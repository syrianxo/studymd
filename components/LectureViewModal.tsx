// components/LectureViewModal.tsx
// Full pop-out modal for a lecture. Opened by clicking a LectureCard.
// Features: editable title, course picker, study buttons with counts,
// editable topics, scrollable slide deck with lightbox + flashcard linking,
// footer with color picker + hide/archive.
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase';
import Lightbox from './Lightbox';
import type { Lecture } from '@/hooks/useUserLectures';
import type { Flashcard, Course } from '@/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface LectureViewModalProps {
  lecture: Lecture | null;   // null = modal hidden but mounted
  isOpen: boolean;
  flashcardProgress: number;
  examProgress: number;
  onClose: () => void;
  onFlashcards: () => void;
  onExam: () => void;
  onChangeColor?: (color: string) => void;
  onChangeCourse?: (course: Course) => void;
  onRenameTitle?: (title: string) => void;
  onHide?: () => void;
  onArchive?: () => void;
}

const PRESET_COLORS = [
  '#5b8dee', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

const COURSES: Course[] = [
  'Physical Diagnosis I',
  'Anatomy & Physiology',
  'Laboratory Diagnosis',
];

// ─── Slide Loader ────────────────────────────────────────────────────────────

type SlideState = 'loading' | 'loaded' | 'empty';

function useSlides(internalId: string, slideCount: number) {
  const [urls, setUrls] = useState<string[]>([]);
  const [state, setState] = useState<SlideState>('loading');
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    async function load() {
      const supabase = createClient();
      const count = Math.max(slideCount ?? 0, 1);
      const built: string[] = [];
      for (let i = 1; i <= count; i++) {
        const path = `slides/${internalId}/slide_${String(i).padStart(2, '0')}.jpg`;
        const { data } = supabase.storage.from('studymd').getPublicUrl(path);
        if (data?.publicUrl) built.push(data.publicUrl);
      }
      if (built.length > 0) {
        try {
          const res = await fetch(built[0], { method: 'HEAD' });
          if (!res.ok) { setState('empty'); return; }
        } catch { setState('empty'); return; }
      }
      if (built.length === 0) { setState('empty'); return; }
      setUrls(built);
      setState('loaded');
    }
    load();
  }, [internalId, slideCount]);

  return { urls, state };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LectureViewModal({
  lecture, isOpen, flashcardProgress, examProgress,
  onClose, onFlashcards, onExam,
  onChangeColor, onChangeCourse, onRenameTitle,
  onHide, onArchive,
}: LectureViewModalProps) {
  // Guard: nothing to render if no lecture has ever been opened
  if (!lecture) return null;

  const color = lecture.color_override ?? lecture.color ?? '#5b8dee';
  const title = lecture.custom_title ?? lecture.title;
  const course = (lecture.course_override ?? lecture.course) as Course;
  const topics = lecture.topics ?? [];
  const flashcards = lecture.json_data?.flashcards ?? [];
  const fcLen = flashcards.length;
  const qLen = ((lecture.json_data as any)?.questions ?? []).length;

  const [localSubtitle, setLocalSubtitle] = useState(lecture.subtitle ?? '');
  const [isEditingSubtitle, setIsEditingSubtitle] = useState(false);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const [localColor, setLocalColor] = useState(color);
  const [localTitle, setLocalTitle] = useState(title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [localCourse, setLocalCourse] = useState(course);
  const [showCourseMenu, setShowCourseMenu] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [selectedSlide, setSelectedSlide] = useState<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when lecture changes
  useEffect(() => { setLocalTitle(title); }, [title]);
  useEffect(() => { setLocalSubtitle(lecture.subtitle ?? ''); }, [lecture.subtitle]);
  useEffect(() => { setLocalCourse(course); }, [course]);
  useEffect(() => { setLocalColor(color); }, [color]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxIdx === null && !isEditingTitle) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [isOpen, lightboxIdx, isEditingTitle, onClose]);

  function handleClose() { onClose(); }
  function handleStudyAction(action: () => void) { action(); onClose(); }

  const { urls: slideUrls, state: slideState } = useSlides(lecture.internal_id, lecture.slide_count ?? 0);

  // Editable title (fix #5)
  function handleTitleSave() {
    setIsEditingTitle(false);
    if (localTitle.trim() && localTitle !== title) {
      onRenameTitle?.(localTitle.trim());
    } else {
      setLocalTitle(title);
    }
  }

  // Subtitle edit (fix #6)
  function handleSubtitleSave() {
    setIsEditingSubtitle(false);
    if (localSubtitle.trim() !== (lecture.subtitle ?? '')) {
      // Save via the same rename API, pass subtitle field
      fetch('/api/lectures/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalId: lecture.internal_id, updates: { subtitle: localSubtitle.trim() } }),
      }).catch(console.error);
    }
  }

  // Course change (fix #6)
  function handleCourseChange(c: Course) {
    setLocalCourse(c);
    setShowCourseMenu(false);
    onChangeCourse?.(c);
  }

  // Linked flashcards
  const linkedCards = selectedSlide !== null
    ? flashcards.filter(fc => fc.slide_number === selectedSlide)
    : [];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={`lvm-overlay${isOpen ? ' lvm-visible' : ''}`}
      onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}
      aria-hidden={!isOpen}
    >
      <style>{modalCss}</style>

      <div className="lvm-modal" role="dialog" aria-modal={isOpen} aria-label={localTitle}>
        <div className="lvm-drag-handle" />

        {/* ── Header: close button only ── */}
        <div className="lvm-header">
          <div style={{ flex: 1 }} />
          <button className="lvm-close" onClick={handleClose} aria-label="Close">✕</button>
        </div>

        {/* ── Lecture info with editable title ── */}
        <div className="lvm-info">
          <span className="lvm-icon">{lecture.icon || '📖'}</span>
          <div className="lvm-info-text">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                className="lvm-title-input"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') { setLocalTitle(title); setIsEditingTitle(false); } }}
                autoFocus
              />
            ) : (
              <h2
                className="lvm-title"
                onClick={() => { if (onRenameTitle) { setIsEditingTitle(true); setTimeout(() => titleInputRef.current?.select(), 0); } }}
                title={onRenameTitle ? 'Click to edit title' : undefined}
                style={{ cursor: onRenameTitle ? 'text' : 'default' }}
              >
                {localTitle}
                {onRenameTitle && <span className="lvm-edit-hint">✎</span>}
              </h2>
            )}
            {isEditingSubtitle ? (
              <input
                ref={subtitleInputRef}
                className="lvm-subtitle-input"
                value={localSubtitle}
                onChange={e => setLocalSubtitle(e.target.value)}
                onBlur={handleSubtitleSave}
                onKeyDown={e => { if (e.key === 'Enter') handleSubtitleSave(); if (e.key === 'Escape') { setLocalSubtitle(lecture.subtitle ?? ''); setIsEditingSubtitle(false); } }}
                placeholder="Add a subtitle…"
                autoFocus
              />
            ) : (
              <p
                className="lvm-subtitle"
                onClick={() => setIsEditingSubtitle(true)}
                style={{ cursor: 'text', minHeight: 18 }}
                title="Click to edit subtitle"
              >
                {localSubtitle || <span style={{ opacity: 0.35 }}>Add subtitle…</span>}
                <span className="lvm-edit-hint">✎</span>
              </p>
            )}

            {/* Course badge — clickable to change */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <span
                className="lvm-course"
                style={{ background: `${localColor}22`, color: localColor, cursor: onChangeCourse ? 'pointer' : 'default' }}
                onClick={() => { if (onChangeCourse) setShowCourseMenu(v => !v); }}
                title={onChangeCourse ? 'Click to change course' : undefined}
              >
                {localCourse}
                {onChangeCourse && <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 8 }}>▼</span>}
              </span>
              {showCourseMenu && (
                <div className="lvm-course-menu">
                  {COURSES.map(c => (
                    <button key={c} className="lvm-course-option" onClick={() => handleCourseChange(c)}>
                      <span style={{ opacity: c === localCourse ? 1 : 0, width: 14 }}>✓</span> {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Progress ── */}
        {(flashcardProgress > 0 || examProgress > 0) && (
          <div className="lvm-progress-row">
            <div className="lvm-progress-item">
              <span className="lvm-progress-label">Flashcards</span>
              <div className="lvm-progress-bar">
                <div className="lvm-progress-fill" style={{ width: `${flashcardProgress}%`, background: localColor }} />
              </div>
              <span className="lvm-progress-pct">{flashcardProgress}%</span>
            </div>
            <div className="lvm-progress-item">
              <span className="lvm-progress-label">Exam</span>
              <div className="lvm-progress-bar">
                <div className="lvm-progress-fill" style={{ width: `${examProgress}%`, background: 'var(--accent2, #8b5cf6)' }} />
              </div>
              <span className="lvm-progress-pct">{examProgress}%</span>
            </div>
          </div>
        )}

        {/* ── Study Mode — compact buttons with counts (fix #2) ── */}
        <div className="lvm-section-label">Study Mode</div>
        <div className="lvm-study-btns">
          <button className="lvm-study-btn flash" onClick={() => handleStudyAction(onFlashcards)}>
            <span className="lvm-btn-icon">📇</span>
            <div className="lvm-btn-text">
              <span className="lvm-btn-label">Flashcards</span>
              <span className="lvm-btn-sub">{fcLen} cards</span>
            </div>
          </button>
          <button className="lvm-study-btn exam" onClick={() => handleStudyAction(onExam)}>
            <span className="lvm-btn-icon">📝</span>
            <div className="lvm-btn-text">
              <span className="lvm-btn-label">Practice Exam</span>
              <span className="lvm-btn-sub">{qLen} questions</span>
            </div>
          </button>
        </div>

        {/* ── Topics (fix #4) ── */}
        {topics.length > 0 && (
          <>
            <div className="lvm-section-label">Topics</div>
            <div className="lvm-topics">
              {topics.map(t => (
                <span key={t} className="lvm-topic-chip">{t}</span>
              ))}
            </div>
          </>
        )}

        {/* ── Slide Deck ── */}
        <div className="lvm-section-label">
          Lecture Slides
          {slideState === 'loaded' && <span className="lvm-slide-count"> · {slideUrls.length} slides</span>}
        </div>

        {slideState === 'loading' && (
          <div className="lvm-slide-loading"><span className="lvm-spinner">⟳</span> Loading slides…</div>
        )}
        {slideState === 'empty' && (
          <div className="lvm-slide-empty">No slide images available</div>
        )}
        {slideState === 'loaded' && (
          <div className="lvm-slide-strip">
            {slideUrls.map((url, i) => (
              <div
                key={i}
                className={`lvm-slide-thumb${selectedSlide === i + 1 ? ' selected' : ''}`}
                onClick={() => setSelectedSlide(prev => prev === i + 1 ? null : i + 1)}
                role="button" tabIndex={0} aria-label={`Slide ${i + 1}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedSlide(prev => prev === i + 1 ? null : i + 1); } }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Slide ${i + 1}`} loading="lazy" />
                <span className="lvm-slide-num">{i + 1}</span>
                <button className="lvm-slide-expand" onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); }} aria-label={`View slide ${i + 1} full screen`}>⛶</button>
              </div>
            ))}
          </div>
        )}

        {/* ── Linked Flashcards ── */}
        {selectedSlide !== null && (
          <div className="lvm-linked-section">
            <div className="lvm-section-label">
              Flashcards for Slide {selectedSlide}
              {linkedCards.length === 0 && <span className="lvm-linked-none"> — none linked</span>}
            </div>
            {linkedCards.length > 0 && (
              <div className="lvm-linked-cards">
                {linkedCards.map(fc => (
                  <div key={fc.id} className="lvm-linked-card">
                    <div className="lvm-linked-q">{fc.question}</div>
                    <div className="lvm-linked-a">{fc.answer}</div>
                    <span className="lvm-linked-topic">{fc.topic}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Footer: color picker + hide/archive (fix #3) ── */}
        <div className="lvm-divider" />
        <div className="lvm-footer">
          <div className="lvm-footer-colors">
            {PRESET_COLORS.map(c => (
              <button key={c}
                className={`lvm-color-dot${localColor === c ? ' selected' : ''}`}
                style={{ background: c }}
                onClick={() => { setLocalColor(c); onChangeColor?.(c); }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <div className="lvm-footer-actions">
            {onHide && (
              <button className="lvm-manage-btn" onClick={() => { onHide(); handleClose(); }}>
                <span>👁</span> Hide
              </button>
            )}
            {onArchive && (
              <button className="lvm-manage-btn danger" onClick={() => { onArchive(); handleClose(); }}>
                <span>📦</span> Archive
              </button>
            )}
          </div>
        </div>
      </div>

      {lightboxIdx !== null && (
        <Lightbox slides={slideUrls} initialIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
    </div>,
    document.body,
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const modalCss = `
.lvm-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
  z-index: 500; display: flex; align-items: flex-end; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s ease;
}
.lvm-overlay.lvm-visible { opacity: 1; pointer-events: auto; }
.lvm-overlay.lvm-closing { opacity: 0; }

.lvm-modal {
  background: var(--surface, #13161d);
  border: 1px solid var(--border-bright, rgba(255,255,255,0.15));
  border-radius: 20px 20px 0 0;
  padding: 12px 20px 28px; width: 100%; max-width: 640px;
  max-height: 92vh; overflow-y: auto;
  transform: translateY(40px);
  transition: transform 0.3s cubic-bezier(0.34, 1.2, 0.64, 1);
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
}
.lvm-overlay.lvm-visible .lvm-modal { transform: translateY(0); }

.lvm-drag-handle { width: 36px; height: 4px; background: var(--border-bright); border-radius: 2px; margin: 0 auto 14px; }
.lvm-header { display: flex; align-items: center; justify-content: flex-end; margin-bottom: 12px; }
.lvm-close {
  width: 36px; height: 36px; min-width: 44px; min-height: 44px; border-radius: 10px;
  background: none; border: 1px solid rgba(255,255,255,0.08);
  color: var(--text-muted); font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.lvm-close:hover { background: rgba(255,255,255,0.06); color: var(--text); }

/* Info */
.lvm-info { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 18px; }
.lvm-icon { font-size: 32px; line-height: 1; flex-shrink: 0; }
.lvm-info-text { min-width: 0; flex: 1; }
.lvm-title {
  font-family: 'Fraunces', Georgia, serif; font-size: 20px; font-weight: 700;
  color: var(--text); line-height: 1.2; margin-bottom: 4px;
}
.lvm-edit-hint { font-size: 13px; color: var(--text-muted); margin-left: 6px; opacity: 0; transition: opacity 0.15s; }
.lvm-title:hover .lvm-edit-hint { opacity: 0.6; }
.lvm-title-input {
  font-family: 'Fraunces', Georgia, serif; font-size: 20px; font-weight: 700;
  color: var(--text); line-height: 1.2; background: var(--surface2);
  border: 1px solid var(--accent); border-radius: 8px; padding: 4px 8px;
  width: 100%; outline: none;
}
.lvm-subtitle { font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 6px; position: relative; display: inline-block; }
.lvm-subtitle:hover .lvm-edit-hint { opacity: 0.6; }
.lvm-subtitle-input {
  font-family: 'Outfit', sans-serif; font-size: 13px;
  color: var(--text); line-height: 1.5; background: var(--surface2);
  border: 1px solid var(--accent); border-radius: 6px; padding: 3px 8px;
  width: 100%; outline: none; margin-bottom: 6px;
}
.lvm-course {
  display: inline-flex; align-items: center; font-family: 'DM Mono', monospace;
  font-size: 10px; letter-spacing: 0.04em; padding: 2px 8px; border-radius: 100px;
  transition: box-shadow 0.15s;
}
.lvm-course:hover { box-shadow: 0 0 0 2px rgba(255,255,255,0.15); }
.lvm-course-menu {
  position: absolute; top: calc(100% + 4px); left: 0;
  background: var(--surface2); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  z-index: 10; min-width: 200px; overflow: hidden;
  animation: lvm-fade-in 0.1s ease;
}
.lvm-course-option {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 14px;
  font-family: 'Outfit', sans-serif; font-size: 13px; color: var(--text);
  background: none; border: none; cursor: pointer; text-align: left; min-height: 42px;
  transition: background 0.1s;
}
.lvm-course-option:hover { background: rgba(255,255,255,0.06); }

/* Progress */
.lvm-progress-row { display: flex; gap: 16px; margin-bottom: 18px; }
.lvm-progress-item { flex: 1; }
.lvm-progress-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 600; margin-bottom: 4px; font-family: 'DM Mono', monospace; }
.lvm-progress-bar { height: 4px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; margin-bottom: 2px; }
.lvm-progress-fill { height: 100%; border-radius: 2px; transition: width 0.4s ease; }
.lvm-progress-pct { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text-muted); }

/* Section label */
.lvm-section-label { font-family: 'DM Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; color: var(--text-muted); margin-bottom: 10px; margin-top: 4px; }
.lvm-slide-count { font-weight: 400; letter-spacing: 0.02em; text-transform: none; }

/* Study buttons — compact horizontal with counts (fix #2) */
.lvm-study-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
.lvm-study-btn {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 10px; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.1); background: var(--surface2);
  font-family: 'Outfit', sans-serif; color: var(--text);
  transition: all 0.15s; min-height: 44px;
}
.lvm-study-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.2); }
.lvm-study-btn.flash { border-color: rgba(91,141,238,0.3); }
.lvm-study-btn.flash:hover { background: var(--accent-muted, rgba(91,141,238,0.1)); border-color: var(--accent); }
.lvm-study-btn.exam { border-color: rgba(139,92,246,0.3); }
.lvm-study-btn.exam:hover { background: rgba(var(--accent2-rgb, 139,92,246), 0.1); border-color: var(--accent2, #8b5cf6); }
.lvm-btn-icon { font-size: 18px; line-height: 1; flex-shrink: 0; }
.lvm-btn-text { display: flex; flex-direction: column; }
.lvm-btn-label { font-size: 13px; font-weight: 600; }
.lvm-btn-sub { font-size: 10px; color: var(--text-muted); }

/* Topics */
.lvm-topics { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
.lvm-topic-chip { font-size: 11px; color: var(--text-dim); background: var(--surface2); border: 1px solid var(--border); padding: 4px 10px; border-radius: 50px; font-family: 'Outfit', sans-serif; }

/* Slide strip */
.lvm-slide-strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; -webkit-overflow-scrolling: touch; margin-bottom: 4px; }
.lvm-slide-strip::-webkit-scrollbar { height: 4px; }
.lvm-slide-strip::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
.lvm-slide-thumb { flex-shrink: 0; width: 130px; cursor: pointer; border-radius: 8px; overflow: hidden; border: 2px solid transparent; transition: border-color 0.18s, transform 0.15s; position: relative; }
.lvm-slide-thumb:hover { border-color: var(--accent); transform: scale(1.02); }
.lvm-slide-thumb.selected { border-color: var(--accent); box-shadow: 0 0 12px rgba(91,141,238,0.3); }
.lvm-slide-thumb img { width: 100%; display: block; border-radius: 6px; }
.lvm-slide-num { position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.72); color: #fff; font-size: 9px; font-family: 'DM Mono', monospace; padding: 1px 5px; border-radius: 4px; pointer-events: none; }
.lvm-slide-expand { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.55); color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.15s; }
.lvm-slide-thumb:hover .lvm-slide-expand { opacity: 1; }
.lvm-slide-expand:hover { background: rgba(0,0,0,0.75); }
.lvm-slide-loading { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text-muted); padding: 8px 0; display: flex; align-items: center; gap: 6px; }
.lvm-spinner { display: inline-block; animation: lvm-spin 1s linear infinite; }
@keyframes lvm-spin { to { transform: rotate(360deg); } }
.lvm-slide-empty { font-size: 12px; color: var(--text-muted); font-style: italic; padding: 8px 0; }

/* Linked flashcards */
.lvm-linked-section { margin-top: 12px; }
.lvm-linked-none { font-weight: 400; font-style: italic; text-transform: none; letter-spacing: 0; }
.lvm-linked-cards { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.lvm-linked-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.lvm-linked-q { font-family: 'Fraunces', Georgia, serif; font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 6px; line-height: 1.3; }
.lvm-linked-a { font-size: 12px; color: var(--text-dim); line-height: 1.5; margin-bottom: 6px; white-space: pre-line; }
.lvm-linked-topic { font-size: 10px; color: var(--accent); background: rgba(91,141,238,0.1); padding: 2px 8px; border-radius: 50px; border: 1px solid rgba(91,141,238,0.2); font-family: 'DM Mono', monospace; }

/* Footer — color picker + manage actions (fix #3) */
.lvm-divider { height: 1px; background: var(--border); margin: 20px 0 14px; }
.lvm-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.lvm-footer-colors { display: flex; gap: 6px; align-items: center; }
.lvm-color-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform 0.12s, border-color 0.12s; padding: 0; flex-shrink: 0; }
.lvm-color-dot:hover { transform: scale(1.15); }
.lvm-color-dot.selected { border-color: rgba(255,255,255,0.7); box-shadow: 0 0 0 1px rgba(255,255,255,0.3); }
.lvm-footer-actions { display: flex; gap: 8px; }
.lvm-manage-btn { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; background: none; border: 1px solid var(--border); color: var(--text-muted); font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.15s; min-height: 36px; }
.lvm-manage-btn:hover { border-color: var(--border-bright); color: var(--text); background: rgba(255,255,255,0.04); }
.lvm-manage-btn.danger { color: var(--danger, #ef4444); }
.lvm-manage-btn.danger:hover { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.08); }

/* Desktop */
@media (min-width: 768px) {
  .lvm-overlay { align-items: center; padding: 20px; }
  .lvm-modal { border-radius: 20px; transform: translateY(20px) scale(0.97); }
  .lvm-overlay.lvm-visible .lvm-modal { transform: translateY(0) scale(1); }
  .lvm-drag-handle { display: none; }
}
/* Mobile */
@media (max-width: 639px) {
  .lvm-color-dot { width: 24px; height: 24px; }
  .lvm-footer-colors { gap: 8px; }
  .lvm-study-btn { padding: 10px; }
  .lvm-slide-thumb { width: 100px; }
  .lvm-slide-expand { width: 32px; height: 32px; opacity: 1; font-size: 14px; }
}
`;
