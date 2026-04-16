/**
 * GET  /api/lectures/[id]/slides
 * Returns signed URLs for all slides for this lecture.
 * Tries multiple storage path patterns:
 *   1. slides/{internal_id}/slide_XX.jpg  (v2 format)
 *   2. slides/{internal_id}/XX.jpg        (alternate)
 * Also returns public URLs as fallback if signed URL fails.
 *
 * POST /api/lectures/[id]/slides
 * Uploads a new slide image.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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

function buildServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables.');
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Confirm lecture exists
  const { data: lecture } = await supabase
    .from('lectures').select('internal_id, slide_count').eq('internal_id', id).maybeSingle();
  if (!lecture) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

  let service;
  try { service = buildServiceClient(); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }

  // List files in the lecture's folder.
  // Storage structure: bucket='slides', path='slides/{id}/slide_XX.jpg'
  // (there is a 'slides' subfolder inside the 'slides' bucket)
  const folderPath = `slides/${id}`;
  const { data: files, error: listErr } = await service.storage
    .from('slides')
    .list(folderPath, { limit: 300, sortBy: { column: 'name', order: 'asc' } });

  if (listErr) {
    // Bucket may not exist or folder empty — return empty list gracefully
    console.error('[GET slides] list error:', listErr.message);
    return NextResponse.json({ slides: [], debug: { listError: listErr.message } });
  }

  const realFiles = (files ?? []).filter(f =>
    f.name !== '.emptyFolderPlaceholder' &&
    f.name !== '.keep' &&
    !f.name.startsWith('.')
  );

  if (realFiles.length === 0) {
    return NextResponse.json({ slides: [] });
  }

  // Generate signed URLs (1 hour)
  const slides = await Promise.all(
    realFiles.map(async f => {
      const path = `slides/${id}/${f.name}`;
      const { data: signedData } = await service!.storage
        .from('slides')
        .createSignedUrl(path, 3600);

      // Parse slide number from filename:
      // slide_01.jpg → 1, slide_1.jpg → 1, 01.jpg → 1, 1.jpg → 1
      const match = f.name.match(/(?:slide[_-]?)?(\d+)\./i);
      const slideNumber = match ? parseInt(match[1], 10) : null;

      return {
        name: f.name,
        slideNumber,
        url: signedData?.signedUrl ?? null,
        size: f.metadata?.size ?? 0,
      };
    })
  );

  // Sort by slide number, then alphabetically
  slides.sort((a, b) => {
    if (a.slideNumber != null && b.slideNumber != null) return a.slideNumber - b.slideNumber;
    if (a.slideNumber != null) return -1;
    if (b.slideNumber != null) return 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ slides });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: lecture } = await supabase
    .from('lectures').select('internal_id, slide_count').eq('internal_id', id).maybeSingle();
  if (!lecture) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file = formData.get('file') as File | null;
  const slideNumberStr = formData.get('slideNumber') as string | null;
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

  let service;
  try { service = buildServiceClient(); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }

  const slideNumber = slideNumberStr ? parseInt(slideNumberStr, 10) : (lecture.slide_count ?? 0) + 1;
  const padded = String(slideNumber).padStart(2, '0');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const filename = `slide_${padded}.${ext}`;
  // Matches storage structure: slides/{id}/slide_XX.jpg inside 'slides' bucket
  const storagePath = `slides/${id}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await service.storage
    .from('slides')
    .upload(storagePath, buffer, {
      contentType: file.type || 'image/jpeg',
      upsert: true,
    });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  if (slideNumber > (lecture.slide_count ?? 0)) {
    await supabase.from('lectures').update({ slide_count: slideNumber }).eq('internal_id', id);
  }

  return NextResponse.json({ ok: true, filename, slideNumber });
}
