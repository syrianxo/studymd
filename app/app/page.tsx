import { createServerComponentClient, fetchLecturesWithSettings, fetchUserPreferences } from '@/lib/supabase-server';
import type { LectureWithSettings, Course } from '@/types';
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
  const [rawLectures, preferences] = await Promise.all([
  fetchLecturesWithSettings(userId),
  fetchUserPreferences(userId),
  ]);

  // fetchLecturesWithSettings returns Supabase join rows:
  //   { display_order, visible, ..., lecture: { title, course, ... } }
  // Transform them into the LectureWithSettings shape that DashboardClient expects.
  const lectures: LectureWithSettings[] = (rawLectures as any[]).map((row) => {
    const l = row.lecture;
    return {
      // Spread all base Lecture fields from the nested object
      ...l,
      // Nest the settings fields
      settings: {
        user_id:         row.user_id,
        internal_id:     row.internal_id,
        display_order:   row.display_order,
        visible:         row.visible,
        archived:        row.archived,
        group_id:        row.group_id   ?? null,
        tags:            row.tags       ?? [],
        course_override: row.course_override ?? null,
        color_override:  row.color_override  ?? null,
        custom_title:    row.custom_title    ?? null,
      },
      // Computed display values — settings override base lecture
      display_title:  row.custom_title   ?? l.title,
      display_course: (row.course_override ?? l.course) as Course,
      display_color:  row.color_override  ?? l.color,
    };
  });

  return (
    <DashboardClient
      userId={userId}
      initialLectures={lectures}
      initialTheme={preferences?.theme ?? 'midnight'}
    />
  );
}
