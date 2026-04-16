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

  const required = ['title', 'course', 'icon', 'color'];
  for (const f of required) {
    if (!lecture[f]) return NextResponse.json({ error: `Missing required field: ${f}` }, { status: 400 });
  }

  const internal_id = lecture.internal_id || genId();

  // Ensure unique
  const { data: existing } = await supabase.from('lectures').select('internal_id').eq('internal_id', internal_id).single();
  if (existing) return NextResponse.json({ error: `internal_id ${internal_id} already exists` }, { status: 409 });

  const row = {
    internal_id,
    title:         lecture.title,
    subtitle:      lecture.subtitle   ?? null,
    course:        lecture.course,
    color:         lecture.color,
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
