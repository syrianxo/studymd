/**
 * app/app/lectures/page.tsx — Server component
 * Auth guard + initial data fetch, then hands off to LecturesClient.
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
    .select('internal_id, title, subtitle, course, color, icon, slide_count, created_at, json_data')
    .order('created_at', { ascending: false });

  const { data: settings } = await supabase
    .from('user_lecture_settings')
    .select('internal_id, custom_title, tags, group_id, display_order')
    .eq('user_id', user.id);

  const settingsMap = new Map((settings ?? []).map(s => [s.internal_id, s]));

  return (lectures ?? []).map(l => {
    const s = settingsMap.get(l.internal_id);
    return {
      id: l.internal_id,
      title: s?.custom_title ?? l.title,
      subtitle: l.subtitle ?? '',
      course: l.course,
      color: l.color,
      icon: l.icon,
      slideCount: l.slide_count ?? 0,
      flashcardCount: (l.json_data?.flashcards ?? []).length,
      questionCount: (l.json_data?.questions ?? []).length,
      createdAt: l.created_at,
      tags: s?.tags ?? [],
      groupId: s?.group_id ?? null,
      customTitle: s?.custom_title ?? null,
    };
  });
}

export default async function LecturesPage() {
  const lectures = await getLecturesWithCounts();
  if (lectures === null) redirect('/login?next=/app/lectures');

  return <LecturesClient initialLectures={lectures} />;
}
