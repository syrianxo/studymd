/**
 * GET /api/cron/process-jobs
 *
 * Vercel Cron endpoint (runs every minute). Two responsibilities:
 *
 * 1. Hard-fail jobs that haven't progressed in > 20 minutes. Staleness is
 *    measured against `updated_at`, NOT `created_at`. The retry path bumps
 *    `updated_at` to `now()` while leaving `created_at` pointing at the
 *    original upload (which may be days old) — using `created_at` here would
 *    instantly expire any retried-old job.
 *
 * 2. Pick up jobs to (re)run:
 *    - status = 'pending' (never started, or just retried), OR
 *    - status IN ('converting', 'generating') AND claim_expires_at < now()
 *      (stale claim — client disconnected before inline /api/generate finished).
 *
 * Auth: Vercel sends an Authorization: Bearer <CRON_SECRET> header.
 * Set CRON_SECRET in Vercel project environment variables.
 *
 * This is purely a safety net. The inline /api/generate fast-path handles
 * most jobs immediately; the cron only fires for orphans.
 */

import { NextRequest } from 'next/server';
import { getSupabaseAdmin, runProcessingJob } from '@/lib/job-runner';

export const maxDuration = 300; // 5 min — allow time to process up to 5 jobs

export async function GET(request: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/process-jobs] CRON_SECRET env var is not set.');
    return Response.json({ error: 'Server misconfiguration.' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // ── Expire jobs that haven't progressed in > 20 minutes ───────────────────
  // Uses updated_at (which the trigger bumps on every change, and which the
  // retry route resets to now()) rather than created_at — see the file-level
  // comment for why created_at would be wrong.
  const STALE_AFTER_MS = 20 * 60 * 1000;
  const staleThreshold = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { error: expireError } = await supabase
    .from('processing_jobs')
    .update({
      status: 'error',
      status_detail: 'error',
      status_message: 'Processing timed out — please try again.',
      error_message: 'Job timed out after 20 minutes without progress.',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('status', ['pending', 'converting', 'generating'])
    .is('completed_at', null)
    .lt('updated_at', staleThreshold);

  if (expireError) {
    console.error('[cron/process-jobs] Failed to expire stale jobs:', expireError.message);
  }

  // ── Find claimable jobs ────────────────────────────────────────────────────
  const { data: jobs, error } = await supabase
    .from('processing_jobs')
    .select('job_id, storage_path')
    .or(
      // Pending (never claimed, or just retried)
      'status.eq.pending,' +
      // Running but claim expired (client navigated away / function timed out)
      'and(status.in.(converting,generating),claim_expires_at.lt.now())'
    )
    .is('completed_at', null)
    .order('updated_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error('[cron/process-jobs] Failed to query processing_jobs:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return Response.json({ processed: 0, message: 'No orphaned jobs.' });
  }

  // ── Process jobs (in parallel, up to 5) ───────────────────────────────────
  const runId = `cron_${Date.now()}`;
  const results = await Promise.allSettled(
    jobs.map((j: { job_id: string }) => runProcessingJob(j.job_id, runId))
  );

  const summary = results.map((r, i) => ({
    jobId: jobs[i].job_id,
    status: r.status,
    ...(r.status === 'rejected' ? { error: (r.reason as Error).message } : {}),
  }));

  console.log('[cron/process-jobs] Processed:', JSON.stringify(summary));
  return Response.json({ processed: jobs.length, summary });
}
