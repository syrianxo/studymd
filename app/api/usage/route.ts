/**
 * GET /api/usage
 * Returns Claude API usage stats. Admin-only.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { API_LIMITS } from '@/lib/api-limits';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';

  // Last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString().split('T')[0];

  const [{ data: todayRow }, { data: history }] = await Promise.all([
    supabase
      .from('api_usage')
      .select('calls_count, input_tokens, output_tokens, estimated_cost')
      .eq('date', today)
      .single(),
    supabase
      .from('api_usage')
      .select('date, calls_count, input_tokens, output_tokens, estimated_cost')
      .gte('date', since)
      .lte('date', today)
      .order('date', { ascending: true }),
  ]);

  const monthHistory = (history ?? []).filter((r: any) => r.date >= monthStart);
  const monthCost = monthHistory.reduce((s: number, r: any) => s + Number(r.estimated_cost ?? 0), 0);
  const monthCalls = monthHistory.reduce((s: number, r: any) => s + Number(r.calls_count ?? 0), 0);

  return NextResponse.json({
    today: {
      callsCount:    (todayRow as any)?.calls_count    ?? 0,
      inputTokens:   (todayRow as any)?.input_tokens   ?? 0,
      outputTokens:  (todayRow as any)?.output_tokens  ?? 0,
      estimatedCost: Number((todayRow as any)?.estimated_cost ?? 0),
    },
    monthToDate: {
      callsCount:    monthCalls,
      estimatedCost: Number(monthCost.toFixed(4)),
    },
    limits: {
      maxDailyCalls:       API_LIMITS.MAX_DAILY_CALLS,
      maxDailyInputTokens: API_LIMITS.MAX_DAILY_INPUT_TOKENS,
      maxMonthlyCostUsd:   API_LIMITS.MAX_MONTHLY_COST_USD,
    },
    history: (history ?? []).map((r: any) => ({
      date:          r.date,
      callsCount:    r.calls_count    ?? 0,
      inputTokens:   r.input_tokens   ?? 0,
      outputTokens:  r.output_tokens  ?? 0,
      estimatedCost: Number(r.estimated_cost ?? 0),
    })),
  });
}
