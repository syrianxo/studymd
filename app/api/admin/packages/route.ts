// app/api/admin/packages/route.ts
// GET  /api/admin/packages — list all packages with access counts
// POST /api/admin/packages — create a new package
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { data: packages, error } = await supabase
    .from('lecture_packages')
    .select('id, name, description, lecture_ids, created_at')
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count users per package
  const { data: accessRows } = await supabase
    .from('user_package_access')
    .select('package_id');

  const countByPackage: Record<string, number> = {};
  for (const row of accessRows ?? []) {
    countByPackage[row.package_id] = (countByPackage[row.package_id] ?? 0) + 1;
  }

  return NextResponse.json({
    packages: (packages ?? []).map(pkg => ({
      ...pkg,
      user_count: countByPackage[pkg.id] ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const body = await req.json();
  const { id, name, description, lecture_ids } = body as {
    id: string;
    name: string;
    description?: string;
    lecture_ids?: string[];
  };

  if (!id || !name) {
    return NextResponse.json({ error: 'id and name are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('lecture_packages')
    .insert({ id, name, description: description ?? null, lecture_ids: lecture_ids ?? [] })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ package: data }, { status: 201 });
}
