/**
 * POST /api/admin/reprocess/[internalId]
 *
 * Admin-only. Re-runs Claude on the original uploaded file and updates
 * lectures.json_data in place. Primary use: backfill slide_number on
 * flashcards and questions that were generated before that field was added.
 *
 * The re-processed JSON must pass validateLecture() or the endpoint returns
 * 422 without touching the database.
 */
import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/admin-auth';
import { buildSystemWithCache } from '@/lib/lecture-processor-prompt';
import { validateLecture } from '@/lib/validate-lecture';
import { API_LIMITS, estimateCost } from '@/lib/api-limits';
import { extractPptxSlides, formatSlidesForClaude } from '@/lib/pptx-extractor';

const STORAGE_BUCKET = 'uploads';
// Re-process signed URL valid for 30 minutes
const SIGNED_URL_TTL = 1800;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ internalId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { internalId } = await params;
  if (!internalId) return NextResponse.json({ error: 'internalId is required' }, { status: 400 });

  // ── 1. Load lecture + matching processing_job ─────────────────────────────
  const { data: lecture, error: lecErr } = await supabase
    .from('lectures')
    .select('internal_id, title, course, json_data')
    .eq('internal_id', internalId)
    .single();

  if (lecErr || !lecture) {
    return NextResponse.json({ error: `Lecture not found: ${internalId}` }, { status: 404 });
  }

  const { data: job, error: jobErr } = await supabase
    .from('processing_jobs')
    .select('storage_path, file_type')
    .eq('internal_id', internalId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobErr || !job?.storage_path) {
    return NextResponse.json(
      { error: 'No processing_job found for this lecture — cannot locate original file.' },
      { status: 404 }
    );
  }

  // ── 2. Get signed URL ─────────────────────────────────────────────────────
  const { data: urlData, error: urlErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(job.storage_path, SIGNED_URL_TTL);

  if (urlErr || !urlData?.signedUrl) {
    return NextResponse.json(
      { error: `Could not create signed URL: ${urlErr?.message ?? 'no URL returned'}` },
      { status: 500 }
    );
  }

  // ── 3. Fetch file ─────────────────────────────────────────────────────────
  let fileBuffer: ArrayBuffer;
  try {
    const res = await fetch(urlData.signedUrl);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    fileBuffer = await res.arrayBuffer();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch file: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  const isPptx = job.file_type === 'pptx' || job.file_type === 'ppt';
  let fileBase64: string | null = null;
  let slideText: string | null = null;

  if (isPptx) {
    const slides = await extractPptxSlides(fileBuffer);
    if (slides.length === 0) {
      return NextResponse.json({ error: 'PPTX extraction produced no slides.' }, { status: 422 });
    }
    slideText = formatSlidesForClaude(slides, lecture.title);
  } else {
    fileBase64 = arrayBufferToBase64(fileBuffer);
  }

  // ── 4. Call Claude (Sonnet for reliability on reprocess) ──────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

  const anthropic = new Anthropic({ apiKey });
  const model = API_LIMITS.MODEL_FALLBACK; // use Sonnet — reprocess is admin-only, quality matters

  const userContent: Anthropic.MessageParam['content'] = [];
  if (fileBase64) {
    userContent.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
    } as Anthropic.DocumentBlockParam);
  } else {
    userContent.push({ type: 'text', text: slideText! });
  }
  userContent.push({
    type: 'text',
    text: `Process the above lecture content as lecture ${internalId} for course "${lecture.course}". Title: "${lecture.title}". Generate the full JSON output as specified in your system prompt.`,
  });

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: 16000,
      system: buildSystemWithCache(),
      messages: [{ role: 'user', content: userContent }],
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Claude API error: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  const inputTokens  = response.usage?.input_tokens  ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  if (response.stop_reason === 'max_tokens') {
    return NextResponse.json({ error: 'Claude response was truncated at max_tokens. Try again or split the lecture.' }, { status: 422 });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: 'Claude returned no text content.' }, { status: 500 });
  }

  const rawText = textBlock.text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const firstBrace = rawText.indexOf('{');
  const lastBrace  = rawText.lastIndexOf('}');
  const jsonStr = firstBrace !== -1 && lastBrace > firstBrace
    ? rawText.slice(firstBrace, lastBrace + 1)
    : rawText;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return NextResponse.json(
      { error: `Response was not valid JSON: ${(e as Error).message}` },
      { status: 422 }
    );
  }

  // Inject canonical metadata so validate passes
  const newJson = {
    ...(parsed as Record<string, unknown>),
    lecture_id: internalId,
    course: lecture.course,
    title: lecture.title,
  };

  // ── 5. Validate — must pass, otherwise reject ─────────────────────────────
  const validation = validateLecture(newJson);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Reprocessed JSON failed validation', errors: validation.errors },
      { status: 422 }
    );
  }

  // ── 6. Update lectures.json_data in place ─────────────────────────────────
  const { error: updateErr } = await supabase
    .from('lectures')
    .update({ json_data: newJson })
    .eq('internal_id', internalId);

  if (updateErr) {
    return NextResponse.json(
      { error: `Database update failed: ${updateErr.message}` },
      { status: 500 }
    );
  }

  // ── 7. Record API usage ───────────────────────────────────────────────────
  const cost = estimateCost(model, inputTokens, outputTokens, false);
  const today = new Date().toISOString().split('T')[0];
  await supabase.rpc('increment_api_usage', {
    p_date: today,
    p_calls: 1,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost: cost,
  });

  const fc = (newJson as { flashcards?: unknown[] }).flashcards?.length ?? 0;
  const q  = (newJson as { questions?: unknown[] }).questions?.length ?? 0;

  return NextResponse.json({
    ok: true,
    internalId,
    model,
    flashcards: fc,
    questions: q,
    inputTokens,
    outputTokens,
    estimatedCost: cost,
  });
}
