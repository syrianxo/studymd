/**
 * PUT /api/admin/lectures/card?id=xxx&type=flashcard|question&cardId=yyy
 * Updates a single flashcard or exam question inside json_data JSONB
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const url = new URL(req.url);
  const id     = url.searchParams.get('id');
  const type   = url.searchParams.get('type') as 'flashcard' | 'question';
  const cardId = url.searchParams.get('cardId');

  if (!id || !type || !cardId) return NextResponse.json({ error: 'id, type, cardId required' }, { status: 400 });
  if (type !== 'flashcard' && type !== 'question') return NextResponse.json({ error: 'type must be flashcard or question' }, { status: 400 });

  const { item } = await req.json();
  if (!item) return NextResponse.json({ error: 'item required' }, { status: 400 });

  // Fetch current json_data
  const { data: lecture, error: fetchErr } = await supabase
    .from('lectures').select('json_data').eq('internal_id', id).single();
  if (fetchErr || !lecture) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

  const jsonData = lecture.json_data ?? {};
  const arrayKey = type === 'flashcard' ? 'flashcards' : 'questions';
  const arr: any[] = jsonData[arrayKey] ?? [];

  const idx = arr.findIndex((x: any) => x.id === cardId);
  if (idx === -1) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  arr[idx] = { ...arr[idx], ...item, id: cardId };

  const { error: updateErr } = await supabase
    .from('lectures')
    .update({ json_data: { ...jsonData, [arrayKey]: arr } })
    .eq('internal_id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
