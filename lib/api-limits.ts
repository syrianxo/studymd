/**
 * StudyMD Claude API Cost Controls
 *
 * Single source of truth for all API limits and model selection.
 * Adjust these values to control daily/monthly spend.
 *
 * Pricing reference (April 2026):
 *   Haiku 4.5:   $1.00 / MTok input  |  $5.00 / MTok output
 *   Sonnet 4.6:  $3.00 / MTok input  | $15.00 / MTok output
 *   Batch API:   50% off either model (24-hour processing window)
 *   Cache write: 1.25x input cost (one-time per cache fill)
 *   Cache read:  0.10x input cost  (90% savings vs uncached)
 */

export const API_LIMITS = {
  // ── Daily hard caps ─────────────────────────────────────────────────────────
  /** Maximum lecture processing calls per calendar day (UTC). */
  MAX_DAILY_CALLS: 5,

  /** Maximum input tokens consumed per calendar day across all calls. */
  MAX_DAILY_INPUT_TOKENS: 500_000,

  /** Maximum output tokens consumed per calendar day across all calls. */
  MAX_DAILY_OUTPUT_TOKENS: 150_000,

  // ── Monthly hard cap ────────────────────────────────────────────────────────
  /** Hard monthly spend cap in USD. Processing is rejected once exceeded. */
  MAX_MONTHLY_COST_USD: 5.00,

  // ── Model selection ─────────────────────────────────────────────────────────
  /**
   * Default model for lecture processing.
   * Haiku 4.5 is 3x cheaper than Sonnet and sufficient for structured JSON output.
   */
  MODEL_DEFAULT: 'claude-haiku-4-5-20251001' as const,

  /**
   * Fallback model used when the default model produces JSON that fails validation.
   * Only triggered on a single retry — never used as the first attempt.
   */
  MODEL_FALLBACK: 'claude-sonnet-4-6' as const,

  // ── Generation parameters ───────────────────────────────────────────────────
  /**
   * Max tokens for the Claude response.
   * Haiku 4.5 max output: 8,192 tokens
   * Sonnet 4.6 max output: 64,000 tokens
   *
   * A dense lecture with 40+ flashcards + 30+ questions can exceed 8K tokens.
   * We set this to 8000 for Haiku (safe ceiling) and rely on the fallback to
   * Sonnet when Haiku's output is truncated/invalid. For very large lectures
   * Sonnet will be used automatically via the validation+fallback path.
   *
   * To always use Sonnet's higher limit, change MODEL_DEFAULT to MODEL_FALLBACK.
   */
  MAX_OUTPUT_TOKENS: 8000,

  // ── Batch API ───────────────────────────────────────────────────────────────
  /**
   * When true, use the Anthropic Batch API (50% cost reduction, 24-hour window).
   * Set to false for synchronous processing during development/testing.
   */
  BATCH_API_ENABLED: false,

  // ── Upload limits ───────────────────────────────────────────────────────────
  /** Maximum allowed file size for lecture uploads, in bytes. */
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50 MB

  /** Accepted MIME types for lecture file uploads. */
  ACCEPTED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ] as const,

  // ── Token pre-flight ────────────────────────────────────────────────────────
  /**
   * If estimated input tokens exceed this value, warn the user before processing.
   * Rough heuristic: see estimateTokensFromBytes() for PDF-aware logic.
   */
  TOKEN_WARNING_THRESHOLD: 200_000,

  /**
   * Hard reject if estimated input tokens exceed this value.
   * Prevents runaway costs from extremely large lecture files.
   */
  TOKEN_HARD_LIMIT: 400_000,
} as const;

// ─── Alias consumed by upload/route.ts ────────────────────────────────────────
/** @alias API_LIMITS.TOKEN_WARNING_THRESHOLD — used by upload route pre-flight check */
export const TOKEN_PREFLIGHT_LIMIT = API_LIMITS.TOKEN_WARNING_THRESHOLD;

