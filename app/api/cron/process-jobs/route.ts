/**
 * GET /api/cron/process-jobs
 *
 * Vercel Cron endpoint (runs every minute).
 * Picks up any processing_jobs that are:
 *   - status = 'pending' (never started), OR
 *   - status IN ('converting', 'generating') AND claim_expires_at < now()
 *     (stale — client disconnected before the inline /api/generate completed)
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

  // ── Find claimable jobs ────────────────────────────────────────────────────
  const supabase = getSupabaseAdmin();

  const { data: jobs, error } = await supabase
    .from('processing_jobs')
    .select('job_id, storage_path')
    .or(
      // Pending (never claimed)
      'status.eq.pending,' +
      // Running but claim expired (client navigated away / function timed out)
      'and(status.in.(converting,generating),claim_expires_at.lt.now())'
    )
    .is('completed_at', null)
    .order('created_at', { ascending: true })
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
