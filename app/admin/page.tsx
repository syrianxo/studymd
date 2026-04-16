/**
 * app/admin/page.tsx
 *
 * Server component — handles both auth and role enforcement.
 * - Not logged in → /login
 * - Logged in but not admin → /app
 * - Admin → render dashboard
 *
 * The proxy only checks authentication. Role checking lives here
 * so it runs in the Node.js runtime with a reliable service-key client.
 */
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import AdminClient from './AdminClient';

async function getAdminUser() {
  const cookieStore = await cookies();

  // Session client — checks auth via cookie
  const sessionClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return 'unauthenticated' as const;

  // Service client — bypasses RLS to reliably read role
  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('role, display_name, email')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') return 'forbidden' as const;

  return {
    id: user.id,
    name: profile.display_name ?? profile.email ?? 'Admin',
    role: profile.role as string,
  };
}

export default async function AdminPage() {
  const result = await getAdminUser();

  if (result === 'unauthenticated') redirect('/login?next=/admin');
  if (result === 'forbidden') redirect('/app');

  return <AdminClient adminName={result.name} />;
}
