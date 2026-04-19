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

  // Name resolution order:
  // 1. full_name from auth raw_user_meta_data — set via admin or profile update
  // 2. display_name from user_preferences — editable in profile page
  // 3. 'there' — never the raw email username
  const userName =
    session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    preferences?.display_name?.trim() ||
    'there';

  return (
    <DashboardClient
      initialTheme={preferences?.theme ?? 'midnight'}
      userName={userName}
      isPrimary={preferences?.is_primary ?? false}
    />
  );
}
