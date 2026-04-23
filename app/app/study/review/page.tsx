// app/app/study/review/page.tsx
// Entry route for the Review study mode.
// Reads ?lecture= and optionally ?slide= from the URL.
// Fetches lecture metadata, then renders SlideReviewView.
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import SlideReviewView from '@/components/study/SlideReviewView';

interface LectureMeta {
  internal_id: string;
  title: string;
  icon: string;
  slide_count: number;
  custom_title?: string | null;
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ReviewPageInner />
    </Suspense>
  );
}

function ReviewPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const lectureId = params.get('lecture') ?? '';
  const initialSlide = Number(params.get('slide') ?? '1');

  const [lecture, setLecture] = useState<LectureMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lectureId) { router.replace('/app'); return; }

    const supabase = createClient();
    Promise.all([
      supabase.from('lectures').select('internal_id, title, icon, slide_count').eq('internal_id', lectureId).maybeSingle(),
      supabase.from('user_lecture_settings').select('custom_title').eq('internal_id', lectureId).maybeSingle(),
    ]).then(([{ data: lec, error: lecErr }, { data: settings }]) => {
      if (lecErr || !lec) { setError('Lecture not found.'); return; }
      setLecture({ ...lec, custom_title: settings?.custom_title });
    }).catch(() => setError('Failed to load lecture.'));
  }, [lectureId, router]);

  if (error) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text, #f0f0f0)', fontFamily: "'Outfit', sans-serif" }}>
        <div style={{ fontSize: 36 }}>⚠️</div>
        <div style={{ fontWeight: 600 }}>{error}</div>
        <button onClick={() => router.back()} style={{ marginTop: 8, padding: '8px 20px', border: '1.5px solid rgba(255,255,255,.15)', borderRadius: 8, background: 'none', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit' }}>
          Go back
        </button>
      </div>
    );
  }

  if (!lecture) return <Loading />;

  return (
    <SlideReviewView
      lectureId={lecture.internal_id}
      lectureTitle={lecture.custom_title ?? lecture.title}
      lectureIcon={lecture.icon}
      slideCount={lecture.slide_count}
      initialSlide={Math.max(1, initialSlide)}
      onClose={() => router.back()}
    />
  );
}

function Loading() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, rgba(240,240,240,.55))', fontFamily: "'Outfit', sans-serif", fontSize: 14 }}>
      Loading…
    </div>
  );
}
