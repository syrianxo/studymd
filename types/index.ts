// ─── Core Types ────────────────────────────────────────────────────────────

// Courses are user-extensible strings. The legacy cohort seeded with three
// fixed courses; new courses can be added freely via the upload flow and
// ManageMode. They emerge from lectures.course + user_lecture_settings.course_override.
export type Course = string;

export const DEFAULT_COURSES = [
  'Physical Diagnosis I',
  'Anatomy & Physiology',
  'Laboratory Diagnosis',
] as const;

import type { ThemeId } from '@/lib/themes';
export type { ThemeId as Theme } from '@/lib/themes';

export interface Lecture {
  internal_id: string;
  original_file?: string | null;
  title: string;
  subtitle: string | null;
  course: Course;
  theme_colors?: Partial<Record<ThemeId, string>> | null;
  icon: string;
  topics: string[];
  slide_count: number;
  json_data: LectureData;
  created_at: string;
}

// Canonical card/question shapes live in lib/validate-lecture.ts (matches the
// JSON the Claude processor emits and what is stored in lectures.json_data).
// Re-exported here so both names work: `Flashcard`/`Question` alias the canonical
// `LectureFlashcard`/`LectureQuestion`. Flashcards use `front`/`back`; questions
// use `stem`/`answer`/`options`/`explanation` (Anki convention).
import type { LectureFlashcard, LectureQuestion } from '@/lib/validate-lecture';
export type Flashcard = LectureFlashcard;
export type Question = LectureQuestion;

export interface LectureData {
  flashcards?: Flashcard[];
  questions?: Question[];
}

import type { ColorOverrideMap } from '@/hooks/useUserLectures';

export interface UserLectureSettings {
  user_id: string;
  internal_id: string;
  display_order: number;
  visible: boolean;
  archived: boolean;
  group_id?: string | null;
  tags: string[];
  course_override?: Course | null;
  color_override?: ColorOverrideMap | null;
  custom_title?: string | null;
  topics_override?: string[] | null;
}

export interface LectureWithSettings extends Lecture {
  settings: UserLectureSettings;
  // Computed display values (settings override base)
  display_title: string;
  display_course: Course;
  display_color: string; // resolved for current theme by caller
  display_topics: string[]; // resolved from settings.topics_override ?? topics
}

export interface UserPreferences {
  user_id: string;
  theme: ThemeId;
  settings: Record<string, unknown>;
}

// ─── Folders ────────────────────────────────────────────────────────────────

export interface Folder {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  icon: string;        // default '📁'
  color: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ─── Study Plans ───────────────────────────────────────────────────────────

/**
 * schedule maps ISO date strings → array of lecture internal_ids
 * e.g. { "2026-04-15": ["lec_001"], "2026-04-16": ["lec_003", "lec_005"] }
 */
export type StudySchedule = Record<string, string[]>;

export interface StudyPlan {
  id: string;
  user_id: string;
  name: string;
  test_date: string;          // ISO date "YYYY-MM-DD"
  lecture_ids: string[];
  schedule: StudySchedule;
  completed_days: string[];   // ISO dates the user has marked done
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateStudyPlanInput {
  name: string;
  testDate: string;           // ISO date
  lectureIds: string[];
}
