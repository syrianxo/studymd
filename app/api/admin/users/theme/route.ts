/** PUT /api/admin/users/theme — update a user's theme preference */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { userId, theme } = await req.json() as { userId: string; theme: string };
  if (!userId || !theme) return NextResponse.json({ error: 'userId and theme required' }, { status: 400 });

  const { error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, theme }, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
