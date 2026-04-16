/**
 * PUT    /api/lectures/[id]/questions/[qId]
 *   Saves a user override for a single exam question.
 *   Body: { question?, correctAnswer?, explanation?, acceptCanonical? }
 *   acceptCanonical=true → deletes override (accept admin version).
 *
 * DELETE /api/lectures/[id]/questions/[qId]
 *   Removes the user override — reverts to canonical.
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

function hashCard(card: object): string {
  return crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex').slice(0, 16);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; qId: string }> }
) {
  const { id, qId } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { data: lecture } = await supabase
    .from('lectures').select('json_data').eq('internal_id', id).single();
  if (!lecture) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

  const questions: any[] = lecture.json_data?.questions ?? [];
  const canonical = questions.find(q => q.id === qId);
  if (!canonical) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  if (body.acceptCanonical) {
    await supabase
      .from('user_card_overrides')
      .delete()
      .eq('user_id', user.id)
      .eq('internal_id', id)
      .eq('card_id', qId);
    return NextResponse.json({ ok: true, accepted: true });
  }

  const overrides: Record<string, unknown> = {};
  if ('question'      in body && body.question?.trim())      overrides.question       = body.question.trim();
  if ('correctAnswer' in body && body.correctAnswer?.trim()) overrides.correct_answer = body.correctAnswer.trim();
  if ('explanation'   in body)                               overrides.explanation    = body.explanation?.trim() ?? '';
  if ('topic'         in body && body.topic?.trim())         overrides.topic          = body.topic.trim();

  if (Object.keys(overrides).length === 0)
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const canonicalHash = hashCard(canonical);

  const { error } = await supabase
    .from('user_card_overrides')
    .upsert(
      {
        user_id: user.id,
        internal_id: id,
        card_id: qId,
        card_type: 'question',
        overrides,
        canonical_hash: canonicalHash,
      },
      { onConflict: 'user_id,internal_id,card_id' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; qId: string }> }
) {
  const { id, qId } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('user_card_overrides')
    .delete()
    .eq('user_id', user.id)
    .eq('internal_id', id)
    .eq('card_id', qId)
    .eq('card_type', 'question');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
