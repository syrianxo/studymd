/** GET /api/admin/overview — stats + recent activity for overview section */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';

  const [
    { count: totalUsers },
    { count: totalLectures },
    { data: todayUsage },
    { data: monthUsage },
    { data: recentApiCalls },
    { data: recentUploads },
    { data: recentProgress },
  ] = await Promise.all([
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('lectures').select('*', { count: 'exact', head: true }),
    supabase.from('api_usage').select('calls_count, estimated_cost').eq('date', today).single(),
    supabase.from('api_usage').select('estimated_cost').gte('date', monthStart).lte('date', today),
    // Recent API calls (last 5 days with activity)
    supabase.from('api_usage').select('date, calls_count, estimated_cost').order('date', { ascending: false }).limit(5),
    // Recent lecture uploads
    supabase.from('lectures').select('internal_id, title, created_at, original_file').order('created_at', { ascending: false }).limit(5),
    // Recent user progress updates
    supabase.from('user_progress')
      .select('user_id, internal_id, last_studied, lecture:lectures(title), profile:user_profiles(display_name, username)')
      .order('last_studied', { ascending: false })
      .limit(6),
  ]);

  const callsToday = (todayUsage as any)?.calls_count ?? 0;
  const costMonth = ((monthUsage ?? []) as any[]).reduce((s: number, r: any) => s + Number(r.estimated_cost ?? 0), 0);

  // Enrich recent uploads with job status
  const uploadsWithStatus = await Promise.all(
    (recentUploads ?? []).map(async (u: any) => {
      const { data: job } = await supabase
        .from('processing_jobs')
        .select('status')
        .eq('internal_id', u.internal_id)
        .single();
      return { ...u, status: (job as any)?.status ?? 'success' };
    })
  );

  // Format activity feed
  const recentActivity = (recentProgress ?? []).map((row: any) => ({
    user_name: (row.profile as any)?.display_name ?? (row.profile as any)?.username ?? 'User',
    action: 'studied',
    lecture_title: (row.lecture as any)?.title ?? row.internal_id,
    ts: row.last_studied,
  }));

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    totalLectures: totalLectures ?? 0,
    callsToday,
    costToday: Number((todayUsage as any)?.estimated_cost ?? 0),
    costMonth: Number(costMonth.toFixed(4)),
    recentApiCalls: recentApiCalls ?? [],
    recentUploads: uploadsWithStatus,
    recentActivity,
  });
}
