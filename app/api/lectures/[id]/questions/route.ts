/**
 * POST /api/lectures/[id]/questions
 * Adds a new exam question to the lecture's json_data.
 * Requires: { question, correctAnswer, type }
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

const VALID_TYPES = ['mcq', 'tf', 'matching', 'fillin'];

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

  const { question, correctAnswer, type = 'mcq', topic, options, explanation } = body;
  if (!question?.trim() || !correctAnswer?.trim())
    return NextResponse.json({ error: 'question and correctAnswer are required' }, { status: 400 });
  if (!VALID_TYPES.includes(type))
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });

  const { data: lecture, error: lecErr } = await supabase
    .from('lectures').select('json_data').eq('internal_id', id).single();
  if (lecErr || !lecture) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

  const jsonData = lecture.json_data ?? {};
  const questions: any[] = jsonData.questions ?? [];

  const newQuestion = {
    id: 'q_' + crypto.randomBytes(6).toString('hex'),
    type,
    question: question.trim(),
    correct_answer: correctAnswer.trim(),
    topic: topic?.trim() ?? 'General',
    options: options ?? [],
    explanation: explanation?.trim() ?? '',
    slide_number: body.slideNumber ?? null,
    added_by_user: user.id,
  };

  questions.push(newQuestion);

  const { error: updateErr } = await supabase
    .from('lectures')
    .update({ json_data: { ...jsonData, questions } })
    .eq('internal_id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, question: newQuestion });
}
