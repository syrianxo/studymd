// components/study/FlashcardView.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Lightbox from './Lightbox';
import ToastContainer from './ToastContainer';
import { useToast } from '@/hooks/useToast';
import { getSlideThumbUrl } from '@/hooks/useUserLectures';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FlashCard {
  id: string;
  question: string;
  answer: string;
  topic: string;
  slide_number?: number | null;
}

export interface FlashcardSessionConfig {
  lectureTitle: string;
  lectureId: string;
  cards: FlashCard[];
  slidesStoragePath: string | null;
  slideCount: number;
  onExit: () => void;
  // Previously saved card states from other sessions/devices
  initialGotItIds?: string[];
  initialMissedIds?: string[];
  // Called on every card mark with full current ID sets
  onProgressUpdate?: (gotItIds: string[], missedIds: string[], totalCards: number) => void;
  // Called at session end — same signature, used to increment session counter
  onSessionComplete?: (gotItIds: string[], missedIds: string[], totalCards: number) => void;
}

const FONT_SIZES = [11, 12, 13, 14, 16, 18] as const;
const FONT_LABELS = ['XS', 'S', 'M', 'L', 'XL', '2X'] as const;

// ── Component ────────────────────────────────────────────────────────────────

export default function FlashcardView({
  lectureTitle,
  cards: allCards,
  slidesStoragePath,
  slideCount,
  onExit,
  initialGotItIds = [],
  initialMissedIds = [],
  onProgressUpdate,
  onSessionComplete,
}: FlashcardSessionConfig) {
  const [deck, setDeck] = useState<FlashCard[]>(() => shuffle([...allCards]));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [complete, setComplete] = useState(false);
  const [focusMissed, setFocusMissed] = useState(false);

  // Seed got_it / missed from previously saved progress
  const [gotItIds, setGotItIds] = useState<Set<string>>(() => new Set(initialGotItIds));
  const [missedIds, setMissedIds] = useState<Set<string>>(() => new Set(initialMissedIds));

  const [fontSizeIdx, setFontSizeIdx] = useState(2);

  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const allSlideUrls = slidesStoragePath
    ? Array.from({ length: slideCount }, (_, i) =>
        getSlideThumbUrl(SUPABASE_URL, slidesStoragePath, i)
      )
    : [];

  const { toasts, addToast } = useToast();
  const cardRef = useRef<HTMLDivElement>(null);

  const currentCard = deck[currentIndex];
  const progress = deck.length > 0 ? (currentIndex / deck.length) * 100 : 0;
  const totalAllCards = allCards.length;

  // ── Keyboard controls ──────────────────────────────────────────────────
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (complete || lightboxIndex >= 0) return;
      switch (e.key) {
        case ' ': case 'Enter': e.preventDefault(); setFlipped((f) => !f); break;
        case 'ArrowRight': case 'ArrowDown': e.preventDefault(); advanceCard(); break;
        case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); goBack(); break;
        case '1': case 'm': case 'M': if (flipped) markCard(false); break;
        case '2': case 'g': case 'G': if (flipped) markCard(true); break;
        case 's': case 'S': skipCard(); break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [complete, flipped, currentIndex, lightboxIndex]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // ── Navigation ─────────────────────────────────────────────────────────
  function advanceCard() {
    if (currentIndex < deck.length - 1) { setCurrentIndex((i) => i + 1); setFlipped(false); }
  }

  function goBack() {
    if (currentIndex > 0) { setCurrentIndex((i) => i - 1); setFlipped(false); }
  }

  function skipCard() {
    if (currentIndex < deck.length - 1) {
      setCurrentIndex((i) => i + 1);
      setFlipped(false);
      addToast('→ Skipped', 'default');
    } else {
      finishSession(gotItIds, missedIds);
    }
  }

  // ── Mark card ──────────────────────────────────────────────────────────
  function markCard(knew: boolean) {
    if (!currentCard) return;
    const id = currentCard.id;

    let newGotIt: Set<string>;
    let newMissed: Set<string>;

    if (knew) {
      newGotIt = new Set([...gotItIds, id]);
      newMissed = new Set(missedIds);
      newMissed.delete(id);
      setGotItIds(newGotIt);
      setMissedIds(newMissed);
      addToast('✓ Got it', 'success');
    } else {
      newGotIt = new Set(gotItIds);
      newGotIt.delete(id); // un-mark if previously got it this session
      newMissed = new Set([...missedIds, id]);
      setGotItIds(newGotIt);
      setMissedIds(newMissed);
      addToast('— Still learning', 'default');
    }

    // Save progress after every mark
    onProgressUpdate?.(Array.from(newGotIt), Array.from(newMissed), totalAllCards);

    if (currentIndex < deck.length - 1) {
      setCurrentIndex((i) => i + 1);
      setFlipped(false);
    } else {
      finishSession(newGotIt, newMissed);
    }
  }

  function finishSession(finalGotIt: Set<string>, finalMissed: Set<string>) {
    setComplete(true);
    onSessionComplete?.(Array.from(finalGotIt), Array.from(finalMissed), totalAllCards);
  }

  // ── Restart / study missed ──────────────────────────────────────────────
  function restart() {
    setDeck(shuffle([...allCards]));
    setCurrentIndex(0);
    setFlipped(false);
    // Keep got_it/missed from history so they persist across restarts
    setComplete(false);
    setFocusMissed(false);
  }

  function studyMissed() {
    const missedCards = allCards.filter((c) => missedIds.has(c.id));
    if (missedCards.length === 0) return;
    setDeck(shuffle(missedCards));
    setCurrentIndex(0);
    setFlipped(false);
    setComplete(false);
    setFocusMissed(true);
  }

  function openSlide(slideNumber: number) {
    const idx = Math.max(0, slideNumber - 1);
    if (idx < allSlideUrls.length) setLightboxIndex(idx);
  }

  // ── Completion screen ─────────────────────────────────────────────────
  if (complete) {
    // Show stats relative to the full lecture (all cards), not just this deck
    const totalGotIt = Array.from(gotItIds).filter(id => allCards.some(c => c.id === id)).length;
    const totalMissed = Array.from(missedIds).filter(id => allCards.some(c => c.id === id)).length;
    const pct = Math.round((totalGotIt / totalAllCards) * 100);
    const skippedCount = deck.length - Array.from(gotItIds).filter(id => deck.some(c => c.id === id)).length
      - Array.from(missedIds).filter(id => deck.some(c => c.id === id)).length;

    return (
      <div className="smd-study-view">
        <div className="smd-study-header">
          <div>
            <div className="smd-study-title">
              {focusMissed ? 'Missed Cards Review' : 'Flashcards'} — {lectureTitle}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onExit} style={{ padding: '8px 13px', fontSize: 13 }}>
            ✕ Exit
          </button>
        </div>
        <div className="smd-study-body">
          <div className="smd-session-complete">
            <div className="smd-complete-icon">🎉</div>
            <div className="smd-complete-title">Session Complete!</div>
            <p style={{ color: 'var(--text-muted)', marginBottom: 18 }}>Cumulative mastery across all sessions:</p>
            <div className="smd-complete-stats">
              <div>
                <span className="smd-c-stat-value success">{totalGotIt}</span>
                <span className="smd-c-stat-label">Got it</span>
              </div>
              <div>
                <span className="smd-c-stat-value danger">{totalMissed}</span>
                <span className="smd-c-stat-label">Still learning</span>
              </div>
              <div>
                <span className="smd-c-stat-value gold">{pct}%</span>
                <span className="smd-c-stat-label">Mastery</span>
              </div>
            </div>
            {skippedCount > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                {skippedCount} card{skippedCount !== 1 ? 's' : ''} skipped this session
              </p>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Mastery = cards ever marked "Got it" ÷ total cards in lecture
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 }}>
              <button className="btn btn-primary btn-lg" onClick={restart}>↻ Study Again</button>
              {totalMissed > 0 && (
                <button className="btn btn-ghost btn-lg" onClick={studyMissed}>
                  Focus on Missed ({totalMissed})
                </button>
              )}
              <button className="btn btn-ghost btn-lg" onClick={onExit}>Dashboard</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentCard) return null;

  // Visual hint: has this card been marked in a previous session?
  const prevGotIt = initialGotItIds.includes(currentCard.id);
  const prevMissed = initialMissedIds.includes(currentCard.id);
  const thisSessionGotIt = gotItIds.has(currentCard.id) && !initialGotItIds.includes(currentCard.id);
  const thisSessionMissed = missedIds.has(currentCard.id) && !initialMissedIds.includes(currentCard.id);

  const slideUrl =
    currentCard.slide_number && slidesStoragePath
      ? getSlideThumbUrl(SUPABASE_URL, slidesStoragePath, currentCard.slide_number - 1)
      : null;

  return (
    <div className="smd-study-view">
      <div className="smd-study-header">
        <div style={{ minWidth: 0 }}>
          <div className="smd-study-title">Flashcards — {lectureTitle}</div>
          <div className="smd-study-subtitle">
            {focusMissed ? 'Focused on missed cards' : currentCard.topic}
          </div>
        </div>
        <div className="smd-study-progress-info">
          <div className="smd-card-counter">{currentIndex + 1} / {deck.length}</div>
          <button className="btn btn-ghost" onClick={onExit} style={{ padding: '8px 13px', fontSize: 13 }}>
            ✕ Exit
          </button>
        </div>
      </div>

      <div className="smd-study-body">
        <div className="smd-study-progress-bar">
          <div className="smd-study-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* Previous-session status badge */}
        {(prevGotIt || prevMissed || thisSessionGotIt || thisSessionMissed) && (
          <div style={{
            textAlign: 'center',
            marginBottom: 8,
            fontSize: 11,
            color: gotItIds.has(currentCard.id)
              ? 'var(--success)'
              : missedIds.has(currentCard.id)
              ? 'var(--danger)'
              : 'var(--text-muted)',
          }}>
            {gotItIds.has(currentCard.id)
              ? '✓ Previously marked: Got it'
              : missedIds.has(currentCard.id)
              ? '✗ Previously marked: Still learning'
              : ''}
          </div>
        )}

        <div
          className="smd-flashcard-scene"
          onClick={() => setFlipped((f) => !f)}
          role="button"
          aria-label={flipped ? 'Card back — click to flip' : 'Card front — click to flip'}
        >
          <div ref={cardRef} className={`smd-flashcard${flipped ? ' flipped' : ''}`}>
            <div className="smd-card-face smd-card-front">
              <div className="smd-card-topic-tag">{currentCard.topic}</div>
              <div className="smd-card-front-label">QUESTION</div>
              <div className="smd-card-question">{currentCard.question}</div>
              <div className="smd-card-flip-hint">Tap to reveal ↕</div>
            </div>

            <div className="smd-card-face smd-card-back">
              <div className="smd-card-answer-text">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="smd-card-answer-label">ANSWER</div>
                  <div className="smd-font-size-bar" onClick={(e) => e.stopPropagation()}>
                    <button className="smd-font-size-btn" onClick={() => setFontSizeIdx((i) => Math.max(0, i - 1))} aria-label="Decrease font size">A−</button>
                    <span className="smd-font-size-indicator">{FONT_LABELS[fontSizeIdx]}</span>
                    <button className="smd-font-size-btn" onClick={() => setFontSizeIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))} aria-label="Increase font size">A+</button>
                  </div>
                </div>
                <div className="smd-card-answer-content" style={{ fontSize: FONT_SIZES[fontSizeIdx] }}>
                  {currentCard.answer}
                </div>
              </div>

              <div className="smd-card-slide-preview" onClick={(e) => e.stopPropagation()}>
                {slideUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="smd-slide-preview-img"
                      src={slideUrl}
                      alt={`Slide ${currentCard.slide_number}`}
                      loading="lazy"
                      onClick={() => openSlide(currentCard.slide_number!)}
                    />
                    <button className="smd-slide-expand-btn" onClick={() => openSlide(currentCard.slide_number!)}>⤢ Expand</button>
                    <div className="smd-slide-number-tag">Slide {currentCard.slide_number}</div>
                  </>
                ) : (
                  <div className="smd-slide-preview-placeholder">
                    <span style={{ fontSize: 18 }}>🖼</span>
                    <span>No slide ref</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="smd-flashcard-nav">
          <button className="smd-nav-btn" onClick={goBack} disabled={currentIndex === 0} aria-label="Previous card">←</button>

          <div className="smd-know-btns">
            <button
              className="btn btn-danger"
              onClick={() => markCard(false)}
              disabled={!flipped}
              style={{ opacity: flipped ? 1 : 0.4 }}
            >
              ✗ Still learning
            </button>
            <button className="btn btn-ghost" onClick={skipCard} style={{ opacity: 0.7 }}>→ Skip</button>
            <button
              className="btn btn-success"
              onClick={() => markCard(true)}
              disabled={!flipped}
              style={{ opacity: flipped ? 1 : 0.4 }}
            >
              ✓ Got it
            </button>
          </div>

          <button className="smd-nav-btn" onClick={advanceCard} disabled={currentIndex === deck.length - 1} aria-label="Next card">→</button>
        </div>

        <div className="smd-keyboard-hint">
          <div className="smd-key-combo"><kbd>Space</kbd> Flip</div>
          <div className="smd-key-combo"><kbd>←</kbd><kbd>→</kbd> Navigate</div>
          <div className="smd-key-combo"><kbd>M</kbd> Missed &nbsp;<kbd>G</kbd> Got it &nbsp;<kbd>S</kbd> Skip</div>
        </div>
      </div>

      <Lightbox
        images={allSlideUrls}
        currentIndex={lightboxIndex}
        onClose={() => setLightboxIndex(-1)}
        onNavigate={setLightboxIndex}
        caption={lightboxIndex >= 0 ? `Slide ${lightboxIndex + 1} — ${lectureTitle}` : undefined}
      />

      <ToastContainer toasts={toasts} />
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
