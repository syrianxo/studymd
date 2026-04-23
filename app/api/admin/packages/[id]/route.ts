// app/api/admin/packages/[id]/route.ts
// GET    /api/admin/packages/[id] — package detail + user access list
// PATCH  /api/admin/packages/[id] — update package metadata or lecture list
// DELETE /api/admin/packages/[id] — delete package (cascades user_package_access)
// POST   /api/admin/packages/[id] — grant or revoke user access (action in body)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  const [{ data: pkg, error: pkgErr }, { data: access, error: accErr }] = await Promise.all([
    supabase.from('lecture_packages').select('*').eq('id', id).single(),
    supabase
      .from('user_package_access')
      .select('user_id, source, granted_at, expires_at')
      .eq('package_id', id),
  ]);

  if (pkgErr) return NextResponse.json({ error: pkgErr.message }, { status: 404 });
  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

  // Enrich with display names from user_profiles
  const userIds = (access ?? []).map(a => a.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from('user_profiles').select('user_id, display_name, username').in('user_id', userIds)
    : { data: [] };

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]));

  return NextResponse.json({
    package: pkg,
    users: (access ?? []).map(a => ({
      ...a,
      display_name: profileMap[a.user_id]?.display_name ?? null,
      username: profileMap[a.user_id]?.username ?? null,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  const body = await req.json();
  const allowed = ['name', 'description', 'lecture_ids'] as const;
  const patch: Partial<Record<typeof allowed[number], unknown>> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('lecture_packages')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ package: data });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  const { error } = await supabase
    .from('lecture_packages')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

// POST /api/admin/packages/[id]  body: { action: 'grant'|'revoke', userId, source?, expiresAt? }
export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  const { id } = await params;

  const body = await req.json();
  const { action } = body as { action?: string };

  if (action === 'grant') {
    const { userId, source = 'admin', expiresAt } = body as {
      userId: string;
      source?: string;
      expiresAt?: string;
    };
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const { error } = await supabase
      .from('user_package_access')
      .upsert({
        user_id: userId,
        package_id: id,
        source,
        expires_at: expiresAt ?? null,
      }, { onConflict: 'user_id,package_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'revoke') {
    const { userId } = body as { userId: string };
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const { error } = await supabase
      .from('user_package_access')
      .delete()
      .eq('user_id', userId)
      .eq('package_id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
