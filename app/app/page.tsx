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
  // 1. display_name set in user_preferences (editable via profile page)
  // 2. full_name from Supabase user metadata
  // 3. first segment of email prefix (split on . _ -), capitalized — never raw username
  const emailLocal = session.user.email?.split('@')[0] ?? '';
  const emailFirstPart = emailLocal.split(/[._-]/)[0];
  const emailFallback = emailFirstPart
    ? emailFirstPart.charAt(0).toUpperCase() + emailFirstPart.slice(1)
    : 'there';

  const userName =
    preferences?.display_name?.trim() ||
    session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    emailFallback;

  return (
    <DashboardClient
      initialTheme={preferences?.theme ?? 'midnight'}
      userName={userName}
      isPrimary={preferences?.is_primary ?? false}
    />
  );
}
