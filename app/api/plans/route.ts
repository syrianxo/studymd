/**
 * app/api/plans/route.ts
 *
 * GET  /api/plans        — list all plans for the authenticated user
 * POST /api/plans        — create a new plan (generates schedule server-side)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerComponentClient } from '@/lib/supabase-server';
import { generateSchedule } from '@/lib/schedule-generator';
import type { CreateStudyPlanInput } from '@/types';

// ── GET /api/plans ────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = await createServerComponentClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('study_plans')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET /api/plans]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ plans: data ?? [] });
}

// ── POST /api/plans ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CreateStudyPlanInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, testDate, lectureIds } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Plan name is required.' }, { status: 400 });
  }
  if (!testDate) {
    return NextResponse.json({ error: 'Test date is required.' }, { status: 400 });
  }
  if (!lectureIds?.length) {
    return NextResponse.json({ error: 'Select at least one lecture.' }, { status: 400 });
  }

  // Fetch lecture card counts so we can weight the schedule
  const { data: lectures, error: lectureError } = await supabase
    .from('lectures')
    .select('internal_id, json_data')
    .in('internal_id', lectureIds);

  if (lectureError) {
    console.error('[POST /api/plans] lecture fetch', lectureError);
    return NextResponse.json({ error: 'Failed to fetch lecture data.' }, { status: 500 });
  }

  // Build weight list
  const weights = (lectures ?? []).map((l) => {
    const data = l.json_data as { flashcards?: unknown[]; questions?: unknown[] } | null;
    const cardCount =
      (data?.flashcards?.length ?? 0) + (data?.questions?.length ?? 0);
    return { internalId: l.internal_id, cardCount };
  });

  // Generate schedule (may throw if date is invalid)
  let schedule;
  try {
    schedule = generateSchedule({ testDate, lectures: weights });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Schedule generation failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Persist
  const { data: plan, error: insertError } = await supabase
    .from('study_plans')
    .insert({
      user_id: user.id,
      name: name.trim(),
      test_date: testDate,
      lecture_ids: lectureIds,
      schedule,
      completed_days: [],
      is_active: true,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[POST /api/plans] insert', insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ plan }, { status: 201 });
}
