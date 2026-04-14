// app/app/study/flashcards/[id]/page.tsx
//
// Reads URL search params set by FlashcardConfigModal:
//   ?count=10&topics=Topic+A,Topic+B&order=random
//
// Then filters the lecture's flashcard pool and launches FlashcardView.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import FlashcardStudyClient from './FlashcardStudyClient';

interface PageProps {
  params: { id: string };
  searchParams: {
    count?: string;
    topics?: string;   // comma-separated
    order?: string;    // 'random' | 'sequential'
  };
}

export default async function FlashcardStudyPage({ params, searchParams }: PageProps) {
  const supabase = createServerComponentClient({ cookies });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  // Fetch lecture
  const { data: lecture, error } = await supabase
    .from('lectures')
    .select('internal_id, title, subtitle, icon, json_data, slide_count')
    .eq('internal_id', params.id)
    .single();

  if (error || !lecture) redirect('/app');

  // Fetch user progress
  const { data: progress } = await supabase
    .from('user_progress')
    .select('flashcard_progress')
    .eq('user_id', session.user.id)
    .eq('internal_id', params.id)
    .single();

  // Fetch user lecture settings for slide path + display color
  const { data: settings } = await supabase
    .from('user_lecture_settings')
    .select('color_override')
    .eq('user_id', session.user.id)
    .eq('internal_id', params.id)
    .single();

  const jsonData = lecture.json_data as { flashcards?: unknown[] } | null;
  const allCards = (jsonData?.flashcards ?? []) as Array<{
    id: string; question: string; answer: string; topic: string; slide_number?: number | null;
  }>;

  // Parse config from URL
  const requestedCount = searchParams.count ? parseInt(searchParams.count, 10) : null;
  const requestedTopics = searchParams.topics
    ? searchParams.topics.split(',').map((t) => decodeURIComponent(t.trim())).filter(Boolean)
    : null;
  const order = (searchParams.order === 'sequential' ? 'sequential' : 'random') as 'random' | 'sequential';

  // Filter by topics if specified
  let filteredCards = requestedTopics && requestedTopics.length > 0
    ? allCards.filter((c) => requestedTopics.includes(c.topic))
    : allCards;

  // Sort before slicing if sequential
  if (order === 'sequential') {
    // Keep original array order (JSON order = lecture order)
    // If random, the FlashcardView handles shuffle internally — we pass cards sorted here
  }

  // Limit to requested count
  if (requestedCount && requestedCount > 0 && requestedCount < filteredCards.length) {
    filteredCards = filteredCards.slice(0, requestedCount);
  }

  const flashcardProgress = progress?.flashcard_progress as {
    got_it_ids?: string[];
    missed_ids?: string[];
  } | null;

  const slidesStoragePath = `slides/${lecture.internal_id}`;

  return (
    <FlashcardStudyClient
      lectureId={lecture.internal_id}
      lectureTitle={lecture.title}
      cards={filteredCards}
      allCards={allCards}
      order={order}
      slidesStoragePath={slidesStoragePath}
      slideCount={lecture.slide_count ?? 0}
      initialGotItIds={flashcardProgress?.got_it_ids ?? []}
      initialMissedIds={flashcardProgress?.missed_ids ?? []}
    />
  );
}
