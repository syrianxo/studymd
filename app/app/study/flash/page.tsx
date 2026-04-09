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
  const { recordSession, saveProgress } = useProgress();

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

  // Save mid-session mastery as cards are marked, so progress
  // reaches Supabase even if the user exits before finishing the deck.
  const handleProgressUpdate = useCallback(
    (gotItCount: number, totalCards: number) => {
      if (!lecture) return;
      const pct = totalCards > 0 ? Math.round((gotItCount / totalCards) * 100) : 0;
      saveProgress(lecture.internal_id, pct);
    },
    [lecture, saveProgress]
  );

  if (loading) return <LoadingScreen />;
  if (error || !lecture) return <ErrorScreen message={error ?? 'Unknown error'} onBack={() => router.push('/app')} />;

  let cards: FlashCard[] = lecture.json_data?.flashcards ?? [];

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
      onExit={() => router.push('/app')}
      onProgressUpdate={handleProgressUpdate}
      onSessionComplete={async (_gotIt, _missed, pct) => {
        // Session complete: record a full session with final mastery %
        recordSession(lecture.internal_id, 'flash', { masteryPct: pct });
      }}
    />
  );
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
