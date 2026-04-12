// app/app/study/exam/page.tsx
// Fetches lecture questions and renders the ExamView.
// URL: /app/study/exam?lecture=<lectureId>[&topics=t1,t2&count=15&types=mcq,tf]
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import ExamView, { type ExamQuestion } from '@/components/study/ExamView';
import { useProgress } from '@/hooks/useProgress';
import '@/styles/study.css';

interface LectureData {
  internal_id: string;
  title: string;
  json_data: {
    questions?: ExamQuestion[];
    [key: string]: unknown;
  };
}

export default function ExamPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ExamPageInner />
    </Suspense>
  );
}

function ExamPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const { recordSession } = useProgress();

  const lectureId = params.get('lecture') ?? '';
  const topicsFilter = params.get('topics')?.split(',').filter(Boolean) ?? [];
  const countParam = Number(params.get('count') ?? '0');
  const typesFilter = params.get('types')?.split(',').filter(Boolean) ?? [];

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
      .select('internal_id, title, json_data')
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

  if (loading) return <LoadingScreen />;
  if (error || !lecture) return <ErrorScreen message={error ?? 'Unknown error'} onBack={() => router.push('/app')} />;

  // ── Build question set ──────────────────────────────────────────────────
  let questions: ExamQuestion[] = normalizeQuestions(
    (lecture.json_data?.questions as Record<string, unknown>[] | undefined) ?? []
  );
  if (topicsFilter.length > 0) {
    questions = questions.filter((q) => topicsFilter.includes(q.topic));
  }

  if (typesFilter.length > 0) {
    questions = questions.filter((q) => typesFilter.includes(q.type));
  }

  // Shuffle
  questions = shuffle(questions);

  if (countParam > 0 && countParam < questions.length) {
    questions = questions.slice(0, countParam);
  }

  return (
    <ExamView
      lectureTitle={lecture.title}
      lectureId={lecture.internal_id}
      questions={questions}
      onExit={() => router.push('/app')}
      onSessionComplete={(score) => {
        recordSession(lecture.internal_id, 'exam', { score });
      }}
    />
  );
}

function normalizeQuestions(raw: Record<string, unknown>[]): ExamQuestion[] {
  return raw.map((q) => ({
    id:             String(q.id ?? ''),
    type:           (q.type ?? 'mcq') as ExamQuestion['type'],
    question:       String(q.question ?? q.stem ?? ''),
    topic:          String(q.topic ?? ''),
    options:        (q.options as string[] | undefined),
    correct_answer: String(q.correct_answer ?? q.answer ?? ''),
    explanation:    q.explanation ? String(q.explanation) : undefined,
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
      background: 'var(--bg)', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif'
    }}>
      <div style={{ fontSize: 36 }}>📝</div>
      <p>Loading exam questions…</p>
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
