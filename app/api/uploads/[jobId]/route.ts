/**
 * DELETE /api/uploads/[jobId]
 *
 * Removes the processing_jobs row and the original file from Supabase
 * Storage. The processed lecture (if any) is left intact — to remove the
 * lecture itself, use the lectures management UI.
 *
 * Storage delete is best-effort: if the file is already gone (30-day
 * lifecycle, manual cleanup, etc.), the job row is still removed.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

const STORAGE_BUCKET = 'uploads';

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { supabase, session } = await getSupabaseAndUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 });

  // Ownership check via the RLS-bound client.
  const { data: job, error: jobErr } = await supabase
    .from('processing_jobs')
    .select('job_id, storage_path, status')
    .eq('job_id', jobId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  }
  if (job.status === 'pending' || job.status === 'converting' || job.status === 'generating') {
    return NextResponse.json(
      { error: 'Cannot delete a job that is currently processing — wait for it to finish or fail.' },
      { status: 409 }
    );
  }

  const service = getServiceClient();

  // Best-effort storage delete — log a warning but don't fail the request.
  try {
    const { error: storageErr } = await service.storage
      .from(STORAGE_BUCKET)
      .remove([job.storage_path]);
    if (storageErr) {
      console.warn(`[DELETE /api/uploads] storage remove failed for ${job.storage_path}:`, storageErr.message);
    }
  } catch (err) {
    console.warn(`[DELETE /api/uploads] storage remove threw for ${job.storage_path}:`, (err as Error).message);
  }

  const { error: deleteErr } = await service
    .from('processing_jobs')
    .delete()
    .eq('job_id', jobId);

  if (deleteErr) {
    return NextResponse.json({ error: `Failed to delete job: ${deleteErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
