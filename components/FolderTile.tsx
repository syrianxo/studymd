// components/FolderTile.tsx
// A tile rendered inside the lecture grid representing a folder the user can click into.
// Matches the visual weight of LectureCard so the grid feels uniform.
'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { Folder } from '@/types';
import type { Theme } from '@/types';

interface FolderTileProps {
  folder: Folder;
  lectureCount: number;       // how many lectures live directly in this folder
  subfoldersCount: number;    // how many immediate subfolders
  activeTheme: Theme;
  onOpen: () => void;         // navigate into this folder
  onRename: (newName: string) => void;
  onDelete: () => void;
  onChangeColor: (color: string | null) => void;
}

const PRESET_COLORS = [
  '#e57373', '#ef9a9a', // reds
  '#ffb74d', '#ffcc80', // oranges
  '#fff176', '#fff9c4', // yellows
  '#81c784', '#a5d6a7', // greens
  '#4fc3f7', '#81d4fa', // blues
  '#ce93d8', '#e1bee7', // purples
  '#f48fb1', '#f8bbd0', // pinks
];

export default function FolderTile({
  folder,
  lectureCount,
  subfoldersCount,
  activeTheme: _activeTheme,
  onOpen,
  onRename,
  onDelete,
  onChangeColor,
}: FolderTileProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(folder.name);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen && !colorPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, colorPickerOpen]);

  // Focus rename input when opened
  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  function handleRenameSubmit() {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== folder.name) onRename(trimmed);
    else setNameValue(folder.name);
    setRenaming(false);
  }

  const accent = folder.color ?? 'var(--accent)';

  const meta: string[] = [];
  if (lectureCount === 1) meta.push('1 lecture');
  else if (lectureCount > 1) meta.push(`${lectureCount} lectures`);
  if (subfoldersCount === 1) meta.push('1 folder');
  else if (subfoldersCount > 1) meta.push(`${subfoldersCount} folders`);

  return (
    <div className="ft-tile" style={{ '--ft-accent': accent } as React.CSSProperties}>
      <button className="ft-main" onClick={onOpen} aria-label={`Open folder ${folder.name}`}>
        <div className="ft-icon">{folder.icon}</div>
        <div className="ft-body">
          {renaming ? (
            <input
              ref={renameRef}
              className="ft-rename-input"
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
            <div className="ft-name">{folder.name}</div>
          )}
          <div className="ft-meta">{meta.length > 0 ? meta.join(' · ') : 'Empty'}</div>
        </div>
      </button>

      {/* Kebab menu */}
      <div className="ft-menu-wrap" ref={menuRef}>
        <button
          className="ft-kebab"
          aria-label="Folder options"
          onClick={e => { e.stopPropagation(); setMenuOpen(p => !p); setColorPickerOpen(false); }}
        >
          ···
        </button>

        {menuOpen && !colorPickerOpen && (
          <div className="ft-dropdown">
            <button onClick={() => { setMenuOpen(false); setRenaming(true); }}>Rename</button>
            <button onClick={() => { setColorPickerOpen(true); }}>Change colour</button>
            <button className="ft-danger" onClick={() => { setMenuOpen(false); onDelete(); }}>
              Delete folder
            </button>
          </div>
        )}

        {colorPickerOpen && (
          <div className="ft-dropdown ft-color-picker">
            <div className="ft-cp-label">Folder colour</div>
            <div className="ft-cp-grid">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className="ft-cp-swatch"
                  style={{ background: c, outline: folder.color === c ? '2px solid var(--text)' : undefined }}
                  onClick={() => { onChangeColor(c); setColorPickerOpen(false); setMenuOpen(false); }}
                />
              ))}
              <button
                className="ft-cp-swatch ft-cp-clear"
                title="Clear colour"
                onClick={() => { onChangeColor(null); setColorPickerOpen(false); setMenuOpen(false); }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .ft-tile {
          position: relative;
          display: flex;
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--border);
          border-left: 3px solid var(--ft-accent, var(--accent));
          border-radius: 10px;
          overflow: visible;
          transition: box-shadow .15s, border-color .15s;
          min-height: 52px;
        }
        .ft-tile:hover { box-shadow: 0 2px 10px rgba(0,0,0,.18); border-color: var(--border-bright); }

        .ft-main {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 0 10px 12px;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          min-width: 0;
        }
        .ft-icon {
          font-size: 20px;
          flex-shrink: 0;
          line-height: 1;
        }
        .ft-body { min-width: 0; flex: 1; }
        .ft-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ft-meta { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
        .ft-rename-input {
          font-size: 15px;
          font-weight: 600;
          width: 100%;
          background: var(--surface2);
          border: 1px solid var(--accent);
          border-radius: 6px;
          padding: 2px 6px;
          color: var(--text);
          outline: none;
        }

        .ft-menu-wrap { position: relative; flex-shrink: 0; padding: 0 8px; }
        .ft-kebab {
          background: none;
          border: none;
          font-size: 15px;
          line-height: 1;
          color: var(--text-muted);
          cursor: pointer;
          padding: 3px 5px;
          border-radius: 5px;
          letter-spacing: 1px;
        }
        .ft-kebab:hover { background: var(--surface2); color: var(--text); }

        .ft-dropdown {
          position: absolute;
          right: 0;
          top: calc(100% + 4px);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 8px 24px var(--shadow);
          z-index: 200;
          min-width: 160px;
          overflow: hidden;
        }
        .ft-dropdown button {
          display: block;
          width: 100%;
          padding: 9px 14px;
          background: none;
          border: none;
          text-align: left;
          font-size: 14px;
          color: var(--text);
          cursor: pointer;
        }
        .ft-dropdown button:hover { background: var(--surface2); }
        .ft-danger { color: #ef5350 !important; }

        .ft-color-picker { min-width: 190px; padding: 10px; }
        .ft-cp-label { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
        .ft-cp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
        .ft-cp-swatch {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          transition: transform .1s;
        }
        .ft-cp-swatch:hover { transform: scale(1.2); }
        .ft-cp-clear {
          background: var(--surface2) !important;
          font-size: 11px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
