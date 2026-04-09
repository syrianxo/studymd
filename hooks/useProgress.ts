// hooks/useProgress.ts
// React hook wrapping lib/progress-sync.
// Loads all progress on mount, exposes save/recordSession/load,
// and handles loading + error state.
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

/** Flattened view of a lecture's progress used throughout the UI. */
export interface LectureProgress {
  lecture_id: string;
  flash_sessions: number;
  exam_sessions: number;
  best_exam_score: number | null;
  avg_exam_score: number | null;
  last_studied_at: string | null;
  mastery_pct: number;
}

export interface GlobalStats {
  totalSessions: number;
  bestExamScore: number | null;
  avgExamScore: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function recordToProgress(r: ProgressRecord): LectureProgress {
  return {
    lecture_id: r.internalId,
    flash_sessions: r.flashcardProgress.sessions,
    exam_sessions: r.examProgress.sessions,
    best_exam_score: r.examProgress.best_score,
    avg_exam_score: r.examProgress.avg_score,
    last_studied_at: r.lastStudied,
    mastery_pct: r.flashcardProgress.mastery_pct,
  };
}

function deriveGlobalStats(byLecture: Record<string, LectureProgress>): GlobalStats {
  const entries = Object.values(byLecture);
  if (entries.length === 0) {
    return { totalSessions: 0, bestExamScore: null, avgExamScore: null };
  }

  const totalSessions = entries.reduce(
    (acc, e) => acc + e.flash_sessions + e.exam_sessions,
    0
  );

  const scores = entries
    .map((e) => e.best_exam_score)
    .filter((s): s is number => s !== null);

  const avgScores = entries
    .map((e) => e.avg_exam_score)
    .filter((s): s is number => s !== null);

  return {
    totalSessions,
    bestExamScore: scores.length > 0 ? Math.max(...scores) : null,
    avgExamScore:
      avgScores.length > 0
        ? Math.round(avgScores.reduce((a, b) => a + b, 0) / avgScores.length)
        : null,
  };
}

function syncMapToUI(
  syncMap: Record<string, ProgressRecord>
): Record<string, LectureProgress> {
  const result: Record<string, LectureProgress> = {};
  for (const [id, r] of Object.entries(syncMap)) {
    result[id] = recordToProgress(r);
  }
  return result;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useProgress() {
  const [byLecture, setByLecture] = useState<Record<string, LectureProgress>>(
    // Seed from localStorage immediately so UI doesn't flash empty on mount
    () => syncMapToUI(readLocalProgress())
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref to byLecture for use inside recordSession without stale closure
  const byLectureRef = useRef(byLecture);
  byLectureRef.current = byLecture;

  // ── Load on mount ──────────────────────────────────────────────────────
  const fetchProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const merged = await loadAll();
      setByLecture(syncMapToUI(merged));
    } catch (err) {
      setError((err as Error).message);
      // Keep whatever was loaded from localStorage
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProgress();
    setupOnlineListener(); // idempotent — safe to call multiple times
  }, [fetchProgress]);

  // ── recordSession ──────────────────────────────────────────────────────
  // Optimistically updates React state, then persists via progress-sync.
  const recordSession = useCallback(
    (
      lectureId: string,
      type: 'flash' | 'exam',
      opts?: { score?: number; masteryPct?: number }
    ) => {
      const now = new Date().toISOString();
      const current = byLectureRef.current[lectureId];

      const flashSessions =
        type === 'flash'
          ? (current?.flash_sessions ?? 0) + 1
          : (current?.flash_sessions ?? 0);

      const examSessions =
        type === 'exam'
          ? (current?.exam_sessions ?? 0) + 1
          : (current?.exam_sessions ?? 0);

      const bestScore =
        opts?.score !== undefined
          ? current?.best_exam_score === null || current?.best_exam_score === undefined
            ? opts.score
            : Math.max(current.best_exam_score, opts.score)
          : current?.best_exam_score ?? null;

      const avgScore =
        type === 'exam' && opts?.score !== undefined
          ? current?.avg_exam_score === null || current?.avg_exam_score === undefined
            ? opts.score
            : Math.round((current.avg_exam_score + opts.score) / 2)
          : current?.avg_exam_score ?? null;

      const masteryPct =
        opts?.masteryPct !== undefined
          ? opts.masteryPct
          : current?.mastery_pct ?? 0;

      const record: ProgressRecord = {
        internalId: lectureId,
        flashcardProgress: { sessions: flashSessions, mastery_pct: masteryPct },
        examProgress: { sessions: examSessions, best_score: bestScore, avg_score: avgScore },
        lastStudied: now,
        updatedAt: now,
      };

      // 1. Optimistic React state update
      setByLecture((prev) => {
        const updated = { ...prev, [lectureId]: recordToProgress(record) };
        return updated;
      });

      // 2. Persist (localStorage + server, with offline queue fallback)
      save(record);
    },
    []
  );

  return {
    progressByLecture: byLecture,
    globalStats: deriveGlobalStats(byLecture),
    loading,
    error,
    recordSession,
    refetch: fetchProgress,
  };
}
