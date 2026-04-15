// components/LectureCard.tsx
// The user-facing lecture card displayed on the normal dashboard.
// Uses smd-* CSS classes from dashboard.css (original v1 aesthetic).
// Shows quick-access Flashcard/Exam buttons + click to open LectureViewModal.
// Right-click opens a context menu for course/color/visibility changes.
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Lecture } from '@/hooks/useUserLectures';
import type { Course } from '@/types';

const COURSES: Course[] = [
  'Physical Diagnosis I',
  'Anatomy & Physiology',
  'Laboratory Diagnosis',
];

const PRESET_COLORS = [
  '#5b8dee', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

interface LectureCardProps {
  lecture: Lecture;
  flashcardProgress: number;
  examProgress: number;
  onOpen: () => void;
  onFlashcards: () => void;
  onExam: () => void;
  onChangeCourse?: (course: Course) => void;
  onChangeColor?: (color: string) => void;
  onHide?: () => void;
  onArchive?: () => void;
}

export default function LectureCard({
  lecture, flashcardProgress, examProgress,
  onOpen, onFlashcards, onExam,
  onChangeCourse, onChangeColor, onHide, onArchive,
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

  // Right-click context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [ctxMenu]);

  function handleCtx(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  return (
    <>
      <div
        className="smd-lecture-card"
        style={{ '--card-color': color } as React.CSSProperties}
        onClick={onOpen}
        onContextMenu={handleCtx}
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

          {/* Progress bars — always shown (fix #4) */}
          <div className="smd-card-progress">
            <div className="smd-progress-label">
              <span>Flashcards</span><span>{flashcardProgress > 0 ? `${flashcardProgress}%` : '—'}</span>
            </div>
            <div className="smd-progress-bar">
              {flashcardProgress > 0 && <div className="smd-progress-fill" style={{ width: `${flashcardProgress}%`, background: flashColor }} />}
            </div>
            <div className="smd-progress-label" style={{ marginTop: 7 }}>
              <span>Last Exam</span><span>{examProgress > 0 ? `${examProgress}%` : '—'}</span>
            </div>
            <div className="smd-progress-bar">
              {examProgress > 0 && <div className="smd-progress-fill" style={{ width: `${examProgress}%`, background: examColor }} />}
            </div>
          </div>

          {/* Quick-access study buttons */}
          <div className="smd-card-actions">
            <button className="btn btn-flash" onClick={(e) => { e.stopPropagation(); onFlashcards(); }}>
              📇 Flashcards
            </button>
            <button className="btn btn-exam" onClick={(e) => { e.stopPropagation(); onExam(); }}>
              📝 Exam
            </button>
          </div>
        </div>
      </div>

      {/* Right-click context menu */}
      {ctxMenu && typeof document !== 'undefined' && createPortal(
        <ContextMenu
          ref={ctxRef}
          x={ctxMenu.x} y={ctxMenu.y}
          color={color} course={course as Course}
          onChangeCourse={(c) => { onChangeCourse?.(c); setCtxMenu(null); }}
          onChangeColor={(c) => { onChangeColor?.(c); setCtxMenu(null); }}
          onHide={() => { onHide?.(); setCtxMenu(null); }}
          onArchive={() => { onArchive?.(); setCtxMenu(null); }}
          onClose={() => setCtxMenu(null)}
        />,
        document.body,
      )}

      <style>{cardExtraCss}</style>
    </>
  );
}

// ─── Right-click Context Menu ────────────────────────────────────────────────

interface ContextMenuProps {
  x: number; y: number;
  color: string; course: Course;
  onChangeCourse: (c: Course) => void;
  onChangeColor: (c: string) => void;
  onHide: () => void; onArchive: () => void;
  onClose: () => void;
}

const ContextMenu = React.forwardRef<HTMLDivElement, ContextMenuProps>(
  ({ x, y, color, course, onChangeCourse, onChangeColor, onHide, onArchive, onClose }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null);
    const combinedRef = (node: HTMLDivElement) => {
      (innerRef as any).current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as any).current = node;
    };
    const [pos, setPos] = useState({ x, y });

    useEffect(() => {
      if (!innerRef.current) return;
      const r = innerRef.current;
      const vw = window.innerWidth, vh = window.innerHeight;
      setPos({
        x: x + r.offsetWidth > vw - 8 ? Math.max(4, vw - r.offsetWidth - 8) : x,
        y: y + r.offsetHeight > vh - 8 ? Math.max(4, vh - r.offsetHeight - 8) : y,
      });
    }, [x, y]);

    return (
      <div ref={combinedRef} className="lc-ctx" style={{ left: pos.x, top: pos.y }} role="menu">
        <style>{ctxCss}</style>
        <div className="lc-ctx-label">Color</div>
        <div className="lc-ctx-colors">
          {PRESET_COLORS.map(c => (
            <button key={c}
              className={`lc-ctx-swatch${color === c ? ' selected' : ''}`}
              style={{ background: c }} aria-label={`Color ${c}`}
              onClick={() => onChangeColor(c)} />
          ))}
        </div>
        <div className="lc-ctx-divider" />
        <div className="lc-ctx-label">Course</div>
        {COURSES.map(c => (
          <button key={c} className="lc-ctx-item" role="menuitem" onClick={() => onChangeCourse(c)}>
            <span style={{ opacity: c === course ? 1 : 0, width: 16, flexShrink: 0 }}>✓</span> {c}
          </button>
        ))}
        <div className="lc-ctx-divider" />
        <button className="lc-ctx-item" role="menuitem" onClick={onHide}>
          <span>👁</span> Hide
        </button>
        <button className="lc-ctx-item danger" role="menuitem" onClick={onArchive}>
          <span>📦</span> Archive
        </button>
      </div>
    );
  }
);
ContextMenu.displayName = 'ContextMenu';

// ─── CSS ─────────────────────────────────────────────────────────────────────

const cardExtraCss = `
.smd-card-course-badge {
  display: inline-block;
  align-self: flex-start;   /* prevent stretching in flex-column parent */
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 100px;
  margin-bottom: 6px;
  opacity: 0.9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
`;

const ctxCss = `
.lc-ctx {
  position: fixed; background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
  z-index: 99999; min-width: 200px; overflow: hidden; padding-bottom: 4px;
  animation: lc-ctx-in 0.12s ease;
}
@keyframes lc-ctx-in {
  from { opacity: 0; transform: scale(0.97) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.lc-ctx-label {
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em;
  color: var(--text-muted, #6b7280); padding: 10px 16px 4px; text-transform: uppercase;
}
.lc-ctx-colors { display: flex; gap: 7px; flex-wrap: wrap; padding: 6px 16px 10px; }
.lc-ctx-swatch {
  width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
  border: 2px solid transparent; transition: transform 0.12s, border-color 0.12s; flex-shrink: 0; padding: 0;
}
.lc-ctx-swatch:hover { transform: scale(1.2); }
.lc-ctx-swatch.selected { border-color: rgba(255,255,255,0.75); box-shadow: 0 0 0 1px rgba(255,255,255,0.3); }
@media (max-width: 639px) { .lc-ctx-swatch { width: 32px; height: 32px; } .lc-ctx-colors { gap: 9px; } }
.lc-ctx-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px;
  font-family: 'Outfit', sans-serif; font-size: 13px;
  color: var(--text, #e8eaf0); cursor: pointer;
  transition: background 0.1s; border: none; background: none;
  width: 100%; text-align: left; min-height: 42px; white-space: nowrap;
}
.lc-ctx-item:hover { background: rgba(255,255,255,0.06); }
.lc-ctx-item.danger { color: #f87171; }
.lc-ctx-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 2px 0; }
@media (max-width: 639px) { .lc-ctx-item { min-height: 44px; font-size: 14px; padding: 10px 18px; } }
`;
