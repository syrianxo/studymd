// components/LectureGrid.tsx
// Grid layout of lecture cards. LectureViewModal is kept permanently mounted
// to prevent the re-render flash on open/close — only its content swaps.
'use client';

import React, { useState, useCallback } from 'react';
import LectureCard from './LectureCard';
import LectureViewModal from './LectureViewModal';
import type { Lecture } from '@/hooks/useUserLectures';
import type { LectureProgress } from '@/hooks/useProgress';
import type { Course, Theme } from '@/types';

interface LectureGridProps {
  lectures: Lecture[];
  progressByLecture: Record<string, LectureProgress>;
  loading: boolean;
  activeTheme: Theme;
  onStartFlash: (lectureId: string) => void;
  onStartExam: (lectureId: string) => void;
  onChangeCourse?: (lectureId: string, course: Course) => void;
  onChangeColor?: (lectureId: string, color: string) => void;
  onHide?: (lectureId: string) => void;
  onArchive?: (lectureId: string) => void;
  onRenameTitle?: (lectureId: string, title: string) => void;
  /** lectureId → next scheduled ISO date from the active study plan */
  planNextReview?: Record<string, string>;
  /** lectureId → test date ISO string from active plan */
  planTestDate?: string;
}

export default function LectureGrid({
  lectures, progressByLecture, loading,
  activeTheme,
  onStartFlash, onStartExam,
  onChangeCourse, onChangeColor,
  onHide, onArchive, onRenameTitle,
  planNextReview = {},
  planTestDate,
}: LectureGridProps) {
  const [openLecture, setOpenLecture] = useState<Lecture | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openProgress = openLecture
    ? progressByLecture[openLecture.internal_id] ?? null
    : null;

  const handleOpen = useCallback((lecture: Lecture) => {
    setOpenLecture(lecture);
    setIsModalOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
    setTimeout(() => setOpenLecture(null), 300);
  }, []);

  if (loading) {
    return (
      <div className="smd-lecture-grid">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
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
    <>
      <style>{planBadgeCss}</style>
      <div className="smd-lecture-grid">
        {lectures.map(lecture => {
          const progress    = progressByLecture[lecture.internal_id] ?? null;
          const nextReview  = planNextReview[lecture.internal_id];
          const isToday     = nextReview === todayISO();
          return (
            <div key={lecture.internal_id} className="smd-grid-cell">
              {/* Plan badges rendered as overlay above the card */}
              {(nextReview || planTestDate) && (
                <div className="smd-plan-badges">
                  {planTestDate && (
                    <span className="smd-plan-badge smd-plan-badge--test">
                      🎯 {daysUntil(planTestDate)}d to test
                    </span>
                  )}
                  {nextReview && (
                    <span className={`smd-plan-badge${isToday ? ' smd-plan-badge--today' : ''}`}>
                      {isToday ? '📌 Study today' : `📅 Next: ${formatShortDate(nextReview)}`}
                    </span>
                  )}
                </div>
              )}
              <LectureCard
                lecture={lecture}
                activeTheme={activeTheme}
                flashcardProgress={progress?.mastery_pct ?? 0}
                examProgress={progress?.best_exam_score ?? 0}
                onOpen={() => handleOpen(lecture)}
                onFlashcards={() => onStartFlash(lecture.internal_id)}
                onExam={() => onStartExam(lecture.internal_id)}
                onChangeCourse={onChangeCourse ? (c) => onChangeCourse(lecture.internal_id, c) : undefined}
                onChangeColor={onChangeColor ? (c) => onChangeColor(lecture.internal_id, c) : undefined}
                onHide={onHide ? () => onHide(lecture.internal_id) : undefined}
                onArchive={onArchive ? () => onArchive(lecture.internal_id) : undefined}
              />
            </div>
          );
        })}
      </div>

      <LectureViewModal
        lecture={openLecture}
        isOpen={isModalOpen}
        activeTheme={activeTheme}
        flashcardProgress={openProgress?.mastery_pct ?? 0}
        examProgress={openProgress?.best_exam_score ?? 0}
        onClose={handleClose}
        onFlashcards={() => { handleClose(); if (openLecture) onStartFlash(openLecture.internal_id); }}
        onExam={() => { handleClose(); if (openLecture) onStartExam(openLecture.internal_id); }}
        onChangeColor={onChangeColor && openLecture ? (c) => onChangeColor(openLecture.internal_id, c) : undefined}
        onChangeCourse={onChangeCourse && openLecture ? (c) => onChangeCourse(openLecture.internal_id, c) : undefined}
        onRenameTitle={onRenameTitle && openLecture ? (t) => onRenameTitle(openLecture.internal_id, t) : undefined}
        onHide={onHide && openLecture ? () => { onHide(openLecture.internal_id); handleClose(); } : undefined}
        onArchive={onArchive && openLecture ? () => { onArchive(openLecture.internal_id); handleClose(); } : undefined}
      />
    </>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}

function daysUntil(iso: string): number {
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.ceil((new Date(iso + 'T00:00:00').getTime() - t.getTime()) / 86_400_000);
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Plan badge CSS ─────────────────────────────────────────────────────────────

const planBadgeCss = `
.smd-grid-cell { position: relative; }

.smd-plan-badges {
  position: absolute;
  top: -8px;
  left: 12px;
  z-index: 5;
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  pointer-events: none;
}

.smd-plan-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 100px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  font-family: 'DM Mono', monospace;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.smd-plan-badge--today {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.smd-plan-badge--test {
  background: rgba(245,158,11,0.12);
  border-color: rgba(245,158,11,0.4);
  color: #f59e0b;
}
`;

function SkeletonCard() {
  return (
    <div className="smd-lecture-card" style={{ cursor: 'default', animation: 'smd-skeleton-pulse 1.6s ease infinite' }}>
      <div className="smd-card-summary">
        <div className="smd-card-top">
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface2)', flexShrink: 0 }} />
          <div className="smd-card-badges">
            <span style={{ width: 56, height: 20, borderRadius: 50, background: 'var(--surface2)', display: 'block' }} />
            <span style={{ width: 42, height: 20, borderRadius: 50, background: 'var(--surface2)', display: 'block' }} />
          </div>
        </div>
        <div style={{ width: '70%', height: 18, borderRadius: 6, background: 'var(--surface2)', marginBottom: 6 }} />
        <div style={{ width: '50%', height: 12, borderRadius: 4, background: 'var(--surface2)', marginBottom: 12 }} />
        <div style={{ height: 3, borderRadius: 2, background: 'var(--surface2)', marginBottom: 10 }} />
        <div style={{ height: 10, width: 70, borderRadius: 4, background: 'var(--surface2)' }} />
      </div>
      <style>{`@keyframes smd-skeleton-pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );
}
