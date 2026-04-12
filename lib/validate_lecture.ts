/**
 * lib/validate-lecture.ts
 *
 * Validates the raw JSON object returned by Claude against the StudyMD
 * LectureOutput schema before it is written to the database.
 *
 * Returns { valid: true } when everything passes, or
 *         { valid: false, errors: string[] } listing every problem found.
 *
 * Design goals:
 *  - Exhaustive: collect ALL errors in one pass so callers get a full picture.
 *  - Fast: pure in-memory checks, no I/O.
 *  - Informative: error messages include the offending field path and value.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Flashcard {
  id: string;
  topic: string;
  front: string;
  back: string;
  tags: string[];
  difficulty: "easy" | "medium" | "hard";
}

export interface Question {
  id: string;
  topic: string;
  type: "mcq" | "true_false" | "short_answer" | "clinical_vignette";
  stem: string;
  options?: string[];
  answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface LectureOutput {
  lecture_id: string;
  course: string;
  title: string;
  summary: string;
  topics: string[];
  flashcards: Flashcard[];
  questions: Question[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const VALID_QUESTION_TYPES = new Set([
  "mcq",
  "true_false",
  "short_answer",
  "clinical_vignette",
]);
const VALID_MCQ_ANSWERS = new Set(["A", "B", "C", "D"]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((v) => typeof v === "string")
  );
}

/** Parse an ID like "F007" or "Q012" and return the numeric part. */
function parseSequentialId(id: string, prefix: "F" | "Q"): number | null {
  const match = id.match(new RegExp(`^${prefix}(\\d{3})$`));
  return match ? parseInt(match[1], 10) : null;
}

// ─── Main validator ───────────────────────────────────────────────────────────

/**
 * validateLecture
 *
 * @param data - The parsed JSON object to validate (type unknown on purpose
 *               so we can safely check every field ourselves).
 * @returns ValidationResult
 */
