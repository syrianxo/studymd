/**
 * app/app/lectures/page.tsx — Server component
 * Auth guard + initial data fetch, sorted by display_order.
 */
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import LecturesClient from './LecturesClient';

async function getLecturesWithCounts() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: lectures } = await supabase
    .from('lectures')
    .select('internal_id, title, subtitle, course, color, icon, slide_count, created_at, json_data');

  const { data: settings } = await supabase
    .from('user_lecture_settings')
    .select('internal_id, custom_title, tags, group_id, display_order, color_override, course_override')
    .eq('user_id', user.id);

  const settingsMap = new Map((settings ?? []).map(s => [s.internal_id, s]));

  const mapped = (lectures ?? []).map(l => {
    const s = settingsMap.get(l.internal_id);
    return {
      id: l.internal_id,
      title: l.title,
      subtitle: l.subtitle ?? '',
      course: s?.course_override ?? l.course,
      color: s?.color_override ?? l.color,
      icon: l.icon,
      slideCount: l.slide_count ?? 0,
      flashcardCount: (l.json_data?.flashcards ?? []).length,
      questionCount: (l.json_data?.questions ?? []).length,
      createdAt: l.created_at,
      tags: s?.tags ?? [],
      groupId: s?.group_id ?? null,
      customTitle: s?.custom_title ?? null,
      // Lectures without a display_order row sort by created_at (newest last = high order)
      displayOrder: s?.display_order ?? 9999,
    };
  });

  // Sort by display_order ascending; ties break by created_at desc
  mapped.sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return mapped;
}

export default async function LecturesPage() {
  const lectures = await getLecturesWithCounts();
  if (lectures === null) redirect('/login?next=/app/lectures');
  return <LecturesClient initialLectures={lectures} />;
}
