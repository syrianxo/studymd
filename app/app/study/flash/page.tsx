// app/app/study/flash/page.tsx
'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import FlashcardView, { type FlashCard } from '@/components/study/FlashcardView';
import { useProgress } from '@/hooks/useProgress';
import '@/styles/study.css';

interface LectureData {
  internal_id: string;
  title: string;
  slide_count: number;
  json_data: {
    flashcards?: FlashCard[];
    [key: string]: unknown;
  };
}

export default function FlashPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <FlashPageInner />
    </Suspense>
  );
}

function FlashPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const { progressByLecture, recordFlashcard } = useProgress();

  const lectureId = params.get('lecture') ?? '';
  const topicsFilter = params.get('topics')?.split(',').filter(Boolean) ?? [];
  const countParam = Number(params.get('count') ?? '0');
  const order = (params.get('order') ?? 'random') as 'random' | 'sequential' | 'missed';

  const [lecture, setLecture] = useState<LectureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lectureId) {
      setError('No lecture specified.');
      setLoading(false);
      return;
    }

    supabase
      .from('lectures')
      .select('internal_id, title, slide_count, json_data')
      .eq('internal_id', lectureId)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError(err?.message ?? 'Lecture not found.');
        } else {
          setLecture(data as LectureData);
        }
        setLoading(false);
      });
  }, [lectureId, supabase]);

  // Called on every card mark — saves incremental progress to Supabase
  const handleProgressUpdate = useCallback(
    (gotItIds: string[], missedIds: string[], totalCards: number) => {
      if (!lecture) return;
      recordFlashcard(lecture.internal_id, gotItIds, missedIds, totalCards, false);
    },
    [lecture, recordFlashcard]
  );

  // Called at session end — same as above but increments session counter
  const handleSessionComplete = useCallback(
    (gotItIds: string[], missedIds: string[], totalCards: number) => {
      if (!lecture) return;
      recordFlashcard(lecture.internal_id, gotItIds, missedIds, totalCards, true);
    },
    [lecture, recordFlashcard]
  );

  if (loading) return <LoadingScreen />;
  if (error || !lecture) return <ErrorScreen message={error ?? 'Unknown error'} onBack={() => router.push('/app')} />;

  // Pass previously known/missed card IDs so the view can pre-mark them
  const existing = progressByLecture[lecture.internal_id];
  const knownGotItIds = existing?.got_it_ids ?? [];
  const knownMissedIds = existing?.missed_ids ?? [];

  let cards: FlashCard[] = normalizeCards(
    (lecture.json_data?.flashcards as Record<string, unknown>[] | undefined) ?? []
  );
  if (topicsFilter.length > 0) {
    cards = cards.filter((c) => topicsFilter.includes(c.topic));
  }

  if (order !== 'sequential') {
    cards = shuffle(cards);
  }

  if (countParam > 0 && countParam < cards.length) {
    cards = cards.slice(0, countParam);
  }

  return (
    <FlashcardView
      lectureTitle={lecture.title}
      lectureId={lecture.internal_id}
      cards={cards}
      slidesStoragePath={null}
      slideCount={lecture.slide_count}
      initialGotItIds={knownGotItIds}
      initialMissedIds={knownMissedIds}
      onExit={() => router.push('/app')}
      onProgressUpdate={handleProgressUpdate}
      onSessionComplete={handleSessionComplete}
    />
  );
}

function normalizeCards(raw: Record<string, unknown>[]): FlashCard[] {
  return raw.map((c) => ({
    id:           String(c.id ?? ''),
    question:     String(c.question ?? c.front ?? ''),
    answer:       String(c.answer  ?? c.back  ?? ''),
    topic:        String(c.topic   ?? ''),
    slide_number: (c.slide_number ?? c.slideNumber ?? null) as number | null,
  }));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 16,
      background: 'var(--bg)', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif',
    }}>
      <div style={{ fontSize: 36 }}>📇</div>
      <p>Loading flashcards…</p>
    </div>
  );
}

function ErrorScreen({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 32,
      background: 'var(--bg)', color: 'var(--text)', fontFamily: 'Outfit, sans-serif', textAlign: 'center',
    }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <p style={{ color: 'var(--text-muted)', maxWidth: 340 }}>{message}</p>
      <button className="btn btn-primary" onClick={onBack}>← Back to Dashboard</button>
    </div>
  );
}
