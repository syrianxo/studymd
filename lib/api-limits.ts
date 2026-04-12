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
  /** Max tokens for the Claude response. 16384 handles large lecture JSON output. */
  MAX_OUTPUT_TOKENS: 16384,

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
   * Rough heuristic: file bytes / 4 ≈ tokens.
   */
  TOKEN_WARNING_THRESHOLD: 200_000,

  /**
   * Hard reject if estimated input tokens exceed this value.
   * Prevents runaway costs from extremely large lecture files.
   */
  TOKEN_HARD_LIMIT: 400_000,
} as const;

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
 * Rule of thumb: 1 token ≈ 4 bytes of text. Conservative (actual may be lower).
 */
export function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(bytes / 4);
}

/**
 * Calculates the estimated cost of a single API call.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  isBatch = false
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const batchMultiplier = isBatch ? 0.5 : 1.0;
  const inputCost = inputTokens * pricing.inputPerToken * batchMultiplier;
  const outputCost = outputTokens * pricing.outputPerToken * batchMultiplier;
  return inputCost + outputCost;
}