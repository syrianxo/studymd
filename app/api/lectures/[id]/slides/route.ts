/**
 * GET  /api/lectures/[id]/slides
 *   Returns signed URLs for all slides for this lecture.
 *
 * POST /api/lectures/[id]/slides
 *   Uploads a new slide image to Supabase Storage.
 *   Form data: file (image), slideNumber (int)
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
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

  const service = buildServiceClient();

  // List all files for this lecture in the slides bucket
  const { data: files, error: listErr } = await service.storage
    .from('slides')
    .list(id, { sortBy: { column: 'name', order: 'asc' } });

  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  // Generate signed URLs (1 hour)
  const slides = await Promise.all(
    (files ?? [])
      .filter(f => f.name !== '.emptyFolderPlaceholder')
      .map(async f => {
        const path = `${id}/${f.name}`;
        const { data } = await service.storage
          .from('slides')
          .createSignedUrl(path, 3600);
        // Parse slide number from filename: slide_01.jpg → 1
        const match = f.name.match(/slide[_-]?(\d+)/i);
        return {
          name: f.name,
          slideNumber: match ? parseInt(match[1], 10) : null,
          url: data?.signedUrl ?? null,
          size: f.metadata?.size ?? 0,
        };
      })
  );

  slides.sort((a, b) => (a.slideNumber ?? 999) - (b.slideNumber ?? 999));

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

  // Confirm lecture exists
  const { data: lecture } = await supabase
    .from('lectures').select('internal_id, slide_count').eq('internal_id', id).maybeSingle();
  if (!lecture) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file = formData.get('file') as File | null;
  const slideNumberStr = formData.get('slideNumber') as string | null;

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

  const slideNumber = slideNumberStr ? parseInt(slideNumberStr, 10) : lecture.slide_count + 1;
  const padded = String(slideNumber).padStart(2, '0');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const filename = `slide_${padded}.${ext}`;
  const storagePath = `${id}/${filename}`;

  const service = buildServiceClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await service.storage
    .from('slides')
    .upload(storagePath, buffer, {
      contentType: file.type || 'image/jpeg',
      upsert: true,
    });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  // Update slide_count if new slide number exceeds current count
  if (slideNumber > (lecture.slide_count ?? 0)) {
    await supabase
      .from('lectures')
      .update({ slide_count: slideNumber })
      .eq('internal_id', id);
  }

  return NextResponse.json({ ok: true, filename, slideNumber });
}
