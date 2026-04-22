// app/api/folders/route.ts
// GET  /api/folders  — flat list of all folders for the current user
// POST /api/folders  — create a new folder
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// Validate that newParentId doesn't create a cycle for folderId.
// Returns true if accepting newParentId would create a cycle.
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
      .from('folders')
      .select('parent_id')
      .eq('id', cursor)
      .maybeSingle() as { data: { parent_id: string | null } | null };
    cursor = data?.parent_id ?? null;
  }
  return false;
}

// ─── GET /api/folders ─────────────────────────────────────────────────────────

export async function GET() {
  const { supabase, session } = await getSupabaseAndUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('folders')
    .select('id, parent_id, name, icon, color, display_order, created_at, updated_at')
    .eq('user_id', session.user.id)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('[GET /api/folders]', error);
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
  }

  return NextResponse.json({ folders: data ?? [] });
}

// ─── POST /api/folders ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { supabase, session } = await getSupabaseAndUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name: string; parentId?: string | null; icon?: string; color?: string | null };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, parentId = null, icon = '📁', color = null } = body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (parentId !== null && typeof parentId !== 'string') {
    return NextResponse.json({ error: 'parentId must be a uuid string or null' }, { status: 400 });
  }

  // Verify parent belongs to the same user (belt-and-suspenders; RLS also catches it)
  if (parentId) {
    const { data: parent } = await supabase
      .from('folders').select('id').eq('id', parentId).eq('user_id', session.user.id).maybeSingle();
    if (!parent) return NextResponse.json({ error: 'Parent folder not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('folders')
    .insert({
      user_id: session.user.id,
      parent_id: parentId,
      name: name.trim(),
      icon,
      color,
    })
    .select()
    .single();

  if (error) {
    console.error('[POST /api/folders]', error);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }

  return NextResponse.json({ folder: data }, { status: 201 });
}
