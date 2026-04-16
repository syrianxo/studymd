/**
 * DELETE /api/lectures/[id]/slides/[slideNum]
 * Deletes a slide image from Supabase Storage.
 * Tries common extensions: .jpg, .jpeg, .png, .webp
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; slideNum: string }> }
) {
  const { id, slideNum } = await params;
  const supabase = await buildClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const padded = String(slideNum).padStart(2, '0');
  const exts = ['jpg', 'jpeg', 'png', 'webp'];
  let deleted = false;

  for (const ext of exts) {
    const path = `${id}/slide_${padded}.${ext}`;
    const { error } = await service.storage.from('slides').remove([path]);
    if (!error) { deleted = true; break; }
  }

  if (!deleted) {
    // Try listing to find the actual file
    const { data: files } = await service.storage.from('slides').list(id);
    const match = files?.find(f => {
      const n = f.name.match(/slide[_-]?(\d+)/i);
      return n && parseInt(n[1], 10) === parseInt(slideNum, 10);
    });
    if (match) {
      await service.storage.from('slides').remove([`${id}/${match.name}`]);
      deleted = true;
    }
  }

  if (!deleted) return NextResponse.json({ error: 'Slide not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
