import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export type JobStatus = 'pending' | 'converting' | 'generating' | 'complete' | 'error';

export interface StatusResponse {
  status: JobStatus;
  progress?: number;       // 0–100
  error?: string;
  title?: string;
  course?: string;
  completedAt?: string;
  lectureId?: string;      // populated when status === 'complete'
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables are not configured.');
  return createClient(url, key);
}

async function getUserFromRequest(request: NextRequest): Promise<{ id: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}

// ─── GET /api/upload/status?jobId=X ───────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    // 1. Auth
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    // 2. Extract jobId
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId query parameter is required.' }, { status: 400 });
    }

    // 3. Query processing_jobs
    const supabase = getSupabaseClient();
    const { data: job, error } = await supabase
      .from('processing_jobs')
      .select('job_id, user_id, status, progress, error_message, title, course, completed_at, lecture_id')
      .eq('job_id', jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    // 4. Ownership check — users may only poll their own jobs
    if (job.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    // 5. Build response
    const response: StatusResponse = {
      status: job.status as JobStatus,
    };

    if (job.progress !== null && job.progress !== undefined) {
      response.progress = job.progress;
    }

    if (job.status === 'error' && job.error_message) {
      response.error = job.error_message;
    }

    if (job.title) response.title = job.title;
    if (job.course) response.course = job.course;

    if (job.status === 'complete') {
      if (job.completed_at) response.completedAt = job.completed_at;
      if (job.lecture_id) response.lectureId = job.lecture_id;
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('Status route error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
