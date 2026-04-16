// ─── Core Types ────────────────────────────────────────────────────────────

export type Course =
  | 'Physical Diagnosis I'
  | 'Anatomy & Physiology'
  | 'Laboratory Diagnosis';

export type Theme = 'midnight' | 'pink' | 'forest';

export interface Lecture {
  internal_id: string;
  original_file?: string | null;
  title: string;
  subtitle: string | null;
  course: Course;
  color: string;
  icon: string;
  topics: string[];
  slide_count: number;
  json_data: LectureData;
  created_at: string;
}

export interface LectureData {
  flashcards?: Flashcard[];
  questions?: Question[];
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  topic: string;
  slide_number?: number | null;
}

export interface Question {
  id: string;
  type: 'mcq' | 'tf' | 'matching' | 'fillin';
  question: string;
  options?: string[];
  correct_answer: string;
  topic: string;
  explanation?: string;
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
}

export interface LectureWithSettings extends Lecture {
  settings: UserLectureSettings;
  // Computed display values (settings override base)
  display_title: string;
  display_course: Course;
  display_color: string; // resolved for current theme by caller
}

export interface UserPreferences {
  user_id: string;
  theme: Theme;
  settings: Record<string, unknown>;
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
