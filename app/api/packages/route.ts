// app/api/packages/route.ts
// GET /api/packages — packages the current user has access to, with lecture list
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function getSupabaseAndUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch packages the user has access to (joined through user_package_access)
  const { data: access, error: accessError } = await supabase
    .from('user_package_access')
    .select('package_id, source, granted_at, expires_at')
    .eq('user_id', user.id);

  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });

  if (!access || access.length === 0) {
    return NextResponse.json({ packages: [] });
  }

  const packageIds = access.map(a => a.package_id);

  const { data: packages, error: pkgError } = await supabase
    .from('lecture_packages')
    .select('id, name, description, lecture_ids, created_at')
    .in('id', packageIds);

  if (pkgError) return NextResponse.json({ error: pkgError.message }, { status: 500 });

  const accessByPackage = Object.fromEntries(access.map(a => [a.package_id, a]));

  return NextResponse.json({
    packages: (packages ?? []).map(pkg => ({
      ...pkg,
      access: accessByPackage[pkg.id],
    })),
  });
}
