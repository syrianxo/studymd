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
  internal_id: string;
  title: string;
  slide_count: number;
  // json_data is raw storage — normalized by the helpers below which accept
  // both canonical (front/back, stem/answer) and legacy (question/answer,
  // correct_answer) keys.
  json_data: {
    flashcards?: Record<string, unknown>[];
    questions?: Record<string, unknown>[];
    examQuestions?: Record<string, unknown>[]; // v1 key — tolerated on read
  };
}

// Canonicalize flashcard shape for FlashcardView (front/back). Tolerates
// legacy `question`/`answer` keys until data migration completes.
function normalizeCards(raw: Record<string, unknown>[]): FlashCard[] {
  return raw.map((c) => ({
    id:    String(c.id ?? ''),
    front: String(c.front ?? c.question ?? ''),
    back:  String(c.back  ?? c.answer   ?? ''),
    topic: String(c.topic ?? ''),
    slide_number: (c.slide_number ?? c.slideNumber ?? null) as number | null,
  }));
}

// ExamView still uses legacy `question`/`correct_answer` keys — translate the
// canonical `stem`/`answer` into that shape here.
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
  const { progressByLecture, recordFlashcard, recordSession } = useProgress();

  const mode = (params.get('mode') ?? 'flash') as 'flash' | 'exam';
  const lectureIds = params.get('lectures')?.split(',').filter(Boolean) ?? [];
  const topicsFilter = params.get('topics')?.split(',').filter(Boolean) ?? [];
  const countParam = Number(params.get('count') ?? '20');
  const typesFilter = params.get('types')?.split(',').filter(Boolean) ?? [];
  const cardMode = (params.get('cardMode') ?? 'all') as 'all' | 'new' | 'missed';
  const questionMode = (params.get('questionMode') ?? 'all') as 'all' | 'new' | 'missed';

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
      .select('internal_id, title, slide_count, json_data')
      .in('internal_id', lectureIds)
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
    let cards: FlashCard[] = lectures.flatMap((l) => {
      const lCards = normalizeCards(l.json_data?.flashcards ?? []);
      if (cardMode === 'new') {
        const progress = progressByLecture[l.internal_id];
        const seen = new Set([...(progress?.got_it_ids ?? []), ...(progress?.missed_ids ?? [])]);
        return lCards.filter((c) => !seen.has(c.id));
      }
      if (cardMode === 'missed') {
        const progress = progressByLecture[l.internal_id];
        const missed = new Set(progress?.missed_ids ?? []);
        return lCards.filter((c) => missed.has(c.id));
      }
      return lCards;
    });

    if (topicsFilter.length > 0) {
      cards = cards.filter((c) => topicsFilter.includes(c.topic));
    }

    cards = shuffle(cards).slice(0, countParam);

    // Use first lecture's slides for previews (best effort for cross-lecture)
    const primaryLecture = lectures[0];

    return (
      <FlashcardView
        lectureTitle={sessionTitle}
        lectureId={lectures.map((l) => l.internal_id).join(',')}
        cards={cards}
        slidesStoragePath={primaryLecture.internal_id}
        slideCount={primaryLecture.slide_count}
        onExit={() => router.push('/app')}
        onProgressUpdate={(gotItIds, missedIds, totalCards) => {
          lectures.forEach((l) => recordFlashcard(l.internal_id, gotItIds, missedIds, totalCards, false));
        }}
        onSessionComplete={(gotItIds, missedIds, totalCards) => {
          lectures.forEach((l) => recordFlashcard(l.internal_id, gotItIds, missedIds, totalCards, true));
        }}
      />
    );
  }

  // ── Exam mode ──────────────────────────────────────────────────────────
  // v1 JSON uses 'examQuestions', v2 normalised key is 'questions'. Try both.
  let questions: ExamQuestion[] = lectures.flatMap((l) => {
    const lQs = normalizeQuestions(l.json_data?.questions ?? l.json_data?.examQuestions ?? []);
    if (questionMode === 'new') {
      const progress = progressByLecture[l.internal_id];
      const attempted = new Set(progress?.attempted_question_ids ?? []);
      return lQs.filter((q) => !attempted.has(q.id));
    }
    if (questionMode === 'missed') {
      const progress = progressByLecture[l.internal_id];
      const missedQs = new Set(progress?.missed_question_ids ?? []);
      return lQs.filter((q) => missedQs.has(q.id));
    }
    return lQs;
  });

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
      lectureId={lectures.map((l) => l.internal_id).join(',')}
      questions={questions}
      onExit={() => router.push('/app')}
      onSessionComplete={async (score, _correct, _total, attemptedIds, missedIds) => {
        await Promise.all(
          lectures.map((l) => recordSession(l.internal_id, 'exam', { score, attemptedIds, missedQuestionIds: missedIds }))
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
