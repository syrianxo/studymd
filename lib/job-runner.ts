/**
 * lib/job-runner.ts
 *
 * Extracts the per-job processing logic from /api/generate so it can be
 * called both inline (from the upload flow, fast-start) and from the
 * Vercel Cron orphan-recovery endpoint.
 *
 * Stage flow written to processing_jobs.status_detail:
 *   fetching_file → extracting_text → generating_flashcards →
 *   generating_questions → validating → saving → (complete | error)
 */

import type Anthropic from '@anthropic-ai/sdk';
import { toFile } from '@anthropic-ai/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  API_LIMITS,
  estimateCost,
  estimateTokensFromBytes,
  userIsAdmin,
  checkLimits,
  recordUserCall,
} from '@/lib/api-limits';
import {
  getAnthropicClient,
  STRUCTURED_OUTPUTS_ENABLED,
  FILES_API_ENABLED,
  FILES_API_BETA_HEADER,
} from '@/lib/anthropic-client';
import { buildSystemWithCache } from '@/lib/lecture-processor-prompt';
import { validateLecture } from '@/lib/validate-lecture';
import type { LectureJSON } from '@/lib/lecture-schema';
import { buildLectureOutputConfig } from '@/lib/lecture-schema';
import { extractPptxSlides, formatSlidesForClaude } from '@/lib/pptx-extractor';

// ─── Theme color palette ──────────────────────────────────────────────────────
// Mirrors the palette in the original /api/generate route so the cron path
// produces identical color assignments.
const PALETTE = [
  { midnight: '#5b8dee', pink: '#f472b6', forest: '#10b981' },
  { midnight: '#8b5cf6', pink: '#ec4899', forest: '#34d399' },
  { midnight: '#06b6d4', pink: '#db2777', forest: '#84cc16' },
  { midnight: '#10b981', pink: '#e879f9', forest: '#65a30d' },
  { midnight: '#f59e0b', pink: '#c084fc', forest: '#f59e0b' },
  { midnight: '#ef4444', pink: '#a855f7', forest: '#d97706' },
  { midnight: '#ec4899', pink: '#fb7185', forest: '#b45309' },
  { midnight: '#a855f7', pink: '#f43f5e', forest: '#78716c' },
];
function pickThemeColors(internalId: string): Record<string, string> {
  const hex = internalId.replace(/[^0-9a-f]/gi, '');
  const idx = hex.length ? parseInt(hex.slice(-2), 16) % PALETTE.length : 0;
  return PALETTE[idx];
}

// ─── Supabase admin client ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabaseAdmin(): SupabaseClient<any, 'public', any> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any, 'public', any>(url, key);
}

// ─── Per-model output token limits ───────────────────────────────────────────
// Keyed on the bare model IDs we pass to the API (see lib/api-limits.ts).
// Haiku raised above the default to handle dense lectures; Sonnet sized to
// give 40+ flashcard / 30+ question lectures room without hitting the
// hard ceiling on the fallback retry.
const MODEL_MAX_OUTPUT: Record<string, number> = {
  'claude-haiku-4-5':  16000,
  'claude-sonnet-4-6': 48000,
};

