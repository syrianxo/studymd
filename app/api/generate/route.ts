/**
 * POST /api/generate
 *
 * Calls the Claude API to generate flashcards and exam questions
 * from an uploaded lecture file. This route is called by the
 * background processing job — NOT directly by the browser client.
 *
 * The system prompt (LECTURE_PROCESSOR_PROMPT) is stored server-side
 * and never exposed to the client.
 *
 * Workstream 1 will implement the full handler:
 *   1. Validate that the request comes from an authorized background job
 *      (internal secret header, not user auth)
 *   2. Check and enforce API_LIMITS before calling Claude:
 *      - Daily call count
 *      - Daily input token budget
 *      - Monthly cost cap
 *   3. Fetch the file from Supabase Storage
 *   4. Build the Anthropic API request:
 *      - model: API_LIMITS.MODEL_DEFAULT (Haiku 4.5)
 *      - system: LECTURE_PROCESSOR_PROMPT (with cache_control if PROMPT_CACHING_ENABLED)
 *      - user message: document attachment + extraction prompt
 *      - Batch API if BATCH_API_ENABLED
 *   5. Parse and validate the JSON response against ProcessedLecture schema
 *   6. Fallback to MODEL_FALLBACK (Sonnet 4.6) if validation fails
 *   7. Update api_usage table with actual tokens and cost
 *   8. Return processed lecture data to the caller
 *
 * Security: ANTHROPIC_API_KEY lives only in Vercel env vars.
 * It is NEVER sent to the client, NEVER logged, NEVER returned in responses.
 */
import { NextResponse } from "next/server";
import { API_LIMITS } from "@/lib/api-limits";
// import { LECTURE_PROCESSOR_PROMPT } from "@/lib/lecture-processor-prompt";
// import Anthropic from "@anthropic-ai/sdk"; // install in Workstream 1

export async function POST() {
  // TODO (Workstream 1): full implementation
  return NextResponse.json(
    {
      error: "Not yet implemented — see Workstream 1",
      config: {
        defaultModel: API_LIMITS.MODEL_DEFAULT,
        fallbackModel: API_LIMITS.MODEL_FALLBACK,
        batchEnabled: API_LIMITS.BATCH_API_ENABLED,
        cachingEnabled: API_LIMITS.PROMPT_CACHING_ENABLED,
      },
    },
    { status: 501 }
  );
}
