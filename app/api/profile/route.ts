// app/api/profile/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
      },
    }
  );
}

function usernameError(u: string): string | null {
  if (u.length < 2) return 'Username must be at least 2 characters.';
  if (u.length > 32) return 'Username must be 32 characters or fewer.';
  if (!/^[a-z0-9_]+$/.test(u)) return 'Username may only contain lowercase letters, numbers, and underscores.';
  return null;
}

// ---------------------------------------------------------------------------
// GET /api/profile
// Returns: profile row + auth email + member_since + study stats
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = await getSupabase();

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  // Upsert a profile row (creates one if it doesn't exist yet)
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .upsert(
      { user_id: userId },
      { onConflict: 'user_id', ignoreDuplicates: true }
    )
    .select()
    .single();

  // If upsert errored or returned nothing, try a plain select
  let profileRow = profile;
  if (profileError || !profileRow) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    profileRow = data;
  }

  // Study stats from user_progress
  const { data: progressRows } = await supabase
    .from('user_progress')
    .select('flashcard_progress, exam_progress')
    .eq('user_id', userId);

  let totalFlashcards = 0;
  let totalExams = 0;
  let examScoreSum = 0;
  let examScoreCount = 0;

  for (const row of progressRows ?? []) {
    const fp = row.flashcard_progress as any;
    const ep = row.exam_progress as any;
    if (fp?.got_it_ids) totalFlashcards += (fp.got_it_ids as string[]).length + ((fp.missed_ids as string[] | undefined)?.length ?? 0);
    if (ep?.sessions) {
      for (const s of ep.sessions as any[]) {
        totalExams++;
        if (typeof s.score === 'number') { examScoreSum += s.score; examScoreCount++; }
      }
    }
  }

  const avgScore = examScoreCount > 0 ? Math.round(examScoreSum / examScoreCount) : null;

  return NextResponse.json({
    profile: {
      userId,
      displayName: profileRow?.display_name ?? null,
      username: profileRow?.username ?? null,
      role: profileRow?.role ?? 'student',
      isPrimary: profileRow?.is_primary ?? false,
      createdAt: profileRow?.created_at ?? session.user.created_at,
    },
    auth: {
      email: session.user.email,
      memberSince: session.user.created_at,
    },
    stats: {
      totalFlashcards,
      totalExams,
      avgScore,
    },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/profile
// Updates: display_name, username (with uniqueness check)
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  const supabase = await getSupabase();

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { displayName?: string; username?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: Record<string, unknown> = {};

  if (body.displayName !== undefined) {
    const dn = String(body.displayName).trim();
    if (dn.length === 0 || dn.length > 64) {
      return NextResponse.json({ error: 'Display name must be 1–64 characters.' }, { status: 400 });
    }
    updates.display_name = dn;
  }

  if (body.username !== undefined) {
    const u = String(body.username).trim().toLowerCase();
    const err = usernameError(u);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    // Uniqueness check (excluding self)
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', u)
      .neq('user_id', session.user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });
    }
    updates.username = u;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ user_id: session.user.id, ...updates }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('[PUT /api/profile]', error);
    return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
  }

  return NextResponse.json({
    profile: {
      displayName: data.display_name,
      username: data.username,
      role: data.role,
      isPrimary: data.is_primary,
    },
  });
}
