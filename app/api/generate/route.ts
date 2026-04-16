/**
 * POST /api/generate
 *
 * Accepts:  { fileUrl, course, title, internalId, jobId, userId, fileSizeBytes? }
 * Fetches the file from Supabase Storage, calls the Anthropic API to generate
 * structured lecture JSON, validates the result, and inserts it into the DB.
 *
 * Status flow written to processing_jobs:
 *   pending → converting → generating → complete | error
 *
 * Security: ANTHROPIC_API_KEY is server-side only. Never exposed to the client.
 * Protected by x-internal-secret header — only the upload handler can call this.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  API_LIMITS,
  estimateCost,
  estimateTokensFromBytes,
} from '@/lib/api-limits';
import { buildSystemWithCache } from '@/lib/lecture-processor-prompt';
import { validateLecture, type LectureJSON } from '@/lib/validate-lecture';
import { extractPptxSlides, formatSlidesForClaude } from '@/lib/pptx-extractor';

// ─── Supabase admin client ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSupabaseAdmin(): SupabaseClient<any, 'public', any> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any, 'public', any>(url, key);
}

// ─── Anthropic client ─────────────────────────────────────────────────────────
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY environment variable.');
  return new Anthropic({ apiKey });
}

// ─── Request body type ────────────────────────────────────────────────────────
interface GenerateRequestBody {
  fileUrl: string;
  course: string;
  title: string;
  internalId: string;
  jobId: string;
  userId: string;
  fileSizeBytes?: number;
  slideCount?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateJobStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  jobId: string,
  status: 'converting' | 'generating' | 'complete' | 'error',
  errorMessage?: string
) {
  // Build the payload as a plain object — SupabaseClient<any> accepts this fine.
  const payload = errorMessage
    ? { status, updated_at: new Date().toISOString(), error_message: errorMessage }
    : { status, updated_at: new Date().toISOString() };

  const { error } = await supabase
    .from('processing_jobs')
    .update(payload)
    .eq('job_id', jobId);

  if (error) {
    console.error(`[generate] Failed to update job ${jobId} to "${status}":`, error.message);
  }
}

async function fetchFileFromStorage(fileUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function getMimeType(
  fileUrl: string
): 'application/pdf' | 'application/vnd.openxmlformats-officedocument.presentationml.presentation' {
  return fileUrl.toLowerCase().includes('.pptx')
    ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    : 'application/pdf';
}

// ─── Usage tracking ───────────────────────────────────────────────────────────

async function recordApiUsage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  model: string,
  inputTokens: number,
  outputTokens: number,
  isBatch: boolean
) {
  const today = new Date().toISOString().split('T')[0];
  const cost = estimateCost(model, inputTokens, outputTokens, isBatch);

  const { error } = await supabase.rpc('increment_api_usage', {
    p_date: today,
    p_calls: 1,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost: cost,
  });

  if (error) {
    console.error('[generate] increment_api_usage RPC failed, using fallback upsert:', error.message);
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

async function checkRateLimits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  estimatedInputTokens: number
): Promise<{ allowed: boolean; reason?: string }> {
  const today = new Date().toISOString().split('T')[0];

  const { data: todayUsage } = await supabase
    .from('api_usage')
    .select('calls_count, input_tokens')
    .eq('date', today)
    .maybeSingle();

  if (todayUsage) {
    if (todayUsage.calls_count >= API_LIMITS.MAX_DAILY_CALLS) {
      return {
        allowed: false,
        reason: `Daily limit reached (${API_LIMITS.MAX_DAILY_CALLS} lectures/day). Try again tomorrow.`,
      };
    }
    if (todayUsage.input_tokens + estimatedInputTokens > API_LIMITS.MAX_DAILY_INPUT_TOKENS) {
      return { allowed: false, reason: `Daily token limit would be exceeded. Try again tomorrow.` };
    }
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: monthRows } = await supabase
    .from('api_usage')
    .select('estimated_cost')
    .gte('date', monthStart.toISOString().split('T')[0]);

  if (monthRows && monthRows.length > 0) {
    const monthTotal = monthRows.reduce(
      (sum: number, r: { estimated_cost?: number }) => sum + (r.estimated_cost ?? 0),
      0
    );
    if (monthTotal >= API_LIMITS.MAX_MONTHLY_COST_USD) {
      return {
        allowed: false,
        reason: `Monthly budget of $${API_LIMITS.MAX_MONTHLY_COST_USD.toFixed(2)} reached. Contact Khalid.`,
      };
    }
  }

  return { allowed: true };
}

// Per-model output token limits
const MODEL_MAX_OUTPUT: Record<string, number> = {
  'claude-haiku-4-5-20251001': 8000,
  'claude-sonnet-4-6':        16000,
};

interface ClaudeCallResult {
  lectureJson: LectureJSON;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

async function callClaudeAPI(
  client: Anthropic,
  fileBase64: string | null,
  slideText: string | null,
  internalId: string,
  course: string,
  title: string,
  model: string
): Promise<ClaudeCallResult> {
  // Build the user content — either a PDF document source or extracted text
  const userContent: Anthropic.MessageParam['content'] = [];

  if (fileBase64) {
    // PDF: send as a document source (Claude can extract text + layout natively)
    userContent.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: fileBase64,
      },
    } as Anthropic.DocumentBlockParam);
  } else if (slideText) {
    // PPTX (or any non-PDF): send extracted text as a text block
    userContent.push({
      type: 'text',
      text: slideText,
    });
  } else {
    throw new Error('No file content provided to Claude — either fileBase64 (PDF) or slideText (PPTX) must be set.');
  }

  userContent.push({
    type: 'text',
    text: `Process the above lecture content as lecture ${internalId} for course "${course}". Title: "${title}". Generate the full JSON output as specified in your system prompt.`,
  });

  const response = await client.messages.create({
    model,
    max_tokens: MODEL_MAX_OUTPUT[model] ?? API_LIMITS.MAX_OUTPUT_TOKENS,
    system: buildSystemWithCache(),
    messages: [{ role: 'user', content: userContent }],
  });

  const inputTokens  = response.usage?.input_tokens  ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  // If stop_reason is max_tokens, output was truncated — return invalid result
  // so the caller's validation step triggers the Sonnet fallback automatically
  if (response.stop_reason === 'max_tokens') {
    console.warn(`[generate] ${model} truncated at max_tokens — will trigger fallback`);
    return {
      lectureJson: { _truncated: true } as unknown as LectureJSON,
      inputTokens,
      outputTokens,
      model,
    };
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content.');
  }

  const rawText = textBlock.text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Extract the outermost JSON object — handles cases where Claude adds
  // commentary before or after the JSON despite being instructed not to
  const firstBrace = rawText.indexOf('{');
  const lastBrace  = rawText.lastIndexOf('}');
  const jsonStr = (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace)
    ? rawText.slice(firstBrace, lastBrace + 1)
    : rawText;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(
      `Response was not valid JSON. Error: ${(e as Error).message}. ` +
        `First 500 chars: ${jsonStr.slice(0, 500)}`
    );
  }

  // Inject known metadata — guarantees these fields are correct even if
  // Claude omits or mis-formats them
  const lectureJson = {
    ...(parsed as Record<string, unknown>),
    lecture_id: internalId,
    course,
    title,
  } as LectureJSON;

  return { lectureJson, inputTokens, outputTokens, model };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabaseAuth = getSupabaseAdmin();
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
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
      `File too large to process (~${estimatedTokens.toLocaleString()} tokens estimated). ` +
      `Max is ${API_LIMITS.TOKEN_HARD_LIMIT.toLocaleString()} tokens. Consider splitting the lecture.`;
    await updateJobStatus(supabase, jobId, 'error', msg);
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // ── Rate limits ────────────────────────────────────────────────────────────
  const rateCheck = await checkRateLimits(supabase, estimatedTokens);
  if (!rateCheck.allowed) {
    await updateJobStatus(supabase, jobId, 'error', rateCheck.reason);
    return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
  }

  // ── Step 1: Fetch file ─────────────────────────────────────────────────────
  await updateJobStatus(supabase, jobId, 'converting');

  let fileBuffer: ArrayBuffer;
  try {
    fileBuffer = await fetchFileFromStorage(fileUrl);
  } catch (err) {
    const msg = `Could not retrieve lecture file: ${(err as Error).message}`;
    await updateJobStatus(supabase, jobId, 'error', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const isPptx = fileUrl.toLowerCase().includes('.pptx') || fileUrl.toLowerCase().includes('.ppt');
  let fileBase64: string | null = null;
  let slideText: string | null = null;

  if (isPptx) {
    try {
      const slides = await extractPptxSlides(fileBuffer);
      if (slides.length === 0) {
        const msg = 'No slide content could be extracted from the PPTX. The file may be empty or corrupted.';
        await updateJobStatus(supabase, jobId, 'error', msg);
        return NextResponse.json({ error: msg }, { status: 422 });
      }
      slideText = formatSlidesForClaude(slides, title);
      const totalChars = slideText.length;
      console.log(`[generate] PPTX: extracted ${slides.length} slides (${totalChars} chars)`);
      if (totalChars < 200) {
        const msg = `PPTX extraction produced almost no text (${totalChars} chars across ${slides.length} slides). ` +
          'The file may use embedded images for text rather than actual text objects. ' +
          'Please export as PDF from PowerPoint/Keynote/Google Slides and re-upload.';
        await updateJobStatus(supabase, jobId, 'error', msg);
        return NextResponse.json({ error: msg }, { status: 422 });
      }
    } catch (err) {
      const msg = `PPTX text extraction failed: ${(err as Error).message}`;
      await updateJobStatus(supabase, jobId, 'error', msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } else {
    fileBase64 = arrayBufferToBase64(fileBuffer);
  }

  // ── Step 2: Call Claude (default model, with validation + fallback) ─────────
  await updateJobStatus(supabase, jobId, 'generating');

  let result: ClaudeCallResult;
  let firstAttemptErrors: string[] = [];
  let usedFallback = false;

  try {
    result = await callClaudeAPI(
      anthropic, fileBase64, slideText, internalId, course, title, API_LIMITS.MODEL_DEFAULT
    );

    const validation = validateLecture(result.lectureJson);
    if (!validation.valid) {
      firstAttemptErrors = validation.errors;
      console.warn(
        `[generate] ${API_LIMITS.MODEL_DEFAULT} validation failed ` +
          `(${validation.errors.length} errors). Retrying with ${API_LIMITS.MODEL_FALLBACK}...`
      );

      await recordApiUsage(
        supabase, result.model, result.inputTokens, result.outputTokens, API_LIMITS.BATCH_API_ENABLED
      );

      usedFallback = true;
      const fallback = await callClaudeAPI(
        anthropic, fileBase64, slideText, internalId, course, title, API_LIMITS.MODEL_FALLBACK
      );
      const fallbackValidation = validateLecture(fallback.lectureJson);

      if (!fallbackValidation.valid) {
        const msg =
          `Both models produced invalid output. ${API_LIMITS.MODEL_FALLBACK} errors: ` +
          fallbackValidation.errors.slice(0, 5).join('; ');
        await recordApiUsage(
          supabase, fallback.model, fallback.inputTokens, fallback.outputTokens, API_LIMITS.BATCH_API_ENABLED
        );
        await updateJobStatus(supabase, jobId, 'error', msg);
        return NextResponse.json({ error: msg }, { status: 422 });
      }

      result = fallback;
    }
  } catch (err) {
    const msg = `Claude API error: ${(err as Error).message}`;
    await updateJobStatus(supabase, jobId, 'error', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const lecture = result.lectureJson;

  // ── Step 3: Insert into lectures table ────────────────────────────────────
  const { error: insertError } = await supabase.from('lectures').insert({
    internal_id: internalId,
    title: lecture.title || title,
    subtitle: '',
    course: lecture.course,
    color: '#5b8dee',
    icon: '🩺',
    topics: lecture.topics,
    slide_count: body.slideCount ?? 0,
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
    console.error('[generate] user_lecture_settings insert failed (non-fatal):', settingsError.message);
  }

  // ── Step 5: Record API usage ───────────────────────────────────────────────
  await recordApiUsage(
    supabase, result.model, result.inputTokens, result.outputTokens, API_LIMITS.BATCH_API_ENABLED
  );

  // ── Step 6: Mark job complete ──────────────────────────────────────────────
  const finalCost = estimateCost(
    result.model, result.inputTokens, result.outputTokens, API_LIMITS.BATCH_API_ENABLED
  );

  await supabase.from('processing_jobs').update({
    status: 'complete',
    internal_id: internalId,
    model_used: result.model,
    used_fallback: usedFallback,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    estimated_cost: finalCost,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('job_id', jobId);

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
    firstAttemptValidationErrors: usedFallback ? firstAttemptErrors : [],
  });
}
