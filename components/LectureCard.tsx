'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LectureWithSettings, Course } from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const COURSES: Course[] = [
  'Physical Diagnosis I',
  'Anatomy & Physiology',
  'Laboratory Diagnosis',
];

// ─── Styles ──────────────────────────────────────────────────────────────────

const cardCss = `
.lc-card {
  position: relative;
  background: var(--surface, #13161d);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
  overflow: visible;
  user-select: none;
}
.lc-card:hover:not(.lc-dragging) {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.35);
}
.lc-card.lc-manage-mode {
  cursor: default;
}
.lc-card.lc-dragging {
  opacity: 0.5;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6);
  z-index: 999;
}
.lc-card.lc-archived {
  opacity: 0.55;
  border-style: dashed;
}

/* Color accent bar at top */
.lc-accent-bar {
  position: absolute;
  top: 0;
  left: 20px;
  right: 20px;
  height: 3px;
  border-radius: 0 0 4px 4px;
  transition: left 0.2s, right 0.2s;
}

/* Card header */
.lc-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
  margin-top: 8px;
}
.lc-icon {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
}
.lc-title-block { flex: 1; min-width: 0; }
.lc-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 16px;
  font-weight: 600;
  color: var(--text, #e8eaf0);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.lc-course-badge {
  display: inline-block;
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 100px;
  margin-top: 5px;
  opacity: 0.85;
}

/* Progress */
.lc-progress-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.lc-progress-item {
  flex: 1;
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  color: var(--text-muted, #6b7280);
}
.lc-progress-bar-bg {
  height: 4px;
  background: rgba(255,255,255,0.07);
  border-radius: 2px;
  margin-top: 3px;
  overflow: hidden;
}
.lc-progress-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
}

/* Tags */
.lc-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.lc-tag {
  font-family: 'Outfit', sans-serif;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 100px;
  background: rgba(255,255,255,0.07);
  color: var(--text-muted, #6b7280);
  border: 1px solid rgba(255,255,255,0.06);
}

/* Slide count */
.lc-slide-count {
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  color: var(--text-muted, #6b7280);
  margin-top: 10px;
}

/* ── Manage mode overlays ── */
.lc-drag-handle {
  position: absolute;
  top: 14px;
  left: 12px;
  color: var(--text-muted, #6b7280);
  cursor: grab;
  font-size: 16px;
  line-height: 1;
  opacity: 0.5;
  transition: opacity 0.15s;
  z-index: 5;
  display: none;
}
.lc-drag-handle:active { cursor: grabbing; }
.lc-manage-mode .lc-drag-handle { display: block; }
.lc-manage-mode .lc-drag-handle:hover { opacity: 1; }

/* Kebab menu */
.lc-kebab-btn {
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
}
.lc-manage-mode .lc-kebab-btn,
.lc-card:hover .lc-kebab-btn {
  opacity: 0.7;
}
.lc-kebab-btn:hover { opacity: 1 !important; background: rgba(255,255,255,0.07); }

/* Kebab dropdown */
.lc-menu {
  position: absolute;
  top: 36px;
  right: 12px;
  background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
  z-index: 99;
  min-width: 180px;
  overflow: hidden;
  animation: lc-menu-in 0.12s ease;
}
@keyframes lc-menu-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.lc-menu-item {
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
}
.lc-menu-item:hover { background: rgba(255,255,255,0.06); }
.lc-menu-item.danger { color: #f87171; }
.lc-menu-divider {
  height: 1px;
  background: rgba(255,255,255,0.06);
  margin: 2px 0;
}

/* Sub-menu for course change */
.lc-submenu {
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
  animation: lc-menu-in 0.1s ease;
}

/* Color picker mini */
.lc-color-row {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  flex-wrap: wrap;
}
.lc-color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.12s, border-color 0.12s;
}
.lc-color-swatch:hover { transform: scale(1.15); }
.lc-color-swatch.selected { border-color: rgba(255,255,255,0.6); }

/* Restore button (archived) */
.lc-restore-btn {
  display: block;
  width: 100%;
  text-align: center;
  margin-top: 10px;
  padding: 6px;
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent, #5b8dee);
  background: rgba(91,141,238,0.1);
  border: 1px solid rgba(91,141,238,0.2);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.lc-restore-btn:hover { background: rgba(91,141,238,0.18); }
`;

