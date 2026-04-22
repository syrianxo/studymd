// GET /api/admin/courses  — list all courses (including archived)
// POST /api/admin/courses — create a new course
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from('courses')
    .select('id, name, code, description, display_order, color, created_at, archived_at')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const id = body.id?.trim() ||
    body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const { data, error } = await auth.supabase
    .from('courses')
    .insert({
      id,
      name:          body.name.trim(),
      code:          body.code?.trim() ?? null,
      description:   body.description?.trim() ?? null,
      display_order: body.display_order ?? 0,
      color:         body.color?.trim() ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
