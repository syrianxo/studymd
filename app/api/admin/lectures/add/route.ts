/**
 * POST /api/admin/lectures/add
 * Adds a new lecture from a JSON payload. auto-generates internal_id if omitted.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

function genId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return 'lec_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { lecture } = await req.json();
  if (!lecture) return NextResponse.json({ error: 'lecture payload required' }, { status: 400 });

  const required = ['title', 'course', 'icon'];
  for (const f of required) {
    if (!lecture[f]) return NextResponse.json({ error: `Missing required field: ${f}` }, { status: 400 });
  }

  const internal_id = lecture.internal_id || genId();

  // Ensure unique
  const { data: existing } = await supabase.from('lectures').select('internal_id').eq('internal_id', internal_id).single();
  if (existing) return NextResponse.json({ error: `internal_id ${internal_id} already exists` }, { status: 409 });

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
  const hex = internal_id.replace(/[^0-9a-f]/gi, '');
  const paletteIdx = hex.length ? parseInt(hex.slice(-2), 16) % PALETTE.length : 0;
  const theme_colors = lecture.theme_colors ?? PALETTE[paletteIdx];

  const row = {
    internal_id,
    title:         lecture.title,
    subtitle:      lecture.subtitle   ?? null,
    course:        lecture.course,
    theme_colors,
    icon:          lecture.icon,
    topics:        lecture.topics     ?? [],
    slide_count:   lecture.slide_count ?? 0,
    original_file: lecture.original_file ?? null,
    json_data:     lecture.json_data  ?? { flashcards: [], questions: [] },
  };

  const { error } = await supabase.from('lectures').insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Seed user_lecture_settings for all existing users
  const { data: users } = await supabase.from('user_profiles').select('user_id');
  if (users && users.length > 0) {
    const settings = users.map((u: any, i: number) => ({
      user_id: u.user_id, internal_id, display_order: 9999,
      visible: true, archived: false, tags: [],
    }));
    await supabase.from('user_lecture_settings').upsert(settings, { onConflict: 'user_id,internal_id', ignoreDuplicates: true });
  }

  return NextResponse.json({ ok: true, internal_id });
}
