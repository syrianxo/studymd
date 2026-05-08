/**
 * Split prompts for the parallel-generation path. Three phases:
 *
 *   Phase 1 — METADATA: outputs only lecture_id, course, title, summary, topics
 *             (small response, ~500 tokens). Run sequentially first because
 *             both flashcards and questions need the canonical topics list.
 *
 *   Phase 2 — FLASHCARDS: outputs only flashcards[] using the known topics.
 *
 *   Phase 3 — QUESTIONS: outputs only questions[] using the known topics.
 *
 * Phases 2 and 3 run in parallel after phase 1 returns. Splitting the work
 * keeps per-call output well under Haiku's 16k cap (no truncation → no Sonnet
 * fallback → significant cost & time savings on dense lectures).
 *
 * The system prompt for each phase keeps the FULL quality rules from
 * lecture-processor-prompt.ts but redefines the output schema for that phase.
 * The shared rule sections (content weighting, question types, quality, etc.)
 * are pulled in verbatim to keep voice and style consistent.
 */

const SHARED_RULES = `
════════════════════════════════════════════════════════════
SECTION 2 — CONTENT WEIGHTING RULES
════════════════════════════════════════════════════════════

1. SLIDE COVERAGE
   - Every major concept on every slide must appear in at least one flashcard or question.
   - Slides marked "objectives", "references", "disclosures", or "acknowledgements"
     should be SKIPPED — do not generate items from them.
   - Tables, figures, and diagrams: extract their key takeaway as a plain-text fact.
     NEVER write "see Figure N" or "as shown in Table N". State the finding directly.

2. CONTENT HIERARCHY
   Priority 1 — Bolded, underlined, or highlighted text in slides.
   Priority 2 — Slide titles and first-level bullet points.
   Priority 3 — Sub-bullets and speaker notes (if present in the document).

3. QUANTITY TARGETS (scale with lecture length)
   Short lecture  (≤ 20 slides):  ≥ 20 flashcards, ≥ 10 questions
   Medium lecture (21–40 slides): ≥ 35 flashcards, ≥ 18 questions
   Long lecture   (≥ 41 slides):  ≥ 50 flashcards, ≥ 25 questions
`;

const QUALITY_FLASHCARDS = `
FLASHCARDS
- Fronts must be unambiguous — a student should be able to answer without guessing
  what is being asked.
- Backs must be complete and self-contained; a student should not need the slides
  to understand the answer. Write out the fact, value, or finding in full.
- NEVER reference a figure, table, diagram, or image by name or number (e.g., do not
  write "see Figure 3", "as shown in Table 2"). State the key takeaway directly.
- Avoid "What is…?" as the entire front. Prefer "What is the mechanism of…?",
  "What are the 3 classic findings of…?", etc.
- Include First Aid / Pathoma / Sketchy-style mnemonics where they genuinely aid recall.

DIFFICULTY CALIBRATION
- easy   — direct recall of a single fact from the slide
- medium — requires synthesis of 2+ concepts, or is a common board-level question
- hard   — requires clinical reasoning, exception knowledge, or multi-step logic
`;

const QUALITY_QUESTIONS = `
QUESTION TYPE DISTRIBUTION
Across all questions, use this approximate mix:
  mcq              — 50 %
  clinical_vignette — 25 %
  short_answer      — 15 %
  true_false        — 10 %

For clinical_vignette, "options" still has 4 choices (A–D) and "answer" is
the letter, just like mcq. The vignette text goes in "stem".

MULTIPLE-CHOICE QUESTIONS
- All 4 options must be plausible; avoid absurd distractors.
- One and only one option is correct.
- Do NOT use "All of the above" or "None of the above."
- Rotate which letter is correct; do not cluster on "A" or "C."

CLINICAL VIGNETTES
- Include: age/sex, chief complaint, key history, relevant vitals/labs/imaging.
- The question at the end should test a single clinical decision.

EXPLANATIONS — REQUIRED for every single question.
- For true_false: explain why the statement is true or false.
- For short_answer: confirm the answer with one sentence of supporting context.
- For MCQ/vignette: state what makes the correct answer correct, then briefly
  explain why each wrong option is incorrect (1 clause each).

DIFFICULTY CALIBRATION
- easy / medium / hard as above.
`;

