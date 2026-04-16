/**
 * GET  /api/admin/config          → read system_config table
 * PUT  /api/admin/config          → upsert a config key { key, value }
 * POST /api/admin/config          → quick actions { action: 'clear_jobs' | 'rebuild_registry' }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  // Read config table
  const { data: configRows, error: configErr } = await supabase
    .from('system_config')
    .select('key, value, updated_at')
    .order('key');

  if (configErr) {
    // Table may not exist yet — return defaults
    return NextResponse.json({
      config: [],
      storageUsed: null,
      error: 'system_config table not found — run migration SQL',
    });
  }

  // Supabase Storage usage (bucket: 'slides')
  let storageUsed: number | null = null;
  try {
    const { data: storageData } = await supabase.storage.getBucket('slides');
    // getBucket doesn't return usage directly; we'll estimate from file listing
    storageUsed = null; // requires storage admin API
  } catch {}

  return NextResponse.json({ config: configRows ?? [], storageUsed });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const body = await req.json();
  const { key, value } = body as { key: string; value: unknown };

  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const { error } = await supabase
    .from('system_config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const body = await req.json();
  const { action } = body as { action: string };

  if (action === 'clear_jobs') {
    const { error } = await supabase.from('processing_jobs').delete().neq('id', '');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, message: 'All processing jobs cleared.' });
  }

  if (action === 'rebuild_registry') {
    // Ensure every lecture has a user_lecture_settings row for all users
    const { data: users } = await supabase.from('user_profiles').select('user_id');
    const { data: lectures } = await supabase.from('lectures').select('internal_id');
    if (!users || !lectures) return NextResponse.json({ ok: true, message: 'Nothing to rebuild.' });

    const inserts: any[] = [];
    for (const u of users) {
      for (const l of lectures) {
        inserts.push({
          user_id: u.user_id,
          internal_id: l.internal_id,
          display_order: 9999,
          visible: true,
          archived: false,
          tags: [],
        });
      }
    }

    // Upsert — won't overwrite existing settings
    const { error } = await supabase
      .from('user_lecture_settings')
      .upsert(inserts, { onConflict: 'user_id,internal_id', ignoreDuplicates: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, message: `Registry rebuilt: ${inserts.length} entries checked.` });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
