/**
 * POST /api/generate
 *
 * Accepts:  { fileUrl, course, title, internalId, jobId, userId }
 * Fetches the file from Supabase Storage, calls the Anthropic API to generate
 * structured lecture JSON, validates the result, and inserts it into the DB.
 *
 * Status flow written to processing_jobs:
 *   pending → converting → generating → complete | error
 *
 * Security: ANTHROPIC_API_KEY is server-side only. Never exposed to the client.
 * This route must only be called from server-side code (upload handler) or
 * from Supabase Edge Functions. It is protected by checking a shared secret
 * header (INTERNAL_API_SECRET) so the browser cannot call it directly.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  API_LIMITS,
  estimateCost,
  estimateTokensFromBytes,
} from '@/lib/api-limits';
import { LECTURE_PROCESSOR_SYSTEM_PROMPT } from '@/lib/lecture-processor-prompt';
import { validateLecture, type LectureJSON } from '@/lib/validate-lecture';

// ─── Supabase admin client (service role — bypasses RLS for server writes) ────
// This is intentional: the generate route writes to tables on behalf of the
// user, so we use the service role key. Never send this key to the client.
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  }
  return createClient(url, key);
}

// ─── Anthropic client ─────────────────────────────────────────────────────────
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY environment variable.');
  }
  return new Anthropic({ apiKey });
}

// ─── Request body type ────────────────────────────────────────────────────────
interface GenerateRequestBody {
  fileUrl: string;       // Supabase Storage signed URL for the uploaded file
  course: string;        // One of the three valid course strings
  title: string;         // Lecture title (may be refined by Claude)
  internalId: string;    // e.g. "lec_abc123"
  jobId: string;         // processing_jobs row ID for status updates
  userId: string;        // Supabase Auth user ID (for user_lecture_settings)
  fileSizeBytes?: number; // Optional — used for token pre-flight estimation
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Updates the processing_jobs row status. Swallows errors to avoid cascading failures. */
async function updateJobStatus(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  status: 'converting' | 'generating' | 'complete' | 'error',
  errorMessage?: string
) {
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (errorMessage) update.error_message = errorMessage;

  const { error } = await supabase
    .from('processing_jobs')
    .update(update)
    .eq('id', jobId);

  if (error) {
    console.error(`[generate] Failed to update job ${jobId} to "${status}":`, error.message);
  }
}

