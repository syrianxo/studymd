/**
 * app/api/plans/[id]/route.ts
 *
 * GET    /api/plans/[id]  — fetch a single plan
 * PATCH  /api/plans/[id]  — update a plan (mark day done/undone, deactivate)
 * DELETE /api/plans/[id]  — delete a plan
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerComponentClient } from '@/lib/supabase-server';

type Params = { params: Promise<{ id: string }> };

// ── GET /api/plans/[id] ───────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerComponentClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('study_plans')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Plan not found.' }, { status: 404 });
  }

  return NextResponse.json({ plan: data });
}

// ── PATCH /api/plans/[id] ─────────────────────────────────────────────────────
// Accepted body shapes:
//   { action: "markDayDone",   date: "2026-04-15" }
//   { action: "markDayUndone", date: "2026-04-15" }
//   { action: "deactivate" }
//   { action: "activate" }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerComponentClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from('study_plans')
    .select('completed_days, is_active')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Plan not found.' }, { status: 404 });
  }

  let body: { action: string; date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  switch (body.action) {
    case 'markDayDone': {
      if (!body.date) return NextResponse.json({ error: 'date required' }, { status: 400 });
      const days = new Set<string>(existing.completed_days ?? []);
      days.add(body.date);
      updates.completed_days = Array.from(days);
      break;
    }
    case 'markDayUndone': {
      if (!body.date) return NextResponse.json({ error: 'date required' }, { status: 400 });
      updates.completed_days = (existing.completed_days ?? []).filter(
        (d: string) => d !== body.date
      );
      break;
    }
    case 'deactivate':
      updates.is_active = false;
      break;
    case 'activate':
      updates.is_active = true;
      break;
    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }

  const { data: plan, error: updateError } = await supabase
    .from('study_plans')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (updateError) {
    console.error('[PATCH /api/plans/[id]]', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ plan });
}

// ── DELETE /api/plans/[id] ────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerComponentClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('study_plans')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[DELETE /api/plans/[id]]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
