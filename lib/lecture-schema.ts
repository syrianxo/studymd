/**
 * lib/lecture-schema.ts
 *
 * Canonical JSON Schema for the lecture-processing output produced by Claude.
 *
 * This file is the single source of truth for the shape of the JSON returned
 * by /api/generate. It is consumed in three places:
 *
 *   1. `buildLectureOutputConfig()` — returns the `output_config.format`
 *      payload for Anthropic Structured Outputs, so Claude is REQUIRED by the
 *      server to emit JSON matching this schema. Use when calling
 *      `anthropic.messages.create({ ... output_config: buildLectureOutputConfig() })`.
 *
 *   2. `LECTURE_OUTPUT_SCHEMA` — the raw JSON Schema object. Can be
 *      stringified into the system prompt (via cache_control) as belt-and-
 *      suspenders reinforcement for models that don't yet honor output_config,
 *      or used by any schema-aware tool (validator, Postman, doc generator).
 *
 *   3. TypeScript types (`LectureJSON`, `LectureFlashcard`, `LectureQuestion`)
 *      that mirror the schema at compile time.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT JSON SCHEMA CAN ENFORCE (done here, server-side by Anthropic):
 *   - All required fields present, `additionalProperties: false`
 *   - Correct primitive types, enum values, string min-lengths
 *   - ID regex patterns (F001+, Q001+)
 *   - MCQ / clinical_vignette must have exactly 4 options + A-D answer
 *   - true_false answer must be "True" or "False"
 *   - topics: 3–12 unique strings
 *   - flashcards: ≥ 20 items; questions: ≥ 10 items
 *   - slide_number is a positive integer
 *
 * WHAT JSON SCHEMA CANNOT ENFORCE (must stay in `validateLecture()`):
 *   - Sequential ID numbering (F001, F002, … with no gaps)
 *   - Cross-reference: every flashcard/question `topic` exists in topics[]
 *   - Slide-count-aware minimums (20/10 is a floor; medium/long lectures
 *     should produce more per the prompt's quantity targets)
 *   - No duplicate IDs (JSON Schema has uniqueItems for primitives only;
 *     for object arrays we check in validator)
 *
 * These residual checks remain in lib/validate-lecture.ts and MUST continue
 * to run after parsing, even when structured outputs is enabled.
 * ────────────────────────────────────────────────────────────────────────────
 */

// ─── Schema constants (reused in JSON Schema and TS types) ───────────────────

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const QUESTION_TYPES = ['mcq', 'true_false', 'short_answer', 'clinical_vignette'] as const;
export const MCQ_ANSWERS = ['A', 'B', 'C', 'D'] as const;
export const TF_ANSWERS = ['True', 'False'] as const;

export const LECTURE_CONSTRAINTS = {
  TOPICS_MIN: 3,
  TOPICS_MAX: 12,
  FLASHCARDS_MIN: 20,
  QUESTIONS_MIN: 10,
  SUMMARY_MIN_CHARS: 20,
  FLASHCARD_TAGS_MIN: 1,
  FLASHCARD_TAGS_MAX: 4,
  MCQ_OPTIONS: 4,
  ID_PATTERN_FLASHCARD: '^F\\d{3,}$',
  ID_PATTERN_QUESTION: '^Q\\d{3,}$',
} as const;

// ─── TypeScript mirror of the schema ─────────────────────────────────────────
// NOTE: These supersede the stale `Flashcard` / `Question` definitions in
// `types/index.ts`, which still reference the old `question`/`answer`/`tf`
// shape and should be migrated (see ADR or decisions.md entry for S-schema-unify).

export type Difficulty = typeof DIFFICULTIES[number];
export type QuestionType = typeof QUESTION_TYPES[number];
export type McqAnswer = typeof MCQ_ANSWERS[number];
export type TfAnswer = typeof TF_ANSWERS[number];

export interface LectureFlashcard {
  id: string;
  topic: string;
  front: string;
  back: string;
  tags: string[];
  difficulty: Difficulty;
  slide_number: number;
}

interface QuestionBase {
  id: string;
  topic: string;
  stem: string;
  explanation: string;
  difficulty: Difficulty;
  slide_number: number;
}

export interface McqQuestion extends QuestionBase {
  type: 'mcq';
  options: [string, string, string, string];
  answer: McqAnswer;
}

