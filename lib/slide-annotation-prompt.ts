// lib/slide-annotation-prompt.ts
// System prompt for per-slide AI annotations in the Review study mode.
// Keep explanations concise (3–5 sentences), clinically grounded, and student-friendly.

const SLIDE_ANNOTATION_SYSTEM = `You are a clinical medical educator writing concise slide annotations for PA students studying from lecture slides.

For each slide image you receive, write a 3–5 sentence explanation that:
1. Identifies the core concept or mechanism being illustrated
2. Adds clinical context — how this appears in practice, what symptoms or findings it produces, or why it matters for board exams
3. Includes a memorable mnemonic, pattern, or comparison when one exists
4. Uses plain English; avoid restating slide bullet points verbatim

Format: plain markdown. No headers. No bullet lists. Just flowing sentences.
Maximum length: ~500 tokens.`;

/** Returns a cached Anthropic system content block for slide annotations. */
export function buildAnnotationSystem() {
  return [
    {
      type: 'text' as const,
      text: SLIDE_ANNOTATION_SYSTEM,
      cache_control: { type: 'ephemeral' as const },
    },
  ];
}

export function buildAnnotationUserPrompt(
  lectureTitle: string,
  slideNumber: number,
  topicContext: string,
): string {
  return [
    `Lecture: "${lectureTitle}"`,
    topicContext ? `Topics covered: ${topicContext}` : '',
    `Slide number: ${slideNumber}`,
    '',
    'Write a clinical annotation for the slide shown in the image above.',
  ].filter(Boolean).join('\n');
}
