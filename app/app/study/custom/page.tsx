// app/app/study/custom/page.tsx
// Cross-lecture custom study session.
// URL: /app/study/custom?mode=flash|exam&lectures=id1,id2&topics=t1,t2&count=20&types=mcq,tf
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import FlashcardView, { type FlashCard } from '@/components/study/FlashcardView';
import ExamView, { type ExamQuestion } from '@/components/study/ExamView';
import { useProgress } from '@/hooks/useProgress';
import '@/styles/study.css';

interface LectureData {
  id: string;
  title: string;
  slides_storage_path: string | null;
  slide_count: number;
  json_data: {
    flashcards?: FlashCard[];
    questions?: ExamQuestion[];
  };
}

export default function CustomPage() {
  return (
    <Suspense fallback={<LoadingScreen mode="flash" />}>
      <CustomPageInner />
    </Suspense>
  );
}

function CustomPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const { recordSession } = useProgress();

  const mode = (params.get('mode') ?? 'flash') as 'flash' | 'exam';
  const lectureIds = params.get('lectures')?.split(',').filter(Boolean) ?? [];
  const topicsFilter = params.get('topics')?.split(',').filter(Boolean) ?? [];
  const countParam = Number(params.get('count') ?? '20');
  const typesFilter = params.get('types')?.split(',').filter(Boolean) ?? [];

  const [lectures, setLectures] = useState<LectureData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lectureIds.length === 0) {
      setError('No lectures specified.');
      setLoading(false);
      return;
    }

    supabase
      .from('lectures')
      .select('id, title, slides_storage_path, slide_count, json_data')
      .in('id', lectureIds)
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
        } else {
          setLectures((data ?? []) as LectureData[]);
        }
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingScreen mode={mode} />;
  if (error || lectures.length === 0) {
    return <ErrorScreen message={error ?? 'No lectures found.'} onBack={() => router.push('/app')} />;
  }

  const sessionTitle = lectures.length === 1
    ? lectures[0].title
    : `${lectures.length} Lectures`;

  // ── Build merged deck ─────────────────────────────────────────────────
  if (mode === 'flash') {
    let cards: FlashCard[] = lectures.flatMap((l) => l.json_data?.flashcards ?? []);

    if (topicsFilter.length > 0) {
      cards = cards.filter((c) => topicsFilter.includes(c.topic));
    }

    cards = shuffle(cards).slice(0, countParam);

    // Use first lecture's slides for previews (best effort for cross-lecture)
    const primaryLecture = lectures[0];

    return (
      <FlashcardView
        lectureTitle={sessionTitle}
        lectureId={lectures.map((l) => l.id).join(',')}
        cards={cards}
        slidesStoragePath={primaryLecture.slides_storage_path}
        slideCount={primaryLecture.slide_count}
        onExit={() => router.push('/app')}
        onSessionComplete={async (_gotIt, _missed, pct) => {
          // Record for each lecture in the session
          await Promise.all(
            lectures.map((l) => recordSession(l.id, 'flash', { masteryPct: pct }))
          );
        }}
      />
    );
  }

  // ── Exam mode ──────────────────────────────────────────────────────────
  let questions: ExamQuestion[] = lectures.flatMap((l) => l.json_data?.questions ?? []);

  if (topicsFilter.length > 0) {
    questions = questions.filter((q) => topicsFilter.includes(q.topic));
  }

  if (typesFilter.length > 0) {
    questions = questions.filter((q) => typesFilter.includes(q.type));
  }

  questions = shuffle(questions).slice(0, countParam);

  return (
    <ExamView
      lectureTitle={sessionTitle}
      lectureId={lectures.map((l) => l.id).join(',')}
      questions={questions}
      onExit={() => router.push('/app')}
      onSessionComplete={async (score) => {
        await Promise.all(
          lectures.map((l) => recordSession(l.id, 'exam', { score }))
        );
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

function LoadingScreen({ mode }: { mode: string }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 16,
      background: 'var(--bg)', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif'
    }}>
      <div style={{ fontSize: 36 }}>{mode === 'flash' ? '📇' : '📝'}</div>
      <p>Building your custom session…</p>
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
