// POST /api/admin/courses/[id]/unassign-lectures
// Body: { lectureIds: string[] }  — sets lectures.course_id to null
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const lectureIds: string[] = Array.isArray(body?.lectureIds) ? body.lectureIds : [];

  if (lectureIds.length === 0) {
    return NextResponse.json({ error: 'lectureIds must be a non-empty array' }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from('lectures')
    .update({ course_id: null })
    .in('internal_id', lectureIds)
    .eq('course_id', id);  // only unassign if actually in this course

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: lectureIds.length });
}
