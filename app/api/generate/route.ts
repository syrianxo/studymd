/**
 * POST /api/generate
 *
 * Thin wrapper around lib/job-runner.ts.
 * Accepts:  { fileUrl, course, title, internalId, jobId, userId, fileSizeBytes?, slideCount? }
 * Delegates all processing logic to runProcessingJob so the same code path
 * is used by both the inline upload flow and the Vercel Cron orphan-recovery.
 *
 * Fire-and-forget behavior: if the client disconnects (user navigates away),
 * the Vercel serverless function continues running to completion. The Cron
 * serves as a safety net for jobs that time out before completing.
 *
 * Security: ANTHROPIC_API_KEY is server-side only. Never exposed to the client.
 * Auth: Bearer token from the client session — validated against Supabase auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runProcessingJob, getSupabaseAdmin } from '@/lib/job-runner';

// ─── Request body type ────────────────────────────────────────────────────────
interface GenerateRequestBody {
  fileUrl: string;
  course: string;
  title: string;
  internalId: string;
  jobId: string;
  userId: string;
  fileSizeBytes?: number;
  slideCount?: number;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAuth = createClient<any, 'public', any>(url, key);

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: GenerateRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { fileUrl, course, title, internalId, jobId, userId, fileSizeBytes, slideCount } = body;

  if (!fileUrl || !course || !title || !internalId || !jobId || !userId) {
    return NextResponse.json(
      { error: 'Missing required fields: fileUrl, course, title, internalId, jobId, userId.' },
      { status: 400 }
    );
  }

  // Backfill file_size_bytes and slide_count into the job row so the cron
  // can pick up any orphaned jobs with the same data.
  if (fileSizeBytes || slideCount) {
    const supabase = getSupabaseAdmin();
    await supabase.from('processing_jobs').update({
      ...(fileSizeBytes ? { file_size_bytes: fileSizeBytes } : {}),
      ...(slideCount    ? { slide_count: slideCount }        : {}),
    }).eq('job_id', jobId);
  }

  // ── Run the job (fire; Vercel continues even if client disconnects) ─────────
  const runId = `inline_${Date.now()}`;
  try {
    const result = await runProcessingJob(jobId, runId, { fileUrl, internalId });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    // Job status was already written to processing_jobs inside runProcessingJob.
    // Return the error to the client so the UploadModal can show it immediately
    // (rather than waiting for the next poll cycle).
    const message = (err as Error).message;
    const isAlreadyClaimed = message.includes('already claimed');
    return NextResponse.json({ error: message }, { status: isAlreadyClaimed ? 409 : 500 });
  }
}
