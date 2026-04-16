/**
 * POST /api/admin/lectures/regen-id
 * Body: { oldId, newId, password? }
 * - No password: auto-generated newId is used (passed from client genId())
 * - With password: verifies the admin's Supabase password, then applies manual override
 *
 * Updates: lectures row, user_lecture_settings rows, user_progress rows, storage paths (best-effort)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  const { oldId, newId, password } = await req.json() as { oldId: string; newId: string; password?: string };

  if (!oldId || !newId) return NextResponse.json({ error: 'oldId and newId required' }, { status: 400 });
  if (!newId.match(/^lec_[a-f0-9]{8}$/)) return NextResponse.json({ error: 'newId must match lec_xxxxxxxx format' }, { status: 400 });

  // If password provided, verify it by attempting a sign-in
  if (password) {
    const cookieStore = await cookies();
    const sessionClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: 'Cannot resolve user email for verification' }, { status: 400 });

    const anonClient = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error: signInError } = await anonClient.auth.signInWithPassword({ email: user.email, password });
    if (signInError) return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
  }

  // Check new ID doesn't already exist
  const { data: existing } = await supabase.from('lectures').select('internal_id').eq('internal_id', newId).single();
  if (existing) return NextResponse.json({ error: `ID ${newId} already exists` }, { status: 409 });

  // Fetch the lecture to duplicate it with new ID
  const { data: lecture, error: fetchError } = await supabase.from('lectures').select('*').eq('internal_id', oldId).single();
  if (fetchError || !lecture) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

  // Insert with new ID
  const { error: insertError } = await supabase.from('lectures').insert({ ...lecture, internal_id: newId });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Update user_lecture_settings
  await supabase.from('user_lecture_settings').update({ internal_id: newId }).eq('internal_id', oldId);

  // Update user_progress
  await supabase.from('user_progress').update({ internal_id: newId }).eq('internal_id', oldId);

  // Delete old lecture row
  await supabase.from('lectures').delete().eq('internal_id', oldId);

  return NextResponse.json({ ok: true, newId });
}
