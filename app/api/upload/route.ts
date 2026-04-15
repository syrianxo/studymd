import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkLimits, estimateCost, estimateTokens, TOKEN_PREFLIGHT_LIMIT } from '@/lib/api-limits';

// ─── Route config ───────────────────────────────────────────────────────────
// This route no longer receives the file body — the client uploads directly
// to Supabase Storage and passes the storagePath here. The payload is tiny
// JSON so Vercel's 4.5 MB body limit is not a concern.
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// ─── File constraints (validated against client-reported values) ────────────
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_EXTENSIONS  = new Set(['.pdf', '.pptx', '.ppt']);
// Bucket that receives raw uploaded PDFs/PPTX files from users.
// Created in Supabase Storage with authenticated-user RLS policies.
const STORAGE_BUCKET = 'uploads';

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in environment variables.');
  return createClient(url, key);
}

async function getUserFromRequest(
  request: NextRequest
): Promise<{ id: string; email: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
}

// ─── POST /api/upload ────────────────────────────────────────────────────────
//
// NEW CONTRACT (v2): client uploads file directly to Supabase Storage,
// then calls this endpoint with JSON metadata only.
//
// Request body (JSON):
//   storagePath   string   — path already uploaded to the 'uploads' bucket
//   originalName  string   — original filename (for extension + title fallback)
//   fileSizeBytes number   — reported by the browser File object
//   course        string   — one of the three valid courses
//   title?        string   — optional override title
//
// Response (JSON):
//   jobId           string
//   estimatedCost   number
//   estimatedTokens number
//   tokenWarning?   string
//
export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    // 2. Parse JSON body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const storagePath   = body.storagePath   as string | undefined;
    const originalName  = body.originalName  as string | undefined;
    const fileSizeBytes = body.fileSizeBytes as number | undefined;
    const course        = body.course        as string | undefined;
    const titleOverride = body.title         as string | undefined;

    if (!storagePath)   return NextResponse.json({ error: 'storagePath is required.'   }, { status: 400 });
    if (!originalName)  return NextResponse.json({ error: 'originalName is required.'  }, { status: 400 });
    if (!fileSizeBytes) return NextResponse.json({ error: 'fileSizeBytes is required.' }, { status: 400 });
    if (!course)        return NextResponse.json({ error: 'course is required.'         }, { status: 400 });

    // 3. Validate that storagePath belongs to this user
    //    (path is always `{userId}/...` — anything else is rejected)
    if (!storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Forbidden: storagePath does not belong to this user.' }, { status: 403 });
    }

    // 4. Validate extension
    const ext = getFileExtension(originalName);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Only PDF and PPTX files are accepted.' },
        { status: 415 }
      );
    }

    // 5. Validate reported size (sanity check — real enforcement is in Storage RLS)
    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.` },
        { status: 413 }
      );
    }

    // 6. Rate / cost limits
    const limitsCheck = await checkLimits(user.id);
    if (!limitsCheck.allowed) {
      return NextResponse.json({ error: limitsCheck.reason ?? 'Usage limit reached.' }, { status: 429 });
    }

    // 7. Token pre-flight estimate
    const estimatedTokens = estimateTokens(fileSizeBytes);
    const tokenWarning =
      estimatedTokens > TOKEN_PREFLIGHT_LIMIT
        ? `This file may contain ~${(estimatedTokens / 1000).toFixed(0)}K tokens, exceeding the 200K recommended limit. Consider splitting it.`
        : undefined;

    // 8. Create processing_jobs row
    const estimatedCost  = estimateCost(fileSizeBytes);
    const lectureTitle   = titleOverride?.trim() || originalName.replace(/\.[^.]+$/, '');

    const supabase = getSupabaseAdmin();
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({
        user_id:            user.id,
        storage_path:       storagePath,
        original_filename:  originalName,
        file_size_bytes:    fileSizeBytes,
        file_type:          ext.slice(1), // 'pdf' | 'pptx' | 'ppt'
        course,
        title:              lectureTitle,
        status:             'pending',
        estimated_cost_usd: estimatedCost,
        estimated_tokens:   estimatedTokens,
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      .select('job_id')
      .single();

    if (jobError || !job) {
      // Surface the real Supabase error so we can diagnose it
      const detail = jobError?.message ?? jobError?.details ?? jobError?.hint ?? 'unknown';
      console.error('Job creation error:', jobError);
      return NextResponse.json(
        { error: `Failed to create processing job: ${detail}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ jobId: job.job_id, estimatedCost, estimatedTokens, tokenWarning });
  } catch (err) {
    console.error('Upload route error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