export function validateLecture(data: unknown): ValidationResult {
  const errors: string[] = [];

  // ── 0. Top-level type check ────────────────────────────────────────────────
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {
      valid: false,
      errors: ["Root value must be a JSON object, got: " + typeof data],
    };
  }

  const obj = data as Record<string, unknown>;

  // ── 1. Required top-level string fields ───────────────────────────────────
  for (const field of ["lecture_id", "course", "title", "summary"] as const) {
    if (!isNonEmptyString(obj[field])) {
      errors.push(`Missing or empty required field: "${field}"`);
    }
  }

  // ── 2. topics array ───────────────────────────────────────────────────────
  if (!Array.isArray(obj.topics) || obj.topics.length === 0) {
    errors.push('Field "topics" must be a non-empty array');
  } else if (!isStringArray(obj.topics)) {
    errors.push('All entries in "topics" must be strings');
  }

  // Build a set for O(1) topic lookups (even if there were errors above,
  // we do our best to continue validation).
  const topicSet = new Set<string>(
    Array.isArray(obj.topics) ? (obj.topics as string[]) : []
  );

  if (topicSet.size < 3) {
    errors.push(
      `"topics" must have at least 3 entries, found ${topicSet.size}`
    );
  }

  if (topicSet.size > 12) {
    errors.push(
      `"topics" must have at most 12 entries, found ${topicSet.size}`
    );
  }

  // ── 3. flashcards array ───────────────────────────────────────────────────
  if (!Array.isArray(obj.flashcards) || obj.flashcards.length === 0) {
    errors.push('"flashcards" must be a non-empty array');
  } else {
    const seenIds = new Set<number>();

    (obj.flashcards as unknown[]).forEach((fc, idx) => {
      const path = `flashcards[${idx}]`;

      if (typeof fc !== "object" || fc === null) {
        errors.push(`${path}: must be an object`);
        return;
      }

      const f = fc as Record<string, unknown>;

      // id — sequential, pattern F001..F999
      if (!isNonEmptyString(f.id)) {
        errors.push(`${path}.id: missing or empty`);
      } else {
        const num = parseSequentialId(f.id as string, "F");
        if (num === null) {
          errors.push(
            `${path}.id: "${f.id}" does not match expected pattern F001–F999`
          );
        } else if (seenIds.has(num)) {
          errors.push(`${path}.id: duplicate ID "${f.id}"`);
        } else {
          seenIds.add(num);
        }
      }

      // topic — must match topics[]
      if (!isNonEmptyString(f.topic)) {
        errors.push(`${path}.topic: missing or empty`);
      } else if (!topicSet.has(f.topic as string)) {
        errors.push(
          `${path}.topic: "${f.topic}" does not match any entry in topics[]`
        );
      }

      // front, back
      if (!isNonEmptyString(f.front)) errors.push(`${path}.front: missing or empty`);
      if (!isNonEmptyString(f.back))  errors.push(`${path}.back: missing or empty`);

      // tags
      if (!isStringArray(f.tags) || (f.tags as string[]).length === 0) {
        errors.push(`${path}.tags: must be a non-empty string array`);
      } else if ((f.tags as string[]).length > 4) {
        errors.push(`${path}.tags: maximum 4 tags allowed, found ${(f.tags as string[]).length}`);
      }

      // difficulty
      if (!VALID_DIFFICULTIES.has(f.difficulty as string)) {
        errors.push(
          `${path}.difficulty: "${f.difficulty}" must be "easy", "medium", or "hard"`
        );
      }
    });

    // Sequential check — IDs must be 1, 2, 3, … without gaps
    const sortedIds = Array.from(seenIds).sort((a, b) => a - b);
    sortedIds.forEach((num, i) => {
      if (num !== i + 1) {
        errors.push(
          `flashcard IDs are not strictly sequential — expected F${String(i + 1).padStart(3, "0")}, found F${String(num).padStart(3, "0")}`
        );
      }
    });
  }

  // ── 4. questions array ────────────────────────────────────────────────────
  if (!Array.isArray(obj.questions) || obj.questions.length === 0) {
    errors.push('"questions" must be a non-empty array');
  } else {
    const seenIds = new Set<number>();

    (obj.questions as unknown[]).forEach((q, idx) => {
      const path = `questions[${idx}]`;

      if (typeof q !== "object" || q === null) {
        errors.push(`${path}: must be an object`);
        return;
      }

      const qu = q as Record<string, unknown>;

      // id — sequential, pattern Q001..Q999
      if (!isNonEmptyString(qu.id)) {
        errors.push(`${path}.id: missing or empty`);
      } else {
        const num = parseSequentialId(qu.id as string, "Q");
        if (num === null) {
          errors.push(
            `${path}.id: "${qu.id}" does not match expected pattern Q001–Q999`
          );
        } else if (seenIds.has(num)) {
          errors.push(`${path}.id: duplicate ID "${qu.id}"`);
        } else {
          seenIds.add(num);
        }
      }

      // topic
      if (!isNonEmptyString(qu.topic)) {
        errors.push(`${path}.topic: missing or empty`);
      } else if (!topicSet.has(qu.topic as string)) {
        errors.push(
          `${path}.topic: "${qu.topic}" does not match any entry in topics[]`
        );
      }

      // type
      if (!VALID_QUESTION_TYPES.has(qu.type as string)) {
        errors.push(
          `${path}.type: "${qu.type}" must be one of mcq, true_false, short_answer, clinical_vignette`
        );
      }

      // stem, answer, explanation
      if (!isNonEmptyString(qu.stem))        errors.push(`${path}.stem: missing or empty`);
      if (!isNonEmptyString(qu.answer))      errors.push(`${path}.answer: missing or empty`);
      if (!isNonEmptyString(qu.explanation)) errors.push(`${path}.explanation: missing or empty`);

      // options — required for mcq and clinical_vignette
      const isMcqType =
        qu.type === "mcq" || qu.type === "clinical_vignette";

      if (isMcqType) {
        if (!Array.isArray(qu.options) || (qu.options as unknown[]).length !== 4) {
          errors.push(
            `${path}.options: mcq/clinical_vignette must have exactly 4 options (A–D)`
          );
        } else if (!isStringArray(qu.options)) {
          errors.push(`${path}.options: all options must be strings`);
        }

        if (
          isNonEmptyString(qu.answer) &&
          !VALID_MCQ_ANSWERS.has(qu.answer as string)
        ) {
          errors.push(
            `${path}.answer: "${qu.answer}" must be "A", "B", "C", or "D" for mcq/vignette`
          );
        }
      }

      // difficulty
      if (!VALID_DIFFICULTIES.has(qu.difficulty as string)) {
        errors.push(
          `${path}.difficulty: "${qu.difficulty}" must be "easy", "medium", or "hard"`
        );
      }
    });

    // Sequential check
    const sortedIds = Array.from(seenIds).sort((a, b) => a - b);
    sortedIds.forEach((num, i) => {
      if (num !== i + 1) {
        errors.push(
          `question IDs are not strictly sequential — expected Q${String(i + 1).padStart(3, "0")}, found Q${String(num).padStart(3, "0")}`
        );
      }
    });
  }

  // ── 5. Minimum quantity checks ─────────────────────────────────────────────
  const fcCount = Array.isArray(obj.flashcards) ? obj.flashcards.length : 0;
  const qCount  = Array.isArray(obj.questions)  ? obj.questions.length  : 0;

  if (fcCount < 20) {
    errors.push(
      `Insufficient flashcards: minimum 20 required, got ${fcCount}`
    );
  }

  if (qCount < 10) {
    errors.push(
      `Insufficient questions: minimum 10 required, got ${qCount}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}