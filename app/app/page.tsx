// app/app/page.tsx
// ──────────────────────────────────────────────────────────────────────────────
// Protected dashboard page.
// Auth check runs server-side; unauthenticated users are redirected to /login.
// ──────────────────────────────────────────────────────────────────────────────
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Dashboard from '@/components/Dashboard';

// Force this route to be dynamic (relies on cookies for auth)
export const dynamic = 'force-dynamic';

export default async function AppPage() {
  const supabase = createServerComponentClient({ cookies });

  // ── Auth guard ────────────────────────────────────────────────────────────
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  // ── Extract first name from profile (optional) ────────────────────────────
  let firstName: string | undefined;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name')
      .eq('id', session.user.id)
      .single();

    firstName = profile?.first_name ?? undefined;
  } catch {
    // Non-critical — Dashboard has a default name fallback
  }

  return <Dashboard userName={firstName} />;
}
