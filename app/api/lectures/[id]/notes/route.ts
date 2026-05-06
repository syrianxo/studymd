/**
 * GET  /api/lectures/[id]/notes — list all notes the user has saved for a lecture.
 * PUT  /api/lectures/[id]/notes — upsert a single slide note.
 *   Body: { slide_number: number, body: string }
 *   An empty body string deletes the row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function buildClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(c) {
          try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('student_notes')
    .select('slide_number, body, updated_at')
    .eq('user_id', user.id)
    .eq('internal_id', id)
    .order('slide_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data ?? [] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { slide_number?: number; body?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slideNumber = Number(body.slide_number);
  if (!Number.isInteger(slideNumber) || slideNumber < 1) {
    return NextResponse.json({ error: 'slide_number must be a positive integer' }, { status: 400 });
  }

  const noteBody = (body.body ?? '').trim();

  if (noteBody.length === 0) {
    const { error } = await supabase
      .from('student_notes')
      .delete()
      .eq('user_id', user.id)
      .eq('internal_id', id)
      .eq('slide_number', slideNumber);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { error } = await supabase
    .from('student_notes')
    .upsert(
      {
        user_id: user.id,
        internal_id: id,
        slide_number: slideNumber,
        body: noteBody,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,internal_id,slide_number' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
