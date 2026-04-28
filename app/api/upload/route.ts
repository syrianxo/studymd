import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  API_LIMITS,
  checkLimits,
  userIsAdmin,
  estimateCost,
  estimateTokens,
  TOKEN_PREFLIGHT_LIMIT,
} from '@/lib/api-limits';
import { generateLectureInternalId } from '@/lib/id-generator';

// ─── Route config ───────────────────────────────────────────────────────────
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// ─── Constants ──────────────────────────────────────────────────────────────
// File-size caps are defined in API_LIMITS so they're a single source of truth.
// Admin cap (250 MB) is checked after the admin status is confirmed server-side.
const ALLOWED_EXTENSIONS  = new Set(['.pdf', '.pptx', '.ppt']);

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

    // Determine admin status once — used for both the file-size cap and the rate-limit bypass.
    const isAdmin = await userIsAdmin(user.id);
    const maxFileSizeBytes = isAdmin
      ? API_LIMITS.ADMIN_MAX_FILE_SIZE_BYTES
      : API_LIMITS.MAX_FILE_SIZE_BYTES;
    const maxFileSizeMB = Math.round(maxFileSizeBytes / 1024 / 1024);

    if (fileSizeBytes > maxFileSizeBytes) {
      return NextResponse.json(
        { error: `File too large (${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB). Maximum is ${maxFileSizeMB} MB.` },
        { status: 413 }
      );
    }

    // Admin uploads bypass per-user daily/monthly caps but still record usage
    // for cost tracking and respect the admin sanity cap (see api-limits.ts).
    const limitsCheck = await checkLimits(user.id, { adminBypass: isAdmin });
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
    const internalId    = generateLectureInternalId();

    const supabase = getSupabaseAdmin();

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
    // No fileUrl is returned: the worker pulls the file via service-role
    // download(storage_path) — see lib/job-runner.ts.
    return NextResponse.json({ jobId, internalId, estimatedCost, estimatedTokens, tokenWarning });
  } catch (err) {
    console.error('Upload route error:', err);
    return NextResponse.json({ error: `Internal server error: ${(err as Error).message}` }, { status: 500 });
  }
}
