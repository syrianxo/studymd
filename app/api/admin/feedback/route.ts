/**
 * GET  /api/admin/feedback          → list all feedback submissions
 * PUT  /api/admin/feedback          → update status { id, status }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from('feedback')
    .select('id, user_id, type, message, page_url, status, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with display name if available
  const enriched = await Promise.all(
    (data ?? []).map(async (fb: any) => {
      if (!fb.user_id) return { ...fb, user_name: 'Anonymous' };
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('display_name, email')
        .eq('user_id', fb.user_id)
        .single();
      return {
        ...fb,
        user_name: (profile as any)?.display_name ?? (profile as any)?.email ?? 'Unknown',
      };
    })
  );

  return NextResponse.json({ feedback: enriched });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const body = await req.json();
  const { id, status } = body as { id: string; status: string };

  const validStatuses = ['new', 'reviewed', 'resolved'];
  if (!id || !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'id and valid status required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('feedback')
    .update({ status })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
