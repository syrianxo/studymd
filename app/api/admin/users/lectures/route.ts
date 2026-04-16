/** GET /api/admin/users/lectures?userId=xxx — list all lecture settings for a user */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('user_lecture_settings')
    .select('internal_id, display_order, visible, archived, lecture:lectures(title, icon)')
    .eq('user_id', userId)
    .order('display_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lectures = (data ?? []).map((row: any) => ({
    internal_id: row.internal_id,
    display_order: row.display_order,
    visible: row.visible,
    archived: row.archived,
    title: row.lecture?.title ?? row.internal_id,
    icon: row.lecture?.icon ?? '📖',
  }));

  return NextResponse.json({ lectures });
}
