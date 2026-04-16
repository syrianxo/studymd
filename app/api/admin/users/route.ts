/**
 * GET    /api/admin/users          → list all users with profiles + theme
 * PUT    /api/admin/users          → update a user's role
 * DELETE /api/admin/users?userId=  → delete a user
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, username, role, created_at, is_primary');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = await Promise.all(
    (profiles ?? []).map(async (p: any) => {
      const [
        { count: lectureCount },
        { data: lastProgress },
        { data: prefs },
      ] = await Promise.all([
        supabase.from('user_lecture_settings').select('*', { count: 'exact', head: true }).eq('user_id', p.user_id),
        supabase.from('user_progress').select('updated_at').eq('user_id', p.user_id).order('updated_at', { ascending: false }).limit(1).single(),
        supabase.from('user_preferences').select('theme').eq('user_id', p.user_id).single(),
      ]);

      return {
        ...p,
        lectureCount: lectureCount ?? 0,
        lastActive: (lastProgress as any)?.updated_at ?? p.created_at,
        theme: (prefs as any)?.theme ?? 'midnight',
      };
    })
  );

  return NextResponse.json({ users: enriched });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { userId, role } = await req.json() as { userId: string; role: string };
  if (!userId || !role) return NextResponse.json({ error: 'userId and role required' }, { status: 400 });

  const validRoles = ['admin', 'user', 'student', 'demo'];
  if (!validRoles.includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

  const { error } = await supabase.from('user_profiles').update({ role }).eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  await supabase.from('user_progress').delete().eq('user_id', userId);
  await supabase.from('user_lecture_settings').delete().eq('user_id', userId);
  await supabase.from('user_preferences').delete().eq('user_id', userId);
  await supabase.from('user_profiles').delete().eq('user_id', userId);

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
