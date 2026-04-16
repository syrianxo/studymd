/**
 * GET  /api/admin/lectures/detail?id=xxx  — fetch full lecture with flashcards+questions
 * PUT  /api/admin/lectures/detail?id=xxx  — update metadata fields OR json_data
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('lectures')
    .select('internal_id, title, subtitle, course, color, icon, slide_count, original_file, json_data, created_at')
    .eq('internal_id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });

  return NextResponse.json({
    ...data,
    flashcards: data.json_data?.flashcards ?? [],
    questions:  data.json_data?.questions  ?? [],
    flashcard_count: (data.json_data?.flashcards ?? []).length,
    question_count:  (data.json_data?.questions  ?? []).length,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();

  // jsonData = replace the entire json_data column
  if (body.jsonData !== undefined) {
    const { error } = await supabase
      .from('lectures')
      .update({ json_data: body.jsonData })
      .eq('internal_id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // updates = patch top-level scalar fields (title, subtitle, course, color, icon)
  if (body.updates) {
    const allowed = ['title', 'subtitle', 'course', 'color', 'icon'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body.updates[key] !== undefined) patch[key] = body.updates[key];
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    const { error } = await supabase.from('lectures').update(patch).eq('internal_id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Provide updates or jsonData' }, { status: 400 });
}
