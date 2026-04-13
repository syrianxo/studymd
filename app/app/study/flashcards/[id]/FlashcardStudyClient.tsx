'use client';

// app/app/study/flashcards/[id]/FlashcardStudyClient.tsx
//
// Client wrapper that:
// 1. Shuffles the deck if order === 'random'
// 2. Syncs progress to Supabase via API route
// 3. Renders FlashcardView

import { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import FlashcardView, { type FlashCard } from '@/components/study/FlashcardView';

interface FlashcardStudyClientProps {
  lectureId: string;
  lectureTitle: string;
  /** Filtered, sliced card pool for this session. */
  cards: FlashCard[];
  /** Full card pool (for progress % calculation). */
  allCards: FlashCard[];
  order: 'random' | 'sequential';
  slidesStoragePath: string | null;
  slideCount: number;
  initialGotItIds: string[];
  initialMissedIds: string[];
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function FlashcardStudyClient({
  lectureId,
  lectureTitle,
  cards,
  allCards,
  order,
  slidesStoragePath,
  slideCount,
  initialGotItIds,
  initialMissedIds,
}: FlashcardStudyClientProps) {
  const router = useRouter();

  // If random order, shuffle once on mount (useMemo with empty deps = stable)
  const sessionCards = useMemo(
    () => (order === 'random' ? shuffleArray(cards) : cards),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleProgressUpdate = useCallback(
    async (gotItIds: string[], missedIds: string[], totalCards: number) => {
      try {
        await fetch('/api/progress/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            internalId: lectureId,
            type: 'flashcard',
            data: {
              got_it_ids: gotItIds,
              missed_ids: missedIds,
              total_cards: totalCards,
              last_updated: new Date().toISOString(),
            },
          }),
        });
      } catch {
        // Fail silently — localStorage already saved
      }
    },
    [lectureId]
  );

  const handleSessionComplete = useCallback(
    async (gotItIds: string[], missedIds: string[], totalCards: number) => {
      // Same as progress update — server records final state
      await handleProgressUpdate(gotItIds, missedIds, totalCards);
    },
    [handleProgressUpdate]
  );

  return (
    <FlashcardView
      lectureTitle={lectureTitle}
      lectureId={lectureId}
      cards={sessionCards}
      slidesStoragePath={slidesStoragePath}
      slideCount={slideCount}
      onExit={() => router.push('/app')}
      initialGotItIds={initialGotItIds}
      initialMissedIds={initialMissedIds}
      onProgressUpdate={handleProgressUpdate}
      onSessionComplete={handleSessionComplete}
    />
  );
}
