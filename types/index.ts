// ─── Core Types ────────────────────────────────────────────────────────────

export type Course =
  | 'Physical Diagnosis I'
  | 'Anatomy & Physiology'
  | 'Laboratory Diagnosis';

export type Theme = 'midnight' | 'lavender' | 'forest';

export interface Lecture {
  internal_id: string;
  original_file?: string;
  title: string;
  subtitle?: string;
  course: Course;
  color: string;
  icon: string;
  topics: string[];
  slide_count: number;
  json_data: LectureData;
  created_at: string;
}

export interface LectureData {
  flashcards: Flashcard[];
  questions: Question[];
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  slide_ref?: number;
}

export interface Question {
  id: string;
  type: 'mcq' | 'truefalse' | 'matching' | 'fillin';
  prompt: string;
  options?: string[];
  answer: string | string[];
}

export interface UserLectureSettings {
  user_id: string;
  internal_id: string;
  display_order: number;
  visible: boolean;
  archived: boolean;
  group_id?: string | null;
  tags: string[];
  course_override?: Course | null;
  color_override?: string | null;
  custom_title?: string | null;
}

export interface LectureWithSettings extends Lecture {
  settings: UserLectureSettings;
  // Computed display values (settings override base)
  display_title: string;
  display_course: Course;
  display_color: string;
}

export interface UserPreferences {
  user_id: string;
  theme: Theme;
  settings: Record<string, unknown>;
}
