/**
 * StudyMD Lecture Schema Validator
 *
 * Validates a parsed JSON object against the schema defined in
 * lib/lecture-processor-prompt.ts and produced by the Claude API.
 *
 * Returns { valid: boolean, errors: string[] }.
 * Used by app/api/generate/route.ts before inserting into the database.
 */

// ─── Types (mirror the schema in lecture-processor-prompt.ts) ────────────────

export interface LectureFlashcard {
  id: string;              // "F001", "F002", ...
  topic: string;
  front: string;
  back: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface LectureQuestion {
  id: string;              // "Q001", "Q002", ...
  topic: string;
  type: 'mcq' | 'true_false' | 'short_answer' | 'clinical_vignette';
  stem: string;
  options?: string[];
  answer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface LectureJSON {
  lecture_id: string;
  course: string;
  title: string;
  summary: string;
  topics: string[];
  flashcards: LectureFlashcard[];
  questions: LectureQuestion[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_COURSES = [
  'Physical Diagnosis I',
  'Anatomy & Physiology',
  'Laboratory Diagnosis',
] as const;

const VALID_QUESTION_TYPES = ['mcq', 'true_false', 'short_answer', 'clinical_vignette'] as const;

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

const REQUIRED_TOP_LEVEL = [
  'title', 'summary', 'topics', 'flashcards', 'questions',
] as const;

// lecture_id and course are optional in validation — we supply them ourselves
// from the job row if Claude omits or mis-formats them
const OPTIONAL_TOP_LEVEL = ['lecture_id', 'course'] as const;

const REQUIRED_FLASHCARD_FIELDS = [
  'id', 'topic', 'front', 'back', 'tags', 'difficulty',
] as const;

const REQUIRED_QUESTION_FIELDS = [
  'id', 'topic', 'type', 'stem', 'answer', 'explanation', 'difficulty',
] as const;

// ─── ID helpers ───────────────────────────────────────────────────────────────

/** Parses "F001" → 1, "Q042" → 42. Returns null if format doesn't match. */
function parseId(id: string, prefix: 'F' | 'Q'): number | null {
  const match = id.match(new RegExp(`^${prefix}(\\d{3,})$`));
  return match ? parseInt(match[1], 10) : null;
}

// ─── Main validator ───────────────────────────────────────────────────────────

export function validateLecture(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, errors: ['Root value must be a JSON object.'] };
  }

  const obj = data as Record<string, unknown>;

  // ── 1. Required top-level fields ───────────────────────────────────────────
  for (const field of REQUIRED_TOP_LEVEL) {
    if (!(field in obj)) errors.push(`Missing required field: "${field}".`);
  }

  if (errors.length > 0) return { valid: false, errors };

  // ── 2. Course validation ───────────────────────────────────────────────────
  if (!VALID_COURSES.includes(obj.course as (typeof VALID_COURSES)[number])) {
    errors.push(
      `Invalid course: "${obj.course}". Must be one of: ${VALID_COURSES.map(c => `"${c}"`).join(', ')}.`
    );
  }

  // ── 3. Topics ──────────────────────────────────────────────────────────────
  if (!Array.isArray(obj.topics) || obj.topics.length < 3) {
    errors.push('Field "topics" must be an array with at least 3 entries.');
  }

  const topicSet = new Set<string>(Array.isArray(obj.topics) ? (obj.topics as string[]) : []);

  if (topicSet.size !== (obj.topics as unknown[]).length) {
    errors.push('Field "topics" contains duplicate entries.');
  }

  // ── 4. summary ────────────────────────────────────────────────────────────
  if (typeof obj.summary !== 'string' || obj.summary.trim().length < 20) {
    errors.push('Field "summary" must be a non-empty string (at least 20 characters).');
  }

  // ── 5. Flashcards ──────────────────────────────────────────────────────────
  if (!Array.isArray(obj.flashcards)) {
    errors.push('Field "flashcards" must be an array.');
  } else {
    const fcIds = new Set<string>();
    let expectedNum = 1;

    (obj.flashcards as unknown[]).forEach((fc, i) => {
      const label = `flashcards[${i}]`;
      if (typeof fc !== 'object' || fc === null) { errors.push(`${label}: must be an object.`); return; }

      const card = fc as Record<string, unknown>;

      for (const field of REQUIRED_FLASHCARD_FIELDS) {
        if (!(field in card)) errors.push(`${label}: missing field "${field}".`);
      }

      // ID sequencing: F001, F002, ...
      if (typeof card.id === 'string') {
        const num = parseId(card.id, 'F');
        if (num === null) {
          errors.push(`${label}: id "${card.id}" does not match pattern F001, F002, …`);
        } else if (num !== expectedNum) {
          errors.push(`${label}: id "${card.id}" out of sequence (expected F${String(expectedNum).padStart(3, '0')}).`);
        }
        if (fcIds.has(card.id)) errors.push(`${label}: duplicate id "${card.id}".`);
        fcIds.add(card.id);
        expectedNum++;
      }

      // Topic cross-reference
      if (typeof card.topic === 'string' && !topicSet.has(card.topic)) {
        errors.push(`${label} (${card.id}): topic "${card.topic}" not in topics array.`);
      }

      // difficulty
      if (!VALID_DIFFICULTIES.includes(card.difficulty as (typeof VALID_DIFFICULTIES)[number])) {
        errors.push(`${label} (${card.id}): invalid difficulty "${card.difficulty}".`);
      }

      // tags
      if (!Array.isArray(card.tags) || card.tags.length === 0) {
        errors.push(`${label} (${card.id}): "tags" must be a non-empty array.`);
      }

      // front / back non-empty
      if (typeof card.front !== 'string' || card.front.trim().length === 0) {
        errors.push(`${label} (${card.id}): "front" must be a non-empty string.`);
      }
      if (typeof card.back !== 'string' || card.back.trim().length === 0) {
        errors.push(`${label} (${card.id}): "back" must be a non-empty string.`);
      }
    });
  }

  // ── 6. Questions ───────────────────────────────────────────────────────────
  if (!Array.isArray(obj.questions)) {
    errors.push('Field "questions" must be an array.');
  } else {
    const qIds = new Set<string>();
    let expectedNum = 1;
    const typeCounts: Record<string, number> = { mcq: 0, true_false: 0, short_answer: 0, clinical_vignette: 0 };

    (obj.questions as unknown[]).forEach((q, i) => {
      const label = `questions[${i}]`;
      if (typeof q !== 'object' || q === null) { errors.push(`${label}: must be an object.`); return; }

      const question = q as Record<string, unknown>;

      for (const field of REQUIRED_QUESTION_FIELDS) {
        if (!(field in question)) errors.push(`${label}: missing field "${field}".`);
      }

      // ID sequencing: Q001, Q002, ...
      if (typeof question.id === 'string') {
        const num = parseId(question.id, 'Q');
        if (num === null) {
          errors.push(`${label}: id "${question.id}" does not match pattern Q001, Q002, …`);
        } else if (num !== expectedNum) {
          errors.push(`${label}: id "${question.id}" out of sequence (expected Q${String(expectedNum).padStart(3, '0')}).`);
        }
        if (qIds.has(question.id)) errors.push(`${label}: duplicate id "${question.id}".`);
        qIds.add(question.id);
        expectedNum++;
      }

      // Type validation
      const qType = question.type as string;
      if (!VALID_QUESTION_TYPES.includes(qType as (typeof VALID_QUESTION_TYPES)[number])) {
        errors.push(`${label} (${question.id}): invalid type "${qType}".`);
      } else {
        typeCounts[qType]++;
      }

      // MCQ / clinical_vignette must have 4 options and a letter answer
      if (qType === 'mcq' || qType === 'clinical_vignette') {
        if (!Array.isArray(question.options) || question.options.length !== 4) {
          errors.push(`${label} (${question.id}): ${qType} must have exactly 4 options.`);
        }
        if (typeof question.answer !== 'string' || !['A', 'B', 'C', 'D'].includes(question.answer)) {
          errors.push(`${label} (${question.id}): ${qType} answer must be "A", "B", "C", or "D".`);
        }
      }

      // true_false answer
      if (qType === 'true_false') {
        if (typeof question.answer !== 'string' || !['True', 'False'].includes(question.answer)) {
          errors.push(`${label} (${question.id}): true_false answer must be "True" or "False".`);
        }
      }

      // Topic cross-reference
      if (typeof question.topic === 'string' && !topicSet.has(question.topic)) {
        errors.push(`${label} (${question.id}): topic "${question.topic}" not in topics array.`);
      }

      // difficulty
      if (!VALID_DIFFICULTIES.includes(question.difficulty as (typeof VALID_DIFFICULTIES)[number])) {
        errors.push(`${label} (${question.id}): invalid difficulty "${question.difficulty}".`);
      }

      // stem non-empty
      if (typeof question.stem !== 'string' || question.stem.trim().length === 0) {
        errors.push(`${label} (${question.id}): "stem" must be a non-empty string.`);
      }
    });

    // ── 7. Question type distribution check ────────────────────────────────
    const totalQ = (obj.questions as unknown[]).length;
    if (totalQ >= 10) {
      const mcqPct = (typeCounts.mcq + typeCounts.clinical_vignette) / totalQ;
      if (mcqPct < 0.3 || mcqPct > 0.85) {
        errors.push(
          `Question type distribution warning: MCQ+vignette is ${Math.round(mcqPct * 100)}% ` +
          `(target ~75%). Distribution: ${JSON.stringify(typeCounts)}.`
        );
      }
    }
  }

  // ── 8. Minimum content volume check ───────────────────────────────────────
  // We don't have slideCount in this schema, so use flashcard count as proxy.
  const fcCount = Array.isArray(obj.flashcards) ? (obj.flashcards as unknown[]).length : 0;
  const qCount = Array.isArray(obj.questions) ? (obj.questions as unknown[]).length : 0;

  if (fcCount < 20) {
    errors.push(`Too few flashcards: ${fcCount} (minimum 20 for any lecture).`);
  }
  if (qCount < 10) {
    errors.push(`Too few questions: ${qCount} (minimum 10 for any lecture).`);
  }

  return { valid: errors.length === 0, errors };
}
