/**
 * POST /api/uploads/[jobId]/retry
 *
 * Re-runs processing on an existing job. If the job has a stored
 * anthropic_file_id (PDF, Files API enabled), the runner will skip the
 * Supabase fetch and Files API re-upload entirely — the cached file is
 * referenced directly. Otherwise the runner re-fetches via signed URL
 * like a fresh job.
 *
 * Resets the job state (status='pending', error_message=null,
 * claimed_by/claim_expires_at cleared) and fires runProcessingJob in the
 * background so the request can return quickly.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { runProcessingJob } from '@/lib/job-runner';

export const maxDuration = 300;

async function getSupabaseAndUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  );
  const { data: { session } } = await supabase.auth.getSession();
  return { supabase, session };
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { supabase, session } = await getSupabaseAndUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 });

  // Verify ownership through the user's RLS-bound client.
  const { data: job, error: jobErr } = await supabase
    .from('processing_jobs')
    .select('job_id, status, internal_id')
    .eq('job_id', jobId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  }
  if (job.status === 'pending' || job.status === 'converting' || job.status === 'generating') {
    return NextResponse.json(
      { error: `Job is already ${job.status} — wait for it to finish before retrying.` },
      { status: 409 }
    );
  }

  // Reset state via service client so RLS UPDATE policies don't block us.
  const service = getServiceClient();
  const { error: resetErr } = await service
    .from('processing_jobs')
    .update({
      status: 'pending',
      status_detail: null,
      status_message: null,
      error_message: null,
      claimed_by: null,
      claim_expires_at: null,
      heartbeat_at: null,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('job_id', jobId);

  if (resetErr) {
    return NextResponse.json({ error: `Failed to reset job: ${resetErr.message}` }, { status: 500 });
  }

  // Fire-and-forget — runProcessingJob handles all stage transitions and
  // writes the final status before resolving/rejecting. The cron is the
  // safety net if this serverless invocation is killed.
  const runId = `retry-${Date.now()}`;
  runProcessingJob(jobId, runId).catch((err) => {
    console.error(`[retry] runProcessingJob failed for ${jobId}:`, err);
  });

  return NextResponse.json({ ok: true, jobId });
}
