import { createClient } from '@supabase/supabase-js';
import type {
  UserLectureSettings,
  LectureWithSettings,
  UserPreferences,
  Theme,
  Course,
} from '@/types';

// ─── Supabase Client ────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Lecture Settings API ───────────────────────────────────────────────────

/**
 * Fetch all lectures with user settings, ordered by display_order.
 */
export async function fetchLecturesWithSettings(
  userId: string
): Promise<LectureWithSettings[]> {
  const { data, error } = await supabase
    .from('lectures')
    .select(
      `
      *,
      settings:user_lecture_settings!inner(*)
    `
    )
    .eq('user_lecture_settings.user_id', userId)
    .order('display_order', {
      foreignTable: 'user_lecture_settings',
      ascending: true,
    });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    settings: row.settings,
    display_title: row.settings.custom_title ?? row.title,
    display_course: (row.settings.course_override ?? row.course) as Course,
    display_color: row.settings.color_override ?? row.color,
  }));
}

/**
 * Update settings for a single lecture (optimistic-UI friendly).
 */
export async function updateLectureSettings(
  userId: string,
  internalId: string,
  patch: Partial<Omit<UserLectureSettings, 'user_id' | 'internal_id'>>
): Promise<void> {
  const { error } = await supabase.from('user_lecture_settings').upsert(
    {
      user_id: userId,
      internal_id: internalId,
      ...patch,
    },
    { onConflict: 'user_id,internal_id' }
  );
  if (error) throw error;
}

/**
 * Batch-update display_order for a list of lecture IDs.
 * @param orderedIds - Array of internal_ids in their new order
 */
export async function reorderLectures(
  userId: string,
  orderedIds: string[]
): Promise<void> {
  const updates = orderedIds.map((id, index) => ({
    user_id: userId,
    internal_id: id,
    display_order: index,
  }));

  const { error } = await supabase
    .from('user_lecture_settings')
    .upsert(updates, { onConflict: 'user_id,internal_id' });

  if (error) throw error;
}

// ─── Tag Helpers ────────────────────────────────────────────────────────────

/**
 * Collect all unique tags across all user's lecture settings.
 */
export async function fetchAllTags(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_lecture_settings')
    .select('tags')
    .eq('user_id', userId);

  if (error) throw error;

  const tagSet = new Set<string>();
  (data ?? []).forEach((row: { tags: string[] }) => {
    (row.tags ?? []).forEach((t) => tagSet.add(t));
  });
  return Array.from(tagSet).sort();
}

// ─── User Preferences ───────────────────────────────────────────────────────

export async function fetchUserPreferences(
  userId: string
): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data ?? null;
}

export async function saveUserTheme(
  userId: string,
  theme: Theme
): Promise<void> {
  const { error } = await supabase.from('user_preferences').upsert(
    { user_id: userId, theme },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}
