/**
 * GET /api/uploads — list the current user's processing jobs.
 *
 * Optional query params:
 *   status   — 'pending' | 'converting' | 'generating' | 'complete' | 'error' | 'all' (default 'all')
 *   limit    — 1..200, default 50
 *   offset   — default 0
 *
 * Returns rows scoped to the signed-in user (RLS also enforces this).
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

const VALID_STATUSES = new Set(['pending', 'converting', 'generating', 'complete', 'error']);

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

export async function GET(req: NextRequest) {
  const { supabase, session } = await getSupabaseAndUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status') ?? 'all';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  let query = supabase
    .from('processing_jobs')
    .select(
      'job_id, status, status_detail, status_message, original_filename, original_file, file_size_bytes, file_type, course, title, internal_id, error_message, anthropic_file_id, estimated_cost_usd, created_at, updated_at, completed_at, storage_path'
    )
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusParam !== 'all') {
    if (!VALID_STATUSES.has(statusParam)) {
      return NextResponse.json({ error: `Invalid status: ${statusParam}` }, { status: 400 });
    }
    query = query.eq('status', statusParam);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[GET /api/uploads]', error);
    return NextResponse.json({ error: 'Failed to fetch uploads' }, { status: 500 });
  }

  return NextResponse.json({ uploads: data ?? [] });
}
