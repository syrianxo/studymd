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
  /* overflow: visible is essential — never set overflow:hidden here */
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
/* Elevate card above siblings when its menu is open */
.lc-card.lc-menu-open {
  z-index: 200;
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

/* Kebab menu button */
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
  z-index: 6;
  min-width: 32px;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lc-manage-mode .lc-kebab-btn,
.lc-card:hover .lc-kebab-btn {
  opacity: 0.7;
}
.lc-kebab-btn:hover { opacity: 1 !important; background: rgba(255,255,255,0.07); }
/* On mobile: always visible, full 44px touch target */
@media (max-width: 639px) {
  .lc-kebab-btn {
    opacity: 0.6;
    min-width: 44px;
    min-height: 44px;
    top: 6px;
    right: 6px;
    font-size: 20px;
  }
}

/* ─── Kebab dropdown ───────────────────────────────────────────────────────
   CRITICAL: overflow must be VISIBLE so the submenu can escape the box.
   Use a clip wrapper (.lc-menu-clip) around items that need background
   containment if needed, but the outer shell must never clip. */
.lc-menu {
  position: absolute;
  top: 44px;
  right: 8px;
  background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
  z-index: 300;
  min-width: 190px;
  /* MUST be visible — overflow:hidden clips absolutely-positioned submenus */
  overflow: visible;
  animation: lc-menu-in 0.12s ease;
}
@keyframes lc-menu-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* Each row in the main dropdown */
.lc-menu-row {
  position: relative;
}
/* Clip only the visual background of the top-level rows, not their children */
.lc-menu-row-inner {
  overflow: hidden;
  border-radius: 0;
}
/* First and last rows get rounded corners to match the container */
.lc-menu > .lc-menu-row:first-child .lc-menu-row-inner { border-radius: 9px 9px 0 0; }
.lc-menu > .lc-menu-row:last-child .lc-menu-row-inner  { border-radius: 0 0 9px 9px; }

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
  min-height: 40px;
  white-space: nowrap;
}
.lc-menu-item:hover { background: rgba(255,255,255,0.06); }
.lc-menu-item.active { background: rgba(255,255,255,0.04); }
.lc-menu-item.danger { color: #f87171; }
.lc-menu-divider {
  height: 1px;
  background: rgba(255,255,255,0.06);
  margin: 2px 0;
}
@media (max-width: 639px) {
  .lc-menu-item { min-height: 44px; font-size: 14px; padding: 10px 18px; }
}

/* ─── Sub-menu ─────────────────────────────────────────────────────────────
   Desktop: float to the LEFT of the parent menu row.
   Mobile (≤639px): expand inline below the trigger row.  */
.lc-submenu {
  position: absolute;
  /* Align top with the trigger row */
  top: 0;
  /* Float LEFT: right edge of submenu = left edge of menu - 4px gap */
  right: calc(100% + 4px);
  background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
  z-index: 400;
  min-width: 210px;
  overflow: hidden;
  animation: lc-menu-in 0.1s ease;
}

@media (max-width: 639px) {
  .lc-submenu {
    /* Switch to inline below the trigger */
    position: static;
    right: auto;
    top: auto;
    box-shadow: none;
    border: none;
    border-left: 2px solid rgba(255,255,255,0.1);
    border-radius: 0;
    min-width: 0;
    width: 100%;
    animation: none;
    background: rgba(255,255,255,0.02);
  }
  /* Indent submenu items on mobile */
  .lc-submenu .lc-menu-item {
    padding-left: 32px;
  }
}

/* Color picker */
.lc-color-row {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  flex-wrap: wrap;
}
.lc-color-swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.12s, border-color 0.12s;
  flex-shrink: 0;
}
.lc-color-swatch:hover { transform: scale(1.18); }
.lc-color-swatch.selected { border-color: rgba(255,255,255,0.7); box-shadow: 0 0 0 1px rgba(255,255,255,0.3); }
@media (max-width: 639px) {
  .lc-color-swatch { width: 36px; height: 36px; }
  .lc-color-row { gap: 10px; padding: 12px 18px; }
}

