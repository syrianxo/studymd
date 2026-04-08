/**
 * GET /api/usage
 *
 * Returns Claude API usage statistics. Admin-only.
 *
 * Workstream 4 will implement the full handler:
 *   - Validate auth + admin check (Haley only, or a separate admin role)
 *   - Query api_usage table:
 *     - Today's calls, input tokens, output tokens, estimated cost
 *     - Month-to-date totals
 *     - Last 30 days of daily rows
 *   - Return structured usage object
 *
 * Response shape:
 * {
 *   today: {
 *     callsCount: number
 *     inputTokens: number
 *     outputTokens: number
 *     estimatedCost: number
 *   }
 *   monthToDate: {
 *     callsCount: number
 *     estimatedCost: number
 *   }
 *   limits: {
 *     maxDailyCalls: number
 *     maxDailyInputTokens: number
 *     maxMonthlyCostUsd: number
 *   }
 *   history: Array<{
 *     date: string
 *     callsCount: number
 *     inputTokens: number
 *     outputTokens: number
 *     estimatedCost: number
 *   }>
 * }
 */
import { NextResponse } from "next/server";
import { API_LIMITS } from "@/lib/api-limits";

export async function GET() {
  // TODO (Workstream 4): implement usage stats query
  return NextResponse.json(
    {
      error: "Not yet implemented — see Workstream 4",
      limits: {
        maxDailyCalls: API_LIMITS.MAX_DAILY_CALLS,
        maxDailyInputTokens: API_LIMITS.MAX_DAILY_INPUT_TOKENS,
        maxMonthlyCostUsd: API_LIMITS.MAX_MONTHLY_COST_USD,
      },
    },
    { status: 501 }
  );
}
