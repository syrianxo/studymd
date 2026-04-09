// components/LectureGrid.tsx
'use client';

import LectureCard from './LectureCard';
import type { Lecture } from '@/hooks/useUserLectures';
import type { LectureProgress } from '@/hooks/useProgress';

interface LectureGridProps {
  lectures: Lecture[];
  progressByLecture: Record<string, LectureProgress>;
  loading: boolean;
  onStartFlash: (lectureId: string) => void;
  onStartExam: (lectureId: string) => void;
}

export default function LectureGrid({
  lectures,
  progressByLecture,
  loading,
  onStartFlash,
  onStartExam,
}: LectureGridProps) {
  if (loading) {
    return (
      <div className="smd-lecture-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (lectures.length === 0) {
    return (
      <div className="smd-lecture-grid">
        <div className="smd-empty-state">
          <div className="smd-empty-icon">📚</div>
          <div className="smd-empty-title">No lectures found</div>
          <div className="smd-empty-desc">
            No lectures match your current filter. Try selecting a different course or
            contact your administrator to add content.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="smd-lecture-grid">
      {lectures.map((lecture) => (
        <LectureCard
          key={lecture.internal_id}
          lecture={lecture}
          progress={progressByLecture[lecture.internal_id] ?? null}
          onStartFlash={onStartFlash}
          onStartExam={onStartExam}
        />
      ))}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div
      className="smd-lecture-card"
      style={{ cursor: 'default', animation: 'smd-skeleton-pulse 1.6s ease infinite' }}
    >
      <div className="smd-card-summary">
        <div className="smd-card-top" style={{ marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface2)' }} />
          <div style={{ width: 80, height: 20, borderRadius: 50, background: 'var(--surface2)' }} />
        </div>
        <div style={{ width: '70%', height: 18, borderRadius: 6, background: 'var(--surface2)', marginBottom: 8 }} />
        <div style={{ width: '45%', height: 13, borderRadius: 6, background: 'var(--surface2)', marginBottom: 16 }} />
        <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'var(--surface2)', marginBottom: 14 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ height: 38, borderRadius: 8, background: 'var(--surface2)' }} />
          <div style={{ height: 38, borderRadius: 8, background: 'var(--surface2)' }} />
        </div>
      </div>

      <style>{`
        @keyframes smd-skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
