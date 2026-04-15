import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkLimits, estimateCost, estimateTokens, TOKEN_PREFLIGHT_LIMIT } from '@/lib/api-limits';

// ─── Route config ───────────────────────────────────────────────────────────
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// ─── Constants ──────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS  = new Set(['.pdf', '.pptx', '.ppt']);
const STORAGE_BUCKET      = 'uploads';

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function generateInternalId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `lec_${hex}`;
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
// Client uploads file directly to Supabase Storage, then calls this endpoint
// with JSON metadata. This route:
//   1. Validates inputs
//   2. Gets a signed URL for the file (so /api/generate can fetch it)
//   3. Creates a processing_jobs row
//   4. Fires off POST /api/generate in the background (non-blocking)
//   5. Returns { jobId } immediately so the client can start polling
//
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

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

    if (!storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Forbidden: storagePath does not belong to this user.' }, { status: 403 });
    }

    const ext = getFileExtension(originalName);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: 'Unsupported file type. Only PDF and PPTX files are accepted.' }, { status: 415 });
    }

    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.` },
        { status: 413 }
      );
    }

    const limitsCheck = await checkLimits(user.id);
    if (!limitsCheck.allowed) {
      return NextResponse.json({ error: limitsCheck.reason ?? 'Usage limit reached.' }, { status: 429 });
    }

    const estimatedTokens = estimateTokens(fileSizeBytes);
    const tokenWarning =
      estimatedTokens > TOKEN_PREFLIGHT_LIMIT
        ? `This file may contain ~${(estimatedTokens / 1000).toFixed(0)}K tokens, exceeding the 200K recommended limit.`
        : undefined;

    const estimatedCost = estimateCost(fileSizeBytes);
    const lectureTitle  = titleOverride?.trim() || originalName.replace(/\.[^.]+$/, '');
    const internalId    = generateInternalId();

    const supabase = getSupabaseAdmin();

    // ── Get a signed URL so /api/generate can fetch the file ─────────────────
    // Signed URL valid for 2 hours — plenty of time for processing
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, 7200);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      const detail = signedUrlError?.message ?? 'no URL returned';
      return NextResponse.json(
        { error: `Could not get file URL: ${detail}` },
        { status: 500 }
      );
    }

    const fileUrl = signedUrlData.signedUrl;

    // ── Insert processing_jobs row ────────────────────────────────────────────
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({
        user_id:            user.id,
        storage_path:       storagePath,
        original_file:      originalName,   // NOT NULL legacy column
        original_filename:  originalName,   // newer column
        file_size_bytes:    fileSizeBytes,
        file_type:          ext.slice(1),
        course,
        title:              lectureTitle,
        // internal_id intentionally omitted — FK references lectures.internal_id
        // which doesn't exist yet. /api/generate sets it after inserting the lecture.
        status:             'pending',
        estimated_cost_usd: estimatedCost,
        estimated_tokens:   estimatedTokens,
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      .select('job_id')
      .single();

    if (jobError || !job) {
      const detail = jobError?.message ?? jobError?.details ?? 'unknown';
      console.error('Job creation error:', jobError);
      return NextResponse.json({ error: `Failed to create processing job: ${detail}` }, { status: 500 });
    }

    const jobId = job.job_id as string;

    // ── Return jobId immediately — client calls /api/generate directly ──────
    // This avoids Vercel serverless timeout issues with chained long-running
    // functions. The upload page fires /api/generate after receiving jobId.
    return NextResponse.json({ jobId, internalId, fileUrl, estimatedCost, estimatedTokens, tokenWarning });
  } catch (err) {
    console.error('Upload route error:', err);
    return NextResponse.json({ error: `Internal server error: ${(err as Error).message}` }, { status: 500 });
  }
}
