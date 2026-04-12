import { createServerComponentClient, fetchLecturesWithSettings, fetchUserPreferences } from '@/lib/supabase-server';
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

  const userId = session.user.id;

  // Fetch data in parallel
  const [lectures, preferences] = await Promise.all([
    fetchLecturesWithSettings(userId),
    fetchUserPreferences(userId),
  ]);

  return (
    <DashboardClient
      userId={userId}
      initialLectures={lectures}
      initialTheme={preferences?.theme ?? 'midnight'}
    />
  );
}
