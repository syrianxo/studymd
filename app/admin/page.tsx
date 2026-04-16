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

type AdminResult =
  | 'unauthenticated'
  | 'forbidden'
  | 'missing_service_key'
  | 'no_profile'
  | { id: string; name: string; role: string };

async function getAdminUser(): Promise<AdminResult> {
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
  if (!user) return 'unauthenticated';

  // Guard: service role key must be set in Vercel env vars
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return 'missing_service_key';

  // Service client — bypasses RLS to reliably read role
  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );

  const { data: profile, error } = await serviceClient
    .from('user_profiles')
    .select('role, display_name, email')
    .eq('user_id', user.id)
    .single();

  if (error || !profile) return 'no_profile';
  if (profile.role !== 'admin') return 'forbidden';

  return {
    id: user.id,
    name: profile.display_name ?? profile.email ?? 'Admin',
    role: profile.role as string,
  };
}

export default async function AdminPage() {
  const result = await getAdminUser();

  if (result === 'unauthenticated') {
    redirect('/login?next=/admin');
  }

  if (result === 'missing_service_key') {
    // Render a clear error instead of silently redirecting
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0d0f14', color: '#e8eaf0', fontFamily: 'monospace', padding: '2rem',
        flexDirection: 'column', gap: '1rem', textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem' }}>⚙️</div>
        <h1 style={{ fontSize: '1.25rem', color: '#f87171' }}>Missing: SUPABASE_SERVICE_ROLE_KEY</h1>
        <p style={{ color: '#6b7280', maxWidth: 480 }}>
          This environment variable is not set in Vercel. Go to{' '}
          <strong>Vercel → Project → Settings → Environment Variables</strong> and add{' '}
          <code style={{ color: '#5b8dee' }}>SUPABASE_SERVICE_ROLE_KEY</code> from your{' '}
          Supabase Dashboard → Project Settings → API → service_role key.
          Then redeploy.
        </p>
      </div>
    );
  }

  if (result === 'no_profile') {
    // Profile row missing — show instructions instead of silent redirect
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0d0f14', color: '#e8eaf0', fontFamily: 'monospace', padding: '2rem',
        flexDirection: 'column', gap: '1rem', textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem' }}>🗄️</div>
        <h1 style={{ fontSize: '1.25rem', color: '#f59e0b' }}>No user_profiles row found</h1>
        <p style={{ color: '#6b7280', maxWidth: 480 }}>
          Your user ID is not in the <code>user_profiles</code> table, or the table does not exist.
          Run the following SQL in <strong>Supabase → SQL Editor</strong>:
        </p>
        <pre style={{
          background: '#13161d', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px', padding: '1rem', textAlign: 'left',
          fontSize: '12px', color: '#10b981', maxWidth: 560, overflow: 'auto',
        }}>{`-- 1. Create table (safe if already exists)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email        TEXT,
  role         TEXT NOT NULL DEFAULT 'user',
  is_primary   BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "own_read" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- 2. Seed your admin row (replace with your real UUID from Supabase Auth)
INSERT INTO user_profiles (user_id, display_name, email, role)
VALUES (auth.uid(), 'Khalid', 'your@email.com', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';`}</pre>
      </div>
    );
  }

  if (result === 'forbidden') {
    redirect('/app');
  }

  return <AdminClient adminName={result.name} />;
}
