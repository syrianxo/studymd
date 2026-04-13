'use client';

// components/study/ExamConfigModal.tsx

import { useState, useEffect, useRef } from 'react';
import type { ExamQuestion, QuestionType } from './ExamView';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExamConfig {
  count: number;
  topics: string[];
  types: QuestionType[];
}

interface ExamConfigModalProps {
  lectureTitle: string;
  lectureSubtitle?: string;
  lectureIcon?: string;
  accentColor?: string;
  allQuestions: ExamQuestion[];
  onStart: (config: ExamConfig) => void;
  onClose: () => void;
}

// ── Question type metadata ────────────────────────────────────────────────────

const QUESTION_TYPES: { value: QuestionType; icon: string; label: string; shortLabel: string }[] = [
  { value: 'mcq',      icon: '🔘', label: 'Multiple Choice', shortLabel: 'MCQ' },
  { value: 'tf',       icon: '✓✗', label: 'True / False',    shortLabel: 'T/F' },
  { value: 'matching', icon: '⇄',  label: 'Matching',        shortLabel: 'Match' },
  { value: 'fillin',   icon: '✎',  label: 'Fill in the Blank', shortLabel: 'Fill' },
];

// ── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
.ecm-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  animation: ecm-fade-in 0.18s ease;
}
@keyframes ecm-fade-in { from { opacity: 0; } to { opacity: 1; } }

