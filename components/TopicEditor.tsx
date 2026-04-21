'use client';

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopicEditorProps {
  internalId: string;
  lectureTitle: string;
  /** Currently stored override (null = not overridden). */
  currentTopics: string[] | null;
  /** Canonical topics from the shared lectures row. */
  originalTopics: string[];
  onSave: (topics: string[] | null) => void;
  onClose: () => void;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const css = `
.tpe-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999999;
  animation: tpe-fade-in 0.15s ease;
}
@keyframes tpe-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.tpe-modal {
  background: var(--surface, #13161d);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 28px;
  width: 500px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  animation: tpe-slide-up 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes tpe-slide-up {
  from { transform: translateY(16px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

.tpe-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-shrink: 0;
}
.tpe-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--text, #e8eaf0);
  line-height: 1.3;
}
.tpe-subtitle {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  color: var(--text-muted, #6b7280);
  margin-top: 2px;
}
.tpe-close {
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
.tpe-close:hover { color: var(--text, #e8eaf0); }

/* Topic list */
.tpe-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  min-height: 40px;
}
.tpe-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tpe-input {
  flex: 1;
  background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 8px 12px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  color: var(--text, #e8eaf0);
  outline: none;
  transition: border-color 0.15s;
  min-height: 36px;
}
.tpe-input:focus { border-color: var(--accent, #5b8dee); }
.tpe-input::placeholder { color: var(--text-muted, #6b7280); }
.tpe-delete {
  background: none;
  border: none;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  font-size: 16px;
  padding: 4px 6px;
  border-radius: 6px;
  line-height: 1;
  transition: color 0.15s, background 0.15s;
  flex-shrink: 0;
  min-width: 28px;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tpe-delete:hover { color: #f87171; background: rgba(248,113,113,0.1); }

/* Add row */
.tpe-add-row {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.tpe-add-input {
  flex: 1;
  background: var(--surface2, #1a1e27);
  border: 1px dashed rgba(255,255,255,0.15);
  border-radius: 8px;
  padding: 8px 12px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  color: var(--text, #e8eaf0);
  outline: none;
  transition: border-color 0.15s;
  min-height: 36px;
}
.tpe-add-input:focus { border-color: var(--accent, #5b8dee); border-style: solid; }
.tpe-add-input::placeholder { color: var(--text-muted, #6b7280); }
.tpe-add-btn {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--accent, #5b8dee);
  background: rgba(91,141,238,0.1);
  border: 1px solid rgba(91,141,238,0.25);
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
  flex-shrink: 0;
}
.tpe-add-btn:hover { background: rgba(91,141,238,0.18); }
.tpe-add-btn:disabled { opacity: 0.4; cursor: default; }

/* Footer */
.tpe-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.tpe-reset-btn {
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted, #6b7280);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-decoration-color: rgba(107,114,128,0.4);
  transition: color 0.15s;
}
.tpe-reset-btn:hover { color: var(--text, #e8eaf0); }
.tpe-footer-actions {
  display: flex;
  gap: 10px;
}
.tpe-btn {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
}
.tpe-btn-cancel {
  background: transparent;
  color: var(--text-muted, #6b7280);
  border: 1px solid rgba(255,255,255,0.1);
}
.tpe-btn-cancel:hover { color: var(--text, #e8eaf0); border-color: rgba(255,255,255,0.2); }
.tpe-btn-save {
  background: var(--accent, #5b8dee);
  color: #fff;
}
.tpe-btn-save:hover { filter: brightness(1.1); }
.tpe-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
`;

// ─── Component ───────────────────────────────────────────────────────────────

export function TopicEditor({
  internalId,
  lectureTitle,
  currentTopics,
  originalTopics,
  onSave,
  onClose,
}: TopicEditorProps) {
  // Start from the current override if present, otherwise from the shared topics
  const [topics, setTopics] = useState<string[]>(currentTopics ?? originalTopics);
  const [newInput, setNewInput] = useState('');
  const [saving, setSaving] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape / backdrop click
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function addTopic() {
    const v = newInput.trim();
    if (!v) return;
    setTopics((prev) => [...prev, v]);
    setNewInput('');
    addInputRef.current?.focus();
  }

  function handleAddKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); addTopic(); }
  }

  function changeTopic(i: number, value: string) {
    setTopics((prev) => prev.map((t, j) => (j === i ? value : t)));
  }

  function deleteTopic(i: number) {
    setTopics((prev) => prev.filter((_, j) => j !== i));
  }

  function resetToOriginal() {
    setTopics([...originalTopics]);
    setNewInput('');
  }

  async function handleSave() {
    setSaving(true);
    try {
      const values = topics.map((t) => t.trim()).filter(Boolean);
      // null = revert to shared topics (no override stored)
      const override = values.length > 0 ? values : null;
      await fetch('/api/lectures/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalId, updates: { topicsOverride: override } }),
      });
      onSave(override);
      onClose();
    } catch (err) {
      console.error('Failed to save topics:', err);
      setSaving(false);
    }
  }

  const isResetAvailable = JSON.stringify(topics) !== JSON.stringify(originalTopics);

  return (
    <>
      <style>{css}</style>
      <div
        className="tpe-overlay"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="tpe-modal" role="dialog" aria-modal aria-label="Edit topics">
          {/* Header */}
          <div className="tpe-header">
            <div>
              <div className="tpe-title">Edit Topics</div>
              <div className="tpe-subtitle">{lectureTitle}</div>
            </div>
            <button className="tpe-close" onClick={onClose} aria-label="Close">×</button>
          </div>

          {/* Topic list */}
          <div className="tpe-list">
            {topics.map((t, i) => (
              <div key={i} className="tpe-row">
                <input
                  className="tpe-input"
                  value={t}
                  onChange={(e) => changeTopic(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addInputRef.current?.focus(); }
                  }}
                  aria-label={`Topic ${i + 1}`}
                />
                <button
                  className="tpe-delete"
                  onClick={() => deleteTopic(i)}
                  aria-label={`Remove topic ${t}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Add row */}
          <div className="tpe-add-row">
            <input
              ref={addInputRef}
              className="tpe-add-input"
              placeholder="Add topic…"
              value={newInput}
              onChange={(e) => setNewInput(e.target.value)}
              onKeyDown={handleAddKeyDown}
              aria-label="New topic"
            />
            <button
              className="tpe-add-btn"
              onClick={addTopic}
              disabled={!newInput.trim()}
            >
              + Add
            </button>
          </div>

          {/* Footer */}
          <div className="tpe-footer">
            <button
              className="tpe-reset-btn"
              onClick={resetToOriginal}
              disabled={!isResetAvailable}
              title="Restore original AI-generated topics"
            >
              Reset to original
            </button>
            <div className="tpe-footer-actions">
              <button className="tpe-btn tpe-btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                className="tpe-btn tpe-btn-save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Topics'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
