// app/api/profile/change-password/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
      },
    }
  );

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { newPassword?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { newPassword } = body;
  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { error: 'New password must be at least 8 characters.' },
      { status: 400 }
    );
  }

  // Supabase Auth password update — requires the user to be authenticated
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    console.error('[POST /api/profile/change-password]', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
