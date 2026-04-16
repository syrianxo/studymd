/** POST /api/admin/users/create — create a new Supabase auth user + profile row */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const body = await req.json();
  const { email, password, display_name, role = 'user' } = body as {
    email: string; password: string; display_name?: string; role?: string;
  };

  if (!email || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 });

  // Create auth user via admin API (service key required)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? 'Failed to create user' }, { status: 500 });
  }

  // Insert user_profiles row
  await supabase.from('user_profiles').insert({
    user_id: authData.user.id,
    display_name: display_name ?? null,
    username: email.split('@')[0],
    email,
    role,
    is_primary: false,
  });

  // Insert user_preferences row with defaults
  await supabase.from('user_preferences').insert({
    user_id: authData.user.id,
    theme: 'midnight',
    settings: {},
  });

  // Seed user_lecture_settings for all existing lectures
  const { data: lectures } = await supabase.from('lectures').select('internal_id');
  if (lectures && lectures.length > 0) {
    const settings = lectures.map((l: any, i: number) => ({
      user_id: authData.user.id,
      internal_id: l.internal_id,
      display_order: i + 1,
      visible: true,
      archived: false,
      tags: [],
    }));
    await supabase.from('user_lecture_settings').insert(settings);
  }

  return NextResponse.json({ ok: true, userId: authData.user.id });
}
