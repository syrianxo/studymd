// components/LectureGrid.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Lecture } from '@/hooks/useUserLectures';
import type { LectureProgress } from '@/hooks/useProgress';
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

// Shared sizing — must match LectureCard.tsx constants
const MENU_ITEM_PADDING = '10px 16px';
const MENU_ITEM_MIN_HEIGHT = '42px';
const MENU_FONT_SIZE = '13px';

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

// ─── ContextMenu via Portal ───────────────────────────────────────────────────

interface CtxMenuProps {
  x: number; y: number;
  currentColor: string; currentCourse: Course;
  showColor: boolean;
  showCourse: boolean;
  showVisibility: boolean;  // false for badge click, true for card right-click
  onChangeCourse?: (c: Course) => void;
  onChangeColor?: (c: string) => void;
  onHide?: () => void;
  onArchive?: () => void;
  onClose: () => void;
}

function ContextMenu({
  x, y, currentColor, currentCourse,
  showColor, showCourse, showVisibility,
  onChangeCourse, onChangeColor,
  onHide, onArchive,
  onClose,
}: CtxMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    if (!ref.current) return;
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    const vw = window.innerWidth, vh = window.innerHeight;
    setPos({
      x: x + w > vw - 8 ? Math.max(4, vw - w - 8) : x,
      y: y + h > vh - 8 ? Math.max(4, vh - h - 8) : y,
    });
  }, [x, y]);

  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 0);
    const onDown = (e: MouseEvent) => {
      if (!active) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onCtx = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('contextmenu', onCtx);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('contextmenu', onCtx);
    };
  }, [onClose]);

  const menu = (
    <div
      ref={ref}
      className="slc-ctx"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {showColor && onChangeColor && (
        <>
          <div className="slc-ctx-label">Color</div>
          <div className="slc-ctx-colors">
            {PRESET_COLORS.map(c => (
              <button key={c}
                className={`slc-ctx-swatch${currentColor === c ? ' selected' : ''}`}
                style={{ background: c }} aria-label={`Color ${c}`}
                onClick={() => { onChangeColor(c); onClose(); }} />
            ))}
          </div>
          {(showCourse || showVisibility) && <div className="slc-ctx-divider" />}
        </>
      )}

      {showCourse && onChangeCourse && (
        <>
          <div className="slc-ctx-label">Course</div>
          {COURSES.map(c => (
            <button key={c} className="slc-ctx-item" role="menuitem"
              onClick={() => { onChangeCourse(c); onClose(); }}>
              <span style={{ opacity: c === currentCourse ? 1 : 0, width: 16, flexShrink: 0 }}>✓</span>
              {c}
            </button>
          ))}
          {showVisibility && <div className="slc-ctx-divider" />}
        </>
      )}

      {showVisibility && (
        <>
          {onHide && (
            <button className="slc-ctx-item" role="menuitem" onClick={() => { onHide(); onClose(); }}>
              <span>👁</span> Hide
            </button>
          )}
          {onArchive && (
            <button className="slc-ctx-item danger" role="menuitem" onClick={() => { onArchive(); onClose(); }}>
              <span>📦</span> Archive
            </button>
          )}
        </>
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(menu, document.body);
}

// ─── Grid ────────────────────────────────────────────────────────────────────

export default function LectureGrid({
  lectures, progressByLecture, loading,
  onStartFlash, onStartExam,
  onChangeCourse, onChangeColor,
  onHide, onArchive,
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
      <style>{gridCss}</style>
      <div className="smd-lecture-grid">
        {lectures.map(lecture => (
          <SimpleLectureCard
            key={lecture.internal_id}
            lecture={lecture}
            progress={progressByLecture[lecture.internal_id] ?? null}
            onStartFlash={() => onStartFlash(lecture.internal_id)}
            onStartExam={() => onStartExam(lecture.internal_id)}
            onChangeCourse={onChangeCourse ? c => onChangeCourse(lecture.internal_id, c) : undefined}
            onChangeColor={onChangeColor ? c => onChangeColor(lecture.internal_id, c) : undefined}
            onHide={onHide ? () => onHide(lecture.internal_id) : undefined}
            onArchive={onArchive ? () => onArchive(lecture.internal_id) : undefined}
          />
        ))}
      </div>
    </>
  );
}

// ─── Simple card ─────────────────────────────────────────────────────────────

interface SimpleCardProps {
  lecture: Lecture;
  progress: LectureProgress | null;
  onStartFlash: () => void;
  onStartExam: () => void;
  onChangeCourse?: (course: Course) => void;
  onChangeColor?: (color: string) => void;
  onHide?: () => void;
  onArchive?: () => void;
}

function SimpleLectureCard({
  lecture, progress, onStartFlash, onStartExam,
  onChangeCourse, onChangeColor, onHide, onArchive,
}: SimpleCardProps) {
  const fcPct = progress?.mastery_pct ?? 0;
  const examPct = progress?.best_exam_score ?? 0;

  // Optimistic local state — instant update without grid re-render
  const [localColor, setLocalColor] = useState<string | null>(null);
  const [localCourse, setLocalCourse] = useState<Course | null>(null);
  useEffect(() => { setLocalColor(null); }, [lecture.color_override, lecture.color]);
  useEffect(() => { setLocalCourse(null); }, [lecture.course_override, lecture.course]);

  const color = localColor ?? lecture.color_override ?? lecture.color ?? '#5b8dee';
  const displayCourse = localCourse ?? (lecture.course_override ?? lecture.course) as Course;
  const displayTitle = lecture.custom_title ?? lecture.title;

  const handleChangeColor = useCallback((c: string) => { setLocalColor(c); onChangeColor?.(c); }, [onChangeColor]);
  const handleChangeCourse = useCallback((c: Course) => { setLocalCourse(c); onChangeCourse?.(c); }, [onChangeCourse]);

  type CtxMode = { x: number; y: number; showColor: boolean; showCourse: boolean; showVisibility: boolean } | null;
  const [ctxMenu, setCtxMenu] = useState<CtxMode>(null);

  // Right-click on card: color + course + hide/archive
  function openFullCtx(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, showColor: true, showCourse: true, showVisibility: true });
  }

  // Left-click on badge: course only, no color, no hide/archive
  function openCourseCtx(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, showColor: false, showCourse: true, showVisibility: false });
  }

  const hasActions = !!(onChangeCourse || onChangeColor || onHide || onArchive);

  return (
    <div
      className="smd-lecture-card"
      style={{
        position: 'relative',
        zIndex: ctxMenu ? 200 : undefined,
        // Set --card-color so .smd-lecture-card::before (hover accent bar) uses the correct color
        ['--card-color' as string]: color,
      }}
      onContextMenu={hasActions ? openFullCtx : undefined}
    >
      {/* Static accent bar — always visible, uses optimistic color */}
      <div style={{
        position: 'absolute', top: 0, left: 20, right: 20,
        height: 3, borderRadius: '0 0 4px 4px',
        background: color,
        transition: 'background 0.3s',
      }} />

      {ctxMenu && hasActions && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          currentColor={color} currentCourse={displayCourse}
          showColor={ctxMenu.showColor}
          showCourse={ctxMenu.showCourse}
          showVisibility={ctxMenu.showVisibility}
          onChangeCourse={onChangeCourse ? handleChangeCourse : undefined}
          onChangeColor={onChangeColor ? handleChangeColor : undefined}
          onHide={onHide}
          onArchive={onArchive}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <div className="smd-card-summary">
        <div className="smd-card-top">
          <span style={{ fontSize: 28 }}>{lecture.icon}</span>
          {/* Badge: left-click = course only; right-click = full menu */}
          <span
            className="slc-course-badge"
            style={{
              fontFamily: "'DM Mono', monospace", fontSize: 10,
              padding: '2px 8px', borderRadius: 100,
              background: `${color}22`, color,
              cursor: hasActions ? 'pointer' : 'default',
              transition: 'box-shadow 0.15s, background 0.3s, color 0.3s',
            }}
            onClick={hasActions ? openCourseCtx : undefined}
            onContextMenu={hasActions ? openFullCtx : undefined}
            title={hasActions ? 'Click to change course · Right-click for all options' : undefined}
          >
            {displayCourse}
          </span>
        </div>

        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: '10px 0 4px' }}>
          {displayTitle}
        </div>

        {lecture.subtitle && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{lecture.subtitle}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[{ label: 'Flashcards', pct: fcPct }, { label: 'Exam', pct: examPct }].map(({ label, pct }) => (
            <div key={label} style={{ flex: 1, fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-muted)' }}>
              {label}
              <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, opacity: 0.75, borderRadius: 2, transition: 'width 0.4s, background 0.3s' }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onStartFlash}>📇 Flashcards</button>
          <button className="btn btn-secondary" onClick={onStartExam}>📝 Exam</button>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="smd-lecture-card" style={{ cursor: 'default', animation: 'smd-skeleton-pulse 1.6s ease infinite' }}>
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
      <style>{`@keyframes smd-skeleton-pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const gridCss = `
.slc-course-badge:hover { box-shadow: 0 0 0 2px rgba(255,255,255,0.2); }

/* Context menu — same visual language as kebab menu */
.slc-ctx {
  position: fixed; background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
  z-index: 99999; min-width: 200px; overflow: hidden; padding-bottom: 4px;
  animation: slc-ctx-in 0.12s ease;
}
@keyframes slc-ctx-in {
  from { opacity: 0; transform: scale(0.97) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.slc-ctx-label {
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em;
  color: var(--text-muted, #6b7280); padding: 10px 16px 4px; text-transform: uppercase;
}
.slc-ctx-colors { display: flex; gap: 7px; flex-wrap: wrap; padding: 6px 16px 10px; }
.slc-ctx-swatch {
  width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
  border: 2px solid transparent; transition: transform 0.12s, border-color 0.12s; flex-shrink: 0;
}
.slc-ctx-swatch:hover { transform: scale(1.2); }
.slc-ctx-swatch.selected { border-color: rgba(255,255,255,0.75); box-shadow: 0 0 0 1px rgba(255,255,255,0.3); }
@media (max-width: 639px) { .slc-ctx-swatch { width: 32px; height: 32px; } .slc-ctx-colors { gap: 9px; } }

/* Same padding/size as kebab menu items */
.slc-ctx-item {
  display: flex; align-items: center; gap: 10px;
  padding: ${MENU_ITEM_PADDING};
  font-family: 'Outfit', sans-serif; font-size: ${MENU_FONT_SIZE};
  color: var(--text, #e8eaf0); cursor: pointer;
  transition: background 0.1s; border: none; background: none;
  width: 100%; text-align: left; min-height: ${MENU_ITEM_MIN_HEIGHT}; white-space: nowrap;
}
.slc-ctx-item:hover { background: rgba(255,255,255,0.06); }
.slc-ctx-item.danger { color: #f87171; }
@media (max-width: 639px) { .slc-ctx-item { min-height: 44px; font-size: 14px; } }
.slc-ctx-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 2px 0; }
`;