// ─── Per-model pricing (USD per token) ───────────────────────────────────────

export const MODEL_PRICING: Record<string, { inputPerToken: number; outputPerToken: number }> = {
  'claude-haiku-4-5-20251001': {
    inputPerToken: 1.00 / 1_000_000,
    outputPerToken: 5.00 / 1_000_000,
  },
  'claude-sonnet-4-6': {
    inputPerToken: 3.00 / 1_000_000,
    outputPerToken: 15.00 / 1_000_000,
  },
};

// ─── Cost estimation helpers ──────────────────────────────────────────────────

/**
 * Estimates input token count from a file's byte size.
 *
 * PDFs contain compressed images, fonts, and binary metadata — the vast
 * majority of bytes are NOT text and don't become tokens. Claude's document
 * API extracts only the text layer. Empirically, a dense 50-slide lecture PDF
 * at ~5 MB produces ~20,000–40,000 input tokens, not the ~1.25M that bytes/4
 * would suggest.
 *
 * We use bytes / 150 as a conservative PDF estimate, with a floor of 5,000
 * tokens (tiny files) and a ceiling of 180,000 (very large decks).
 */
export function estimateTokensFromBytes(bytes: number): number {
  const raw = Math.ceil(bytes / 150);
  return Math.min(Math.max(raw, 5_000), 180_000);
}

/**
 * @alias estimateTokensFromBytes — used by upload/route.ts
 */
export function estimateTokens(bytes: number): number {
  return estimateTokensFromBytes(bytes);
}

/**
 * Calculates the estimated cost of a single API call.
 *
 * Overload 1 (generate route): estimateCost(model, inputTokens, outputTokens, isBatch?)
 * Overload 2 (upload route):   estimateCost(fileSizeBytes) — rough pre-upload estimate
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number, isBatch?: boolean): number;
export function estimateCost(fileSizeBytes: number): number;
export function estimateCost(
  modelOrBytes: string | number,
  inputTokens?: number,
  outputTokens?: number,
  isBatch = false
): number {
  // Overload 2: called with a single number (file size bytes) by upload/route.ts
  if (typeof modelOrBytes === 'number') {
    const estInput = estimateTokensFromBytes(modelOrBytes);
    const estOutput = 15_000; // conservative output estimate
    const pricing = MODEL_PRICING[API_LIMITS.MODEL_DEFAULT];
    return estInput * pricing.inputPerToken + estOutput * pricing.outputPerToken;
  }

  // Overload 1: full cost calculation with known token counts
  const pricing = MODEL_PRICING[modelOrBytes];
  if (!pricing) return 0;

  const batchMultiplier = isBatch ? 0.5 : 1.0;
  return (
    (inputTokens ?? 0) * pricing.inputPerToken * batchMultiplier +
    (outputTokens ?? 0) * pricing.outputPerToken * batchMultiplier
  );
}

// ─── Rate limit checker (used by upload/route.ts) ────────────────────────────

import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createClient(url, key);
}

export interface LimitsCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Checks daily call count and monthly cost caps before allowing a new processing job.
 * Called by upload/route.ts before creating a processing_jobs row.
 */
export async function checkLimits(_userId: string): Promise<LimitsCheckResult> {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().split('T')[0];

  // Daily call cap
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
  }

  // Monthly cost cap
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartStr = monthStart.toISOString().split('T')[0];

  const { data: monthRows } = await supabase
    .from('api_usage')
    .select('estimated_cost')
    .gte('date', monthStartStr);

  if (monthRows && monthRows.length > 0) {
    const monthTotal = monthRows.reduce((sum, row) => sum + (row.estimated_cost ?? 0), 0);
    if (monthTotal >= API_LIMITS.MAX_MONTHLY_COST_USD) {
      return {
        allowed: false,
        reason: `Monthly API budget of $${API_LIMITS.MAX_MONTHLY_COST_USD.toFixed(2)} has been reached. Contact Khalid.`,
      };
    }
  }

  return { allowed: true };
}
