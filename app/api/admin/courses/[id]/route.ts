// PATCH /api/admin/courses/[id] — rename, recolor, archive/unarchive a course
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined)          patch.name          = String(body.name).trim();
  if (body.code !== undefined)          patch.code          = body.code ? String(body.code).trim() : null;
  if (body.description !== undefined)   patch.description   = body.description ? String(body.description).trim() : null;
  if (body.color !== undefined)         patch.color         = body.color ? String(body.color).trim() : null;
  if (body.display_order !== undefined) patch.display_order = Number(body.display_order);
  if (body.archived !== undefined)      patch.archived_at   = body.archived ? new Date().toISOString() : null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('courses')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Unset course_id on any lectures that still reference this course
  await auth.supabase
    .from('lectures')
    .update({ course_id: null })
    .eq('course_id', id);

  const { error } = await auth.supabase
    .from('courses')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
