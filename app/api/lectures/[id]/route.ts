/**
 * GET  /api/lectures/[id]
 *   Returns full lecture detail: metadata + flashcards + questions,
 *   with user overrides merged in. Also returns per-card conflict flags.
 *
 * PUT  /api/lectures/[id]
 *   Updates USER-LEVEL metadata stored in user_lecture_settings:
 *   customTitle, subtitle is NOT settable here (it's global).
 *   User can update: customTitle, group_id (block assignment), tags.
 *
 * NOTE: Internal fields like internal_id, raw json_data, original_file
 * are intentionally NOT returned. Users see a safe, clean view only.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import crypto from 'crypto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

export function hashCard(card: object): string {
  return crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex').slice(0, 16);
}

// ─── GET /api/lectures/[id] ───────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch lecture (no json_data exposure — we only return clean arrays)
  const { data: lecture, error: lecErr } = await supabase
    .from('lectures')
    .select('internal_id, title, subtitle, course, color, icon, slide_count, created_at, json_data')
    .eq('internal_id', id)
    .single();

  if (lecErr || !lecture) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

  // Fetch user settings for this lecture
  const { data: settings } = await supabase
    .from('user_lecture_settings')
    .select('custom_title, tags, group_id, display_order, visible, archived, color_override, course_override')
    .eq('user_id', user.id)
    .eq('internal_id', id)
    .maybeSingle();

  // Fetch all user card overrides for this lecture
  const { data: overrides } = await supabase
    .from('user_card_overrides')
    .select('card_id, card_type, overrides, canonical_hash, updated_at')
    .eq('user_id', user.id)
    .eq('internal_id', id);

  const overrideMap = new Map<string, { overrides: any; canonical_hash: string; updated_at: string }>();
  for (const o of overrides ?? []) {
    overrideMap.set(o.card_id, { overrides: o.overrides, canonical_hash: o.canonical_hash, updated_at: o.updated_at });
  }

  // Merge flashcards
  const rawFlashcards: any[] = lecture.json_data?.flashcards ?? [];
  const flashcards = rawFlashcards.map(card => {
    const override = overrideMap.get(card.id);
    const currentHash = hashCard(card);
    const hasOverride = !!override;
    const hasConflict = hasOverride && override.canonical_hash !== currentHash;
    return {
      id: card.id,
      topic: card.topic ?? '',
      slideNumber: card.slide_number ?? card.slideNumber ?? null,
      // Merged: user overrides take precedence for question/answer
      question: override?.overrides?.question ?? card.question,
      answer: override?.overrides?.answer ?? card.answer,
      // Metadata for UI
      hasUserEdit: hasOverride,
      hasConflict,
      // If conflict: give UI the canonical version so user can compare
      canonical: hasConflict ? { question: card.question, answer: card.answer } : undefined,
      userEditedAt: override?.updated_at ?? null,
    };
  });

  // Merge exam questions
  const rawQuestions: any[] = lecture.json_data?.questions ?? [];
  const questions = rawQuestions.map(q => {
    const override = overrideMap.get(q.id);
    const currentHash = hashCard(q);
    const hasOverride = !!override;
    const hasConflict = hasOverride && override.canonical_hash !== currentHash;
    return {
      id: q.id,
      type: q.type ?? 'mcq',
      topic: q.topic ?? '',
      slideNumber: q.slide_number ?? q.slideNumber ?? null,
      question: override?.overrides?.question ?? q.question,
      correctAnswer: override?.overrides?.correct_answer ?? q.correct_answer,
      options: override?.overrides?.options ?? q.options ?? [],
      explanation: override?.overrides?.explanation ?? q.explanation ?? '',
      hasUserEdit: hasOverride,
      hasConflict,
      canonical: hasConflict
        ? { question: q.question, correctAnswer: q.correct_answer, options: q.options, explanation: q.explanation }
        : undefined,
      userEditedAt: override?.updated_at ?? null,
    };
  });

  return NextResponse.json({
    lecture: {
      // Safe fields only — no internal_id, no raw json_data
      id: lecture.internal_id,
      title: settings?.custom_title ?? lecture.title,
      subtitle: lecture.subtitle,
      course: settings?.course_override ?? lecture.course,
      color: settings?.color_override ?? lecture.color,
      icon: lecture.icon,
      slideCount: lecture.slide_count,
      createdAt: lecture.created_at,
      tags: settings?.tags ?? [],
      groupId: settings?.group_id ?? null,
      customTitle: settings?.custom_title ?? null,
    },
    flashcards,
    questions,
    conflictCount: [...flashcards, ...questions].filter(c => c.hasConflict).length,
  });
}

// ─── PUT /api/lectures/[id] ───────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Confirm lecture exists
  const { data: exists } = await supabase
    .from('lectures').select('internal_id').eq('internal_id', id).maybeSingle();
  if (!exists) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Only user-safe fields allowed
  const allowed = ['customTitle', 'groupId', 'tags'];
  const updates: Record<string, unknown> = {};
  if ('customTitle' in body) updates.custom_title = body.customTitle ?? null;
  if ('groupId'    in body) updates.group_id    = body.groupId ?? null;
  if ('tags'       in body) updates.tags        = Array.isArray(body.tags) ? body.tags : [];

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: `Updatable fields: ${allowed.join(', ')}` }, { status: 400 });

  const { error } = await supabase
    .from('user_lecture_settings')
    .upsert({ user_id: user.id, internal_id: id, ...updates }, { onConflict: 'user_id,internal_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
