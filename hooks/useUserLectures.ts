// hooks/useUserLectures.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FlashCard {
  id: string;
  question: string;
  answer: string;
  topic: string;
  slide_number?: number | null;
}

export interface ExamQuestion {
  id: string;
  type: 'mcq' | 'tf' | 'matching' | 'fillin';
  question: string;
  options?: string[];
  correct_answer: string;
  topic: string;
}

export interface Lecture {
  internal_id: string;
  title: string;
  subtitle: string | null;
  icon: string;
  course: string;
  color: string;
  display_order: number;
  topics: string[];
  slide_count: number;
  json_data: {
    flashcards?: FlashCard[];
    questions?: ExamQuestion[];
  };
  // Per-user settings from user_lecture_settings
  visible: boolean;
  archived: boolean;
  custom_title: string | null;
}

interface UseUserLecturesResult {
  lectures: Lecture[];
  courses: string[];          // distinct course names for filter bar
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useUserLectures(): UseUserLecturesResult {
  const supabase = createClient();

  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [courses, setCourses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLectures = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // ── 1. Fetch base lecture rows ──────────────────────────────────────
      const { data: lectureRows, error: lectureErr } = await supabase
        .from('lectures')
        .select('internal_id, title, subtitle, icon, course, color, topics, slide_count, json_data')
        .order('internal_id', { ascending: true });

      if (lectureErr) throw lectureErr;

      let settingsMap: Record<
        string,
        { display_order: number; visible: boolean; archived: boolean; custom_title: string | null }
      > = {};

      // ── 2. Fetch per-user overrides if logged in ────────────────────────
      if (user) {
        const { data: settingsRows } = await supabase
          .from('user_lecture_settings')
          .select('internal_id, display_order, visible, archived, custom_title')
          .eq('user_id', user.id);

        for (const s of settingsRows ?? []) {
          settingsMap[s.internal_id] = {
            display_order: s.display_order ?? 999,
            visible: s.visible ?? true,
            archived: s.archived ?? false,
            custom_title: s.custom_title ?? null,
          };
        }
      }

      // ── 3. Merge ────────────────────────────────────────────────────────
      const merged: Lecture[] = (lectureRows ?? []).map((row, idx) => ({
        ...(row as any),
        display_order: settingsMap[row.internal_id]?.display_order ?? idx,
        visible: settingsMap[row.internal_id]?.visible ?? true,
        archived: settingsMap[row.internal_id]?.archived ?? false,
        custom_title: settingsMap[row.internal_id]?.custom_title ?? null,
      }));

      merged.sort((a, b) => a.display_order - b.display_order);

      const uniqueCourses = Array.from(new Set(merged.map((l) => l.course))).sort();

      setLectures(merged);
      setCourses(uniqueCourses);
    } catch (err) {
      console.error('[useUserLectures]', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchLectures();
  }, [fetchLectures]);

  return { lectures, courses, loading, error, refetch: fetchLectures };
}

// ── Helper: resolve Supabase Storage URL for a slide thumbnail ───────────────
// Slides are stored at: slides/{internal_id}/slide_001.webp
export function getSlideThumbUrl(
  supabaseUrl: string,
  internalId: string,
  slideIndex: number
): string {
  const padded = String(slideIndex + 1).padStart(3, '0');
  return `${supabaseUrl}/storage/v1/object/public/slides/${internalId}/slide_${padded}.webp`;
}
