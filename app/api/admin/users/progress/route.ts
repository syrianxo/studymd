/** GET /api/admin/users/progress?userId=xxx — progress summary per lecture */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('user_progress')
    .select('internal_id, flashcard_progress, exam_progress, last_studied, lecture:lectures(title)')
    .eq('user_id', userId)
    .order('last_studied', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const progress = (data ?? []).map((row: any) => {
    const fp = row.flashcard_progress ?? {};
    const ep = row.exam_progress ?? {};

    // Calculate flashcard pct from got_it_ids / total
    const gotIt = Array.isArray(fp.got_it_ids) ? fp.got_it_ids.length : 0;
    const total = (gotIt + (Array.isArray(fp.missed_ids) ? fp.missed_ids.length : 0)) || 1;
    const flashcard_pct = Math.round((gotIt / total) * 100);

    // Exam pct from last score
    const exam_pct = typeof ep.last_score === 'number' ? Math.round(ep.last_score) : 0;

    return {
      internal_id: row.internal_id,
      lecture_title: row.lecture?.title ?? row.internal_id,
      flashcard_pct,
      exam_pct,
      last_studied: row.last_studied,
    };
  });

  return NextResponse.json({ progress });
}
