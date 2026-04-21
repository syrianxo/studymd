// hooks/useUserLectures.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import type { Course, Theme } from '@/types';

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

// Per-theme color map stored in the DB as JSONB
export type ColorOverrideMap = Partial<Record<Theme, string>>;

export interface Lecture {
  internal_id: string;
  title: string;
  subtitle: string | null;
  icon: string;
  course: Course;
  display_order: number;
  topics: string[];
  slide_count: number;
  created_at: string;
  json_data: {
    flashcards?: FlashCard[];
    questions?: ExamQuestion[];
  };
  // Per-user settings from user_lecture_settings
  visible: boolean;
  archived: boolean;
  custom_title: string | null;
  tags: string[];
  group_id: string | null;
  course_override: Course | null;
  // color_override is now a per-theme map; use resolveColor() to get the active color
  color_override: ColorOverrideMap | null;
  // Default color per theme, set on the lectures table (not per-user)
  theme_colors: ColorOverrideMap | null;
  // topics_override: null = use lectures.topics; string[] = per-user override
  topics_override: string[] | null;
  // Resolved display topics (topics_override ?? topics)
  display_topics: string[];
}

/** Resolve the display color for a lecture given the active theme.
 *  Priority: user color_override[theme] → lectures.theme_colors[theme] → var(--accent)
 */
export function resolveColor(lecture: Lecture, activeTheme: Theme): string {
  if (lecture.color_override?.[activeTheme]) {
    return lecture.color_override[activeTheme]!;
  }
  return lecture.theme_colors?.[activeTheme] ?? 'var(--accent)';
}

interface UseUserLecturesResult {
  lectures: Lecture[];
  courses: Course[];          // distinct course names for filter bar
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useUserLectures(): UseUserLecturesResult {
  const supabase = createClient();

  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
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
        .select('internal_id, title, subtitle, icon, course, theme_colors, topics, slide_count, created_at, json_data')
        .order('internal_id', { ascending: true });

      if (lectureErr) throw lectureErr;

      let settingsMap: Record<
        string,
        { display_order: number; visible: boolean; archived: boolean; custom_title: string | null; tags: string[]; group_id: string | null; course_override: Course | null; color_override: ColorOverrideMap | null; topics_override: string[] | null; }
      > = {};

      // ── 2. Fetch per-user overrides if logged in ────────────────────────
      if (user) {
        const { data: settingsRows } = await supabase
          .from('user_lecture_settings')
          .select('internal_id, display_order, visible, archived, custom_title, tags, group_id, course_override, color_override, topics_override')
          .eq('user_id', user.id);

        for (const s of settingsRows ?? []) {
          // color_override from DB is now JSONB — could be an object like
          // { midnight: '#5b8dee', pink: '#ec4899' } or null
          // Handle legacy text strings from before the migration too
          let colorOverride: ColorOverrideMap | null = null;
          if (s.color_override) {
            if (typeof s.color_override === 'string' && s.color_override.startsWith('#')) {
              // Legacy text value — treat as midnight override
              colorOverride = { midnight: s.color_override };
            } else if (typeof s.color_override === 'object') {
              colorOverride = s.color_override as ColorOverrideMap;
            }
          }
          const topicsOverride: string[] | null =
            Array.isArray(s.topics_override) ? s.topics_override : null;

          settingsMap[s.internal_id] = {
            display_order:   s.display_order   ?? 999,
            visible:         s.visible         ?? true,
            archived:        s.archived        ?? false,
            custom_title:    s.custom_title    ?? null,
            tags:            s.tags            ?? [],
            group_id:        s.group_id        ?? null,
            course_override: s.course_override ?? null,
            color_override:  colorOverride,
            topics_override: topicsOverride,
          };
        }
      }

      // ── 3. Merge ────────────────────────────────────────────────────────
      const merged: Lecture[] = (lectureRows ?? []).map((row, idx) => {
        const s = settingsMap[row.internal_id];
        const topics_override = s?.topics_override ?? null;
        return {
          ...(row as any),
          display_order:   s?.display_order   ?? idx,
          visible:         s?.visible         ?? true,
          archived:        s?.archived        ?? false,
          custom_title:    s?.custom_title    ?? null,
          tags:            s?.tags            ?? [],
          group_id:        s?.group_id        ?? null,
          course_override: s?.course_override ?? null,
          color_override:  s?.color_override  ?? null,
          theme_colors:    (row as any).theme_colors ?? null,
          topics_override,
          // Resolved display topics: per-user override takes precedence over shared topics
          display_topics:  topics_override ?? (row as any).topics ?? [],
        };
      });

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
