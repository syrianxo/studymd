// app/api/profile/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

async function getAnonSupabase() {
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

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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
  const anonClient = await getAnonSupabase();
  const { data: { user }, error: userError } = await anonClient.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = user.id;
  const db = getServiceSupabase();

  // Fetch profile row
  const { data: existingRow, error: fetchError } = await db
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
    const { data: inserted, error: insertError } = await db
      .from('user_profiles')
      .insert({ user_id: userId })
      .select()
      .maybeSingle();

    if (insertError) {
      const { data: retryRow } = await db
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (!retryRow) {
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

  // ── Study stats ────────────────────────────────────────────────────────
  // exam_progress shape: { sessions: number, best_score: number|null, avg_score: number|null }
  // flashcard_progress shape: { sessions: number, got_it_ids: string[], missed_ids: string[] }
  const { data: progressRows } = await db
    .from('user_progress')
    .select('flashcard_progress, exam_progress')
    .eq('user_id', userId);

  let totalFlashcards = 0;
  let totalExams = 0;
  let avgScoreSum = 0;
  let avgScoreCount = 0;

  for (const row of progressRows ?? []) {
    const fp = row.flashcard_progress as any;
    const ep = row.exam_progress as any;

    // flashcard_progress: count got_it_ids + missed_ids as "studied"
    if (Array.isArray(fp?.got_it_ids)) totalFlashcards += fp.got_it_ids.length;
    if (Array.isArray(fp?.missed_ids)) totalFlashcards += fp.missed_ids.length;

    // exam_progress: sessions is a count, avg_score is the per-lecture average
    if (typeof ep?.sessions === 'number' && ep.sessions > 0) {
      totalExams += ep.sessions;
    }
    if (typeof ep?.avg_score === 'number') {
      avgScoreSum += ep.avg_score;
      avgScoreCount++;
    }
  }

  const avgScore = avgScoreCount > 0 ? Math.round(avgScoreSum / avgScoreCount) : null;

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
      avgScore,
    },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/profile
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  const anonClient = await getAnonSupabase();
  const { data: { user }, error: userError } = await anonClient.auth.getUser();
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

    const db = getServiceSupabase();
    const { data: existing } = await db
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

  const db = getServiceSupabase();
  const { data, error } = await db
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