// ─── Phase 1: Metadata + Topics ─────────────────────────────────────────────

export function buildMetadataPrompt(): string {
  return `You are StudyMD's Lecture Processor. Your job here is to read the lecture
content and produce ONLY the lecture metadata: a brief summary plus the
canonical topics list. Subsequent calls will reuse these topics for
flashcards and questions, so the topics list MUST be authoritative and
ordered to reflect the progression of the lecture.

Output exactly ONE JSON object:

{
  "lecture_id": string,        // equals internalId passed in the user message
  "course":     string,        // equals course passed in the user message
  "title":      string,        // equals title passed in the user message
  "summary":    string,        // 3–5 sentence plain-English overview
  "topics":     string[]       // ordered, min 3 max 12; short noun phrases
                                // e.g. "Cardiac Action Potential"
}

DO NOT include flashcards or questions in this response.

Output ONLY the raw JSON. The first character must be '{' and the last '}'.`;
}

// ─── Phase 2: Flashcards ────────────────────────────────────────────────────

export function buildFlashcardsPrompt(topics: string[]): string {
  return `You are StudyMD's Lecture Processor. Your job here is to produce the
FLASHCARDS array for the lecture, using EXACTLY this canonical topics
list (do not add or rename):

${JSON.stringify(topics, null, 2)}

Output exactly ONE JSON object:

{
  "flashcards": Array<{
    id:           string,    // sequential: "F001", "F002", …
    topic:        string,    // MUST exactly match one entry in the topics list above
    front:        string,    // terse question or stem (≤ 120 chars when possible)
    back:         string,    // complete, self-contained answer
    tags:         string[],  // 1–4 descriptive tags
    difficulty:   "easy" | "medium" | "hard",
    slide_number: number     // 1-indexed; use earliest slide if multi-slide
  }>
}

${SHARED_RULES}
${QUALITY_FLASHCARDS}

STRICT CONSTRAINTS
- DO NOT fabricate facts not in the slides.
- Every flashcard MUST include slide_number (positive integer, 1-indexed).
- IDs must be strictly sequential: F001, F002, … no gaps or repeats.
- Every flashcard.topic MUST be an EXACT string match to an entry in the
  topics list given above. If a fact does not fit any of those topics, omit
  the flashcard rather than inventing a new topic.

Output ONLY the raw JSON. The first character must be '{' and the last '}'.`;
}

// ─── Phase 3: Questions ─────────────────────────────────────────────────────

export function buildQuestionsPrompt(topics: string[]): string {
  return `You are StudyMD's Lecture Processor. Your job here is to produce the
QUESTIONS array for the lecture, using EXACTLY this canonical topics list
(do not add or rename):

${JSON.stringify(topics, null, 2)}

Output exactly ONE JSON object:

{
  "questions": Array<{
    id:           string,                                  // "Q001", "Q002", …
    topic:        string,                                  // EXACT match in topics
    type:         "mcq" | "true_false" | "short_answer" | "clinical_vignette",
    stem:         string,
    options?:     string[],                                // mcq/vignette: 4 choices A–D
    answer:       string,                                  // mcq/vignette: "A".."D"; else free text
    explanation:  string,                                  // 2–5 sentences
    difficulty:   "easy" | "medium" | "hard",
    slide_number: number                                    // 1-indexed
  }>
}

${SHARED_RULES}
${QUALITY_QUESTIONS}

STRICT CONSTRAINTS
- DO NOT fabricate facts not in the slides.
- Every question MUST include slide_number (positive integer, 1-indexed).
- IDs must be strictly sequential: Q001, Q002, … no gaps or repeats.
- Every question.topic MUST be an EXACT string match to an entry in the
  topics list above.
- options is REQUIRED for type "mcq" and "clinical_vignette" (4 choices A–D).
  Omit options for "short_answer" and "true_false".
- explanation is REQUIRED for every question.

Output ONLY the raw JSON. The first character must be '{' and the last '}'.`;
}

/** Wraps a phase prompt as a cacheable system message. */
export function asCacheableSystem(prompt: string) {
  return [
    {
      type: 'text' as const,
      text: prompt,
      cache_control: { type: 'ephemeral' as const },
    },
  ];
}
