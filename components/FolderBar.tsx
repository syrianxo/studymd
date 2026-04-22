// components/FolderBar.tsx
// Horizontal pill row above the lecture grid.
// Always rendered (even when no user folders exist) so the built-in
// "Unfiled" and "All Lectures" pills are always accessible.
//
// Must be a descendant of a @dnd-kit DndContext — folder pills are
// droppable targets while lecture cards (in LectureGrid) are drag sources.
//
// Dropdown overflow fix: the scroll container (overflow-x: auto) clips
// position:absolute children. Dropdowns use position:fixed with coords
// from getBoundingClientRect() so they escape the scroll container.
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Folder } from '@/types';

// ─── Per-pill color picker presets ───────────────────────────────────────────

const PRESET_COLORS = [
  '#e57373', '#ef9a9a',
  '#ffb74d', '#ffcc80',
  '#fff176', '#fff9c4',
  '#81c784', '#a5d6a7',
  '#4fc3f7', '#81d4fa',
  '#ce93d8', '#e1bee7',
  '#f48fb1', '#f8bbd0',
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface FolderBarProps {
  /** Root-level folders to render as pills */
  folders: Folder[];
  /** null = Unfiled, '__all__' = All Lectures, uuid = specific folder */
  activeFolderId: string | null;
  lectureCounts: Record<string, number>;
  /** Whether a lecture card is currently being dragged — shows drop hints */
  isDragging: boolean;
  onNavigate: (folderId: string | null) => void;
  onCreateFolder: () => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onChangeFolderColor: (id: string, color: string | null) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FolderBar({
  folders, activeFolderId, lectureCounts, isDragging,
  onNavigate, onCreateFolder,
  onRenameFolder, onDeleteFolder, onChangeFolderColor,
  onMoveUp, onMoveDown,
}: FolderBarProps) {
  return (
    <div className="fb-bar">
      <style>{barCss}</style>
      <div className="fb-scroll">
        {/* ── Built-in: Unfiled (default, shows only lectures not in a folder) ── */}
        <button
          className={['fb-static-pill', activeFolderId === null ? 'fb-static-pill--active' : ''].filter(Boolean).join(' ')}
          onClick={() => onNavigate(null)}
          aria-pressed={activeFolderId === null}
        >
          📋 Unfiled
        </button>

        {/* ── Built-in: All Lectures ── */}
        <button
          className={['fb-static-pill', activeFolderId === '__all__' ? 'fb-static-pill--active' : ''].filter(Boolean).join(' ')}
          onClick={() => onNavigate('__all__')}
          aria-pressed={activeFolderId === '__all__'}
        >
          📚 All
        </button>

        {/* Divider before user folders */}
        {folders.length > 0 && <div className="fb-divider" />}

        {folders.map((folder, i) => (
          <FolderPill
            key={folder.id}
            folder={folder}
            isActive={activeFolderId === folder.id}
            isDragging={isDragging}
            lectureCount={lectureCounts[folder.id] ?? 0}
            onNavigate={() => onNavigate(folder.id)}
            onRename={name => onRenameFolder(folder.id, name)}
            onDelete={() => onDeleteFolder(folder.id)}
            onChangeColor={color => onChangeFolderColor(folder.id, color)}
            canMoveUp={i > 0}
            canMoveDown={i < folders.length - 1}
            onMoveUp={() => onMoveUp(folder.id)}
            onMoveDown={() => onMoveDown(folder.id)}
          />
        ))}

        <button className="fb-create-btn" onClick={onCreateFolder} title="New folder">
          <span className="fb-create-icon">+</span> New folder
        </button>
      </div>
    </div>
  );
}

// ─── Individual pill ──────────────────────────────────────────────────────────

interface FolderPillProps {
  folder: Folder;
  isActive: boolean;
  isDragging: boolean;
  lectureCount: number;
  onNavigate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onChangeColor: (color: string | null) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function FolderPill({
  folder, isActive, isDragging, lectureCount,
  onNavigate, onRename, onDelete, onChangeColor,
  canMoveUp, canMoveDown, onMoveUp, onMoveDown,
}: FolderPillProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder-${folder.id}` });

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(folder.name);
  const [colorOpen, setColorOpen] = useState(false);

  // Fixed-position coords for the dropdown — escapes the scroll container's overflow clip.
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(null);

  const kebabRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const closeAll = useCallback(() => {
    setMenuOpen(false);
    setColorOpen(false);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen && !colorOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeAll();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, colorOpen, closeAll]);

  // Close on scroll / resize (fixed position would drift)
  useEffect(() => {
    if (!menuOpen && !colorOpen) return;
    const handler = () => closeAll();
    window.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler, { passive: true });
    return () => {
      window.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, [menuOpen, colorOpen, closeAll]);

  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  function openKebabMenu(e: React.MouseEvent) {
    e.stopPropagation();
    if (!menuOpen) {
      // Capture button position so dropdown can use position:fixed to escape overflow clip
      const rect = kebabRef.current?.getBoundingClientRect();
      if (rect) setDropPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    }
    setMenuOpen(p => !p);
    setColorOpen(false);
  }

  function handleRenameSubmit() {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== folder.name) onRename(trimmed);
    else setNameValue(folder.name);
    setRenaming(false);
  }

  const accent = folder.color ?? 'var(--accent)';
  const isDropTarget = isDragging && isOver;

  // Shared style for the fixed-position dropdown
  const fixedDropStyle: React.CSSProperties | undefined = dropPos ? {
    position: 'fixed',
    top: dropPos.top,
    left: dropPos.left,
    transform: 'translateX(-50%)',
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      className={[
        'fb-pill',
        isActive ? 'fb-pill--active' : '',
        isDragging ? 'fb-pill--droppable' : '',
        isDropTarget ? 'fb-pill--over' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--fb-accent': accent } as React.CSSProperties}
    >
      {/* Main clickable area */}
      {renaming ? (
        <input
          ref={renameRef}
          className="fb-rename-input"
          value={nameValue}
          onChange={e => setNameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={e => {
            if (e.key === 'Enter') handleRenameSubmit();
            if (e.key === 'Escape') { setNameValue(folder.name); setRenaming(false); }
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <button className="fb-pill-main" onClick={onNavigate} aria-pressed={isActive}>
          <span className="fb-pill-icon">{folder.icon}</span>
          <span className="fb-pill-name">{folder.name}</span>
          {lectureCount > 0 && (
            <span className="fb-pill-count">{lectureCount}</span>
          )}
        </button>
      )}

      {/* Kebab menu */}
      <div className="fb-menu-wrap" ref={menuRef}>
        <button
          ref={kebabRef}
          className="fb-kebab"
          aria-label="Folder options"
          onClick={openKebabMenu}
        >
          ···
        </button>

        {menuOpen && !colorOpen && (
          <div className="fb-dropdown" style={fixedDropStyle}>
            {/* Reorder */}
            <div className="fb-dropdown-reorder">
              <button
                className="fb-dropdown-reorder-btn"
                disabled={!canMoveUp}
                onClick={() => { onMoveUp(); closeAll(); }}
                title="Move left"
              >↑</button>
              <span className="fb-dropdown-reorder-label">Reorder</span>
              <button
                className="fb-dropdown-reorder-btn"
                disabled={!canMoveDown}
                onClick={() => { onMoveDown(); closeAll(); }}
                title="Move right"
              >↓</button>
            </div>
            <div className="fb-dropdown-divider" />
            <button onClick={() => { closeAll(); setRenaming(true); }}>Rename</button>
            <button onClick={() => {
              // Recalculate position for color picker (same anchor)
              const rect = kebabRef.current?.getBoundingClientRect();
              if (rect) setDropPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
              setColorOpen(true);
              setMenuOpen(false);
            }}>Change colour</button>
            <button className="fb-dropdown-danger" onClick={() => { closeAll(); onDelete(); }}>
              Delete folder
            </button>
          </div>
        )}

        {colorOpen && (
          <div className="fb-dropdown fb-color-picker" style={fixedDropStyle}>
            <div className="fb-cp-label">Folder colour</div>
            <div className="fb-cp-grid">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className="fb-cp-swatch"
                  style={{
                    background: c,
                    outline: folder.color === c ? '2px solid var(--text)' : undefined,
                  }}
                  onClick={() => { onChangeColor(c); closeAll(); }}
                />
              ))}
              <button
                className="fb-cp-swatch fb-cp-clear"
                title="Clear colour"
                onClick={() => { onChangeColor(null); closeAll(); }}
              >✕</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const barCss = `
/* ── Bar container ── */
.fb-bar {
  margin-bottom: 14px;
}
.fb-scroll {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.fb-scroll::-webkit-scrollbar { display: none; }

/* ── Vertical divider between built-in and user pills ── */
.fb-divider {
  width: 1px;
  height: 22px;
  background: var(--border);
  flex-shrink: 0;
  margin: 0 2px;
}

/* ── Built-in static pills (Unfiled, All Lectures) ── */
.fb-static-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 6px 14px;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 100px;
  cursor: pointer;
  white-space: nowrap;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  transition: border-color .15s, background .15s, color .15s;
  min-height: 36px;
}
.fb-static-pill:hover {
  border-color: var(--border-bright);
  color: var(--text);
}
.fb-static-pill--active {
  background: rgba(91,141,238,.1);
  border-color: var(--accent) !important;
  color: var(--accent) !important;
}

/* ── User-folder pill ── */
.fb-pill {
  display: inline-flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 100px;
  transition: border-color .15s, background .15s, box-shadow .15s;
  position: relative;
  overflow: visible;
}
.fb-pill:hover { border-color: var(--border-bright); }

/* Active (navigated into this folder) */
.fb-pill--active {
  background: rgba(91,141,238,.1);
  border-color: var(--accent) !important;
}

/* Droppable target state — shown while a card is being dragged */
.fb-pill--droppable {
  border-style: dashed;
  border-color: var(--border-bright);
}
.fb-pill--over {
  border-style: solid;
  border-color: var(--fb-accent, var(--accent)) !important;
  background: rgba(91,141,238,.12) !important;
  box-shadow: 0 0 0 3px rgba(91,141,238,.2);
}

/* ── Pill main button ── */
.fb-pill-main {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px 6px 12px;
  background: none; border: none; cursor: pointer;
  font-family: 'Outfit', sans-serif; color: var(--text);
  border-radius: 100px 0 0 100px;
  min-height: 36px;
}
.fb-pill-main:hover { background: rgba(255,255,255,.04); }
.fb-pill--active .fb-pill-main { color: var(--accent); }

.fb-pill-icon { font-size: 15px; line-height: 1; }
.fb-pill-name { font-size: 13px; font-weight: 600; white-space: nowrap; }
.fb-pill-count {
  font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 500;
  background: rgba(255,255,255,.08); border-radius: 100px;
  padding: 1px 6px; color: var(--text-muted); white-space: nowrap;
}
.fb-pill--active .fb-pill-count { background: rgba(91,141,238,.2); color: var(--accent); }

/* ── Rename input inside pill ── */
.fb-rename-input {
  font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
  background: var(--surface2); border: 1px solid var(--accent);
  border-radius: 8px; padding: 4px 10px;
  color: var(--text); outline: none; width: 120px;
  margin: 4px 0 4px 8px;
}

/* ── Kebab button ── */
.fb-menu-wrap { position: relative; flex-shrink: 0; }
.fb-kebab {
  background: none; border: none; color: var(--text-muted);
  font-size: 14px; letter-spacing: 1px; padding: 6px 10px;
  cursor: pointer; border-radius: 0 100px 100px 0;
  min-height: 36px; display: flex; align-items: center;
  transition: background .12s, color .12s;
}
.fb-kebab:hover { background: rgba(255,255,255,.06); color: var(--text); }

/* ── Dropdown menu (position:fixed set inline via JS) ── */
.fb-dropdown {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.4);
  z-index: 1000; min-width: 168px; overflow: hidden;
  animation: fb-dropdown-in .1s ease;
}
@keyframes fb-dropdown-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.fb-dropdown button {
  display: block; width: 100%; padding: 9px 14px;
  background: none; border: none; text-align: left;
  font-family: 'Outfit', sans-serif; font-size: 13px;
  color: var(--text); cursor: pointer;
}
.fb-dropdown button:hover { background: var(--surface2); }
.fb-dropdown-danger { color: #ef5350 !important; }
.fb-dropdown-divider { height: 1px; background: var(--border); }

/* Reorder row */
.fb-dropdown-reorder {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px;
}
.fb-dropdown-reorder-label {
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: .08em;
  text-transform: uppercase; color: var(--text-muted);
}
.fb-dropdown-reorder-btn {
  width: 28px; height: 28px; border-radius: 6px;
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text-muted); font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .1s, color .1s;
  padding: 0;
}
.fb-dropdown-reorder-btn:not(:disabled):hover { background: var(--surface); color: var(--text); border-color: var(--border-bright); }
.fb-dropdown-reorder-btn:disabled { opacity: .3; cursor: not-allowed; }

/* ── Colour picker inside dropdown ── */
.fb-color-picker { padding: 10px; min-width: 190px; }
.fb-cp-label { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; }
/* Fixed pixel columns prevent oval distortion */
.fb-cp-grid { display: grid; grid-template-columns: repeat(7, 24px); gap: 5px; justify-content: start; }
.fb-cp-swatch {
  width: 24px; height: 24px; border-radius: 50%;
  border: none; cursor: pointer; transition: transform .1s;
}
.fb-cp-swatch:hover { transform: scale(1.2); }
.fb-cp-clear {
  background: var(--surface2) !important; font-size: 11px;
  color: var(--text-muted); display: flex; align-items: center; justify-content: center;
}

/* ── "New folder" button ── */
.fb-create-btn {
  display: inline-flex; align-items: center; gap: 5px;
  flex-shrink: 0; padding: 6px 14px;
  background: none; border: 1.5px dashed var(--border);
  border-radius: 100px; cursor: pointer; white-space: nowrap;
  font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
  color: var(--text-muted); transition: border-color .15s, color .15s;
  min-height: 36px;
}
.fb-create-btn:hover { border-color: var(--border-bright); color: var(--text); }
.fb-create-icon { font-size: 15px; line-height: 1; }
`;
