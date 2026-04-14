// components/LectureGrid.tsx
// Manages the grid layout of lecture cards on the normal dashboard.
// Imports LectureCard for rendering and LectureViewModal for the pop-out.
// Does NOT contain card rendering logic — that lives in LectureCard.tsx.
'use client';

import React, { useState } from 'react';
import LectureCard from './LectureCard';
import LectureViewModal from './LectureViewModal';
import type { Lecture } from '@/hooks/useUserLectures';
import type { LectureProgress } from '@/hooks/useProgress';
import type { Course } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LectureGridProps {
  lectures: Lecture[];
  progressByLecture: Record<string, LectureProgress>;
  loading: boolean;
  onStartFlash: (lectureId: string) => void;
  onStartExam: (lectureId: string) => void;
  onChangeCourse?: (lectureId: string, course: Course) => void;
  onChangeColor?: (lectureId: string, color: string) => void;
  onHide?: (lectureId: string) => void;
  onArchive?: (lectureId: string) => void;
}

// ─── Grid ────────────────────────────────────────────────────────────────────

export default function LectureGrid({
  lectures, progressByLecture, loading,
  onStartFlash, onStartExam,
  onChangeColor, onHide, onArchive,
}: LectureGridProps) {
  const [openLecture, setOpenLecture] = useState<Lecture | null>(null);
  const openProgress = openLecture
    ? progressByLecture[openLecture.internal_id] ?? null
    : null;

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
      <div className="smd-lecture-grid">
        {lectures.map(lecture => {
          const progress = progressByLecture[lecture.internal_id] ?? null;
          return (
            <LectureCard
              key={lecture.internal_id}
              lecture={lecture}
              flashcardProgress={progress?.mastery_pct ?? 0}
              examProgress={progress?.best_exam_score ?? 0}
              onOpen={() => setOpenLecture(lecture)}
            />
          );
        })}
      </div>

      {/* Pop-out modal when a card is clicked */}
      {openLecture && (
        <LectureViewModal
          lecture={openLecture}
          flashcardProgress={openProgress?.mastery_pct ?? 0}
          examProgress={openProgress?.best_exam_score ?? 0}
          onClose={() => setOpenLecture(null)}
          onFlashcards={() => {
            setOpenLecture(null);
            onStartFlash(openLecture.internal_id);
          }}
          onExam={() => {
            setOpenLecture(null);
            onStartExam(openLecture.internal_id);
          }}
          onChangeColor={onChangeColor
            ? (c) => onChangeColor(openLecture.internal_id, c)
            : undefined}
          onHide={onHide
            ? () => { onHide(openLecture.internal_id); setOpenLecture(null); }
            : undefined}
          onArchive={onArchive
            ? () => { onArchive(openLecture.internal_id); setOpenLecture(null); }
            : undefined}
        />
      )}
    </>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

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
