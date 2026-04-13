// hooks/useProgress.ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  save,
  loadAll,
  setupOnlineListener,
  readLocalProgress,
  type ProgressRecord,
} from '@/lib/progress-sync';

// ── Public types ──────────────────────────────────────────────────────────────

export interface LectureProgress {
  lecture_id: string;
  flash_sessions: number;
  exam_sessions: number;
  best_exam_score: number | null;
  avg_exam_score: number | null;
  last_studied_at: string | null;
  mastery_pct: number;
  // Individual card IDs known/missed — used to pre-mark cards on session open
  got_it_ids: string[];
  missed_ids: string[];
}

export interface GlobalStats {
  totalSessions: number;
  bestExamScore: number | null;
  avgExamScore: number | null;
  studyStreak: number;   // consecutive days studied — full impl in v2.5
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function recordToProgress(r: ProgressRecord, totalCards?: number): LectureProgress {
  const gotItIds = r.flashcardProgress.got_it_ids ?? [];
  // Mastery is got_it count / total cards in lecture (passed in when known)
  // Falls back to got_it / (got_it + missed) if total not known
  const missed = r.flashcardProgress.missed_ids ?? [];
  const denominator = totalCards ?? ((gotItIds.length + missed.length) || 1);
  const mastery_pct = Math.round((gotItIds.length / denominator) * 100);

  return {
    lecture_id: r.internalId,
    flash_sessions: r.flashcardProgress.sessions ?? 0,
    exam_sessions: r.examProgress.sessions ?? 0,
    best_exam_score: r.examProgress.best_score,
    avg_exam_score: r.examProgress.avg_score,
    last_studied_at: r.lastStudied,
    mastery_pct,
    got_it_ids: gotItIds,
    missed_ids: missed,
  };
}

function deriveGlobalStats(byLecture: Record<string, LectureProgress>): GlobalStats {
  const entries = Object.values(byLecture);
  if (entries.length === 0) {
    return { totalSessions: 0, bestExamScore: null, avgExamScore: null, studyStreak: 0 };
  }

  const totalSessions = entries.reduce(
    (acc, e) => acc + e.flash_sessions + e.exam_sessions, 0
  );

  const scores = entries.map((e) => e.best_exam_score).filter((s): s is number => s !== null);
  const avgScores = entries.map((e) => e.avg_exam_score).filter((s): s is number => s !== null);

  return {
    totalSessions,
    bestExamScore: scores.length > 0 ? Math.max(...scores) : null,
    avgExamScore:
      avgScores.length > 0
        ? Math.round(avgScores.reduce((a, b) => a + b, 0) / avgScores.length)
        : null,
    studyStreak: 0,  // placeholder — full streak tracking in v2.5 Phase 1
  };
}

function syncMapToUI(syncMap: Record<string, ProgressRecord>): Record<string, LectureProgress> {
  const result: Record<string, LectureProgress> = {};
  for (const [id, r] of Object.entries(syncMap)) {
    result[id] = recordToProgress(r);
  }
  return result;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useProgress() {
  const [byLecture, setByLecture] = useState<Record<string, LectureProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const byLectureRef = useRef(byLecture);
  byLectureRef.current = byLecture;

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Seed from localStorage immediately
      const localData = readLocalProgress();
      if (Object.keys(localData).length > 0) {
        setByLecture(syncMapToUI(localData));
      }
      // Then fetch + merge from server
      const merged = await loadAll();
      setByLecture(syncMapToUI(merged));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProgress();
    setupOnlineListener();
  }, [fetchProgress]);

  // ── recordFlashcard ────────────────────────────────────────────────────
  // Called per-card as cards are marked. Tracks individual card IDs.
  // This is the primary way flashcard progress is saved.
  const recordFlashcard = useCallback(
    (
      lectureId: string,
      gotItIds: string[],   // full current set of got-it card IDs this session
      missedIds: string[],  // full current set of missed card IDs this session
      totalCards: number,
      isSessionEnd = false
    ) => {
      const now = new Date().toISOString();
      const current = byLectureRef.current[lectureId];

      // Merge with existing got_it_ids from previous sessions (union)
      const existingGotIt = new Set(current?.got_it_ids ?? []);
      const newGotIt = new Set(gotItIds);
      const mergedGotIt = Array.from(new Set([...existingGotIt, ...newGotIt]));

      // missed_ids: use current session's missed, minus anything in mergedGotIt
      const finalMissed = missedIds.filter((id) => !mergedGotIt.includes(id));

      const mastery_pct = Math.round((mergedGotIt.length / totalCards) * 100);

      const record: ProgressRecord = {
        internalId: lectureId,
        flashcardProgress: {
          sessions: isSessionEnd
            ? (current?.flash_sessions ?? 0) + 1
            : (current?.flash_sessions ?? 0),
          got_it_ids: mergedGotIt,
          missed_ids: finalMissed,
        },
        examProgress: {
          sessions: current?.exam_sessions ?? 0,
          best_score: current?.best_exam_score ?? null,
          avg_score: current?.avg_exam_score ?? null,
        },
        lastStudied: now,
        updatedAt: now,
      };

      setByLecture((prev) => ({
        ...prev,
        [lectureId]: recordToProgress(record, totalCards),
      }));

      save(record);
    },
    []
  );

  // ── recordSession (exam) ───────────────────────────────────────────────
  const recordSession = useCallback(
    (
      lectureId: string,
      type: 'exam',
      opts?: { score?: number }
    ) => {
      const now = new Date().toISOString();
      const current = byLectureRef.current[lectureId];

      const bestScore =
        opts?.score !== undefined
          ? current?.best_exam_score == null
            ? opts.score
            : Math.max(current.best_exam_score, opts.score)
          : current?.best_exam_score ?? null;

      const avgScore =
        opts?.score !== undefined
          ? current?.avg_exam_score == null
            ? opts.score
            : Math.round((current.avg_exam_score + opts.score) / 2)
          : current?.avg_exam_score ?? null;

      const record: ProgressRecord = {
        internalId: lectureId,
        flashcardProgress: {
          sessions: current?.flash_sessions ?? 0,
          got_it_ids: current?.got_it_ids ?? [],
          missed_ids: current?.missed_ids ?? [],
        },
        examProgress: {
          sessions: (current?.exam_sessions ?? 0) + 1,
          best_score: bestScore,
          avg_score: avgScore,
        },
        lastStudied: now,
        updatedAt: now,
      };

      setByLecture((prev) => ({
        ...prev,
        [lectureId]: recordToProgress(record),
      }));

      save(record);
    },
    []
  );

  return {
    progressByLecture: byLecture,
    globalStats: deriveGlobalStats(byLecture),
    loading,
    error,
    recordFlashcard,
    recordSession,
    refetch: fetchProgress,
  };
}
