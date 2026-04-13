'use client';

// app/app/study/exam/[id]/ExamStudyClient.tsx

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ExamView, { type ExamQuestion } from '@/components/study/ExamView';

interface ExamStudyClientProps {
  lectureId: string;
  lectureTitle: string;
  questions: ExamQuestion[];
  examProgress: {
    sessions?: Array<{ score: number; correct: number; total: number; date: string }>;
  } | null;
}

export default function ExamStudyClient({
  lectureId,
  lectureTitle,
  questions,
  examProgress,
}: ExamStudyClientProps) {
  const router = useRouter();

  const handleSessionComplete = useCallback(
    async (score: number, correct: number, total: number) => {
      const newSession = {
        score,
        correct,
        total,
        date: new Date().toISOString(),
      };

      const existingSessions = examProgress?.sessions ?? [];
      const updatedSessions = [...existingSessions, newSession].slice(-50); // keep last 50

      try {
        await fetch('/api/progress/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            internalId: lectureId,
            type: 'exam',
            data: {
              sessions: updatedSessions,
              last_score: score,
              best_score: Math.max(score, ...existingSessions.map((s) => s.score)),
              last_updated: new Date().toISOString(),
            },
          }),
        });
      } catch {
        // Fail silently — session data saved in parent
      }
    },
    [lectureId, examProgress]
  );

  if (questions.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: 16,
        color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif',
      }}>
        <div style={{ fontSize: 32 }}>📭</div>
        <div>No questions match your selection.</div>
        <button
          onClick={() => router.push('/app')}
          style={{
            padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
            background: 'none', color: 'var(--text)', cursor: 'pointer',
            fontFamily: 'Outfit, sans-serif', fontSize: 14,
          }}
        >
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <ExamView
      lectureTitle={lectureTitle}
      lectureId={lectureId}
      questions={questions}
      onExit={() => router.push('/app')}
      onSessionComplete={handleSessionComplete}
    />
  );
}
