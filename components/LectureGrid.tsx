// components/LectureGrid.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import type { Lecture } from '@/hooks/useUserLectures';
import type { LectureProgress } from '@/hooks/useProgress';
import type { Course } from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const COURSES: Course[] = [
  'Physical Diagnosis I',
  'Anatomy & Physiology',
  'Laboratory Diagnosis',
];

const PRESET_COLORS = [
  '#5b8dee', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface LectureGridProps {
  lectures: Lecture[];
  progressByLecture: Record<string, LectureProgress>;
  loading: boolean;
  onStartFlash: (lectureId: string) => void;
  onStartExam: (lectureId: string) => void;
  onChangeCourse?: (lectureId: string, course: Course) => void;
  onChangeColor?: (lectureId: string, color: string) => void;
}

// ─── Grid ────────────────────────────────────────────────────────────────────

export default function LectureGrid({
  lectures,
  progressByLecture,
  loading,
  onStartFlash,
  onStartExam,
  onChangeCourse,
  onChangeColor,
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
    <>
      <style>{gridCss}</style>
      <div className="smd-lecture-grid">
        {lectures.map((lecture) => (
          <SimpleLectureCard
            key={lecture.internal_id}
            lecture={lecture}
            progress={progressByLecture[lecture.internal_id] ?? null}
            onStartFlash={() => onStartFlash(lecture.internal_id)}
            onStartExam={() => onStartExam(lecture.internal_id)}
            onChangeCourse={onChangeCourse ? (c) => onChangeCourse(lecture.internal_id, c) : undefined}
            onChangeColor={onChangeColor ? (c) => onChangeColor(lecture.internal_id, c) : undefined}
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
}

function SimpleLectureCard({
  lecture,
  progress,
  onStartFlash,
  onStartExam,
  onChangeCourse,
  onChangeColor,
}: SimpleCardProps) {
  const fcPct = progress?.mastery_pct ?? 0;
  const examPct = progress?.best_exam_score ?? 0;
  const color = lecture.color_override ?? lecture.color ?? '#5b8dee';
  const displayCourse = (lecture.course_override ?? lecture.course) as Course;
  const displayTitle = lecture.custom_title ?? lecture.title;

  const [menuOpen, setMenuOpen] = useState(false);
  const [showCourse, setShowCourse] = useState(false);
  const [showColor, setShowColor] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setShowCourse(false);
        setShowColor(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const hasKebab = !!(onChangeCourse || onChangeColor);

  return (
    <div className="smd-lecture-card" style={{ position: 'relative' }}>
      {/* Accent bar */}
      <div
        style={{
          position: 'absolute', top: 0, left: 20, right: 20,
          height: 3, borderRadius: '0 0 4px 4px', background: color,
        }}
      />

      {/* Kebab button — only if handlers are provided */}
      {hasKebab && (
        <button
          className="slc-kebab-btn"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); setShowCourse(false); setShowColor(false); }}
          aria-label="Lecture options"
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          ⋮
        </button>
      )}

      {/* Kebab dropdown */}
      {menuOpen && hasKebab && (
        <div className="slc-menu" ref={menuRef} role="menu">
          {/* Change Course */}
          {onChangeCourse && (
            <div style={{ position: 'relative' }}>
              <button
                className="slc-menu-item"
                onClick={() => { setShowCourse((v) => !v); setShowColor(false); }}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={showCourse}
              >
                <span>📚</span> Change Course
                <span style={{ marginLeft: 'auto', opacity: 0.5 }}>{showCourse ? '▾' : '›'}</span>
              </button>
              {showCourse && (
                <div className="slc-submenu">
                  {COURSES.map((c) => (
                    <button
                      key={c}
                      className="slc-menu-item"
                      onClick={() => { onChangeCourse(c); setMenuOpen(false); setShowCourse(false); }}
                      role="menuitem"
                    >
                      {c === displayCourse ? '✓ ' : '  '}{c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Change Color */}
          {onChangeColor && (
            <div style={{ position: 'relative' }}>
              <button
                className="slc-menu-item"
                onClick={() => { setShowColor((v) => !v); setShowCourse(false); }}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={showColor}
              >
                <span>🎨</span> Change Color
                <span style={{ marginLeft: 'auto', opacity: 0.5 }}>{showColor ? '▾' : '›'}</span>
              </button>
              {showColor && (
                <div className="slc-submenu" style={{ padding: '4px 0' }}>
                  <div className="slc-color-row">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`slc-color-swatch${color === c ? ' selected' : ''}`}
                        style={{ background: c }}
                        aria-label={`Color ${c}`}
                        onClick={() => { onChangeColor(c); setMenuOpen(false); setShowColor(false); }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
            {displayCourse}
          </span>
        </div>

        <div
          style={{
            fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600,
            color: 'var(--text)', lineHeight: 1.3, margin: '10px 0 4px',
          }}
        >
          {displayTitle}
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

// ─── Loading skeleton ─────────────────────────────────────────────────────────

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

// ─── CSS for kebab in simple card ────────────────────────────────────────────

const gridCss = `
/* Kebab button on simple cards */
.slc-kebab-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: var(--text-muted, #6b7280);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
  z-index: 5;
  min-width: 32px;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.smd-lecture-card:hover .slc-kebab-btn { opacity: 0.7; }
.slc-kebab-btn:hover { opacity: 1 !important; background: rgba(255,255,255,0.07); }
@media (max-width: 639px) {
  .slc-kebab-btn {
    opacity: 0.6;
    min-width: 44px;
    min-height: 44px;
    top: 6px;
    right: 6px;
    font-size: 20px;
  }
}

/* Dropdown menu */
.slc-menu {
  position: absolute;
  top: 48px;
  right: 12px;
  background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
  z-index: 99;
  min-width: 180px;
  overflow: hidden;
  animation: slc-menu-in 0.12s ease;
}
@keyframes slc-menu-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.slc-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  color: var(--text, #e8eaf0);
  cursor: pointer;
  transition: background 0.1s;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  min-height: 40px;
}
.slc-menu-item:hover { background: rgba(255,255,255,0.06); }
@media (max-width: 639px) {
  .slc-menu-item { min-height: 44px; font-size: 14px; padding: 10px 18px; }
}

/* Submenu — left-fly on desktop, inline on mobile */
.slc-submenu {
  position: absolute;
  top: 0;
  right: calc(100% + 4px);
  background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
  z-index: 100;
  min-width: 200px;
  overflow: hidden;
  animation: slc-menu-in 0.1s ease;
}
@media (max-width: 639px) {
  .slc-submenu {
    position: static;
    right: auto;
    top: auto;
    box-shadow: none;
    border-left: 2px solid rgba(255,255,255,0.08);
    border-radius: 0 0 8px 8px;
    border-top: none;
    min-width: 0;
    width: 100%;
    animation: none;
  }
}

/* Color swatches */
.slc-color-row {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  flex-wrap: wrap;
}
.slc-color-swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.12s, border-color 0.12s;
}
.slc-color-swatch:hover { transform: scale(1.15); }
.slc-color-swatch.selected { border-color: rgba(255,255,255,0.6); }
@media (max-width: 639px) {
  .slc-color-swatch { width: 36px; height: 36px; }
  .slc-color-row { gap: 10px; padding: 12px 18px; }
}
`;
