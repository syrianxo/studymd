/**
 * GET /api/admin/overview
 * Returns: total users, total lectures, API calls today, cost this month
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01'; // YYYY-MM-01

  const [
    { count: totalUsers },
    { count: totalLectures },
    { data: todayUsage },
    { data: monthUsage },
  ] = await Promise.all([
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('lectures').select('*', { count: 'exact', head: true }),
    supabase.from('api_usage').select('calls_count, estimated_cost').eq('date', today).single(),
    supabase.from('api_usage')
      .select('estimated_cost')
      .gte('date', monthStart)
      .lte('date', today),
  ]);

  const callsToday = (todayUsage as any)?.calls_count ?? 0;
  const costToday = (todayUsage as any)?.estimated_cost ?? 0;
  const costMonth = ((monthUsage ?? []) as any[])
    .reduce((sum: number, row: any) => sum + Number(row.estimated_cost ?? 0), 0);

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    totalLectures: totalLectures ?? 0,
    callsToday,
    costToday: Number(costToday),
    costMonth: Number(costMonth.toFixed(4)),
  });
}
