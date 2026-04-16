/**
 * PUT    /api/lectures/[id]/flashcards/[fcId]
 *   Saves a user override for a single flashcard.
 *   Stores in user_card_overrides — does NOT touch global json_data.
 *   Body: { question?, answer?, topic?, acceptCanonical? }
 *   If acceptCanonical=true: deletes the override (user accepts admin version).
 *
 * DELETE /api/lectures/[id]/flashcards/[fcId]
 *   Removes the user's override for this card (reverts to canonical).
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
  { params }: { params: Promise<{ id: string; fcId: string }> }
) {
  const { id, fcId } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Fetch canonical card
  const { data: lecture } = await supabase
    .from('lectures').select('json_data').eq('internal_id', id).single();
  if (!lecture) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

  const flashcards: any[] = lecture.json_data?.flashcards ?? [];
  const canonical = flashcards.find(f => f.id === fcId);
  if (!canonical) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  // Accept canonical: delete override
  if (body.acceptCanonical) {
    await supabase
      .from('user_card_overrides')
      .delete()
      .eq('user_id', user.id)
      .eq('internal_id', id)
      .eq('card_id', fcId);
    return NextResponse.json({ ok: true, accepted: true });
  }

  // Build override object — only store fields the user explicitly changed
  const overrides: Record<string, unknown> = {};
  if ('question' in body && body.question?.trim()) overrides.question = body.question.trim();
  if ('answer'   in body && body.answer?.trim())   overrides.answer   = body.answer.trim();
  if ('topic'    in body && body.topic?.trim())    overrides.topic    = body.topic.trim();

  if (Object.keys(overrides).length === 0)
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const canonicalHash = hashCard(canonical);

  const { error } = await supabase
    .from('user_card_overrides')
    .upsert(
      {
        user_id: user.id,
        internal_id: id,
        card_id: fcId,
        card_type: 'flashcard',
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
  { params }: { params: Promise<{ id: string; fcId: string }> }
) {
  const { id, fcId } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('user_card_overrides')
    .delete()
    .eq('user_id', user.id)
    .eq('internal_id', id)
    .eq('card_id', fcId)
    .eq('card_type', 'flashcard');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
