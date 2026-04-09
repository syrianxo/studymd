// hooks/useProgress.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';

export interface LectureProgress {
  lecture_id: string;
  flash_sessions: number;
  exam_sessions: number;
  best_exam_score: number | null;
  avg_exam_score: number | null;
  last_studied_at: string | null;
  // percent of flashcards marked "got it" at least once
  mastery_pct: number;
}

export interface GlobalStats {
  totalSessions: number;
  bestExamScore: number | null;
  avgExamScore: number | null;
}

interface ProgressState {
  byLecture: Record<string, LectureProgress>;
  global: GlobalStats;
  loading: boolean;
  error: string | null;
}

const LS_KEY = 'studymd_progress_v2';

function loadFromLocalStorage(): Record<string, LectureProgress> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, LectureProgress>;
  } catch {
    return {};
  }
}

function saveToLocalStorage(data: Record<string, LectureProgress>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // storage full — ignore
  }
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

  const examScores = entries
    .map((e) => e.best_exam_score)
    .filter((s): s is number => s !== null);

  const avgScores = entries
    .map((e) => e.avg_exam_score)
    .filter((s): s is number => s !== null);

  return {
    totalSessions,
    bestExamScore: examScores.length > 0 ? Math.max(...examScores) : null,
    avgExamScore:
      avgScores.length > 0
        ? Math.round(avgScores.reduce((a, b) => a + b, 0) / avgScores.length)
        : null,
  };
}

export function useProgress() {
  const supabase = createClient();

  const [state, setState] = useState<ProgressState>({
    byLecture: {},
    global: { totalSessions: 0, bestExamScore: null, avgExamScore: null },
    loading: true,
    error: null,
  });

  // ── Fetch from Supabase, fall back to localStorage ──────────────────────
  const fetchProgress = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Not logged in — use localStorage only
        const local = loadFromLocalStorage();
        setState({
          byLecture: local,
          global: deriveGlobalStats(local),
          loading: false,
          error: null,
        });
        return;
      }

      const { data, error } = await supabase
        .from('user_progress')
        .select(
          'internal_id, flashcard_progress, exam_progress, last_studied'
        )
        .eq('user_id', user.id);

      if (error) throw error;

      const byLecture: Record<string, LectureProgress> = {};
      for (const row of data ?? []) {
        // Map DB columns to our internal shape
        byLecture[row.internal_id] = {
          lecture_id: row.internal_id,
          flash_sessions: (row.flashcard_progress as any)?.sessions ?? 0,
          exam_sessions: (row.exam_progress as any)?.sessions ?? 0,
          best_exam_score: (row.exam_progress as any)?.best_score ?? null,
          avg_exam_score: (row.exam_progress as any)?.avg_score ?? null,
          last_studied_at: row.last_studied ?? null,
          mastery_pct: (row.flashcard_progress as any)?.mastery_pct ?? 0,
        };
      }

      // Merge with localStorage in case of offline edits
      const local = loadFromLocalStorage();
      for (const [id, lp] of Object.entries(local)) {
        if (!byLecture[id]) {
          byLecture[id] = lp;
        }
      }

      // Persist merged state back to localStorage
      saveToLocalStorage(byLecture);

      setState({
        byLecture,
        global: deriveGlobalStats(byLecture),
        loading: false,
        error: null,
      });
    } catch (err) {
      console.warn('[useProgress] Supabase fetch failed, using localStorage:', err);
      const local = loadFromLocalStorage();
      setState({
        byLecture: local,
        global: deriveGlobalStats(local),
        loading: false,
        error: (err as Error).message,
      });
    }
  }, [supabase]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // ── Optimistic update helper used by study views ──────────────────────────
  const recordSession = useCallback(
    async (
      lectureId: string,
      type: 'flash' | 'exam',
      opts?: { score?: number; masteryPct?: number }
    ) => {
      setState((prev) => {
        const existing = prev.byLecture[lectureId] ?? {
          lecture_id: lectureId,
          flash_sessions: 0,
          exam_sessions: 0,
          best_exam_score: null,
          avg_exam_score: null,
          last_studied_at: null,
          mastery_pct: 0,
        };

        const updated: LectureProgress = {
          ...existing,
          last_studied_at: new Date().toISOString(),
          flash_sessions:
            type === 'flash' ? existing.flash_sessions + 1 : existing.flash_sessions,
          exam_sessions:
            type === 'exam' ? existing.exam_sessions + 1 : existing.exam_sessions,
          mastery_pct:
            opts?.masteryPct !== undefined ? opts.masteryPct : existing.mastery_pct,
          best_exam_score:
            opts?.score !== undefined
              ? existing.best_exam_score === null
                ? opts.score
                : Math.max(existing.best_exam_score, opts.score)
              : existing.best_exam_score,
          avg_exam_score:
            type === 'exam' && opts?.score !== undefined
              ? existing.avg_exam_score === null
                ? opts.score
                : Math.round((existing.avg_exam_score + opts.score) / 2)
              : existing.avg_exam_score,
        };

        const byLecture = { ...prev.byLecture, [lectureId]: updated };
        saveToLocalStorage(byLecture);

        return {
          ...prev,
          byLecture,
          global: deriveGlobalStats(byLecture),
        };
      });

      // Fire-and-forget upsert to Supabase
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const current = state.byLecture[lectureId];
        const newFlashSessions = type === 'flash'
          ? (current?.flash_sessions ?? 0) + 1
          : (current?.flash_sessions ?? 0);
        const newExamSessions = type === 'exam'
          ? (current?.exam_sessions ?? 0) + 1
          : (current?.exam_sessions ?? 0);
        const newBestScore = opts?.score !== undefined
          ? current?.best_exam_score === null
            ? opts.score
            : Math.max(current.best_exam_score!, opts.score)
          : current?.best_exam_score ?? null;
        const newAvgScore = type === 'exam' && opts?.score !== undefined
          ? current?.avg_exam_score === null
            ? opts.score
            : Math.round((current.avg_exam_score! + opts.score) / 2)
          : current?.avg_exam_score ?? null;
        const newMastery = opts?.masteryPct ?? current?.mastery_pct ?? 0;

        await supabase.from('user_progress').upsert(
          {
            user_id: user.id,
            internal_id: lectureId,
            flashcard_progress: { sessions: newFlashSessions, mastery_pct: newMastery },
            exam_progress: { sessions: newExamSessions, best_score: newBestScore, avg_score: newAvgScore },
            last_studied: new Date().toISOString(),
          },
          { onConflict: 'user_id,internal_id' }
        );
      } catch (err) {
        console.warn('[useProgress] Failed to sync session to Supabase:', err);
      }
    },
    [supabase, state.byLecture]
  );

  return {
    progressByLecture: state.byLecture,
    globalStats: state.global,
    loading: state.loading,
    error: state.error,
    recordSession,
    refetch: fetchProgress,
  };
}
