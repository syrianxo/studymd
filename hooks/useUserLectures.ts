// hooks/useUserLectures.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

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
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  icon: string;
  course: string;           // e.g. "Physical Diagnosis I"
  color: string;            // CSS color value for card accent stripe
  display_order: number;
  topics: string[];
  flashcard_count: number;
  question_count: number;
  slide_count: number;
  // Supabase Storage base URL for slide thumbnails
  slides_storage_path: string | null;
  // Per-user settings from user_lecture_settings
  is_pinned: boolean;
  is_hidden: boolean;
  custom_label: string | null;
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
  const supabase = createClientComponentClient();

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
        .select(
          `
          id,
          slug,
          title,
          subtitle,
          icon,
          course,
          color,
          display_order,
          topics,
          flashcard_count,
          question_count,
          slide_count,
          slides_storage_path
        `
        )
        .order('display_order', { ascending: true });

      if (lectureErr) throw lectureErr;

      let settingsMap: Record<
        string,
        { is_pinned: boolean; is_hidden: boolean; custom_label: string | null }
      > = {};

      // ── 2. Fetch per-user overrides if logged in ────────────────────────
      if (user) {
        const { data: settingsRows } = await supabase
          .from('user_lecture_settings')
          .select('lecture_id, is_pinned, is_hidden, custom_label')
          .eq('user_id', user.id);

        for (const s of settingsRows ?? []) {
          settingsMap[s.lecture_id] = {
            is_pinned: s.is_pinned ?? false,
            is_hidden: s.is_hidden ?? false,
            custom_label: s.custom_label ?? null,
          };
        }
      }

      // ── 3. Merge ────────────────────────────────────────────────────────
      const merged: Lecture[] = (lectureRows ?? []).map((row) => ({
        ...(row as Omit<Lecture, 'is_pinned' | 'is_hidden' | 'custom_label'>),
        is_pinned: settingsMap[row.id]?.is_pinned ?? false,
        is_hidden: settingsMap[row.id]?.is_hidden ?? false,
        custom_label: settingsMap[row.id]?.custom_label ?? null,
      }));

      // Pinned lectures float to the top within their sort order
      merged.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return a.display_order - b.display_order;
      });

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
export function getSlideThumbUrl(
  supabaseUrl: string,
  storagePath: string,
  slideIndex: number
): string {
  // Convention: slides_storage_path = "lectures/{slug}/slides"
  // Each thumbnail is stored as "slide_{padded_index}.webp"
  const padded = String(slideIndex + 1).padStart(3, '0');
  return `${supabaseUrl}/storage/v1/object/public/${storagePath}/slide_${padded}.webp`;
}
