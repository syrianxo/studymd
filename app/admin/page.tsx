/**
 * app/admin/page.tsx
 *
 * Server component — verifies role = 'admin' before rendering.
 * Redirects to /app if the user lacks admin access.
 */
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import AdminClient from './AdminClient';

async function getAdminUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Use service client to bypass RLS for role check
  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('role, display_name, email')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') return null;

  return { id: user.id, name: profile.display_name ?? profile.email ?? 'Admin', role: profile.role };
}

export default async function AdminPage() {
  const admin = await getAdminUser();
  if (!admin) redirect('/app');

  return <AdminClient adminName={admin.name} />;
}
