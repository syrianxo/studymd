'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
} from 'react';
import { updateLectureSettings } from '@/lib/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TagEditorProps {
  userId: string;
  internalId: string;
  lectureTitle: string;
  currentTags: string[];
  allTags: string[];          // for autocomplete
  onSave: (tags: string[]) => void;
  onClose: () => void;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const css = `
.te-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: te-fade-in 0.15s ease;
}
@keyframes te-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.te-modal {
  background: var(--surface, #13161d);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 28px;
  width: 480px;
  max-width: calc(100vw - 32px);
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  animation: te-slide-up 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes te-slide-up {
  from { transform: translateY(16px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

.te-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}
.te-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--text, #e8eaf0);
  line-height: 1.3;
}
.te-subtitle {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  color: var(--text-muted, #6b7280);
  margin-top: 2px;
}
.te-close {
  background: none;
  border: none;
  color: var(--text-muted, #6b7280);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: color 0.15s;
  flex-shrink: 0;
}
.te-close:hover { color: var(--text, #e8eaf0); }

/* Chips container */
.te-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  min-height: 32px;
}
.te-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--accent, #5b8dee);
  color: #fff;
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px 4px 12px;
  border-radius: 100px;
  animation: te-chip-in 0.15s ease;
}
@keyframes te-chip-in {
  from { transform: scale(0.85); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
.te-chip-remove {
  background: none;
  border: none;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  line-height: 1;
  display: flex;
  align-items: center;
  transition: color 0.12s;
}
.te-chip-remove:hover { color: #fff; }

/* Input row */
.te-input-wrapper {
  position: relative;
  margin-bottom: 8px;
}
.te-input {
  width: 100%;
  background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 10px 14px;
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  color: var(--text, #e8eaf0);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.te-input:focus {
  border-color: var(--accent, #5b8dee);
}
.te-input::placeholder { color: var(--text-muted, #6b7280); }

/* Autocomplete dropdown */
.te-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  overflow: hidden;
  z-index: 10;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.te-dropdown-item {
  padding: 9px 14px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  color: var(--text, #e8eaf0);
  cursor: pointer;
  transition: background 0.1s;
}
.te-dropdown-item:hover,
.te-dropdown-item.focused {
  background: rgba(255,255,255,0.06);
  color: var(--accent, #5b8dee);
}
.te-dropdown-item-new {
  color: var(--accent, #5b8dee);
  font-style: italic;
}

.te-hint {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  margin-bottom: 20px;
}

/* Footer */
.te-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.te-btn {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
}
.te-btn-cancel {
  background: transparent;
  color: var(--text-muted, #6b7280);
  border: 1px solid rgba(255,255,255,0.1);
}
.te-btn-cancel:hover { color: var(--text, #e8eaf0); border-color: rgba(255,255,255,0.2); }
.te-btn-save {
  background: var(--accent, #5b8dee);
  color: #fff;
}
.te-btn-save:hover { filter: brightness(1.1); }
.te-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
`;

// ─── Component ──────────────────────────────────────────────────────────────

export function TagEditor({
  userId,
  internalId,
  lectureTitle,
  currentTags,
  allTags,
  onSave,
  onClose,
}: TagEditorProps) {
  const [tags, setTags] = useState<string[]>(currentTags);
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [dropdownIdx, setDropdownIdx] = useState(-1);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Compute autocomplete suggestions
  const suggestions = input.trim()
    ? allTags.filter(
        (t) =>
          t.toLowerCase().includes(input.toLowerCase()) &&
          !tags.includes(t)
      )
    : [];
  const showNewOption =
    input.trim().length > 0 &&
    !allTags.includes(input.trim()) &&
    !tags.includes(input.trim());

  const dropdownItems = [
    ...suggestions,
    ...(showNewOption ? [`Create "${input.trim()}"`] : []),
  ];

  // Close on Escape / backdrop click
  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const addTag = useCallback(
    (raw: string) => {
      // Strip the 'Create "..."' wrapper if selected from dropdown
      const tag = raw.startsWith('Create "')
        ? raw.slice(8, -1)
        : raw.trim();
      if (!tag || tags.includes(tag)) return;
      setTags((prev) => [...prev, tag]);
      setInput('');
      setDropdownIdx(-1);
    },
    [tags]
  );

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (dropdownIdx >= 0 && dropdownItems[dropdownIdx]) {
        addTag(dropdownItems[dropdownIdx]);
      } else if (input.trim()) {
        addTag(input.trim());
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDropdownIdx((i) => Math.min(i + 1, dropdownItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDropdownIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateLectureSettings(userId, internalId, { tags });
      onSave(tags);
      onClose();
    } catch (err) {
      console.error('Failed to save tags:', err);
      setSaving(false);
    }
  };

  return (
    <>
      <style>{css}</style>
      <div className="te-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="te-modal" role="dialog" aria-modal aria-label="Edit tags">
          <div className="te-header">
            <div>
              <div className="te-title">Edit Tags</div>
              <div className="te-subtitle">{lectureTitle}</div>
            </div>
            <button className="te-close" onClick={onClose} aria-label="Close">×</button>
          </div>

          {/* Current tags as chips */}
          <div className="te-chips" aria-label="Current tags">
            {tags.length === 0 && (
              <span style={{
                fontFamily: 'Outfit, sans-serif',
                fontSize: '13px',
                color: 'var(--text-muted, #6b7280)',
                fontStyle: 'italic',
              }}>
                No tags yet
              </span>
            )}
            {tags.map((tag) => (
              <span key={tag} className="te-chip">
                {tag}
                <button
                  className="te-chip-remove"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          {/* Input + autocomplete */}
          <div className="te-input-wrapper">
            <input
              ref={inputRef}
              className="te-input"
              type="text"
              placeholder="Add a tag… (Enter or comma to add)"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setDropdownIdx(-1);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              aria-label="Tag input"
              aria-autocomplete="list"
            />
            {focused && dropdownItems.length > 0 && (
              <div className="te-dropdown" role="listbox">
                {dropdownItems.map((item, i) => (
                  <div
                    key={item}
                    className={`te-dropdown-item${i === dropdownIdx ? ' focused' : ''}${
                      item.startsWith('Create "') ? ' te-dropdown-item-new' : ''
                    }`}
                    role="option"
                    aria-selected={i === dropdownIdx}
                    onMouseDown={() => addTag(item)}
                  >
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="te-hint">Press Enter or comma to add · Backspace to remove last</div>

          <div className="te-footer">
            <button className="te-btn te-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              className="te-btn te-btn-save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Tags'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
