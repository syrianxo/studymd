// app/api/progress/load/route.ts
// GET /api/progress/load
// Returns all progress rows for the authenticated user.
import { NextResponse } from 'next/server';
import { createServerComponentClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createServerComponentClient();
  
  // ── Auth check ────────────────────────────────────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Fetch all rows ──────────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('user_progress')
    .select('internal_id, flashcard_progress, exam_progress, last_studied, updated_at')
    .eq('user_id', user.id)
    .order('last_studied', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[progress/load]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Normalise to the shape the client expects
  const progress = (data ?? []).map((row) => ({
    internalId: row.internal_id,
    flashcardProgress: row.flashcard_progress ?? {},
    examProgress: row.exam_progress ?? {},
    lastStudied: row.last_studied ?? null,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json({ progress });
}
