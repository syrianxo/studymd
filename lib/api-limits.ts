import { createClient } from '@supabase/supabase-js';

// ─── Cost & Rate Controls ──────────────────────────────────────────────────
export const API_LIMITS = {
  MAX_DAILY_CALLS: 5,
  MAX_DAILY_INPUT_TOKENS: 500_000,
  MAX_MONTHLY_COST_USD: 5.00,
  MODEL_DEFAULT: 'claude-haiku-4-5-20251001' as const,
  BATCH_API_ENABLED: true,

  // Haiku pricing (per million tokens, as of 2025)
  INPUT_COST_PER_MILLION: 0.80,   // $0.80 / 1M input tokens
  OUTPUT_COST_PER_MILLION: 4.00,  // $4.00 / 1M output tokens

  // File processing assumptions
  CHARS_PER_TOKEN: 4,
  // Estimated output tokens per page of content generated
  OUTPUT_TOKENS_PER_PAGE: 400,
  // Average chars per PDF/PPTX page
  AVG_CHARS_PER_PAGE: 3000,
  // Bytes per page (rough estimate for size-based calculation)
  AVG_BYTES_PER_PAGE: 50_000,
} as const;

// ─── Token Pre-flight Threshold ────────────────────────────────────────────
export const TOKEN_PREFLIGHT_LIMIT = 200_000;

// ─── Cost Estimation ───────────────────────────────────────────────────────
/**
 * Estimates USD processing cost from file size.
 * Uses file size → page count → token count → cost.
 */
export function estimateCost(fileSizeBytes: number): number {
  const estimatedPages = Math.max(1, Math.ceil(fileSizeBytes / API_LIMITS.AVG_BYTES_PER_PAGE));

  const inputChars = estimatedPages * API_LIMITS.AVG_CHARS_PER_PAGE;
  const inputTokens = inputChars / API_LIMITS.CHARS_PER_TOKEN;
  const outputTokens = estimatedPages * API_LIMITS.OUTPUT_TOKENS_PER_PAGE;

  const inputCost = (inputTokens / 1_000_000) * API_LIMITS.INPUT_COST_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * API_LIMITS.OUTPUT_COST_PER_MILLION;

  return Math.round((inputCost + outputCost) * 100) / 100; // round to cents
}

/**
 * Estimates cost from raw character count (used after text extraction).
 */
export function estimateCostFromChars(charCount: number): number {
  const inputTokens = charCount / API_LIMITS.CHARS_PER_TOKEN;
  // Assume ~1 output token per 5 input tokens for summarization workloads
  const outputTokens = inputTokens * 0.2;

  const inputCost = (inputTokens / 1_000_000) * API_LIMITS.INPUT_COST_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * API_LIMITS.OUTPUT_COST_PER_MILLION;

  return Math.round((inputCost + outputCost) * 100) / 100;
}

/**
 * Estimates token count from character count.
 */
export function estimateTokens(charCount: number): number {
  return Math.ceil(charCount / API_LIMITS.CHARS_PER_TOKEN);
}

// ─── Usage Limit Check ─────────────────────────────────────────────────────
export interface LimitsCheckResult {
  allowed: boolean;
  reason?: string;
  usage?: {
    dailyCalls: number;
    dailyInputTokens: number;
    monthlySpendUSD: number;
  };
}

/**
 * Queries api_usage table and returns whether the user/system is within limits.
 * Checks: daily call count, daily input tokens, monthly cost.
 */
export async function checkLimits(userId?: string): Promise<LimitsCheckResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase env vars missing — skipping limits check');
    return { allowed: true };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  try {
    // Build query — filter by user if provided
    let dailyQuery = supabase
      .from('api_usage')
      .select('input_tokens, output_tokens, cost_usd, created_at')
      .gte('created_at', startOfDay);

    let monthlyQuery = supabase
      .from('api_usage')
      .select('cost_usd')
      .gte('created_at', startOfMonth);

    if (userId) {
      dailyQuery = dailyQuery.eq('user_id', userId);
      monthlyQuery = monthlyQuery.eq('user_id', userId);
    }

    const [dailyResult, monthlyResult] = await Promise.all([
      dailyQuery,
      monthlyQuery,
    ]);

    if (dailyResult.error) throw dailyResult.error;
    if (monthlyResult.error) throw monthlyResult.error;

    const dailyCalls = dailyResult.data?.length ?? 0;
    const dailyInputTokens = dailyResult.data?.reduce((sum, r) => sum + (r.input_tokens ?? 0), 0) ?? 0;
    const monthlySpendUSD = monthlyResult.data?.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0) ?? 0;

    const usage = { dailyCalls, dailyInputTokens, monthlySpendUSD };

    if (dailyCalls >= API_LIMITS.MAX_DAILY_CALLS) {
      return {
        allowed: false,
        reason: `Daily call limit reached (${dailyCalls}/${API_LIMITS.MAX_DAILY_CALLS}). Try again tomorrow.`,
        usage,
      };
    }

    if (dailyInputTokens >= API_LIMITS.MAX_DAILY_INPUT_TOKENS) {
      return {
        allowed: false,
        reason: `Daily token limit reached (${dailyInputTokens.toLocaleString()}/${API_LIMITS.MAX_DAILY_INPUT_TOKENS.toLocaleString()} tokens).`,
        usage,
      };
    }

    if (monthlySpendUSD >= API_LIMITS.MAX_MONTHLY_COST_USD) {
      return {
        allowed: false,
        reason: `Monthly budget of $${API_LIMITS.MAX_MONTHLY_COST_USD.toFixed(2)} reached. Budget resets next month.`,
        usage,
      };
    }

    return { allowed: true, usage };
  } catch (err) {
    console.error('checkLimits error:', err);
    // Fail open with a warning — don't block uploads on DB errors
    return { allowed: true };
  }
}
