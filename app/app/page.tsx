import { createServerComponentClient, fetchUserPreferences } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { DashboardClient } from './DashboardClient';

/**
 * Server component — fetches data, enforces auth, passes to client component.
 */
export default async function DashboardPage() {
  const supabase = await createServerComponentClient();

  // Auth check
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const preferences = await fetchUserPreferences(session.user.id);
  const userName = session.user.user_metadata?.full_name
    ?? session.user.user_metadata?.name
    ?? session.user.email?.split('@')[0]
    ?? 'there';

  return (
    <DashboardClient
      initialTheme={preferences?.theme ?? 'midnight'}
      userName={userName}
    />
  );
}
