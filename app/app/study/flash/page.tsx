// app/app/study/flash/page.tsx
// Fetches lecture flashcards and renders the FlashcardView.
// URL: /app/study/flash?lecture=<lectureId>[&topics=t1,t2&count=20&order=random]
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import FlashcardView, { type FlashCard } from '@/components/study/FlashcardView';
import { useProgress } from '@/hooks/useProgress';
import '@/styles/study.css';

interface LectureData {
  id: string;
  title: string;
  slides_storage_path: string | null;
  slide_count: number;
  json_data: {
    flashcards?: FlashCard[];
    [key: string]: unknown;
  };
}

export default function FlashPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const { recordSession } = useProgress();

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
      .select('id, title, slides_storage_path, slide_count, json_data')
      .eq('id', lectureId)
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

  if (loading) return <LoadingScreen />;
  if (error || !lecture) return <ErrorScreen message={error ?? 'Unknown error'} onBack={() => router.push('/app')} />;

  // ── Build deck ──────────────────────────────────────────────────────────
  let cards: FlashCard[] = lecture.json_data?.flashcards ?? [];

  if (topicsFilter.length > 0) {
    cards = cards.filter((c) => topicsFilter.includes(c.topic));
  }

  if (order === 'sequential') {
    // keep as-is
  } else {
    cards = shuffle(cards);
  }

  if (countParam > 0 && countParam < cards.length) {
    cards = cards.slice(0, countParam);
  }

  return (
    <FlashcardView
      lectureTitle={lecture.title}
      lectureId={lecture.id}
      cards={cards}
      slidesStoragePath={lecture.slides_storage_path}
      slideCount={lecture.slide_count}
      onExit={() => router.push('/app')}
      onSessionComplete={async (gotIt, missed, pct) => {
        await recordSession(lecture.id, 'flash', { masteryPct: pct });
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
      background: 'var(--bg)', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif'
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
      background: 'var(--bg)', color: 'var(--text)', fontFamily: 'Outfit, sans-serif', textAlign: 'center'
    }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <p style={{ color: 'var(--text-muted)', maxWidth: 340 }}>{message}</p>
      <button className="btn btn-primary" onClick={onBack}>← Back to Dashboard</button>
    </div>
  );
}
