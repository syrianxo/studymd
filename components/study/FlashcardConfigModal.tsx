'use client';

// components/study/FlashcardConfigModal.tsx

import { useState, useEffect, useRef } from 'react';
import type { FlashCard } from './FlashcardView';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FlashcardConfig {
  count: number;
  topics: string[];
  order: 'random' | 'sequential';
}

interface FlashcardConfigModalProps {
  lectureTitle: string;
  lectureSubtitle?: string;
  lectureIcon?: string;
  accentColor?: string;
  allCards: FlashCard[];
  onStart: (config: FlashcardConfig) => void;
  onClose: () => void;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
.fcm-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  animation: fcm-fade-in 0.18s ease;
}
@keyframes fcm-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.fcm-modal {
  background: var(--surface, #13161d);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 20px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  width: 100%; max-width: 520px;
  max-height: 90vh; overflow-y: auto;
  animation: fcm-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}
@keyframes fcm-slide-up {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.fcm-header {
  padding: 24px 24px 0;
  display: flex; align-items: flex-start; gap: 14px;
}
.fcm-icon-wrap {
  width: 48px; height: 48px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; flex-shrink: 0;
}
.fcm-title-block { flex: 1; min-width: 0; }
.fcm-modal-label {
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--text-muted, #6b7280);
  margin-bottom: 4px;
}
.fcm-lecture-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 18px; font-weight: 700; line-height: 1.25;
  color: var(--text, #e8eaf0);
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.fcm-lecture-subtitle {
  font-family: 'Outfit', sans-serif; font-size: 13px;
  color: var(--text-muted, #6b7280); margin-top: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fcm-close-btn {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted, #6b7280); font-size: 18px;
  padding: 4px; border-radius: 6px; line-height: 1;
  transition: color 0.15s, background 0.15s;
  min-width: 32px; min-height: 32px;
  display: flex; align-items: center; justify-content: center;
}
.fcm-close-btn:hover { color: var(--text, #e8eaf0); background: rgba(255,255,255,0.07); }

.fcm-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 20px 0 0; }

.fcm-body { padding: 20px 24px 24px; display: flex; flex-direction: column; gap: 24px; }

/* Section */
.fcm-section-label {
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-muted, #6b7280);
  margin-bottom: 10px;
}

/* Slider */
.fcm-slider-row {
  display: flex; align-items: center; gap: 14px;
}
.fcm-slider-wrap { flex: 1; }
.fcm-slider {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 5px; border-radius: 3px;
  background: rgba(255,255,255,0.1);
  outline: none; cursor: pointer;
  accent-color: var(--accent, #5b8dee);
}
.fcm-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent, #5b8dee);
  box-shadow: 0 0 0 3px rgba(91,141,238,0.2);
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.fcm-slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 5px rgba(91,141,238,0.3);
}
.fcm-slider::-moz-range-thumb {
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent, #5b8dee); border: none;
  box-shadow: 0 0 0 3px rgba(91,141,238,0.2);
  cursor: pointer;
}
.fcm-slider-value {
  font-family: 'Fraunces', Georgia, serif; font-size: 22px; font-weight: 700;
  color: var(--accent, #5b8dee); min-width: 36px; text-align: right;
}
.fcm-slider-hint {
  font-family: 'Outfit', sans-serif; font-size: 11px;
  color: var(--text-muted, #6b7280); margin-top: 5px;
}

/* Topic chips */
.fcm-topic-grid {
  display: flex; flex-wrap: wrap; gap: 7px;
}
.fcm-topic-chip {
  font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
  padding: 6px 12px; border-radius: 100px; cursor: pointer;
  border: 1.5px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04); color: var(--text-muted, #6b7280);
  transition: all 0.15s; min-height: 32px; display: flex; align-items: center;
  user-select: none;
}
.fcm-topic-chip:hover { border-color: rgba(255,255,255,0.2); color: var(--text, #e8eaf0); }
.fcm-topic-chip.selected {
  background: rgba(91,141,238,0.15); border-color: var(--accent, #5b8dee);
  color: var(--accent, #5b8dee);
}
.fcm-topic-chip.selected:hover { background: rgba(91,141,238,0.22); }

.fcm-topic-actions {
  display: flex; gap: 8px; margin-top: 8px;
}
.fcm-topic-action-btn {
  font-family: 'Outfit', sans-serif; font-size: 11px;
  color: var(--accent, #5b8dee); background: none; border: none;
  cursor: pointer; padding: 2px 0; opacity: 0.8;
  transition: opacity 0.15s;
}
.fcm-topic-action-btn:hover { opacity: 1; }

/* Order select */
.fcm-order-row { display: flex; gap: 10px; }
.fcm-order-option {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  gap: 6px; padding: 12px 8px; border-radius: 12px; cursor: pointer;
  border: 1.5px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  transition: all 0.15s; user-select: none; min-height: 44px;
}
.fcm-order-option:hover { border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.05); }
.fcm-order-option.selected {
  border-color: var(--accent, #5b8dee);
  background: rgba(91,141,238,0.1);
}
.fcm-order-icon { font-size: 18px; }
.fcm-order-label {
  font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 600;
  color: var(--text, #e8eaf0);
}
.fcm-order-desc {
  font-family: 'Outfit', sans-serif; font-size: 11px;
  color: var(--text-muted, #6b7280); text-align: center;
}

/* Footer */
.fcm-footer {
  padding: 0 24px 24px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
}
.fcm-summary {
  font-family: 'Outfit', sans-serif; font-size: 12px;
  color: var(--text-muted, #6b7280); line-height: 1.4;
}
.fcm-summary strong {
  color: var(--text, #e8eaf0); font-weight: 600;
}
.fcm-start-btn {
  font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
  padding: 11px 24px; border-radius: 10px; border: none; cursor: pointer;
  background: var(--accent, #5b8dee); color: #fff;
  transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
  display: flex; align-items: center; gap: 8px;
  white-space: nowrap; min-height: 44px;
  box-shadow: 0 4px 14px rgba(91,141,238,0.3);
}
.fcm-start-btn:hover:not(:disabled) {
  opacity: 0.92; transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(91,141,238,0.4);
}
.fcm-start-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

@media (max-width: 480px) {
  .fcm-modal { border-radius: 16px 16px 0 0; max-height: 95vh; }
  .fcm-backdrop { align-items: flex-end; padding: 0; }
  .fcm-footer { flex-direction: column-reverse; align-items: stretch; }
  .fcm-start-btn { width: 100%; justify-content: center; }
  .fcm-header { padding: 20px 18px 0; }
  .fcm-body { padding: 16px 18px 20px; }
  .fcm-footer { padding: 0 18px 28px; }
}
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function FlashcardConfigModal({
  lectureTitle,
  lectureSubtitle,
  lectureIcon = '📇',
  accentColor,
  allCards,
  onStart,
  onClose,
}: FlashcardConfigModalProps) {
  // Unique topics from cards
  const allTopics = Array.from(new Set(allCards.map((c) => c.topic).filter(Boolean)));
  const totalCards = allCards.length;
  const minCards = Math.min(5, totalCards);
  const defaultCount = Math.min(10, totalCards);

  const [count, setCount] = useState(defaultCount);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set(allTopics));
  const [order, setOrder] = useState<'random' | 'sequential'>('random');

  // Count cards matching selected topics
  const filteredCount = allCards.filter(
    (c) => selectedTopics.size === 0 || selectedTopics.has(c.topic)
  ).length;
  const effectiveMax = Math.max(minCards, filteredCount);
  const effectiveCount = Math.min(count, effectiveMax);

  // Clamp count when topic selection changes
  useEffect(() => {
    if (count > filteredCount && filteredCount > 0) {
      setCount(Math.max(minCards, filteredCount));
    }
  }, [selectedTopics, filteredCount, count, minCards]);

  const backdropRef = useRef<HTMLDivElement>(null);

  function toggleTopic(topic: string) {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) {
        if (next.size === 1) return prev; // keep at least one
        next.delete(topic);
      } else {
        next.add(topic);
      }
      return next;
    });
  }

  function handleStart() {
    if (filteredCount === 0) return;
    onStart({ count: effectiveCount, topics: Array.from(selectedTopics), order });
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  const accent = accentColor || 'var(--accent, #5b8dee)';

  return (
    <>
      <style>{CSS}</style>
      <div className="fcm-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
        <div className="fcm-modal" role="dialog" aria-modal="true" aria-label="Flashcard session setup">

          {/* Header */}
          <div className="fcm-header">
            <div className="fcm-icon-wrap" style={{ background: `${accentColor ?? '#5b8dee'}22` }}>
              {lectureIcon}
            </div>
            <div className="fcm-title-block">
              <div className="fcm-modal-label">📇 Flashcard Session</div>
              <div className="fcm-lecture-title">{lectureTitle}</div>
              {lectureSubtitle && <div className="fcm-lecture-subtitle">{lectureSubtitle}</div>}
            </div>
            <button className="fcm-close-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>

          <div className="fcm-divider" />

          <div className="fcm-body">

            {/* Card count slider */}
            <div>
              <div className="fcm-section-label">Number of Cards</div>
              <div className="fcm-slider-row">
                <div className="fcm-slider-wrap">
                  <input
                    type="range"
                    className="fcm-slider"
                    min={minCards}
                    max={effectiveMax}
                    value={effectiveCount}
                    onChange={(e) => setCount(Number(e.target.value))}
                    style={{ accentColor: accent } as React.CSSProperties}
                  />
                  <div className="fcm-slider-hint">
                    {minCards} – {effectiveMax} cards available
                    {selectedTopics.size < allTopics.length && ' (filtered by topic)'}
                  </div>
                </div>
                <div className="fcm-slider-value" style={{ color: accent }}>{effectiveCount}</div>
              </div>
            </div>

            {/* Topic toggles */}
            {allTopics.length > 1 && (
              <div>
                <div className="fcm-section-label">Topics</div>
                <div className="fcm-topic-grid">
                  {allTopics.map((topic) => (
                    <button
                      key={topic}
                      className={`fcm-topic-chip${selectedTopics.has(topic) ? ' selected' : ''}`}
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
                <div className="fcm-topic-actions">
                  <button className="fcm-topic-action-btn" onClick={() => setSelectedTopics(new Set(allTopics))}>
                    Select all
                  </button>
                  <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                  <button
                    className="fcm-topic-action-btn"
                    onClick={() => setSelectedTopics(new Set([allTopics[0]]))}
                    disabled={allTopics.length < 2}
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}

            {/* Order */}
            <div>
              <div className="fcm-section-label">Card Order</div>
              <div className="fcm-order-row">
                {([
                  { value: 'random', icon: '🔀', label: 'Random', desc: 'Cards in shuffle order' },
                  { value: 'sequential', icon: '📋', label: 'Sequential', desc: 'Original lecture order' },
                ] as const).map((opt) => (
                  <div
                    key={opt.value}
                    className={`fcm-order-option${order === opt.value ? ' selected' : ''}`}
                    onClick={() => setOrder(opt.value)}
                    role="radio"
                    aria-checked={order === opt.value}
                    style={order === opt.value ? {
                      borderColor: accent,
                      background: `${accentColor ?? '#5b8dee'}12`,
                    } : {}}
                  >
                    <span className="fcm-order-icon">{opt.icon}</span>
                    <span className="fcm-order-label">{opt.label}</span>
                    <span className="fcm-order-desc">{opt.desc}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="fcm-footer">
            <div className="fcm-summary">
              <strong>{effectiveCount}</strong> cards ·{' '}
              <strong>{selectedTopics.size}</strong> topic{selectedTopics.size !== 1 ? 's' : ''} ·{' '}
              {order === 'random' ? 'Shuffled' : 'Sequential'}
            </div>
            <button
              className="fcm-start-btn"
              onClick={handleStart}
              disabled={filteredCount === 0}
              style={{ background: accent }}
            >
              Start Studying →
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
