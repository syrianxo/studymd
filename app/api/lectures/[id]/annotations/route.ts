/**
 * GET  /api/lectures/[id]/annotations  — return all stored annotations for a lecture
 * POST /api/lectures/[id]/annotations  — generate + store annotations for given slides
 *
 * POST body: { slideNumbers?: number[], slideImageUrls: Record<number, string> }
 *   slideNumbers: which slides to annotate (omit to annotate all provided URLs)
 *   slideImageUrls: map of slide_number → public URL (fetched from Supabase Storage)
 *
 * Skips slides that already have an annotation. Records usage via increment_api_usage.
 * Cost-gated via checkLimits; admin users get bypass.
 */

import { NextRequest, NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { checkLimits, userIsAdmin, estimateCost, API_LIMITS } from '@/lib/api-limits';
import { getAnthropicClient } from '@/lib/anthropic-client';
import { buildAnnotationSystem, buildAnnotationUserPrompt } from '@/lib/slide-annotation-prompt';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildUserClient() {
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

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any, 'public', any>(url, key);
}

// ─── GET — list annotations ───────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await buildUserClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('slide_annotations')
    .select('slide_number, body, model_used, generated_at')
    .eq('internal_id', id)
    .order('slide_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ annotations: data ?? [] });
}

// ─── POST — generate annotations ─────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await buildUserClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { slideNumbers?: number[]; slideImageUrls: Record<string, string> };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { slideImageUrls } = body;
  if (!slideImageUrls || typeof slideImageUrls !== 'object') {
    return NextResponse.json({ error: 'slideImageUrls is required' }, { status: 400 });
  }

  // Resolve which slides to annotate
  const allSlideNumbers = Object.keys(slideImageUrls).map(Number).sort((a, b) => a - b);
  const targetSlides = body.slideNumbers?.length
    ? body.slideNumbers.filter(n => allSlideNumbers.includes(n))
    : allSlideNumbers;

  if (targetSlides.length === 0) {
    return NextResponse.json({ annotations: [], skipped: 0 });
  }

  // Check limits (admin gets bypass)
  const isAdmin = await userIsAdmin(user.id);
  const limits = await checkLimits(user.id, { adminBypass: isAdmin });
  if (!limits.allowed) {
    return NextResponse.json({ error: limits.reason }, { status: 429 });
  }

  // Fetch existing annotations so we don't regenerate
  const adminSupabase = getSupabaseAdmin();
  const { data: existing } = await adminSupabase
    .from('slide_annotations')
    .select('slide_number')
    .eq('internal_id', id)
    .in('slide_number', targetSlides);

  const existingSet = new Set((existing ?? []).map((r: { slide_number: number }) => r.slide_number));
  const toGenerate = targetSlides.filter(n => !existingSet.has(n));

  if (toGenerate.length === 0) {
    return NextResponse.json({ annotations: [], skipped: targetSlides.length });
  }

  // Fetch lecture metadata for prompt context
  const { data: lecture } = await supabase
    .from('lectures')
    .select('title, topics')
    .eq('internal_id', id)
    .maybeSingle();

  const lectureTitle = lecture?.title ?? 'Unknown Lecture';
  const topicContext = Array.isArray(lecture?.topics) ? (lecture.topics as string[]).join(', ') : '';

  const anthropic = getAnthropicClient();
  const system = buildAnnotationSystem();
  const generated: Array<{ slide_number: number; body: string }> = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Annotate one slide at a time — sequential to avoid rate-limit spikes
  for (const slideNum of toGenerate) {
    const imageUrl = slideImageUrls[String(slideNum)];
    if (!imageUrl) continue;

    const userContent: Anthropic.MessageParam['content'] = [
      {
        type: 'image',
        source: { type: 'url', url: imageUrl },
      },
      {
        type: 'text',
        text: buildAnnotationUserPrompt(lectureTitle, slideNum, topicContext),
      },
    ];

    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create({
        model: API_LIMITS.MODEL_DEFAULT,
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: userContent }],
      });
    } catch (err) {
      console.error(`[annotations] Claude error for slide ${slideNum}:`, err);
      continue; // skip this slide, don't fail the whole request
    }

    const body = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Upsert annotation (UNIQUE constraint handles concurrent races gracefully)
    const { error: upsertErr } = await adminSupabase
      .from('slide_annotations')
      .upsert({
        internal_id: id,
        slide_number: slideNum,
        body,
        model_used: API_LIMITS.MODEL_DEFAULT,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'internal_id,slide_number' });

    if (upsertErr) {
      console.error(`[annotations] Upsert error for slide ${slideNum}:`, upsertErr.message);
    } else {
      generated.push({ slide_number: slideNum, body });
    }
  }

  // Record usage
  if (totalInputTokens > 0) {
    const costUsd = estimateCost(API_LIMITS.MODEL_DEFAULT, totalInputTokens, totalOutputTokens);
    try {
      await adminSupabase.rpc('increment_api_usage', {
        p_date: new Date().toISOString().split('T')[0],
        p_calls: toGenerate.length,
        p_input_tokens: totalInputTokens,
        p_output_tokens: totalOutputTokens,
        p_cost: costUsd,
      });
    } catch (err) {
      console.error('[annotations] Failed to record usage:', err);
    }
  }

  return NextResponse.json({
    annotations: generated,
    skipped: existingSet.size,
    generated: generated.length,
  });
}