/* Restore button (archived/hidden) */
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

      {/* Edit Tags */}
      <div className="lc-menu-row">
        <div className="lc-menu-row-inner">
          <button className="lc-menu-item" onClick={onEditTags} role="menuitem">
            <span>🏷</span> Edit Tags
          </button>
        </div>
      </div>

      {/* Change Course — row wraps both trigger and submenu */}
      <div className="lc-menu-row">
        <div className="lc-menu-row-inner">
          <button
            className={`lc-menu-item${showCourse ? ' active' : ''}`}
            onClick={() => { setShowCourse((v) => !v); setShowColor(false); }}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={showCourse}
          >
            <span>📚</span> Change Course
            <span style={{ marginLeft: 'auto', opacity: 0.5 }}>{showCourse ? '▾' : '›'}</span>
          </button>
        </div>
        {showCourse && (
          <div className="lc-submenu">
            {COURSES.map((c) => (
              <button
                key={c}
                className="lc-menu-item"
                onClick={() => { onChangeCourse(c); onClose(); }}
                role="menuitem"
              >
                <span style={{ opacity: c === lecture.display_course ? 1 : 0 }}>✓</span> {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Change Color */}
      <div className="lc-menu-row">
        <div className="lc-menu-row-inner">
          <button
            className={`lc-menu-item${showColor ? ' active' : ''}`}
            onClick={() => { setShowColor((v) => !v); setShowCourse(false); }}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={showColor}
          >
            <span>🎨</span> Change Color
            <span style={{ marginLeft: 'auto', opacity: 0.5 }}>{showColor ? '▾' : '›'}</span>
          </button>
        </div>
        {showColor && (
          <div className="lc-submenu">
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

      {/* Hide / Archive / Restore */}
      {settings.archived ? (
        <div className="lc-menu-row">
          <div className="lc-menu-row-inner">
            <button className="lc-menu-item" onClick={() => { onRestore(); onClose(); }} role="menuitem">
              <span>↩️</span> Restore
            </button>
          </div>
        </div>
      ) : !settings.visible ? (
        <div className="lc-menu-row">
          <div className="lc-menu-row-inner">
            <button className="lc-menu-item" onClick={() => { onRestore(); onClose(); }} role="menuitem">
              <span>👁</span> Unhide
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="lc-menu-row">
            <div className="lc-menu-row-inner">
              <button className="lc-menu-item" onClick={() => { onHide(); onClose(); }} role="menuitem">
                <span>👁</span> Hide
              </button>
            </div>
          </div>
          <div className="lc-menu-row">
            <div className="lc-menu-row-inner">
              <button className="lc-menu-item danger" onClick={() => { onArchive(); onClose(); }} role="menuitem">
                <span>📦</span> Archive
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── LectureCard ─────────────────────────────────────────────────────────────

interface LectureCardProps {
  lecture: LectureWithSettings;
  isManageMode: boolean;
  flashcardProgress?: number;
  examProgress?: number;
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
    // Elevate above siblings when menu is open so dropdown is never clipped
    zIndex: menuOpen ? 200 : undefined,
  };

  const classNames = [
    'lc-card',
    isManageMode ? 'lc-manage-mode' : '',
    isDragging ? 'lc-dragging' : '',
    lecture.settings.archived ? 'lc-archived' : '',
    menuOpen ? 'lc-menu-open' : '',
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

        {/* Card body */}
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

        <div className="lc-progress-row">
          <div className="lc-progress-item">
            <span>Flashcards</span>
            <div className="lc-progress-bar-bg">
              <div
                className="lc-progress-bar-fill"
                style={{ width: `${flashcardProgress}%`, background: lecture.display_color, opacity: 0.75 }}
              />
            </div>
          </div>
          <div className="lc-progress-item">
            <span>Exam</span>
            <div className="lc-progress-bar-bg">
              <div
                className="lc-progress-bar-fill"
                style={{ width: `${examProgress}%`, background: lecture.display_color, opacity: 0.75 }}
              />
            </div>
          </div>
        </div>

        {lecture.settings.tags.length > 0 && (
          <div className="lc-tags" aria-label="Tags">
            {lecture.settings.tags.map((tag) => (
              <span key={tag} className="lc-tag">{tag}</span>
            ))}
          </div>
        )}

        <div className="lc-slide-count">{lecture.slide_count} slides</div>

        {lecture.settings.archived && (
          <button className="lc-restore-btn" onClick={(e) => { e.stopPropagation(); onRestore(); }}>
            ↩ Restore
          </button>
        )}

        {!lecture.settings.visible && !lecture.settings.archived && (
          <button className="lc-restore-btn" onClick={(e) => { e.stopPropagation(); onRestore(); }}>
            👁 Unhide
          </button>
        )}
      </div>
    </>
  );
}
