// components/NewFolderModal.tsx
// Themed modal for creating a new folder.
// Replaces the native browser prompt() so the UX matches the rest of the app.
// Also lets the user immediately assign unfiled lectures to the new folder.
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Lecture } from '@/hooks/useUserLectures';

interface NewFolderModalProps {
  isOpen: boolean;
  /** Lectures not yet assigned to any folder — the only ones eligible for immediate assignment */
  unfiledLectures: Lecture[];
  onClose: () => void;
  /** Called with folder name, chosen icon, and (optionally) lecture IDs to assign immediately */
  onCreate: (name: string, icon: string, lectureIds: string[]) => Promise<void>;
}

const FOLDER_ICONS = [
  '📁', '📂', '📚', '🗂️', '🏥', '💊', '🩺',
  '🔬', '🧬', '❤️', '🧠', '💉', '📋', '🩻',
  '🦷', '🫀', '🫁', '🦴', '🧪', '⚕️',
];

export default function NewFolderModal({
  isOpen, unfiledLectures, onClose, onCreate,
}: NewFolderModalProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state and focus name input each time modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setIcon('📁');
      setSelectedIds(new Set());
      setSaving(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  function toggleLecture(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(unfiledLectures.map(l => l.internal_id)));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  async function handleCreate() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onCreate(name.trim(), icon, Array.from(selectedIds));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  const allSelected = unfiledLectures.length > 0 && selectedIds.size === unfiledLectures.length;

  return createPortal(
    <div
      className={`nfm-overlay${isOpen ? ' nfm-open' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-modal={isOpen}
      role="dialog"
      aria-label="New folder"
    >
      <style>{css}</style>
      <div className="nfm-modal">
        {/* ── Header ── */}
        <div className="nfm-header">
          <h2 className="nfm-title">New folder</h2>
          <button className="nfm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Icon picker ── */}
        <div className="nfm-label">Icon</div>
        <div className="nfm-icon-grid">
          {FOLDER_ICONS.map(ic => (
            <button
              key={ic}
              className={`nfm-icon-btn${icon === ic ? ' nfm-icon-btn--active' : ''}`}
              onClick={() => setIcon(ic)}
              aria-label={ic}
              aria-pressed={icon === ic}
            >
              {ic}
            </button>
          ))}
        </div>

        {/* ── Name input ── */}
        <div className="nfm-label">Folder name</div>
        <div className="nfm-name-row">
          <span className="nfm-name-preview">{icon}</span>
          <input
            ref={inputRef}
            className="nfm-input"
            placeholder="e.g. Cardiology, Block 2…"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') onClose();
            }}
            maxLength={60}
          />
        </div>

        {/* ── Lecture assignment (only unfiled lectures shown) ── */}
        {unfiledLectures.length > 0 && (
          <div className="nfm-assign-section">
            <div className="nfm-label" style={{ marginBottom: 6 }}>
              Add lectures
              <span className="nfm-label-sub"> — only unfiled lectures shown</span>
              {selectedIds.size > 0 && (
                <span className="nfm-sel-badge">{selectedIds.size}</span>
              )}
              <button
                className="nfm-select-all-btn"
                onClick={allSelected ? clearAll : selectAll}
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="nfm-lecture-list">
              {unfiledLectures.map(l => {
                const checked = selectedIds.has(l.internal_id);
                return (
                  <label
                    key={l.internal_id}
                    className={`nfm-lecture-row${checked ? ' nfm-lecture-row--on' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="nfm-checkbox"
                      checked={checked}
                      onChange={() => toggleLecture(l.internal_id)}
                    />
                    <span className="nfm-lec-icon">{l.icon}</span>
                    <span className="nfm-lec-title">{l.custom_title ?? l.title}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="nfm-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!name.trim() || saving}
          >
            {saving
              ? 'Creating…'
              : selectedIds.size > 0
                ? `Create & add ${selectedIds.size} lecture${selectedIds.size !== 1 ? 's' : ''}`
                : 'Create folder'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const css = `
.nfm-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.65); backdrop-filter: blur(6px);
  z-index: 600;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  opacity: 0; pointer-events: none;
  transition: opacity .18s ease;
}
.nfm-overlay.nfm-open { opacity: 1; pointer-events: auto; }

.nfm-modal {
  background: var(--surface);
  border: 1px solid var(--border-bright, rgba(255,255,255,.12));
  border-radius: 18px;
  padding: 24px;
  width: 100%; max-width: 460px;
  max-height: 88vh; overflow-y: auto;
  transform: translateY(18px) scale(0.97);
  transition: transform .22s cubic-bezier(.34,1.2,.64,1);
}
.nfm-overlay.nfm-open .nfm-modal { transform: translateY(0) scale(1); }

.nfm-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 20px;
}
.nfm-title {
  font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; color: var(--text);
}
.nfm-close {
  width: 32px; height: 32px; border-radius: 8px;
  background: none; border: 1px solid var(--border);
  color: var(--text-muted); font-size: 13px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .12s, color .12s;
}
.nfm-close:hover { background: rgba(255,255,255,.06); color: var(--text); }

.nfm-label {
  font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 10px;
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.nfm-label-sub {
  font-weight: 400; text-transform: none; letter-spacing: 0;
  font-family: 'Outfit', sans-serif; font-size: 11px;
}
.nfm-sel-badge {
  background: var(--accent); color: #fff; border-radius: 100px;
  font-size: 10px; padding: 1px 7px; font-family: 'DM Mono', monospace; font-weight: 600;
}
.nfm-select-all-btn {
  margin-left: auto; font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 600;
  color: var(--accent); background: none; border: none; cursor: pointer;
  text-transform: none; letter-spacing: 0;
}
.nfm-select-all-btn:hover { opacity: .75; }

.nfm-icon-grid {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px;
}
.nfm-icon-btn {
  font-size: 20px; padding: 6px 8px; border-radius: 8px; line-height: 1;
  background: var(--surface2); border: 1.5px solid transparent;
  cursor: pointer; transition: border-color .12s, background .12s;
}
.nfm-icon-btn:hover { background: rgba(255,255,255,.07); }
.nfm-icon-btn--active {
  border-color: var(--accent);
  background: rgba(91,141,238,.12);
}

.nfm-name-row {
  display: flex; align-items: center; gap: 10px; margin-bottom: 20px;
}
.nfm-name-preview { font-size: 24px; flex-shrink: 0; line-height: 1; }
.nfm-input {
  flex: 1; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 10px; padding: 10px 14px;
  color: var(--text); font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 600;
  outline: none; transition: border-color .15s;
}
.nfm-input:focus { border-color: var(--accent); }
.nfm-input::placeholder { color: var(--text-muted); font-weight: 400; }

.nfm-assign-section { margin-bottom: 4px; }

.nfm-lecture-list {
  border: 1px solid var(--border); border-radius: 10px;
  max-height: 210px; overflow-y: auto; overflow-x: hidden;
}
.nfm-lecture-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 14px; cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background .1s;
}
.nfm-lecture-row:last-child { border-bottom: none; }
.nfm-lecture-row:hover { background: rgba(255,255,255,.04); }
.nfm-lecture-row--on { background: rgba(91,141,238,.08); }
.nfm-checkbox { width: 15px; height: 15px; flex-shrink: 0; accent-color: var(--accent); cursor: pointer; }
.nfm-lec-icon { font-size: 16px; flex-shrink: 0; }
.nfm-lec-title {
  font-family: 'Outfit', sans-serif; font-size: 13px; color: var(--text);
  line-height: 1.3; min-width: 0;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}

.nfm-footer {
  display: flex; gap: 10px; justify-content: flex-end;
  margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border);
}

/* Mobile: sheet slides up from bottom */
@media (max-width: 520px) {
  .nfm-overlay { align-items: flex-end; padding: 0; }
  .nfm-modal {
    border-radius: 18px 18px 0 0; max-height: 90vh;
    transform: translateY(100%);
  }
  .nfm-overlay.nfm-open .nfm-modal { transform: translateY(0); }
}
`;
