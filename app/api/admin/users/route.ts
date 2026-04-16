/**
 * GET  /api/admin/users          → list all users with profiles
 * PUT  /api/admin/users          → update a user's role
 * DELETE /api/admin/users        → delete a user (with ?userId=xxx)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  // Pull from user_profiles joined with lecture counts & last activity
  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, username, role, created_at, is_primary');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with lecture count per user
  const enriched = await Promise.all(
    (profiles ?? []).map(async (p: any) => {
      const { count: lectureCount } = await supabase
        .from('user_lecture_settings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', p.user_id);

      const { data: lastProgress } = await supabase
        .from('user_progress')
        .select('updated_at')
        .eq('user_id', p.user_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      return {
        ...p,
        lectureCount: lectureCount ?? 0,
        lastActive: (lastProgress as any)?.updated_at ?? p.created_at,
      };
    })
  );

  return NextResponse.json({ users: enriched });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const body = await req.json();
  const { userId, role } = body as { userId: string; role: string };

  if (!userId || !role) {
    return NextResponse.json({ error: 'userId and role required' }, { status: 400 });
  }

  const validRoles = ['admin', 'user', 'demo'];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_profiles')
    .update({ role })
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  // Delete in order (FK dependencies)
  await supabase.from('user_progress').delete().eq('user_id', userId);
  await supabase.from('user_lecture_settings').delete().eq('user_id', userId);
  await supabase.from('user_preferences').delete().eq('user_id', userId);
  await supabase.from('user_profiles').delete().eq('user_id', userId);

  // Delete from auth.users via admin API
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
