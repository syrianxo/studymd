import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Server Component client — uses cookie store for session.
 * Only call from Server Components or API route handlers.
 */
export async function createServerComponentClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // No-op in Server Components — expected
        }
      },
    },
  });
}

/**
 * Service role client — bypasses RLS.
 * Only call from server-side API routes. Never expose to the client.
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient(supabaseUrl, serviceKey);
}

// ─── Data fetchers used by server components ───────────────────────────────

export async function fetchLecturesWithSettings(userId: string) {
  const supabase = await createServerComponentClient();
  const { data, error } = await supabase
    .from('user_lecture_settings')
    .select(`
      *,
      lecture:lectures(*)
    `)
    .eq('user_id', userId)
    .eq('visible', true)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchUserPreferences(userId: string) {
  const supabase = await createServerComponentClient();
  const [prefsResult, profileResult] = await Promise.all([
    supabase
      .from('user_preferences')
      .select('theme, settings, display_name')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('user_profiles')
      .select('is_primary')
      .eq('user_id', userId)
      .single(),
  ]);

  return {
    theme: prefsResult.data?.theme ?? 'midnight',
    settings: prefsResult.data?.settings ?? {},
    display_name: prefsResult.data?.display_name ?? null,
    // is_primary is authoritative on user_profiles, not user_preferences
    is_primary: profileResult.data?.is_primary ?? false,
  };
}

// ─── Lecture settings mutations (called client-side via API routes) ─────────
// These use the service client and should only be called from API routes,
// not directly from client components.

export async function updateLectureSettings(
  userId: string,
  internalId: string,
  settings: Record<string, unknown>
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('user_lecture_settings')
    .update(settings)
    .eq('user_id', userId)
    .eq('internal_id', internalId);
}

export async function reorderLectures(
  userId: string,
  orderedIds: string[]
): Promise<void> {
  const supabase = createServiceClient();
  const updates = orderedIds.map((internalId, index) =>
    supabase
      .from('user_lecture_settings')
      .update({ display_order: index + 1 })
      .eq('user_id', userId)
      .eq('internal_id', internalId)
  );
  await Promise.all(updates);
}

export async function fetchAllTags(userId: string): Promise<string[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('user_lecture_settings')
    .select('tags')
    .eq('user_id', userId);

  if (!data) return [];
  const tagSet = new Set<string>();
  for (const row of data) {
    const tags = row.tags as string[] | null;
    if (Array.isArray(tags)) tags.forEach((t) => tagSet.add(t));
  }
  return Array.from(tagSet).sort();
}

export async function saveUserTheme(userId: string, theme: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, theme }, { onConflict: 'user_id' });
}
