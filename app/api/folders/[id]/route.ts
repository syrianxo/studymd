// app/api/folders/[id]/route.ts
// PATCH  /api/folders/[id]  — rename, recolor, reparent
// DELETE /api/folders/[id]  — delete (subfolders cascade; lectures set group_id → null)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

async function getSupabaseAndUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  );
  const { data: { session } } = await supabase.auth.getSession();
  return { supabase, session };
}

async function wouldCreateCycle(
  folderId: string,
  newParentId: string | null,
  supabase: ReturnType<typeof createServerClient>
): Promise<boolean> {
  if (!newParentId) return false;
  if (folderId === newParentId) return true;
  let cursor: string | null = newParentId;
  while (cursor) {
    if (cursor === folderId) return true;
    const { data } = await supabase
      .from('folders').select('parent_id').eq('id', cursor).maybeSingle() as { data: { parent_id: string | null } | null };
    cursor = data?.parent_id ?? null;
  }
  return false;
}

// ─── PATCH /api/folders/[id] ─────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, session } = await getSupabaseAndUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  let body: { name?: string; icon?: string; color?: string | null; parentId?: string | null; displayOrder?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  // Confirm ownership
  const { data: existing } = await supabase
    .from('folders').select('id').eq('id', id).eq('user_id', session.user.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

  // Cycle check when reparenting
  if ('parentId' in body) {
    const cycle = await wouldCreateCycle(id, body.parentId ?? null, supabase);
    if (cycle) return NextResponse.json({ error: 'Moving this folder would create a cycle' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.icon !== undefined) patch.icon = body.icon;
  if ('color' in body) patch.color = body.color;
  if ('parentId' in body) patch.parent_id = body.parentId;
  if (body.displayOrder !== undefined) patch.display_order = body.displayOrder;

  const { data, error } = await supabase
    .from('folders')
    .update(patch)
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select()
    .single();

  if (error) {
    console.error('[PATCH /api/folders/[id]]', error);
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
  }

  return NextResponse.json({ folder: data });
}

// ─── DELETE /api/folders/[id] ────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, session } = await getSupabaseAndUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // RLS ensures only the owner can delete; ON DELETE CASCADE removes subfolders;
  // ON DELETE SET NULL clears group_id on lectures in this folder.
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);

  if (error) {
    console.error('[DELETE /api/folders/[id]]', error);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
