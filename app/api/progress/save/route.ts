// app/api/progress/save/route.ts
// POST /api/progress/save
// Upserts a single lecture's progress for the authenticated user.
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server-component';

export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerClient();

  // ── Auth check ────────────────────────────────────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    internalId: string;
    flashcardProgress?: Record<string, unknown>;
    examProgress?: Record<string, unknown>;
    lastStudied?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { internalId, flashcardProgress, examProgress, lastStudied } = body;

  if (!internalId) {
    return NextResponse.json({ error: 'internalId is required' }, { status: 400 });
  }

  // ── Fetch existing row to merge (last-write-wins by field) ────────────────
  const { data: existing } = await supabase
    .from('user_progress')
    .select('flashcard_progress, exam_progress, last_studied, updated_at')
    .eq('user_id', user.id)
    .eq('internal_id', internalId)
    .single();

  const now = new Date().toISOString();

  // Merge: incoming data wins over existing for any provided fields
  const mergedFlashcard = flashcardProgress !== undefined
    ? flashcardProgress
    : (existing?.flashcard_progress ?? {});

  const mergedExam = examProgress !== undefined
    ? examProgress
    : (existing?.exam_progress ?? {});

  const mergedLastStudied = lastStudied ?? existing?.last_studied ?? now;

  // ── Upsert ────────────────────────────────────────────────────────────────
  const { error: upsertError } = await supabase
    .from('user_progress')
    .upsert(
      {
        user_id: user.id,
        internal_id: internalId,
        flashcard_progress: mergedFlashcard,
        exam_progress: mergedExam,
        last_studied: mergedLastStudied,
        updated_at: now,
      },
      { onConflict: 'user_id,internal_id' }
    );

  if (upsertError) {
    console.error('[progress/save]', upsertError);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updatedAt: now });
}
