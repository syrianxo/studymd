/**
 * GET /api/lectures/[id]/export?format=md|docx
 *
 * Builds a single document containing the lecture summary, topics, slide-level
 * clinical notes, the user's own notes, flashcards, and practice questions.
 * Markdown is built inline; docx wraps the markdown in a minimal XML payload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { LectureJSON } from '@/lib/validate-lecture';
import { buildLectureMarkdown, type AnnotationRow, type NoteRow } from '@/lib/lecture-markdown';
import { markdownToDocx } from '@/lib/lecture-docx';

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

function safeFilename(title: string, ext: string): string {
  const base = (title || 'lecture')
    .replace(/[^A-Za-z0-9 _-]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'lecture';
  return `${base}.${ext}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = (req.nextUrl.searchParams.get('format') ?? 'md').toLowerCase();

  if (format !== 'md' && format !== 'docx') {
    return NextResponse.json({ error: 'format must be md or docx' }, { status: 400 });
  }

  const supabase = await buildClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch the lecture (RLS allows any authenticated user to read)
  const { data: lectureRow, error: lecErr } = await supabase
    .from('lectures')
    .select('internal_id, title, json_data')
    .eq('internal_id', id)
    .maybeSingle();

  if (lecErr || !lectureRow) {
    return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });
  }

  // Annotations (public, read-only for authenticated)
  const { data: annRows } = await supabase
    .from('slide_annotations')
    .select('slide_number, body')
    .eq('internal_id', id)
    .order('slide_number');

  // Student notes — only the current user's
  const { data: noteRows } = await supabase
    .from('student_notes')
    .select('slide_number, body')
    .eq('user_id', user.id)
    .eq('internal_id', id)
    .order('slide_number');

  const lecture = lectureRow.json_data as LectureJSON;
  const annotations: AnnotationRow[] = (annRows ?? []) as AnnotationRow[];
  const notes: NoteRow[] = (noteRows ?? []) as NoteRow[];

  const markdown = buildLectureMarkdown({ lecture, annotations, notes });

  if (format === 'md') {
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFilename(lectureRow.title, 'md')}"`,
      },
    });
  }

  // docx
  const buffer = await markdownToDocx(markdown);
  return new NextResponse(buffer as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeFilename(lectureRow.title, 'docx')}"`,
      'Content-Length': String(buffer.byteLength),
    },
  });
}
