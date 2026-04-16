/**
 * GET    /api/admin/lectures          → list all lectures with metadata
 * DELETE /api/admin/lectures?id=xxx   → delete lecture + settings + storage
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { data: lectures, error } = await supabase
    .from('lectures')
    .select('internal_id, title, course, created_at, slide_count, original_file, json_data, icon, color')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich: uploader info from user_lecture_settings (first creator)
  const enriched = (lectures ?? []).map((l: any) => {
    const flashcards = l.json_data?.flashcards ?? [];
    const questions  = l.json_data?.questions ?? [];
    return {
      internal_id:     l.internal_id,
      title:           l.title,
      course:          l.course,
      created_at:      l.created_at,
      slide_count:     l.slide_count,
      original_file:   l.original_file,
      flashcard_count: flashcards.length,
      question_count:  questions.length,
      icon:            l.icon,
      color:           l.color,
    };
  });

  return NextResponse.json({ lectures: enriched });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // 1. Delete slides from Supabase Storage (bucket: 'slides')
  const { data: slideFiles } = await supabase.storage
    .from('slides')
    .list(id);

  if (slideFiles && slideFiles.length > 0) {
    const paths = slideFiles.map((f: any) => `${id}/${f.name}`);
    await supabase.storage.from('slides').remove(paths);
  }

  // 2. Delete user_lecture_settings rows
  await supabase.from('user_lecture_settings').delete().eq('internal_id', id);

  // 3. Delete user_progress rows
  await supabase.from('user_progress').delete().eq('internal_id', id);

  // 4. Delete the lecture itself
  const { error } = await supabase.from('lectures').delete().eq('internal_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
