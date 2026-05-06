import { NextResponse } from 'next/server';
import { createServerComponentClient, createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { display_name?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body — fall through with defaults
  }

  const rawName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  const displayName =
    rawName.length > 0 ? rawName.slice(0, 60) : user.email?.split('@')[0] || 'Student';

  const service = createServiceClient();

  // Don't clobber an existing row's role — only update display_name / email.
  const { data: existing } = await service
    .from('user_profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await service
      .from('user_profiles')
      .update({ display_name: displayName })
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await service
      .from('user_profiles')
      .insert({
        user_id: user.id,
        display_name: displayName,
        role: 'student',
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await service
    .from('user_preferences')
    .upsert(
      { user_id: user.id, display_name: displayName },
      { onConflict: 'user_id' }
    );

  return NextResponse.json({ ok: true });
}
