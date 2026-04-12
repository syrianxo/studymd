// components/LectureGrid.tsx
'use client';

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
        <SimpleLectureCard
          key={lecture.internal_id}
          lecture={lecture}
          progress={progressByLecture[lecture.internal_id] ?? null}
          onStartFlash={() => onStartFlash(lecture.internal_id)}
          onStartExam={() => onStartExam(lecture.internal_id)}
        />
      ))}
    </div>
  );
}

// ── Simple card for the main dashboard grid ───────────────────────────────────

interface SimpleCardProps {
  lecture: Lecture;
  progress: LectureProgress | null;
  onStartFlash: () => void;
  onStartExam: () => void;
}

function SimpleLectureCard({ lecture, progress, onStartFlash, onStartExam }: SimpleCardProps) {
  const fcPct = progress?.mastery_pct ?? 0;
  const examPct = progress?.best_exam_score ?? 0;
  const color = lecture.color ?? '#5b8dee';

  return (
    <div className="smd-lecture-card" style={{ position: 'relative' }}>
      {/* Accent bar */}
      <div
        style={{
          position: 'absolute', top: 0, left: 20, right: 20,
          height: 3, borderRadius: '0 0 4px 4px', background: color,
        }}
      />

      <div className="smd-card-summary">
        <div className="smd-card-top">
          <span style={{ fontSize: 28 }}>{lecture.icon}</span>
          <span
            style={{
              fontFamily: "'DM Mono', monospace", fontSize: 10,
              padding: '2px 8px', borderRadius: 100,
              background: `${color}22`, color,
            }}
          >
            {lecture.course}
          </span>
        </div>

        <div
          style={{
            fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600,
            color: 'var(--text)', lineHeight: 1.3, margin: '10px 0 4px',
          }}
        >
          {lecture.custom_title ?? lecture.title}
        </div>

        {lecture.subtitle && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {lecture.subtitle}
          </div>
        )}

        {/* Progress bars */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Flashcards', pct: fcPct },
            { label: 'Exam', pct: examPct },
          ].map(({ label, pct }) => (
            <div
              key={label}
              style={{
                flex: 1, fontFamily: "'DM Mono', monospace",
                fontSize: 10, color: 'var(--text-muted)',
              }}
            >
              {label}
              <div
                style={{
                  height: 4, background: 'rgba(255,255,255,0.07)',
                  borderRadius: 2, marginTop: 3, overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%', width: `${pct}%`,
                    background: color, opacity: 0.75,
                    borderRadius: 2, transition: 'width 0.4s',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onStartFlash}>
            📇 Flashcards
          </button>
          <button className="btn btn-secondary" onClick={onStartExam}>
            📝 Exam
          </button>
        </div>
      </div>
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
