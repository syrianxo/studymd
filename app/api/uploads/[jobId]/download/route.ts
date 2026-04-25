/**
 * GET /api/uploads/[jobId]/download
 *
 * Returns a fresh, short-lived signed URL for the original uploaded file.
 * Scoped to the signed-in user — a job belonging to another user 404s.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

const STORAGE_BUCKET = 'uploads';
const SIGNED_URL_TTL = 300;

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { supabase, session } = await getSupabaseAndUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 });

  const { data: job, error: jobErr } = await supabase
    .from('processing_jobs')
    .select('storage_path, original_filename, original_file')
    .eq('job_id', jobId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  }

  const service = getServiceClient();
  const { data, error } = await service.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(job.storage_path, SIGNED_URL_TTL, {
      download: job.original_filename ?? job.original_file ?? undefined,
    });

  if (error || !data?.signedUrl) {
    const detail = error?.message ?? 'no URL returned';
    return NextResponse.json(
      { error: `Could not create signed URL — file may have been removed. (${detail})`, expired: true },
      { status: 410 }
    );
  }

  return NextResponse.json({
    url: data.signedUrl,
    filename: job.original_filename ?? job.original_file,
    expiresInSeconds: SIGNED_URL_TTL,
  });
}