.ecm-modal {
  background: var(--surface, #13161d);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 20px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  width: 100%; max-width: 540px;
  max-height: 90vh; overflow-y: auto;
  animation: ecm-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}
@keyframes ecm-slide-up {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.ecm-header {
  padding: 24px 24px 0;
  display: flex; align-items: flex-start; gap: 14px;
}
.ecm-icon-wrap {
  width: 48px; height: 48px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; flex-shrink: 0;
}
.ecm-title-block { flex: 1; min-width: 0; }
.ecm-modal-label {
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--text-muted, #6b7280);
  margin-bottom: 4px;
}
.ecm-lecture-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 18px; font-weight: 700; line-height: 1.25;
  color: var(--text, #e8eaf0);
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.ecm-lecture-subtitle {
  font-family: 'Outfit', sans-serif; font-size: 13px;
  color: var(--text-muted, #6b7280); margin-top: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ecm-close-btn {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted, #6b7280); font-size: 18px;
  padding: 4px; border-radius: 6px; line-height: 1;
  transition: color 0.15s, background 0.15s;
  min-width: 32px; min-height: 32px;
  display: flex; align-items: center; justify-content: center;
}
.ecm-close-btn:hover { color: var(--text, #e8eaf0); background: rgba(255,255,255,0.07); }

.ecm-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 20px 0 0; }

.ecm-body { padding: 20px 24px 24px; display: flex; flex-direction: column; gap: 24px; }

.ecm-section-label {
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-muted, #6b7280);
  margin-bottom: 10px;
}

/* Slider */
.ecm-slider-row { display: flex; align-items: center; gap: 14px; }
.ecm-slider-wrap { flex: 1; }
.ecm-slider {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 5px; border-radius: 3px;
  background: rgba(255,255,255,0.1);
  outline: none; cursor: pointer;
}
.ecm-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent, #5b8dee);
  box-shadow: 0 0 0 3px rgba(91,141,238,0.2);
  cursor: pointer; transition: box-shadow 0.15s;
}
.ecm-slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 5px rgba(91,141,238,0.3);
}
.ecm-slider::-moz-range-thumb {
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent, #5b8dee); border: none;
  box-shadow: 0 0 0 3px rgba(91,141,238,0.2); cursor: pointer;
}
.ecm-slider-value {
  font-family: 'Fraunces', Georgia, serif; font-size: 22px; font-weight: 700;
  color: var(--accent, #5b8dee); min-width: 36px; text-align: right;
}
.ecm-slider-hint {
  font-family: 'Outfit', sans-serif; font-size: 11px;
  color: var(--text-muted, #6b7280); margin-top: 5px;
}

/* Topic chips */
.ecm-topic-grid { display: flex; flex-wrap: wrap; gap: 7px; }
.ecm-topic-chip {
  font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
  padding: 6px 12px; border-radius: 100px; cursor: pointer;
  border: 1.5px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04); color: var(--text-muted, #6b7280);
  transition: all 0.15s; min-height: 32px; display: flex; align-items: center;
  user-select: none;
}
.ecm-topic-chip:hover { border-color: rgba(255,255,255,0.2); color: var(--text, #e8eaf0); }
.ecm-topic-chip.selected {
  background: rgba(91,141,238,0.15); border-color: var(--accent, #5b8dee);
  color: var(--accent, #5b8dee);
}
.ecm-topic-actions {
  display: flex; gap: 8px; margin-top: 8px;
}
.ecm-topic-action-btn {
  font-family: 'Outfit', sans-serif; font-size: 11px;
  color: var(--accent, #5b8dee); background: none; border: none;
  cursor: pointer; padding: 2px 0; opacity: 0.8;
  transition: opacity 0.15s;
}
.ecm-topic-action-btn:hover { opacity: 1; }

/* Question type toggles */
.ecm-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ecm-type-toggle {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border-radius: 10px; cursor: pointer;
  border: 1.5px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  transition: all 0.15s; user-select: none; min-height: 44px;
}
.ecm-type-toggle:hover { border-color: rgba(255,255,255,0.18); }
.ecm-type-toggle.selected {
  border-color: var(--accent, #5b8dee);
  background: rgba(91,141,238,0.1);
}
.ecm-type-toggle.disabled {
  opacity: 0.35; cursor: not-allowed;
}
.ecm-type-icon { font-size: 15px; line-height: 1; }
.ecm-type-info { flex: 1; min-width: 0; }
.ecm-type-label {
  font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 600;
  color: var(--text, #e8eaf0); line-height: 1.2;
}
.ecm-type-count {
  font-family: 'DM Mono', monospace; font-size: 10px;
  color: var(--text-muted, #6b7280); margin-top: 1px;
}
.ecm-type-check {
  width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  font-size: 10px; transition: all 0.15s;
}
.ecm-type-toggle.selected .ecm-type-check {
  background: var(--accent, #5b8dee); border-color: var(--accent, #5b8dee); color: #fff;
}

/* Warning */
.ecm-warning {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: 8px;
  background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  font-family: 'Outfit', sans-serif; font-size: 12px; color: #f87171;
}

/* Footer */
.ecm-footer {
  padding: 0 24px 24px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.ecm-summary {
  font-family: 'Outfit', sans-serif; font-size: 12px;
  color: var(--text-muted, #6b7280); line-height: 1.5;
}
.ecm-summary strong { color: var(--text, #e8eaf0); font-weight: 600; }
.ecm-start-btn {
  font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
  padding: 11px 24px; border-radius: 10px; border: none; cursor: pointer;
  background: var(--accent, #5b8dee); color: #fff;
  transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
  display: flex; align-items: center; gap: 8px;
  white-space: nowrap; min-height: 44px;
  box-shadow: 0 4px 14px rgba(91,141,238,0.3);
}
.ecm-start-btn:hover:not(:disabled) {
  opacity: 0.92; transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(91,141,238,0.4);
}
.ecm-start-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

@media (max-width: 480px) {
  .ecm-modal { border-radius: 16px 16px 0 0; max-height: 95vh; }
  .ecm-backdrop { align-items: flex-end; padding: 0; }
  .ecm-footer { flex-direction: column-reverse; align-items: stretch; }
  .ecm-start-btn { width: 100%; justify-content: center; }
  .ecm-type-grid { grid-template-columns: 1fr 1fr; }
  .ecm-header { padding: 20px 18px 0; }
  .ecm-body { padding: 16px 18px 20px; }
  .ecm-footer { padding: 0 18px 28px; }
  .ecm-type-toggle { padding: 10px 10px; }
  .ecm-type-label { font-size: 11px; }
}
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExamConfigModal({
  lectureTitle,
  lectureSubtitle,
  lectureIcon = '📝',
  accentColor,
  allQuestions,
  onStart,
  onClose,
}: ExamConfigModalProps) {
  const allTopics = Array.from(new Set(allQuestions.map((q) => q.topic).filter(Boolean)));
  const totalQuestions = allQuestions.length;
  const minQ = Math.min(5, totalQuestions);
  const defaultCount = Math.min(15, totalQuestions);

  const [count, setCount] = useState(defaultCount);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set(allTopics));
  const [selectedTypes, setSelectedTypes] = useState<Set<QuestionType>>(
    new Set(['mcq', 'tf', 'matching', 'fillin'])
  );

  // Count of each type available in the filtered pool
  const filteredQuestions = allQuestions.filter(
    (q) => selectedTopics.has(q.topic) && selectedTypes.has(q.type)
  );
  const filteredCount = filteredQuestions.length;
  const effectiveMax = Math.max(minQ, filteredCount);
  const effectiveCount = Math.min(count, effectiveMax);

  // Count per type (across all topics — for the toggle labels)
  const countByType = (type: QuestionType) =>
    allQuestions.filter((q) => q.type === type).length;

  // Clamp when selection changes
  useEffect(() => {
    if (count > filteredCount && filteredCount > 0) {
      setCount(Math.max(minQ, filteredCount));
    }
  }, [selectedTopics, selectedTypes, filteredCount, count, minQ]);

  const backdropRef = useRef<HTMLDivElement>(null);

  function toggleTopic(topic: string) {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) {
        if (next.size === 1) return prev;
        next.delete(topic);
      } else {
        next.add(topic);
      }
      return next;
    });
  }

  function toggleType(type: QuestionType) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) return prev; // keep at least one
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function handleStart() {
    if (filteredCount === 0) return;
    onStart({
      count: effectiveCount,
      topics: Array.from(selectedTopics),
      types: Array.from(selectedTypes),
    });
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  const accent = accentColor || 'var(--accent, #5b8dee)';
  const canStart = filteredCount > 0 && selectedTypes.size > 0;

  return (
    <>
      <style>{CSS}</style>
      <div className="ecm-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
        <div className="ecm-modal" role="dialog" aria-modal="true" aria-label="Exam session setup">

          {/* Header */}
          <div className="ecm-header">
            <div className="ecm-icon-wrap" style={{ background: `${accentColor ?? '#5b8dee'}22` }}>
              {lectureIcon}
            </div>
            <div className="ecm-title-block">
              <div className="ecm-modal-label">📝 Practice Exam</div>
              <div className="ecm-lecture-title">{lectureTitle}</div>
              {lectureSubtitle && <div className="ecm-lecture-subtitle">{lectureSubtitle}</div>}
            </div>
            <button className="ecm-close-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>

          <div className="ecm-divider" />

          <div className="ecm-body">

            {/* Question count slider */}
            <div>
              <div className="ecm-section-label">Number of Questions</div>
              <div className="ecm-slider-row">
                <div className="ecm-slider-wrap">
                  <input
                    type="range"
                    className="ecm-slider"
                    min={minQ}
                    max={effectiveMax}
                    value={effectiveCount}
                    onChange={(e) => setCount(Number(e.target.value))}
                    style={{ accentColor: accent } as React.CSSProperties}
                  />
                  <div className="ecm-slider-hint">
                    {minQ} – {effectiveMax} questions available
                    {(selectedTopics.size < allTopics.length || selectedTypes.size < 4) &&
                      ' (filtered)'}
                  </div>
                </div>
                <div className="ecm-slider-value" style={{ color: accent }}>{effectiveCount}</div>
              </div>
            </div>

            {/* Question type toggles */}
            <div>
              <div className="ecm-section-label">Question Types</div>
              <div className="ecm-type-grid">
                {QUESTION_TYPES.map((qt) => {
                  const available = countByType(qt.value);
                  const isSelected = selectedTypes.has(qt.value);
                  const isDisabled = available === 0;
                  return (
                    <div
                      key={qt.value}
                      className={[
                        'ecm-type-toggle',
                        isSelected && !isDisabled ? 'selected' : '',
                        isDisabled ? 'disabled' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => !isDisabled && toggleType(qt.value)}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-disabled={isDisabled}
                      style={isSelected && !isDisabled ? {
                        borderColor: accent,
                        background: `${accentColor ?? '#5b8dee'}12`,
                      } : {}}
                    >
                      <span className="ecm-type-icon">{qt.icon}</span>
                      <div className="ecm-type-info">
                        <div className="ecm-type-label">{qt.label}</div>
                        <div className="ecm-type-count">
                          {isDisabled ? 'None in lecture' : `${available} question${available !== 1 ? 's' : ''}`}
                        </div>
                      </div>
                      <div className="ecm-type-check" style={isSelected && !isDisabled ? { background: accent, borderColor: accent } : {}}>
                        {isSelected && !isDisabled ? '✓' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Topic toggles */}
            {allTopics.length > 1 && (
              <div>
                <div className="ecm-section-label">Topics</div>
                <div className="ecm-topic-grid">
                  {allTopics.map((topic) => (
                    <button
                      key={topic}
                      className={`ecm-topic-chip${selectedTopics.has(topic) ? ' selected' : ''}`}
                      onClick={() => toggleTopic(topic)}
                      style={selectedTopics.has(topic) ? {
                        borderColor: accent,
                        color: accent,
                        background: `${accentColor ?? '#5b8dee'}18`,
                      } : {}}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
                <div className="ecm-topic-actions">
                  <button className="ecm-topic-action-btn" onClick={() => setSelectedTopics(new Set(allTopics))}>
                    Select all
                  </button>
                  <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                  <button
                    className="ecm-topic-action-btn"
                    onClick={() => setSelectedTopics(new Set([allTopics[0]]))}
                    disabled={allTopics.length < 2}
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}

            {/* Warning if no matching questions */}
            {!canStart && (
              <div className="ecm-warning">
                ⚠️ No questions match the selected filters. Try enabling more topics or question types.
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="ecm-footer">
            <div className="ecm-summary">
              <strong>{effectiveCount}</strong> question{effectiveCount !== 1 ? 's' : ''} ·{' '}
              <strong>{selectedTypes.size}</strong> type{selectedTypes.size !== 1 ? 's' : ''} ·{' '}
              <strong>{selectedTopics.size}</strong> topic{selectedTopics.size !== 1 ? 's' : ''}
            </div>
            <button
              className="ecm-start-btn"
              onClick={handleStart}
              disabled={!canStart}
              style={{ background: accent }}
            >
              Begin Exam →
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