const PRESET_COLORS = [
  '#5b8dee', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

// ─── KebabMenu ───────────────────────────────────────────────────────────────

interface KebabMenuProps {
  lecture: LectureWithSettings;
  onHide: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onEditTags: () => void;
  onChangeCourse: (course: Course) => void;
  onChangeColor: (color: string) => void;
  onClose: () => void;
}

function KebabMenu({
  lecture,
  onHide,
  onArchive,
  onRestore,
  onEditTags,
  onChangeCourse,
  onChangeColor,
  onClose,
}: KebabMenuProps) {
  const [showCourse, setShowCourse] = useState(false);
  const [showColor, setShowColor] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const { settings } = lecture;

  return (
    <div className="lc-menu" ref={menuRef} role="menu">
      <button className="lc-menu-item" onClick={onEditTags} role="menuitem">
        <span>🏷</span> Edit Tags
      </button>

      {/* Change Course */}
      <div style={{ position: 'relative' }}>
        <button
          className="lc-menu-item"
          onClick={() => { setShowCourse((v) => !v); setShowColor(false); }}
          onMouseEnter={() => { setShowCourse(true); setShowColor(false); }}
          role="menuitem"
          aria-haspopup="true"
          aria-expanded={showCourse}
        >
          <span>📚</span> Change Course
          <span style={{ marginLeft: 'auto', opacity: 0.5 }}>›</span>
        </button>
        {showCourse && (
          <div className="lc-submenu">
            {COURSES.map((c) => (
              <button
                key={c}
                className="lc-menu-item"
                onClick={() => { onChangeCourse(c); onClose(); }}
                role="menuitem"
              >
                {c === lecture.display_course ? '✓ ' : '  '}{c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Change Color */}
      <div style={{ position: 'relative' }}>
        <button
          className="lc-menu-item"
          onClick={() => { setShowColor((v) => !v); setShowCourse(false); }}
          onMouseEnter={() => { setShowColor(true); setShowCourse(false); }}
          role="menuitem"
          aria-haspopup="true"
          aria-expanded={showColor}
        >
          <span>🎨</span> Change Color
          <span style={{ marginLeft: 'auto', opacity: 0.5 }}>›</span>
        </button>
        {showColor && (
          <div className="lc-submenu" style={{ padding: '4px 0' }}>
            <div className="lc-color-row">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={`lc-color-swatch${lecture.display_color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                  onClick={() => { onChangeColor(c); onClose(); }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="lc-menu-divider" />

      {settings.archived ? (
        <button className="lc-menu-item" onClick={() => { onRestore(); onClose(); }} role="menuitem">
          <span>↩️</span> Restore
        </button>
      ) : !settings.visible ? (
        <button className="lc-menu-item" onClick={() => { onRestore(); onClose(); }} role="menuitem">
          <span>👁</span> Unhide
        </button>
      ) : (
        <>
          <button className="lc-menu-item" onClick={() => { onHide(); onClose(); }} role="menuitem">
            <span>👁</span> Hide
          </button>
          <button className="lc-menu-item danger" onClick={() => { onArchive(); onClose(); }} role="menuitem">
            <span>📦</span> Archive
          </button>
        </>
      )}
    </div>
  );
}

// ─── LectureCard ─────────────────────────────────────────────────────────────

interface LectureCardProps {
  lecture: LectureWithSettings;
  isManageMode: boolean;
  flashcardProgress?: number; // 0–100
  examProgress?: number;       // 0–100
  onOpen?: () => void;
  onHide: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onEditTags: () => void;
  onChangeCourse: (course: Course) => void;
  onChangeColor: (color: string) => void;
}

export function LectureCard({
  lecture,
  isManageMode,
  flashcardProgress = 0,
  examProgress = 0,
  onOpen,
  onHide,
  onArchive,
  onRestore,
  onEditTags,
  onChangeCourse,
  onChangeColor,
}: LectureCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lecture.internal_id, disabled: !isManageMode });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const classNames = [
    'lc-card',
    isManageMode ? 'lc-manage-mode' : '',
    isDragging ? 'lc-dragging' : '',
    lecture.settings.archived ? 'lc-archived' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <style>{cardCss}</style>
      <div
        ref={setNodeRef}
        style={style}
        className={classNames}
        onClick={() => !isManageMode && !menuOpen && onOpen?.()}
        role={isManageMode ? 'listitem' : 'button'}
        tabIndex={isManageMode ? -1 : 0}
        onKeyDown={(e) => {
          if (!isManageMode && (e.key === 'Enter' || e.key === ' ')) onOpen?.();
        }}
      >
        {/* Accent bar */}
        <div
          className="lc-accent-bar"
          style={{ background: lecture.display_color, left: isManageMode ? 32 : 20 }}
        />

        {/* Drag handle (manage mode only) */}
        {isManageMode && (
          <div
            className="lc-drag-handle"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            ≡
          </div>
        )}

        {/* Kebab menu button */}
        <button
          className="lc-kebab-btn"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          aria-label="Lecture options"
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          ⋮
        </button>

        {/* Kebab dropdown */}
        {menuOpen && (
          <KebabMenu
            lecture={lecture}
            onHide={onHide}
            onArchive={onArchive}
            onRestore={onRestore}
            onEditTags={onEditTags}
            onChangeCourse={onChangeCourse}
            onChangeColor={onChangeColor}
            onClose={() => setMenuOpen(false)}
          />
        )}

        {/* Card content */}
        <div className="lc-header" style={{ paddingLeft: isManageMode ? 20 : 0 }}>
          <div className="lc-icon">{lecture.icon}</div>
          <div className="lc-title-block">
            <div className="lc-title">{lecture.display_title}</div>
            <span
              className="lc-course-badge"
              style={{
                background: `${lecture.display_color}22`,
                color: lecture.display_color,
              }}
            >
              {lecture.display_course}
            </span>
          </div>
        </div>

        {/* Progress bars */}
        <div className="lc-progress-row">
          <div className="lc-progress-item">
            <span>Flashcards</span>
            <div className="lc-progress-bar-bg">
              <div
                className="lc-progress-bar-fill"
                style={{
                  width: `${flashcardProgress}%`,
                  background: lecture.display_color,
                  opacity: 0.75,
                }}
              />
            </div>
          </div>
          <div className="lc-progress-item">
            <span>Exam</span>
            <div className="lc-progress-bar-bg">
              <div
                className="lc-progress-bar-fill"
                style={{
                  width: `${examProgress}%`,
                  background: lecture.display_color,
                  opacity: 0.75,
                }}
              />
            </div>
          </div>
        </div>

        {/* Tags */}
        {lecture.settings.tags.length > 0 && (
          <div className="lc-tags" aria-label="Tags">
            {lecture.settings.tags.map((tag) => (
              <span key={tag} className="lc-tag">{tag}</span>
            ))}
          </div>
        )}

        {/* Slide count */}
        <div className="lc-slide-count">{lecture.slide_count} slides</div>

        {/* Restore button for archived cards */}
        {lecture.settings.archived && (
          <button className="lc-restore-btn" onClick={(e) => { e.stopPropagation(); onRestore(); }}>
            ↩ Restore
          </button>
        )}

        {/* Unhide button for hidden (non-archived) cards */}
        {!lecture.settings.visible && !lecture.settings.archived && (
          <button className="lc-restore-btn" onClick={(e) => { e.stopPropagation(); onRestore(); }}>
            👁 Unhide
          </button>
        )}
      </div>
    </>
  );
}
