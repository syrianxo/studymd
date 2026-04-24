/**
 * POST /api/lectures/[id]/flashcards
 * Adds a NEW flashcard to the lecture's json_data.
 * This is a USER action — it appends to the global json_data array.
 * (No separate user table — user-added cards become part of the lecture.)
 *
 * Requires: { front, back, topic }
 * Legacy `question`/`answer` keys are accepted for backward compatibility.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import crypto from 'crypto';

async function buildClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(c) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
      },
    }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const front = (body.front ?? body.question) as string | undefined;
  const back  = (body.back  ?? body.answer)   as string | undefined;
  const topic = body.topic as string | undefined;
  if (!front?.trim() || !back?.trim())
    return NextResponse.json({ error: 'front and back are required' }, { status: 400 });

  // Fetch current json_data
  const { data: lecture, error: lecErr } = await supabase
    .from('lectures').select('json_data').eq('internal_id', id).single();
  if (lecErr || !lecture) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

  const jsonData = lecture.json_data ?? {};
  const flashcards: any[] = jsonData.flashcards ?? [];

  const newCard = {
    id: 'fc_' + crypto.randomBytes(6).toString('hex'),
    front: front.trim(),
    back: back.trim(),
    topic: topic?.trim() ?? 'General',
    slide_number: body.slideNumber ?? null,
    added_by_user: user.id,
  };

  flashcards.push(newCard);

  const { error: updateErr } = await supabase
    .from('lectures')
    .update({ json_data: { ...jsonData, flashcards } })
    .eq('internal_id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, card: newCard });
}