// ─── Progress helpers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateProgress(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  jobId: string,
  statusDetail: string,
  message: string,
  broadStatus?: 'converting' | 'generating'
) {
  const payload: Record<string, unknown> = {
    status_detail: statusDetail,
    status_message: message,
    heartbeat_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (broadStatus) payload.status = broadStatus;

  await supabase.from('processing_jobs').update(payload).eq('job_id', jobId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markJobError(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  jobId: string,
  errorMessage: string
) {
  await supabase.from('processing_jobs').update({
    status: 'error',
    status_detail: 'error',
    status_message: errorMessage,
    error_message: errorMessage,
    updated_at: new Date().toISOString(),
  }).eq('job_id', jobId);
}

// ─── File helpers ─────────────────────────────────────────────────────────────

/**
 * Download a file from a private Supabase Storage bucket using the service
 * role client. This intentionally does NOT use a signed URL — signed URL
 * fetches from Vercel serverless functions have been observed returning
 * 400 Bad Request even when the URL is valid (works fine from elsewhere).
 *
 * The supabase-js download() method hits `/storage/v1/object/<bucket>/<path>`
 * with `Authorization: Bearer <service-role-key>`, which is a different
 * code path on the Supabase side from `/storage/v1/object/sign/...?token=`
 * and does not have the same failure mode. It also avoids any
 * URL-encoding-of-JWT-in-query-string mangling that may occur in transit.
 */
async function downloadFileFromStorage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  bucket: string,
  path: string,
): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Failed to download file from ${bucket}/${path}: ${error?.message ?? 'no data returned'}`);
  }
  return data.arrayBuffer();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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
    console.error('[job-runner] increment_api_usage RPC failed, using fallback upsert:', error.message);
    await supabase.from('api_usage').upsert(
      { date: today, calls_count: 1, input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost: cost },
      { onConflict: 'date', ignoreDuplicates: false }
    );
  }
}


// ─── Output repair ───────────────────────────────────────────────────────────
// Fixes minor omissions that would otherwise trigger a Sonnet fallback.
// Only fills in fields that are structurally absent, never overwrites content.

function repairLectureOutput(lecture: LectureJSON): LectureJSON {
  return {
    ...lecture,
    questions: (lecture.questions ?? []).map((q) => ({
      ...q,
      // Fill in missing explanation — Haiku occasionally omits it on true_false/short_answer
      explanation: (q.explanation && q.explanation.trim())
        ? q.explanation
        : `The correct answer is: ${q.answer}.`,
    })),
  };
}

// ─── Claude API call ──────────────────────────────────────────────────────────

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
  anthropicFileId: string | null,
  internalId: string,
  course: string,
  title: string,
  model: string
): Promise<ClaudeCallResult> {
  // Branch on which path we'll use. Files API is a beta namespace + beta header;
  // otherwise stable messages.create with base64 or text.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userContent: any[] = [];

  if (anthropicFileId) {
    userContent.push({
      type: 'document',
      source: { type: 'file', file_id: anthropicFileId },
    });
  } else if (fileBase64) {
    userContent.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
    });
  } else if (slideText) {
    userContent.push({ type: 'text', text: slideText });
  } else {
    throw new Error('No file content provided to Claude — either fileBase64, slideText, or anthropicFileId must be set.');
  }

  userContent.push({
    type: 'text',
    text: `Process the above lecture content as lecture ${internalId} for course "${course}". Title: "${title}". Generate the full JSON output as specified in your system prompt.`,
  });

  // Shared params — cast to any so we can mix stable/beta shapes and the
  // output_config add-on without the TS union getting in the way.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model,
    max_tokens: MODEL_MAX_OUTPUT[model] ?? API_LIMITS.MAX_OUTPUT_TOKENS,
    system: buildSystemWithCache(),
    messages: [{ role: 'user', content: userContent }],
  };

  if (STRUCTURED_OUTPUTS_ENABLED) {
    Object.assign(params, buildLectureOutputConfig());
  }

  // Stream and resolve to a final Message. The SDK enforces streaming on
  // requests that may exceed the 10-minute timeout (which we regularly hit on
  // Sonnet fallback + max_tokens=32k for dense lectures); `.finalMessage()`
  // preserves the same shape we had under the non-streaming API.
  const stream = anthropicFileId
    ? client.beta.messages.stream(
        params,
        { headers: { 'anthropic-beta': FILES_API_BETA_HEADER } }
      )
    : client.messages.stream(params);
  const response = await stream.finalMessage();

  const inputTokens  = response.usage?.input_tokens  ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  if (response.stop_reason === 'max_tokens') {
    console.warn(`[job-runner] ${model} truncated at max_tokens — will trigger fallback`);
    return { lectureJson: { _truncated: true } as unknown as LectureJSON, inputTokens, outputTokens, model };
  }

  // Stable + beta content-block types diverge in the SDK; narrow to { type, text }
  // since that's the only shape we need.
  const textBlock = (response.content as Array<{ type: string; text?: string }>)
    .find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text' || !textBlock.text) {
    throw new Error('Claude returned no text content.');
  }

  const rawText = textBlock.text
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  const firstBrace = rawText.indexOf('{');
  const lastBrace  = rawText.lastIndexOf('}');
  const jsonStr = (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace)
    ? rawText.slice(firstBrace, lastBrace + 1) : rawText;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(
      `Response was not valid JSON. Error: ${(e as Error).message}. First 500 chars: ${jsonStr.slice(0, 500)}`
    );
  }

  const lectureJson = {
    ...(parsed as Record<string, unknown>),
    lecture_id: internalId, course, title,
  } as LectureJSON;

  return { lectureJson, inputTokens, outputTokens, model };
}

// ─── Job data type ────────────────────────────────────────────────────────────

export interface ProcessingJobData {
  job_id: string;
  user_id: string;
  storage_path: string;
  course: string;
  title: string;
  slide_count?: number;
  file_size_bytes?: number;
}

// ─── Main job runner ──────────────────────────────────────────────────────────

export interface RunJobOptions {
  /**
   * @deprecated Ignored. The runner now uses the service-role client's
   * `storage.download()` method directly against `job.storage_path`, so
   * pre-resolved URLs aren't needed (and signed-URL fetches were unreliable
   * from Vercel serverless functions). Kept on the type for backwards
   * compat — old callers can still pass it without breaking.
   */
  fileUrl?: string;
  /** Internal ID to assign to the lecture (passed from upload flow). */
  internalId?: string;
}

/**
 * runProcessingJob — processes a single job end-to-end.
 *
 * Can be called:
 * 1. Inline from /api/generate (fast path) — internalId is known.
 * 2. From the cron endpoint — job is fetched from processing_jobs.
 *
 * The file is always pulled via the service-role storage client's download()
 * method against `job.storage_path` — see downloadFileFromStorage() above.
 *
 * Returns a result object on success, throws on unrecoverable error.
 * Always writes final status to processing_jobs before returning/throwing.
 */
export async function runProcessingJob(
  jobId: string,
  runId: string,
  opts: RunJobOptions = {}
): Promise<{
  internalId: string;
  model: string;
  usedFallback: boolean;
  flashcards: number;
  questions: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  firstAttemptValidationErrors: string[];
}> {
  const supabase = getSupabaseAdmin();
  const anthropic = getAnthropicClient();

  // ── Claim the job atomically ───────────────────────────────────────────────
  const { data: claimed, error: claimError } = await supabase.rpc('claim_processing_job', {
    p_job_id: jobId,
    p_run_id: runId,
  });

  if (claimError) {
    throw new Error(`Failed to claim job ${jobId}: ${claimError.message}`);
  }
  if (!claimed) {
    throw new Error(`Job ${jobId} is already claimed or completed — skipping.`);
  }

  // ── Fetch job data ─────────────────────────────────────────────────────────
  const { data: job, error: jobFetchError } = await supabase
    .from('processing_jobs')
    .select('job_id, user_id, storage_path, course, title, slide_count, file_size_bytes, internal_id, anthropic_file_id')
    .eq('job_id', jobId)
    .single();

  if (jobFetchError || !job) {
    throw new Error(`Could not fetch job ${jobId}: ${jobFetchError?.message ?? 'not found'}`);
  }

  // Priority: caller-supplied (inline path) → DB-stored (cron path) → generated fallback.
  // Storing internal_id at job creation ensures the cron uses the same ID as
  // the slides already uploaded to slides/<internal_id>/ by the client.
  const internalId = opts.internalId ?? job.internal_id ?? `lec_${Date.now().toString(16)}`;
  const userId = job.user_id;

  // ── Token pre-flight ───────────────────────────────────────────────────────
  const estimatedTokens = job.file_size_bytes
    ? estimateTokensFromBytes(job.file_size_bytes)
    : API_LIMITS.TOKEN_WARNING_THRESHOLD;

  if (estimatedTokens > API_LIMITS.TOKEN_HARD_LIMIT) {
    const msg = `File too large (~${estimatedTokens.toLocaleString()} tokens). Max is ${API_LIMITS.TOKEN_HARD_LIMIT.toLocaleString()}.`;
    await markJobError(supabase, jobId, msg);
    throw new Error(msg);
  }

  // ── Rate limits (admin users bypass per-user caps; sanity cap still applies) ─
  const isAdmin = await userIsAdmin(userId);
  const rateCheck = await checkLimits(userId, { adminBypass: isAdmin });
  if (!rateCheck.allowed) {
    await markJobError(supabase, jobId, rateCheck.reason!);
    throw new Error(rateCheck.reason);
  }

  // ── Stage: fetch file ──────────────────────────────────────────────────────
  const storagePathLower = job.storage_path.toLowerCase();
  const isPptx = storagePathLower.endsWith('.pptx') || storagePathLower.endsWith('.ppt');
  let fileBase64: string | null = null;
  let slideText: string | null = null;
  let anthropicFileId: string | null = null;

  // Fast path — retry on a PDF that already has a Files API id: skip Supabase
  // fetch and the Files API re-upload entirely. PPTX always re-fetches because
  // we extract text from the buffer, not from a stored Anthropic file.
  const canReuseFileId = !isPptx && FILES_API_ENABLED && !!job.anthropic_file_id;

  if (canReuseFileId) {
    anthropicFileId = job.anthropic_file_id as string;
    await updateProgress(supabase, jobId, 'extracting_text', 'Reusing previously-uploaded file…', 'converting');
  } else {
    await updateProgress(supabase, jobId, 'fetching_file', 'Fetching lecture file…', 'converting');

    // Pull the file using the service-role client's download() method, which
    // hits the auth-header endpoint (not the signed-URL endpoint). See
    // downloadFileFromStorage() above for why we don't use signed URL fetch.
    let fileBuffer: ArrayBuffer;
    try {
      fileBuffer = await downloadFileFromStorage(supabase, 'uploads', job.storage_path);
    } catch (err) {
      const msg = `Could not retrieve lecture file: ${(err as Error).message}`;
      await markJobError(supabase, jobId, msg);
      throw new Error(msg);
    }

    if (isPptx) {
      await updateProgress(supabase, jobId, 'extracting_text', 'Extracting slide text…');
      try {
        const slides = await extractPptxSlides(fileBuffer);
        if (slides.length === 0) {
          const msg = 'No slide content could be extracted from the PPTX.';
          await markJobError(supabase, jobId, msg);
          throw new Error(msg);
        }
        slideText = formatSlidesForClaude(slides, job.title);
        if (slideText.length < 200) {
          const msg = `PPTX extraction produced almost no text (${slideText.length} chars). Please export as PDF.`;
          await markJobError(supabase, jobId, msg);
          throw new Error(msg);
        }
        await updateProgress(supabase, jobId, 'extracting_text', `Extracted ${slides.length} slides`);
      } catch (err) {
        if ((err as Error).message.includes('Could not retrieve') || (err as Error).message.includes('PPTX')) {
          throw err;
        }
        const msg = `PPTX text extraction failed: ${(err as Error).message}`;
        await markJobError(supabase, jobId, msg);
        throw new Error(msg);
      }
    } else {
      await updateProgress(supabase, jobId, 'extracting_text', 'Reading PDF content…');

      if (FILES_API_ENABLED) {
        // Upload once via the Files API so retries (Haiku → Sonnet fallback) and
        // admin reprocesses don't have to re-base64 and re-transmit the file.
        try {
          const uploaded = await anthropic.beta.files.upload(
            {
              file: await toFile(fileBuffer, 'lecture.pdf', { type: 'application/pdf' }),
            },
            { headers: { 'anthropic-beta': FILES_API_BETA_HEADER } },
          );
          anthropicFileId = uploaded.id;
          await supabase
            .from('processing_jobs')
            .update({ anthropic_file_id: anthropicFileId })
            .eq('job_id', jobId);
        } catch (err) {
          console.warn('[job-runner] Files API upload failed — falling back to base64:', (err as Error).message);
          fileBase64 = arrayBufferToBase64(fileBuffer);
        }
      } else {
        fileBase64 = arrayBufferToBase64(fileBuffer);
      }
    }
  }

  // ── Stage: generate flashcards ─────────────────────────────────────────────
  await updateProgress(supabase, jobId, 'generating_flashcards', 'Generating flashcards with Claude (Haiku 4.5)…', 'generating');

  let result: ClaudeCallResult;
  let firstAttemptErrors: string[] = [];
  let usedFallback = false;

  try {
    result = await callClaudeAPI(
      anthropic, fileBase64, slideText, anthropicFileId, internalId, job.course, job.title, API_LIMITS.MODEL_DEFAULT
    );

    await updateProgress(supabase, jobId, 'validating', 'Validating structured output…');

    // Detect truncation before repair/validate — a truncated response has no
    // usable content and will always fail with misleading "missing field" errors.
    const isTruncated = (result.lectureJson as unknown as Record<string, unknown>)._truncated === true;

    if (isTruncated) {
      firstAttemptErrors = ['Output was truncated (max_tokens reached).'];
      console.warn(`[job-runner] ${API_LIMITS.MODEL_DEFAULT} output truncated. Retrying with ${API_LIMITS.MODEL_FALLBACK}…`);
      await recordApiUsage(supabase, result.model, result.inputTokens, result.outputTokens, API_LIMITS.BATCH_API_ENABLED);
      await updateProgress(supabase, jobId, 'generating_questions', `Output too large for Haiku — retrying with ${API_LIMITS.MODEL_FALLBACK}…`);
      usedFallback = true;
      const fallback = await callClaudeAPI(
        anthropic, fileBase64, slideText, anthropicFileId, internalId, job.course, job.title, API_LIMITS.MODEL_FALLBACK
      );
      const fallbackTruncated = (fallback.lectureJson as unknown as Record<string, unknown>)._truncated === true;
      if (fallbackTruncated) {
        const msg = 'Lecture is too large to process — output exceeded the maximum token limit for both models. Try splitting the lecture into smaller sections.';
        await recordApiUsage(supabase, fallback.model, fallback.inputTokens, fallback.outputTokens, API_LIMITS.BATCH_API_ENABLED);
        await markJobError(supabase, jobId, msg);
        throw new Error(msg);
      }
      fallback.lectureJson = repairLectureOutput(fallback.lectureJson);
      const fallbackValidation = validateLecture(fallback.lectureJson);
      if (!fallbackValidation.valid) {
        // Both passed the not-truncated check above, so this is a content
        // failure — Sonnet generated something invalid even with full budget.
        const msg = `Sonnet output invalid after truncation retry. Errors: ${fallbackValidation.errors.slice(0, 5).join('; ')}`;
        await recordApiUsage(supabase, fallback.model, fallback.inputTokens, fallback.outputTokens, API_LIMITS.BATCH_API_ENABLED);
        await markJobError(supabase, jobId, msg);
        throw new Error(msg);
      }
      result = fallback;
    } else {
      // Repair minor omissions (e.g. missing explanation fields) before validating
      // so they don't needlessly trigger the Sonnet fallback.
      result.lectureJson = repairLectureOutput(result.lectureJson);

      const validation = validateLecture(result.lectureJson);
      if (!validation.valid) {
        firstAttemptErrors = validation.errors;
        console.warn(
          `[job-runner] ${API_LIMITS.MODEL_DEFAULT} validation failed (${validation.errors.length} errors). ` +
          `Retrying with ${API_LIMITS.MODEL_FALLBACK}…`
        );
        await recordApiUsage(supabase, result.model, result.inputTokens, result.outputTokens, API_LIMITS.BATCH_API_ENABLED);

        await updateProgress(supabase, jobId, 'generating_questions', `Retrying with ${API_LIMITS.MODEL_FALLBACK}…`);
        usedFallback = true;
        const fallback = await callClaudeAPI(
          anthropic, fileBase64, slideText, anthropicFileId, internalId, job.course, job.title, API_LIMITS.MODEL_FALLBACK
        );
        fallback.lectureJson = repairLectureOutput(fallback.lectureJson);
        const fallbackValidation = validateLecture(fallback.lectureJson);

        if (!fallbackValidation.valid) {
          const msg = `Both models produced invalid output. Errors: ${fallbackValidation.errors.slice(0, 5).join('; ')}`;
          await recordApiUsage(supabase, fallback.model, fallback.inputTokens, fallback.outputTokens, API_LIMITS.BATCH_API_ENABLED);
          await markJobError(supabase, jobId, msg);
          throw new Error(msg);
        }
        result = fallback;
      }
    }
  } catch (err) {
    const msg = (err as Error).message;
    // These prefixes indicate markJobError was already called — don't double-wrap.
    const alreadyHandled = ['Both models', 'Lecture is too large', 'Sonnet output invalid', 'Output exceeded'];
    if (!alreadyHandled.some((prefix) => msg.startsWith(prefix))) {
      const wrapped = `Claude API error: ${msg}`;
      await markJobError(supabase, jobId, wrapped);
      throw new Error(wrapped);
    }
    throw err;
  }

  const lecture = result.lectureJson;

  // ── Stage: save to database ────────────────────────────────────────────────
  await updateProgress(supabase, jobId, 'saving', 'Saving to your library…');

  const { error: insertError } = await supabase.from('lectures').insert({
    internal_id: internalId,
    title: lecture.title || job.title,
    subtitle: '',
    course: lecture.course,
    theme_colors: pickThemeColors(internalId),
    icon: '🩺',
    topics: lecture.topics,
    slide_count: job.slide_count ?? 0,
    json_data: lecture,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    const msg = `Database insert failed: ${insertError.message}`;
    await markJobError(supabase, jobId, msg);
    throw new Error(msg);
  }

  // Create default user_lecture_settings
  const { data: existingSettings } = await supabase
    .from('user_lecture_settings').select('display_order')
    .eq('user_id', userId).order('display_order', { ascending: false }).limit(1);

  const nextOrder = existingSettings?.length ? (existingSettings[0].display_order ?? 0) + 1 : 1;

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
    console.error('[job-runner] user_lecture_settings insert failed (non-fatal):', settingsError.message);
  }

  // ── Record usage and mark complete ─────────────────────────────────────────
  // recordUserCall: increment per-user successful lecture count ONLY here, after
  // confirmed DB insert. Failed attempts and Haiku→Sonnet retries don't count.
  await recordUserCall(userId);
  await recordApiUsage(supabase, result.model, result.inputTokens, result.outputTokens, API_LIMITS.BATCH_API_ENABLED);

  const finalCost = estimateCost(result.model, result.inputTokens, result.outputTokens, API_LIMITS.BATCH_API_ENABLED);

  await supabase.from('processing_jobs').update({
    status: 'complete',
    status_detail: 'complete',
    status_message: 'Lecture added to your library.',
    internal_id: internalId,
    model_used: result.model,
    used_fallback: usedFallback,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    estimated_cost: finalCost,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('job_id', jobId);

  return {
    internalId,
    model: result.model,
    usedFallback,
    flashcards: lecture.flashcards.length,
    questions: lecture.questions.length,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCost: finalCost,
    firstAttemptValidationErrors: usedFallback ? firstAttemptErrors : [],
  };
}