/** Fetches the lecture file from Supabase Storage as an ArrayBuffer. */
async function fetchFileFromStorage(fileUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch file from storage: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

/** Converts ArrayBuffer to base64 string for the Anthropic API. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Determines MIME type from fileUrl extension. Defaults to PDF. */
function getMimeType(
  fileUrl: string
): 'application/pdf' | 'application/vnd.openxmlformats-officedocument.presentationml.presentation' {
  const lower = fileUrl.toLowerCase();
  if (lower.includes('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return 'application/pdf';
}

// ─── Usage tracking ───────────────────────────────────────────────────────────

/**
 * Upserts today's api_usage row, incrementing all counters.
 * Tries the increment_api_usage RPC first; falls back to a plain insert if the
 * RPC hasn't been created yet (useful during initial setup).
 */
async function recordApiUsage(
  supabase: ReturnType<typeof createClient>,
  model: string,
  inputTokens: number,
  outputTokens: number,
  isBatch: boolean
) {
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  const cost = estimateCost(model, inputTokens, outputTokens, isBatch);

  const { error } = await supabase.rpc('increment_api_usage', {
    p_date: today,
    p_calls: 1,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost: cost,
  });

  if (error) {
    console.error('[generate] increment_api_usage RPC failed, trying manual upsert:', error.message);

    // Fallback: plain upsert (overwrites rather than increments — acceptable as last resort)
    await supabase.from('api_usage').upsert(
      {
        date: today,
        calls_count: 1,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost: cost,
      },
      { onConflict: 'date', ignoreDuplicates: false }
    );
  }
}

// ─── Rate limit checks ────────────────────────────────────────────────────────

interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
}

async function checkRateLimits(
  supabase: ReturnType<typeof createClient>,
  estimatedInputTokens: number
): Promise<RateLimitCheckResult> {
  const today = new Date().toISOString().split('T')[0];

  // Today's usage
  const { data: todayUsage } = await supabase
    .from('api_usage')
    .select('calls_count, input_tokens')
    .eq('date', today)
    .maybeSingle();

  if (todayUsage) {
    if (todayUsage.calls_count >= API_LIMITS.MAX_DAILY_CALLS) {
      return {
        allowed: false,
        reason: `Daily processing limit reached (${API_LIMITS.MAX_DAILY_CALLS} lectures/day). Try again tomorrow.`,
      };
    }
    if (todayUsage.input_tokens + estimatedInputTokens > API_LIMITS.MAX_DAILY_INPUT_TOKENS) {
      return {
        allowed: false,
        reason: `Daily token limit would be exceeded. Try a smaller file or try again tomorrow.`,
      };
    }
  }

  // Monthly cost
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartStr = monthStart.toISOString().split('T')[0];

  const { data: monthUsage } = await supabase
    .from('api_usage')
    .select('estimated_cost')
    .gte('date', monthStartStr);

  if (monthUsage && monthUsage.length > 0) {
    const monthTotal = monthUsage.reduce((sum, row) => sum + (row.estimated_cost ?? 0), 0);
    if (monthTotal >= API_LIMITS.MAX_MONTHLY_COST_USD) {
      return {
        allowed: false,
        reason: `Monthly API budget of $${API_LIMITS.MAX_MONTHLY_COST_USD.toFixed(2)} has been reached. Contact Khalid.`,
      };
    }
  }

  return { allowed: true };
}

// ─── Core Claude API call ─────────────────────────────────────────────────────

interface ClaudeCallResult {
  lectureJson: LectureJSON;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

async function callClaudeAPI(
  client: Anthropic,
  fileBase64: string,
  mimeType: string,
  internalId: string,
  course: string,
  title: string,
  model: string
): Promise<ClaudeCallResult> {
  const userMessage = `Process this as lecture ${internalId} for course ${course}. Title: ${title}.`;

  const response = await client.messages.create({
    model,
    max_tokens: API_LIMITS.MAX_OUTPUT_TOKENS,
    system: [
      {
        type: 'text',
        text: LECTURE_PROCESSOR_SYSTEM_PROMPT,
        // Prompt caching: Anthropic caches this after the first call.
        // Subsequent calls pay 0.1x input cost for this block (90% savings).
        // @ts-expect-error — cache_control is a beta feature not in all SDK type defs
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              // The Anthropic SDK types this narrowly; cast required for PPTX support
              media_type: mimeType as 'application/pdf',
              data: fileBase64,
            },
          },
          {
            type: 'text',
            text: userMessage,
          },
        ],
      },
    ],
  });

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude API returned no text content block.');
  }

  // Strip accidental markdown fencing (the prompt forbids it, but be defensive)
  const rawText = textBlock.text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (parseError) {
    throw new Error(
      `Claude response was not valid JSON. Parse error: ${(parseError as Error).message}. ` +
        `First 500 chars: ${rawText.slice(0, 500)}`
    );
  }

  return {
    lectureJson: parsed as LectureJSON,
    inputTokens,
    outputTokens,
    model,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Security: only callable server-to-server via shared secret ────────────
  const internalSecret = request.headers.get('x-internal-secret');
  if (internalSecret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized. This endpoint is internal only.' },
      { status: 401 }
    );
  }

  let body: GenerateRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { fileUrl, course, title, internalId, jobId, userId, fileSizeBytes } = body;

  if (!fileUrl || !course || !title || !internalId || !jobId || !userId) {
    return NextResponse.json(
      { error: 'Missing required fields: fileUrl, course, title, internalId, jobId, userId.' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const anthropic = getAnthropicClient();

  // ── Token pre-flight ───────────────────────────────────────────────────────
  const estimatedTokens = fileSizeBytes
    ? estimateTokensFromBytes(fileSizeBytes)
    : API_LIMITS.TOKEN_WARNING_THRESHOLD;

  if (estimatedTokens > API_LIMITS.TOKEN_HARD_LIMIT) {
    const msg =
      `File is too large to process (estimated ${estimatedTokens.toLocaleString()} tokens). ` +
      `Maximum is ${API_LIMITS.TOKEN_HARD_LIMIT.toLocaleString()} tokens. ` +
      `Consider splitting the lecture into smaller sections.`;
    await updateJobStatus(supabase, jobId, 'error', msg);
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // ── Rate limit checks ──────────────────────────────────────────────────────
  const rateLimitResult = await checkRateLimits(supabase, estimatedTokens);
  if (!rateLimitResult.allowed) {
    await updateJobStatus(supabase, jobId, 'error', rateLimitResult.reason);
    return NextResponse.json({ error: rateLimitResult.reason }, { status: 429 });
  }

  // ── Step 1: Fetch file from Supabase Storage ───────────────────────────────
  await updateJobStatus(supabase, jobId, 'converting');

  let fileBuffer: ArrayBuffer;
  try {
    fileBuffer = await fetchFileFromStorage(fileUrl);
  } catch (err) {
    const msg = `Failed to retrieve lecture file: ${(err as Error).message}`;
    await updateJobStatus(supabase, jobId, 'error', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const fileBase64 = arrayBufferToBase64(fileBuffer);
  const mimeType = getMimeType(fileUrl);

  // ── Step 2: Call Claude API with default model ─────────────────────────────
  await updateJobStatus(supabase, jobId, 'generating');

  let result: ClaudeCallResult;
  let firstAttemptValidationErrors: string[] = [];
  let usedFallback = false;

  try {
    result = await callClaudeAPI(
      anthropic,
      fileBase64,
      mimeType,
      internalId,
      course,
      title,
      API_LIMITS.MODEL_DEFAULT
    );

    const validation = validateLecture(result.lectureJson);

    if (!validation.valid) {
      firstAttemptValidationErrors = validation.errors;

      console.warn(
        `[generate] ${API_LIMITS.MODEL_DEFAULT} produced invalid JSON ` +
          `(${validation.errors.length} error(s)). Retrying with ${API_LIMITS.MODEL_FALLBACK}...`
      );

      // Track tokens from the failed first attempt
      await recordApiUsage(
        supabase,
        result.model,
        result.inputTokens,
        result.outputTokens,
        API_LIMITS.BATCH_API_ENABLED
      );

      // ── Step 2b: Retry with fallback model ──────────────────────────────
      usedFallback = true;
      const fallbackResult = await callClaudeAPI(
        anthropic,
        fileBase64,
        mimeType,
        internalId,
        course,
        title,
        API_LIMITS.MODEL_FALLBACK
      );

      const fallbackValidation = validateLecture(fallbackResult.lectureJson);
      if (!fallbackValidation.valid) {
        const errorSummary =
          `Both models produced invalid output. ` +
          `${API_LIMITS.MODEL_FALLBACK} errors: ${fallbackValidation.errors.slice(0, 5).join('; ')}`;

        await recordApiUsage(
          supabase,
          fallbackResult.model,
          fallbackResult.inputTokens,
          fallbackResult.outputTokens,
          API_LIMITS.BATCH_API_ENABLED
        );
        await updateJobStatus(supabase, jobId, 'error', errorSummary);
        return NextResponse.json({ error: errorSummary }, { status: 422 });
      }

      result = fallbackResult;
    }
  } catch (err) {
    const msg = `Claude API error: ${(err as Error).message}`;
    await updateJobStatus(supabase, jobId, 'error', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const lecture = result.lectureJson;

  // ── Step 3: Insert lecture into database ───────────────────────────────────
  const { error: insertError } = await supabase.from('lectures').insert({
    internal_id: internalId,
    original_file: fileUrl.split('/').pop() ?? '',
    title: lecture.title || title,
    subtitle: lecture.subtitle ?? '',
    course: lecture.course,
    color: lecture.color,
    icon: lecture.icon,
    topics: lecture.topics,
    slide_count: lecture.slideCount,
    json_data: lecture,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    const msg = `Database insert failed: ${insertError.message}`;
    await updateJobStatus(supabase, jobId, 'error', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── Step 4: Create default user_lecture_settings ───────────────────────────
  const { data: existingSettings } = await supabase
    .from('user_lecture_settings')
    .select('display_order')
    .eq('user_id', userId)
    .order('display_order', { ascending: false })
    .limit(1);

  const nextOrder =
    existingSettings && existingSettings.length > 0
      ? (existingSettings[0].display_order ?? 0) + 1
      : 1;

  const { error: settingsError } = await supabase.from('user_lecture_settings').insert({
    user_id: userId,
    internal_id: internalId,
    display_order: nextOrder,
    visible: true,
    archived: false,
    group_id: null,
    tags: [],
    course_override: null,
    color_override: null,
    custom_title: null,
  });

  if (settingsError) {
    // Non-fatal: lecture is saved, display order defaults gracefully
    console.error('[generate] user_lecture_settings insert failed:', settingsError.message);
  }

  // ── Step 5: Record API usage ───────────────────────────────────────────────
  await recordApiUsage(
    supabase,
    result.model,
    result.inputTokens,
    result.outputTokens,
    API_LIMITS.BATCH_API_ENABLED
  );

  // ── Step 6: Mark job complete ──────────────────────────────────────────────
  const finalCost = estimateCost(
    result.model,
    result.inputTokens,
    result.outputTokens,
    API_LIMITS.BATCH_API_ENABLED
  );

  await supabase
    .from('processing_jobs')
    .update({
      status: 'complete',
      internal_id: internalId,
      model_used: result.model,
      used_fallback: usedFallback,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      estimated_cost: finalCost,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  return NextResponse.json({
    success: true,
    internalId,
    model: result.model,
    usedFallback,
    flashcards: lecture.flashcards.length,
    questions: lecture.questions.length,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCost: finalCost,
    firstAttemptValidationErrors: usedFallback ? firstAttemptValidationErrors : [],
  });
}