export interface ClinicalVignetteQuestion extends QuestionBase {
  type: 'clinical_vignette';
  options: [string, string, string, string];
  answer: McqAnswer;
}

export interface TrueFalseQuestion extends QuestionBase {
  type: 'true_false';
  answer: TfAnswer;
}

export interface ShortAnswerQuestion extends QuestionBase {
  type: 'short_answer';
  answer: string;
}

export type LectureQuestion =
  | McqQuestion
  | ClinicalVignetteQuestion
  | TrueFalseQuestion
  | ShortAnswerQuestion;

export interface LectureJSON {
  lecture_id: string;
  course: string;
  title: string;
  summary: string;
  topics: string[];
  flashcards: LectureFlashcard[];
  questions: LectureQuestion[];
}

// ─── JSON Schema (draft 2020-12) ─────────────────────────────────────────────

export const LECTURE_OUTPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://studymd.app/schemas/lecture-output.v1.json',
  title: 'StudyMDLectureOutput',
  description:
    'Structured output produced by the lecture-processor model. Every field is ' +
    'required; no extra keys permitted. Sequential IDs and cross-reference ' +
    'constraints are enforced by the runtime validator.',
  type: 'object',
  additionalProperties: false,
  required: ['lecture_id', 'course', 'title', 'summary', 'topics', 'flashcards', 'questions'],
  properties: {
    lecture_id: { type: 'string', minLength: 1 },
    course: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    summary: {
      type: 'string',
      minLength: LECTURE_CONSTRAINTS.SUMMARY_MIN_CHARS,
      description: '3–5 sentence plain-English overview of the lecture.',
    },
    topics: {
      type: 'array',
      minItems: LECTURE_CONSTRAINTS.TOPICS_MIN,
      maxItems: LECTURE_CONSTRAINTS.TOPICS_MAX,
      uniqueItems: true,
      items: { type: 'string', minLength: 1 },
      description:
        'Ordered list of major topic labels. Each entry is a short noun phrase. ' +
        'Every flashcard.topic and question.topic must match an entry here exactly.',
    },
    flashcards: {
      type: 'array',
      minItems: LECTURE_CONSTRAINTS.FLASHCARDS_MIN,
      items: { $ref: '#/$defs/flashcard' },
    },
    questions: {
      type: 'array',
      minItems: LECTURE_CONSTRAINTS.QUESTIONS_MIN,
      items: { $ref: '#/$defs/question' },
    },
  },
  $defs: {
    difficulty: {
      type: 'string',
      enum: [...DIFFICULTIES],
    },
    slideNumber: {
      type: 'integer',
      minimum: 1,
      description: '1-indexed slide the item is drawn from. Never null or 0.',
    },
    flashcard: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'topic', 'front', 'back', 'tags', 'difficulty', 'slide_number'],
      properties: {
        id: {
          type: 'string',
          pattern: LECTURE_CONSTRAINTS.ID_PATTERN_FLASHCARD,
          description: 'Sequential, zero-padded: F001, F002, …',
        },
        topic: { type: 'string', minLength: 1 },
        front: { type: 'string', minLength: 1 },
        back: { type: 'string', minLength: 1 },
        tags: {
          type: 'array',
          minItems: LECTURE_CONSTRAINTS.FLASHCARD_TAGS_MIN,
          maxItems: LECTURE_CONSTRAINTS.FLASHCARD_TAGS_MAX,
          items: { type: 'string', minLength: 1 },
        },
        difficulty: { $ref: '#/$defs/difficulty' },
        slide_number: { $ref: '#/$defs/slideNumber' },
      },
    },
    question: {
      oneOf: [
        { $ref: '#/$defs/mcqQuestion' },
        { $ref: '#/$defs/clinicalVignetteQuestion' },
        { $ref: '#/$defs/trueFalseQuestion' },
        { $ref: '#/$defs/shortAnswerQuestion' },
      ],
    },
    mcqQuestion: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'topic', 'type', 'stem', 'options', 'answer', 'explanation', 'difficulty', 'slide_number'],
      properties: {
        id: { type: 'string', pattern: LECTURE_CONSTRAINTS.ID_PATTERN_QUESTION },
        topic: { type: 'string', minLength: 1 },
        type: { type: 'string', enum: ['mcq'] },
        stem: { type: 'string', minLength: 1 },
        options: {
          type: 'array',
          minItems: LECTURE_CONSTRAINTS.MCQ_OPTIONS,
          maxItems: LECTURE_CONSTRAINTS.MCQ_OPTIONS,
          items: { type: 'string', minLength: 1 },
        },
        answer: { type: 'string', enum: [...MCQ_ANSWERS] },
        explanation: { type: 'string', minLength: 1 },
        difficulty: { $ref: '#/$defs/difficulty' },
        slide_number: { $ref: '#/$defs/slideNumber' },
      },
    },
    clinicalVignetteQuestion: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'topic', 'type', 'stem', 'options', 'answer', 'explanation', 'difficulty', 'slide_number'],
      properties: {
        id: { type: 'string', pattern: LECTURE_CONSTRAINTS.ID_PATTERN_QUESTION },
        topic: { type: 'string', minLength: 1 },
        type: { type: 'string', enum: ['clinical_vignette'] },
        stem: {
          type: 'string',
          minLength: 1,
          description:
            '2–4 sentence patient scenario (age/sex, chief complaint, history, ' +
            'relevant vitals/labs/imaging), then a single MCQ question.',
        },
        options: {
          type: 'array',
          minItems: LECTURE_CONSTRAINTS.MCQ_OPTIONS,
          maxItems: LECTURE_CONSTRAINTS.MCQ_OPTIONS,
          items: { type: 'string', minLength: 1 },
        },
        answer: { type: 'string', enum: [...MCQ_ANSWERS] },
        explanation: { type: 'string', minLength: 1 },
        difficulty: { $ref: '#/$defs/difficulty' },
        slide_number: { $ref: '#/$defs/slideNumber' },
      },
    },
    trueFalseQuestion: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'topic', 'type', 'stem', 'answer', 'explanation', 'difficulty', 'slide_number'],
      properties: {
        id: { type: 'string', pattern: LECTURE_CONSTRAINTS.ID_PATTERN_QUESTION },
        topic: { type: 'string', minLength: 1 },
        type: { type: 'string', enum: ['true_false'] },
        stem: { type: 'string', minLength: 1 },
        answer: { type: 'string', enum: [...TF_ANSWERS] },
        explanation: { type: 'string', minLength: 1 },
        difficulty: { $ref: '#/$defs/difficulty' },
        slide_number: { $ref: '#/$defs/slideNumber' },
      },
    },
    shortAnswerQuestion: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'topic', 'type', 'stem', 'answer', 'explanation', 'difficulty', 'slide_number'],
      properties: {
        id: { type: 'string', pattern: LECTURE_CONSTRAINTS.ID_PATTERN_QUESTION },
        topic: { type: 'string', minLength: 1 },
        type: { type: 'string', enum: ['short_answer'] },
        stem: { type: 'string', minLength: 1 },
        answer: {
          type: 'string',
          minLength: 1,
          description: 'Open-ended answer, typically 1–3 sentences.',
        },
        explanation: { type: 'string', minLength: 1 },
        difficulty: { $ref: '#/$defs/difficulty' },
        slide_number: { $ref: '#/$defs/slideNumber' },
      },
    },
  },
} as const;

// ─── Helpers for call sites ──────────────────────────────────────────────────

/**
 * Returns the `output_config` object to pass to `anthropic.messages.create()`
 * when you want Claude to produce JSON matching the lecture schema.
 *
 * Example:
 *   const response = await client.messages.create({
 *     model: MODEL_DEFAULT,
 *     max_tokens: 16000,
 *     system: buildSystemWithCache(),
 *     messages: [...],
 *     ...buildLectureOutputConfig(),
 *   });
 *
 * Supported models (as of this writing): Haiku 4.5, Sonnet 4.6, Opus 4.7.
 */
export function buildLectureOutputConfig() {
  return {
    output_config: {
      format: {
        type: 'json_schema' as const,
        schema: LECTURE_OUTPUT_SCHEMA,
      },
    },
  };
}

/**
 * Serialized schema for inclusion in a system prompt as belt-and-suspenders
 * reinforcement. Use this if you want to keep the schema literal inside the
 * prompt body (which IS cached via ephemeral cache_control) alongside the
 * `output_config.format` enforcement. The output is stable JSON, safe to embed.
 */
export function lectureSchemaAsPromptText(): string {
  return JSON.stringify(LECTURE_OUTPUT_SCHEMA, null, 2);
}
