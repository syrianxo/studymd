// components/LectureCard.tsx
'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import type { Lecture } from '@/hooks/useUserLectures';
import { getSlideThumbUrl } from '@/hooks/useUserLectures';
import type { LectureProgress } from '@/hooks/useProgress';

interface LectureCardProps {
  lecture: Lecture;
  progress: LectureProgress | null;
  onStartFlash: (lectureId: string) => void;
  onStartExam: (lectureId: string) => void;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

export default function LectureCard({
  lecture,
  progress,
  onStartFlash,
  onStartExam,
}: LectureCardProps) {
  const [expanded, setExpanded] = useState(false);
  const expandRef = useRef<HTMLDivElement>(null);

  const masteryPct = progress?.mastery_pct ?? 0;
  const sessionsCount = (progress?.flash_sessions ?? 0) + (progress?.exam_sessions ?? 0);

  // ── Slide thumbnails from Supabase Storage ──────────────────────────────
  const slideThumbUrls: string[] = Array.from({ length: lecture.slide_count }, (_, i) =>
    getSlideThumbUrl(SUPABASE_URL, lecture.internal_id, i)
  );

  function handleCardClick(e: React.MouseEvent) {
    // Don't toggle expand if a button was clicked
    if ((e.target as HTMLElement).closest('button')) return;
    setExpanded((v) => !v);
  }

  function handleFlash(e: React.MouseEvent) {
    e.stopPropagation();
    onStartFlash(lecture.id);
  }

  function handleExam(e: React.MouseEvent) {
    e.stopPropagation();
    onStartExam(lecture.id);
  }

  // Progress bar color mirrors card accent color
  const progressColor = lecture.color || 'var(--accent)';

  return (
    <div
      className="smd-lecture-card"
      style={{ '--card-color': lecture.color } as React.CSSProperties}
      onClick={handleCardClick}
      role="article"
      aria-expanded={expanded}
    >
      {/* ── Summary ───────────────────────────────────────────────────── */}
      <div className="smd-card-summary">
        <div className="smd-card-top">
          <span className="smd-card-icon">{lecture.icon}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="smd-card-badges">
              {lecture.json_data?.flashcards && lecture.json_data.flashcards.length > 0 && (
                <span className="smd-badge smd-badge-cards">
                  {lecture.json_data.flashcards.length} cards
                </span>
              )}
              {lecture.json_data?.questions && lecture.json_data.questions.length > 0 && (
                <span className="smd-badge smd-badge-exam">
                  {lecture.json_data.questions.length} Q
                </span>
              )}
            </div>
            <span className="smd-card-expand-hint">
              {expanded ? '▲' : '▼'}
            </span>
          </div>
        </div>

        <div className="smd-card-title">
          {lecture.custom_title ?? lecture.title}
        </div>
        <div className="smd-card-subtitle">{lecture.subtitle}</div>

        {lecture.topics.length > 0 && (
          <div className="smd-card-topics">
            {lecture.topics.slice(0, 5).map((t) => (
              <span key={t} className="smd-topic-chip">
                {t}
              </span>
            ))}
            {lecture.topics.length > 5 && (
              <span className="smd-topic-chip">+{lecture.topics.length - 5}</span>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div className="smd-card-progress">
          <div className="smd-progress-label">
            <span>Mastery</span>
            <span>
              {masteryPct}%
              {sessionsCount > 0 && (
                <> · {sessionsCount} session{sessionsCount !== 1 ? 's' : ''}</>
              )}
            </span>
          </div>
          <div className="smd-progress-bar">
            <div
              className="smd-progress-fill"
              style={{
                width: `${masteryPct}%`,
                background: progressColor,
              }}
            />
          </div>
        </div>

        {/* Quick-action buttons */}
        <div className="smd-card-actions">
          <button className="btn btn-flash" onClick={handleFlash}>
            📇 Flashcards
          </button>
          <button className="btn btn-exam" onClick={handleExam}>
            📝 Exam
          </button>
        </div>
      </div>

      {/* ── Expand panel ─────────────────────────────────────────────── */}
      <div
        ref={expandRef}
        className={`smd-lecture-expand${expanded ? ' open' : ''}`}
      >
        <div className="smd-expand-inner">
          {/* Study mode buttons */}
          <div className="smd-expand-section-label">Study Mode</div>
          <div className="smd-expand-mode-btns">
            <button className="smd-expand-mode-btn flash-btn" onClick={handleFlash}>
              <div className="mode-icon">📇</div>
              <div className="mode-label">Flashcards</div>
              <div className="mode-sub">{lecture.json_data?.flashcards?.length ?? 0} cards</div>
            </button>
            <button className="smd-expand-mode-btn exam-btn" onClick={handleExam}>
              <div className="mode-icon">📝</div>
              <div className="mode-label">Practice Exam</div>
              <div className="mode-sub">{lecture.json_data?.questions?.length ?? 0} questions</div>
            </button>
          </div>

          {/* Slide thumbnails */}
          {lecture.slide_count > 0 && (
            <>
              <div className="smd-expand-section-label">
                Slide Reference · {lecture.slide_count} slides
              </div>
              <div className="smd-slide-strip">
                {slideThumbUrls.map((url, i) => (
                  <SlideThumb key={i} url={url} index={i} lectureTitle={lecture.title} />
                ))}
              </div>
            </>
          )}

          {lecture.slide_count === 0 && (
            <p className="smd-slide-no-images">No slide thumbnails available.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Slide thumbnail sub-component ────────────────────────────────────────────
interface SlideThumbProps {
  url: string;
  index: number;
  lectureTitle: string;
}

function SlideThumb({ url, index, lectureTitle }: SlideThumbProps) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div
        className="smd-slide-thumb"
        style={{
          background: 'var(--surface2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          aspectRatio: '16/9',
          fontSize: 10,
          color: 'var(--text-muted)',
        }}
      >
        {index + 1}
      </div>
    );
  }

  return (
    <div className="smd-slide-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${lectureTitle} — slide ${index + 1}`}
        loading="lazy"
        onError={() => setErrored(true)}
      />
      <span className="smd-slide-thumb-num">{index + 1}</span>
    </div>
  );
}
