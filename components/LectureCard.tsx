// components/LectureCard.tsx
// The user-facing lecture card displayed on the normal dashboard.
// Uses smd-* CSS classes from dashboard.css (original v1 aesthetic).
// Click → opens LectureViewModal (pop-out, not inline expand).
// This is NOT the manage-mode card — that's ManageLectureCard.tsx.
'use client';

import React from 'react';
import type { Lecture } from '@/hooks/useUserLectures';
import type { LectureProgress } from '@/hooks/useProgress';

interface LectureCardProps {
  lecture: Lecture;
  flashcardProgress: number;
  examProgress: number;
  onOpen: () => void;
}

export default function LectureCard({
  lecture,
  flashcardProgress,
  examProgress,
  onOpen,
}: LectureCardProps) {
  const color = lecture.color_override ?? lecture.color ?? 'var(--accent)';
  const course = lecture.course_override ?? lecture.course;
  const title = lecture.custom_title ?? lecture.title;
  const fcLen = (lecture.json_data?.flashcards ?? []).length;
  const qLen = ((lecture.json_data as any)?.questions ?? []).length;

  const flashColor =
    flashcardProgress >= 80 ? 'var(--success)' :
    flashcardProgress >= 60 ? 'var(--warning)' : color;
  const examColor =
    examProgress >= 80 ? 'var(--success)' :
    examProgress >= 60 ? 'var(--warning)' : 'var(--accent2, #8b5cf6)';

  return (
    <div
      className="smd-lecture-card"
      style={{ '--card-color': color } as React.CSSProperties}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
    >
      <div className="smd-card-summary">
        <div className="smd-card-top">
          <div className="smd-card-icon">{lecture.icon || '📖'}</div>
          <div className="smd-card-badges">
            <span className="smd-badge smd-badge-cards">{fcLen} cards</span>
            <span className="smd-badge smd-badge-exam">{qLen} Q&apos;s</span>
          </div>
        </div>

        {course && (
          <div className="smd-card-course-badge" style={{ background: `${color}22`, color }}>
            {course}
          </div>
        )}

        <div className="smd-card-title">{title}</div>
        {lecture.subtitle && <div className="smd-card-subtitle">{lecture.subtitle}</div>}

        {(flashcardProgress > 0 || examProgress > 0) && (
          <div className="smd-card-progress">
            {flashcardProgress > 0 && (
              <>
                <div className="smd-progress-label">
                  <span>Flashcards</span><span>{flashcardProgress}%</span>
                </div>
                <div className="smd-progress-bar">
                  <div className="smd-progress-fill" style={{ width: `${flashcardProgress}%`, background: flashColor }} />
                </div>
              </>
            )}
            {examProgress > 0 && (
              <>
                <div className="smd-progress-label" style={{ marginTop: flashcardProgress > 0 ? 7 : 0 }}>
                  <span>Last Exam</span><span>{examProgress}%</span>
                </div>
                <div className="smd-progress-bar">
                  <div className="smd-progress-fill" style={{ width: `${examProgress}%`, background: examColor }} />
                </div>
              </>
            )}
          </div>
        )}

        <div className="smd-card-expand-hint">Tap to open ↗</div>
      </div>

      <style>{cardExtraCss}</style>
    </div>
  );
}

const cardExtraCss = `
.smd-card-course-badge {
  display: inline-block;
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 100px;
  margin-bottom: 6px;
  opacity: 0.85;
}
`;
