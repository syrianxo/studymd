import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractPptxSlides, formatSlidesForClaude } from '@/lib/pptx-extractor';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/pptx-extract?storagePath=userId/timestamp_file.pptx
 *
 * Debug endpoint — returns the raw extracted text from a PPTX file
 * already in Supabase Storage. Used to diagnose extraction issues.
 * Protected by Bearer token (any authenticated user).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token      = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const storagePath = searchParams.get('storagePath');
  if (!storagePath) return NextResponse.json({ error: 'storagePath param required' }, { status: 400 });

  // Signed URL so we can fetch the file
  const { data: signed, error: signErr } = await supabase.storage
    .from('uploads')
    .createSignedUrl(storagePath, 300);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: `Could not sign URL: ${signErr?.message}` }, { status: 500 });
  }

  const fileRes = await fetch(signed.signedUrl);
  if (!fileRes.ok) return NextResponse.json({ error: `Fetch failed: ${fileRes.status}` }, { status: 500 });
  const buffer = await fileRes.arrayBuffer();

  const slides    = await extractPptxSlides(buffer);
  const formatted = formatSlidesForClaude(slides, 'DEBUG');

  return NextResponse.json({
    slideCount:      slides.length,
    totalChars:      formatted.length,
    slidesSample:    slides.slice(0, 5).map(s => ({
      num:   s.slideNumber,
      chars: s.text.length,
      text:  s.text.slice(0, 500),
    })),
    formattedSample: formatted.slice(0, 3000),
  });
}
