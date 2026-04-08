/**
 * StudyMD — Claude API Cost Controls
 *
 * All API budget limits live here. Edit these numbers to adjust caps.
 * Hard limits are enforced server-side in /api/generate before every call.
 *
 * Pricing reference (April 2026):
 *   Haiku 4.5    $1.00 input / $5.00 output per MTok
 *   Sonnet 4.6   $3.00 input / $15.00 output per MTok
 *   Batch API    50% off all models
 *   Prompt cache 90% off cached input tokens
 */

export const API_LIMITS = {
  // ── Daily caps ─────────────────────────────────────────────────────────────
  /** Maximum lecture-processing API calls per calendar day (UTC). */
  MAX_DAILY_CALLS: 5,

  /** Maximum input tokens consumed per calendar day across all calls. */
  MAX_DAILY_INPUT_TOKENS: 500_000, // ~3 large lectures

  // ── Monthly cap ────────────────────────────────────────────────────────────
  /** Hard monthly spend ceiling in USD. Resets on the 1st of each month. */
  MAX_MONTHLY_COST_USD: 5.0,

  // ── Model selection ────────────────────────────────────────────────────────
  /** Primary model — cheapest option; used for all first attempts. */
  MODEL_DEFAULT: "claude-haiku-4-5-20251001" as const,

  /** Fallback model — used only if Haiku output fails schema validation. */
  MODEL_FALLBACK: "claude-sonnet-4-6" as const,

  // ── Batch API ──────────────────────────────────────────────────────────────
  /**
   * When true, all lecture-processing calls use the Batch API (50% discount).
   * Trade-off: results arrive within 24 hours instead of immediately.
   * Set to false for instant processing (e.g., during development / testing).
   */
  BATCH_API_ENABLED: true,

  // ── Prompt caching ─────────────────────────────────────────────────────────
  /**
   * When true, the system prompt is sent with cache_control: { type: "ephemeral" }.
   * First call pays 1.25× for cache write; subsequent calls pay 0.10× on that input.
   * Disable only for debugging — always keep on in production.
   */
  PROMPT_CACHING_ENABLED: true,

  // ── Pre-flight token estimation ─────────────────────────────────────────────
  /**
   * Rough chars-per-token ratio used to estimate input tokens from file text.
   * Claude typically encodes ~4 characters per token for English prose.
   */
  CHARS_PER_TOKEN: 4,

  /**
   * If estimated input tokens exceed this threshold, warn the user and
   * suggest splitting the file before continuing.
   */
  MAX_INPUT_TOKENS_WARN: 200_000,

  // ── File upload limits ─────────────────────────────────────────────────────
  /** Maximum upload file size in bytes (50 MB). */
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,

  /** Accepted MIME types for lecture uploads. */
  ALLOWED_MIME_TYPES: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ] as const,
} as const;

// ── Per-model pricing (USD per million tokens) ─────────────────────────────
// Used by the usage-tracking logic to compute estimated_cost per call.

export const MODEL_PRICING: Record<
  string,
  { inputPerMTok: number; outputPerMTok: number }
> = {
  "claude-haiku-4-5-20251001": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  "claude-sonnet-4-6": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
};

/**
 * Compute the estimated USD cost for a single API call.
 * Pass batchDiscount=true to apply the 50% Batch API reduction.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  batchDiscount = false
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const factor = batchDiscount ? 0.5 : 1.0;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok * factor;
  const outputCost =
    (outputTokens / 1_000_000) * pricing.outputPerMTok * factor;
  return inputCost + outputCost;
}

export type AllowedModel =
  (typeof API_LIMITS)["MODEL_DEFAULT"] | (typeof API_LIMITS)["MODEL_FALLBACK"];
