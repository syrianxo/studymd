// app/api/profile/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
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
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = await getSupabase();

  // Use getUser() not getSession() — getSession() trusts the JWT from the
  // cookie without server-side re-validation, which can leave auth.uid()
  // null for RLS even when the user is logged in.
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = user.id;

  // Fetch existing row — maybeSingle() returns null (not error) when missing
  const { data: existingRow, error: fetchError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('[GET /api/profile] fetch error:', JSON.stringify(fetchError));
    return NextResponse.json(
      { error: 'Failed to load profile.', detail: fetchError.message, code: fetchError.code },
      { status: 500 }
    );
  }

  // Auto-create row on first visit
  let profileRow = existingRow;
  if (!profileRow) {
    const { data: inserted, error: insertError } = await supabase
      .from('user_profiles')
      .insert({ user_id: userId })
      .select()
      .maybeSingle();

    if (insertError) {
      console.error('[GET /api/profile] insert error:', JSON.stringify(insertError));
      // Possible race — retry select before giving up
      const { data: retryRow, error: retryError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (retryError || !retryRow) {
        return NextResponse.json(
          { error: 'Failed to create profile.', detail: insertError.message, code: insertError.code },
          { status: 500 }
        );
      }
      profileRow = retryRow;
    } else {
      profileRow = inserted;
    }
  }

  // Study stats — non-fatal if this fails
  const { data: progressRows } = await supabase
    .from('user_progress')
    .select('flashcard_progress, exam_progress')
    .eq('user_id', userId);

  let totalFlashcards = 0, totalExams = 0, examScoreSum = 0, examScoreCount = 0;
  for (const row of progressRows ?? []) {
    const fp = row.flashcard_progress as any;
    const ep = row.exam_progress as any;
    if (fp?.got_it_ids) {
      totalFlashcards += (fp.got_it_ids as string[]).length + ((fp.missed_ids as string[] | undefined)?.length ?? 0);
    }
    if (ep?.sessions) {
      for (const s of ep.sessions as any[]) {
        totalExams++;
        if (typeof s.score === 'number') { examScoreSum += s.score; examScoreCount++; }
      }
    }
  }

  return NextResponse.json({
    profile: {
      userId,
      displayName: profileRow?.display_name ?? null,
      username:    profileRow?.username    ?? null,
      role:        profileRow?.role        ?? 'student',
      isPrimary:   profileRow?.is_primary  ?? false,
      createdAt:   profileRow?.created_at  ?? user.created_at,
    },
    auth: {
      email:       user.email,
      memberSince: user.created_at,
    },
    stats: {
      totalFlashcards,
      totalExams,
      avgScore: examScoreCount > 0 ? Math.round(examScoreSum / examScoreCount) : null,
    },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/profile
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  const supabase = await getSupabase();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
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

    const { data: existing } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('username', u)
      .neq('user_id', user.id)
      .maybeSingle();

    if (existing) return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });
    updates.username = u;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ user_id: user.id, ...updates }, { onConflict: 'user_id', ignoreDuplicates: false })
    .select()
    .maybeSingle();

  if (error || !data) {
    console.error('[PUT /api/profile]', JSON.stringify(error));
    return NextResponse.json(
      { error: 'Failed to update profile.', detail: error?.message, code: error?.code },
      { status: 500 }
    );
  }

  return NextResponse.json({
    profile: {
      displayName: data.display_name,
      username:    data.username,
      role:        data.role,
      isPrimary:   data.is_primary,
    },
  });
}
