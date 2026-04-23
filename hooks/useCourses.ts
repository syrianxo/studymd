// hooks/useCourses.ts
// Returns the list of courses available to the current user.
//
// Courses are not a first-class table — they emerge from:
//   1. lectures.course (the canonical course stored on each lecture row)
//   2. user_lecture_settings.course_override (per-user overrides)
//   3. A small set of cohort defaults (DEFAULT_COURSES) so a brand-new
//      student with no lectures yet still sees something in the picker.
//
// Users can add a new course freely from the Upload / ManageMode dropdowns;
// the name is passed through to /api/upload as the `course` field and gets
// persisted on the lecture row when the job completes. Calling `addLocal`
// only affects this hook's in-memory list so the new name appears in the
// dropdown immediately (pre-persist).
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { DEFAULT_COURSES } from '@/types';

interface UseCoursesReturn {
  courses: string[];
  loading: boolean;
  error: string | null;
  /** Locally add a course name so it appears in the dropdown before upload. */
  addLocal: (name: string) => void;
  /** Re-read from DB (e.g. after a new lecture is created). */
  refetch: () => void;
}

export function useCourses(): UseCoursesReturn {
  const [courses, setCourses] = useState<string[]>(() => [...DEFAULT_COURSES]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extras, setExtras] = useState<Set<string>>(() => new Set());

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCourses([...DEFAULT_COURSES]);
        return;
      }

      const [lecturesRes, settingsRes] = await Promise.all([
        supabase.from('lectures').select('course'),
        supabase
          .from('user_lecture_settings')
          .select('course_override')
          .eq('user_id', user.id)
          .not('course_override', 'is', null),
      ]);

      const set = new Set<string>(DEFAULT_COURSES);
      for (const row of lecturesRes.data ?? []) {
        if (typeof row.course === 'string' && row.course.trim().length > 0) {
          set.add(row.course.trim());
        }
      }
      for (const row of settingsRes.data ?? []) {
        const v = row.course_override;
        if (typeof v === 'string' && v.trim().length > 0) set.add(v.trim());
      }
      setCourses(Array.from(set).sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const addLocal = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setExtras(prev => {
      if (prev.has(trimmed)) return prev;
      const next = new Set(prev);
      next.add(trimmed);
      return next;
    });
  }, []);

  const merged = (() => {
    if (extras.size === 0) return courses;
    const set = new Set([...courses, ...extras]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  })();

  return { courses: merged, loading, error, addLocal, refetch: fetchCourses };
}
