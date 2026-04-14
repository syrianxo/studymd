// components/LectureGrid.tsx
'use client';

// LectureGrid renders the normal (non-manage) dashboard card grid.
// Uses its own SimpleLectureCard component with the original v1 aesthetic
// (smd-* CSS classes from dashboard.css). Clicking a card expands it inline
// to show study mode buttons + slide thumbnail strip.
//
// This is SEPARATE from LectureCard.tsx, which is the manage-mode-only card
// used inside ManageMode.tsx (with drag handles, kebab menu, useSortable).

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase';
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

// ─── Lightbox ─────────────────────────────────────────────────────────────────

interface LightboxProps {
  slides: string[];
  initialIndex: number;
  onClose: () => void;
}

function Lightbox({ slides, initialIndex, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx(i => Math.min(slides.length - 1, i + 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, slides.length]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="smd-lightbox-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label="Slide viewer"
    >
      <div className="smd-lightbox-inner">
        <button className="smd-lightbox-close" onClick={onClose} aria-label="Close">✕</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slides[idx]} alt={`Slide ${idx + 1}`} />
        <div className="smd-lightbox-controls">
          <button
            className="smd-lightbox-btn"
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0} aria-label="Previous slide"
          >‹</button>
          <span className="smd-lightbox-counter">{idx + 1} / {slides.length}</span>
          <button
            className="smd-lightbox-btn"
            onClick={() => setIdx(i => Math.min(slides.length - 1, i + 1))}
            disabled={idx === slides.length - 1} aria-label="Next slide"
          >›</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── SlideStrip ───────────────────────────────────────────────────────────────

type SlideState = 'loading' | 'loaded' | 'empty';

function SlideStrip({ internalId, slideCount, accentColor }: {
  internalId: string; slideCount: number; accentColor: string;
}) {
  const [slideUrls, setSlideUrls] = useState<string[]>([]);
  const [state, setState] = useState<SlideState>('loading');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    async function loadSlides() {
      const supabase = createClient();
      const count = Math.max(slideCount ?? 0, 1);
      const urls: string[] = [];

      for (let i = 1; i <= count; i++) {
        const paddedNum = String(i).padStart(2, '0');
        const path = `slides/${internalId}/slide_${paddedNum}.jpg`;
        const { data } = supabase.storage.from('studymd').getPublicUrl(path);
        if (data?.publicUrl) urls.push(data.publicUrl);
      }

      if (urls.length > 0) {
        try {
          const res = await fetch(urls[0], { method: 'HEAD' });
          if (!res.ok) { setState('empty'); return; }
        } catch {
          setState('empty'); return;
        }
      }

      if (urls.length === 0) { setState('empty'); return; }
      setSlideUrls(urls);
      setState('loaded');
    }

    loadSlides();
  }, [internalId, slideCount]);

  return (
    <>
      {state === 'loading' && (
        <div className="smd-slide-loading">
          <span className="smd-slide-spinner">⟳</span>
          Loading slides…
        </div>
      )}
      {state === 'empty' && (
        <div className="smd-slide-no-images">No slide images available</div>
      )}
      {state === 'loaded' && (
        <div className="smd-slide-strip" role="list" aria-label="Lecture slides">
          {slideUrls.map((url, i) => (
            <div
              key={i}
              className="smd-slide-thumb"
              role="listitem"
              tabIndex={0}
              aria-label={`Slide ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIdx(i); } }}
              style={{ borderColor: lightboxIdx === i ? accentColor : undefined }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Slide ${i + 1}`} loading="lazy" />
              <span className="smd-slide-thumb-num">{i + 1}</span>
            </div>
          ))}
        </div>
      )}

      {lightboxIdx !== null && (
        <Lightbox
          slides={slideUrls}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}

// ─── SimpleLectureCard ────────────────────────────────────────────────────────
// This is the user-facing lecture card on the normal dashboard.
// Uses the smd-* CSS classes from dashboard.css (the original v1 aesthetic).
// Click the card body → expand inline. Click again → collapse.
// Flashcard / Exam buttons live inside the expand panel.

interface SimpleLectureCardProps {
  lecture: Lecture;
  flashcardProgress: number;
  examProgress: number;
  onFlashcards: () => void;
  onExam: () => void;
}

function SimpleLectureCard({
  lecture, flashcardProgress, examProgress,
  onFlashcards, onExam,
}: SimpleLectureCardProps) {
  const [expanded, setExpanded] = useState(false);

  const color = lecture.color_override ?? lecture.color ?? 'var(--accent)';
  const course = lecture.course_override ?? lecture.course;
  const title = lecture.custom_title ?? lecture.title;
  const fcLen = (lecture.json_data?.flashcards ?? []).length;
  const qLen = ((lecture.json_data as any)?.questions ?? []).length;

  const flashColor = flashcardProgress >= 80 ? 'var(--success)' : flashcardProgress >= 60 ? 'var(--warning)' : color;
  const examColor = examProgress >= 80 ? 'var(--success)' : examProgress >= 60 ? 'var(--warning)' : 'var(--accent2, #8b5cf6)';

  function handleCardClick() {
    setExpanded(v => !v);
  }

  function handleFlashClick(e: React.MouseEvent) {
    e.stopPropagation();
    onFlashcards();
  }

  function handleExamClick(e: React.MouseEvent) {
    e.stopPropagation();
    onExam();
  }

  return (
    <div
      className={`smd-lecture-card${expanded ? ' smd-card-expanded' : ''}`}
      style={{ '--card-color': color } as React.CSSProperties}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
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
          <div
            className="smd-card-course-badge"
            style={{ background: `${color}22`, color }}
          >
            {course}
          </div>
        )}

        <div className="smd-card-title">{title}</div>
        {lecture.subtitle && (
          <div className="smd-card-subtitle">{lecture.subtitle}</div>
        )}

        {(flashcardProgress > 0 || examProgress > 0) && (
          <div className="smd-card-progress">
            {flashcardProgress > 0 && (
              <>
                <div className="smd-progress-label">
                  <span>Flashcards</span>
                  <span>{flashcardProgress}%</span>
                </div>
                <div className="smd-progress-bar">
                  <div
                    className="smd-progress-fill"
                    style={{ width: `${flashcardProgress}%`, background: flashColor }}
                  />
                </div>
              </>
            )}
            {examProgress > 0 && (
              <>
                <div className="smd-progress-label" style={{ marginTop: flashcardProgress > 0 ? 7 : 0 }}>
                  <span>Last Exam</span>
                  <span>{examProgress}%</span>
                </div>
                <div className="smd-progress-bar">
                  <div
                    className="smd-progress-fill"
                    style={{ width: `${examProgress}%`, background: examColor }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div className="smd-card-expand-hint">
          {expanded ? 'Tap to close ▲' : 'Tap to open ↗'}
        </div>
      </div>

      {/* ── Expand panel: Study Mode + Slide strip ── */}
      <div className={`smd-lecture-expand${expanded ? ' open' : ''}`}>
        <div className="smd-expand-inner">

          {/* STUDY MODE */}
          <div className="smd-expand-section-label">Study Mode</div>
          <div className="smd-expand-mode-btns">
            <button
              className="smd-expand-mode-btn flash-btn"
              onClick={handleFlashClick}
              aria-label={`Study flashcards for ${title}`}
            >
              <div className="mode-icon">📇</div>
              <div className="mode-label">Flashcards</div>
              <div className="mode-sub">Review &amp; memorize</div>
            </button>
            <button
              className="smd-expand-mode-btn exam-btn"
              onClick={handleExamClick}
              aria-label={`Practice exam for ${title}`}
            >
              <div className="mode-icon">📝</div>
              <div className="mode-label">Practice Exam</div>
              <div className="mode-sub">Test your knowledge</div>
            </button>
          </div>

          {/* LECTURE SLIDES */}
          <div className="smd-expand-section-label">Lecture Slides</div>
          {expanded && (
            <SlideStrip
              internalId={lecture.internal_id}
              slideCount={lecture.slide_count ?? 0}
              accentColor={color}
            />
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Grid ────────────────────────────────────────────────────────────────────

export default function LectureGrid({
  lectures, progressByLecture, loading,
  onStartFlash, onStartExam,
  onChangeCourse: _onChangeCourse, onChangeColor: _onChangeColor,
  onHide: _onHide, onArchive: _onArchive,
}: LectureGridProps) {
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
      <style>{gridExtraCss}</style>
      <div className="smd-lecture-grid">
        {lectures.map(lecture => {
          const progress = progressByLecture[lecture.internal_id] ?? null;

          return (
            <SimpleLectureCard
              key={lecture.internal_id}
              lecture={lecture}
              flashcardProgress={progress?.mastery_pct ?? 0}
              examProgress={progress?.best_exam_score ?? 0}
              onFlashcards={() => onStartFlash(lecture.internal_id)}
              onExam={() => onStartExam(lecture.internal_id)}
            />
          );
        })}
      </div>
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

// ─── Extra CSS for pieces not in dashboard.css ───────────────────────────────

const gridExtraCss = `
/* Course badge on card */
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

/* Expanded card state */
.smd-lecture-card.smd-card-expanded {
  border-color: var(--border-bright);
  box-shadow: 0 12px 40px rgba(0,0,0,0.35);
}
.smd-lecture-card.smd-card-expanded::before {
  opacity: 1;
}

/* Slide loading/empty inside expand panel */
.smd-slide-loading {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
  padding: 8px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.smd-slide-spinner {
  display: inline-block;
  animation: smd-slide-spin 1s linear infinite;
}
@keyframes smd-slide-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Lightbox */
.smd-lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.88);
  backdrop-filter: blur(10px);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: smd-lb-in 0.15s ease;
}
@keyframes smd-lb-in { from { opacity: 0; } to { opacity: 1; } }

.smd-lightbox-inner {
  position: relative;
  max-width: min(90vw, 900px);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.smd-lightbox-inner img {
  max-width: 100%;
  max-height: 75vh;
  border-radius: 10px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.7);
  object-fit: contain;
}
.smd-lightbox-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}
.smd-lightbox-btn {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  color: #fff;
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.smd-lightbox-btn:hover { background: rgba(255,255,255,0.2); }
.smd-lightbox-btn:disabled { opacity: 0.3; cursor: default; }
.smd-lightbox-counter {
  font-family: 'DM Mono', monospace;
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  min-width: 60px;
  text-align: center;
}
.smd-lightbox-close {
  position: absolute;
  top: -40px;
  right: 0;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  color: #fff;
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.smd-lightbox-close:hover { background: rgba(255,255,255,0.2); }

/* Mobile expand panel touch targets */
@media (max-width: 639px) {
  .smd-expand-mode-btn {
    min-height: 44px;
    padding: 12px;
  }
  .smd-slide-thumb {
    width: 96px;
  }
}
`;
