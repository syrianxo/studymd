// components/study/SlideReviewView.tsx
// Slide-by-slide review viewer with AI-generated clinical annotations.
// Left: slide image. Right: annotation text.
// Annotations are generated lazily — first visit triggers POST, subsequent visits read cache.
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlideAnnotation {
  slide_number: number;
  body: string;
  model_used: string;
  generated_at: string;
}

interface SlideReviewViewProps {
  lectureId: string;
  lectureTitle: string;
  lectureIcon?: string;
  slideCount?: number;
  initialSlide?: number;
  /** Called when the user wants to close/exit the review */
  onClose?: () => void;
}

// ─── Slide URL resolver ───────────────────────────────────────────────────────

function useSlideUrls(internalId: string, slideCount?: number) {
  const [urls, setUrls] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>('loading');

  useEffect(() => {
    if (!internalId) { setStatus('empty'); return; }
    setStatus('loading');
    setUrls([]);

    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const count = (slideCount && slideCount > 0) ? slideCount : 200;
      const built: string[] = [];
      for (let i = 1; i <= count; i++) {
        const path = `slides/${internalId}/slide_${String(i).padStart(2, '0')}.jpg`;
        const { data } = supabase.storage.from('slides').getPublicUrl(path);
        if (data?.publicUrl) built.push(data.publicUrl);
      }
      if (cancelled || built.length === 0) { if (!cancelled) setStatus('empty'); return; }

      // Probe the first slide to confirm storage has content
      try {
        const res = await fetch(built[0], { method: 'HEAD' });
        if (cancelled) return;
        if (!res.ok) { setStatus('empty'); return; }
      } catch { if (!cancelled) setStatus('empty'); return; }

      // Binary-search for actual last slide when slide_count was 0
      if (!slideCount || slideCount === 0) {
        let lo = 1, hi = built.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          try {
            const r = await fetch(built[mid - 1], { method: 'HEAD' });
            if (r.ok) { lo = mid; } else { hi = mid - 1; }
          } catch { hi = mid - 1; }
        }
        if (!cancelled) { setUrls(built.slice(0, lo)); setStatus('ready'); }
      } else {
        if (!cancelled) { setUrls(built); setStatus('ready'); }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [internalId, slideCount]);

  return { urls, status };
}

// ─── Simple markdown → React renderer ────────────────────────────────────────
// Handles bold (**text**), italic (*text* / _text_), and line breaks.

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, li) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;

    while (remaining.length > 0) {
      // Bold: **...**
      const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/);
      // Italic: *...* or _..._
      const italicMatch = remaining.match(/^(.*?)(?:\*([^*]+?)\*|_([^_]+?)_)(.*)/);

      const boldIdx = boldMatch ? (boldMatch[1]?.length ?? 0) : Infinity;
      const italicIdx = italicMatch ? (italicMatch[1]?.length ?? 0) : Infinity;

      if (boldIdx <= italicIdx && boldMatch) {
        if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
        parts.push(<strong key={key++}>{boldMatch[2]}</strong>);
        remaining = boldMatch[3] ?? '';
      } else if (italicMatch) {
        if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
        parts.push(<em key={key++}>{italicMatch[2] ?? italicMatch[3]}</em>);
        remaining = italicMatch[4] ?? '';
      } else {
        parts.push(<span key={key++}>{remaining}</span>);
        remaining = '';
      }
    }

    return (
      <React.Fragment key={li}>
        {li > 0 && <br />}
        {parts}
      </React.Fragment>
    );
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SlideReviewView({
  lectureId, lectureTitle, lectureIcon, slideCount, initialSlide = 1, onClose,
}: SlideReviewViewProps) {
  const [currentSlide, setCurrentSlide] = useState(initialSlide);
  // Map of slide_number → annotation body (or null while loading)
  const [annotations, setAnnotations] = useState<Map<number, string | null>>(new Map());
  const [annotationStatus, setAnnotationStatus] = useState<Map<number, 'idle' | 'loading' | 'done' | 'error'>>(new Map());
  // Student notes: slide_number → body
  const [notes, setNotes] = useState<Map<number, string>>(new Map());
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [noteSaveStatus, setNoteSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { urls, status: slideStatus } = useSlideUrls(lectureId, slideCount);
  const totalSlides = urls.length;

  // Fetch all existing annotations once on mount
  useEffect(() => {
    if (!lectureId) return;
    fetch(`/api/lectures/${lectureId}/annotations`)
      .then(r => r.json())
      .then(({ annotations: rows }: { annotations: SlideAnnotation[] }) => {
        setAnnotations(prev => {
          const next = new Map(prev);
          for (const row of (rows ?? [])) next.set(row.slide_number, row.body);
          return next;
        });
        setAnnotationStatus(prev => {
          const next = new Map(prev);
          for (const row of (rows ?? [])) next.set(row.slide_number, 'done');
          return next;
        });
      })
      .catch(console.error);
  }, [lectureId]);

  // Fetch student notes once on mount
  useEffect(() => {
    if (!lectureId) return;
    fetch(`/api/lectures/${lectureId}/notes`)
      .then(r => r.json())
      .then(({ notes: rows }: { notes: Array<{ slide_number: number; body: string }> }) => {
        setNotes(() => {
          const next = new Map<number, string>();
          for (const row of (rows ?? [])) next.set(row.slide_number, row.body);
          return next;
        });
      })
      .catch(console.error);
  }, [lectureId]);

  // When the current slide changes, hydrate the note draft from the store
  useEffect(() => {
    setNoteDraft(notes.get(currentSlide) ?? '');
    setNoteSaveStatus('idle');
    if (noteTimerRef.current) { clearTimeout(noteTimerRef.current); noteTimerRef.current = null; }
  }, [currentSlide, notes]);

  const saveNote = useCallback(async (slideNum: number, text: string) => {
    setNoteSaveStatus('saving');
    try {
      const res = await fetch(`/api/lectures/${lectureId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slide_number: slideNum, body: text }),
      });
      if (!res.ok) throw new Error('save failed');
      setNotes(prev => {
        const next = new Map(prev);
        if (text.trim().length === 0) next.delete(slideNum);
        else next.set(slideNum, text);
        return next;
      });
      setNoteSaveStatus('saved');
      setTimeout(() => setNoteSaveStatus(s => (s === 'saved' ? 'idle' : s)), 1500);
    } catch {
      setNoteSaveStatus('error');
    }
  }, [lectureId]);

  function onNoteChange(text: string) {
    setNoteDraft(text);
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => {
      saveNote(currentSlide, text);
    }, 700);
  }

  // When current slide changes, generate annotation if it doesn't exist yet
  const generateAnnotation = useCallback(async (slideNum: number, slideUrl: string) => {
    if (!slideUrl) return;
    if (annotationStatus.get(slideNum) === 'loading' || annotationStatus.get(slideNum) === 'done') return;

    setAnnotationStatus(prev => new Map(prev).set(slideNum, 'loading'));
    setAnnotations(prev => new Map(prev).set(slideNum, null));

    try {
      const res = await fetch(`/api/lectures/${lectureId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideNumbers: [slideNum],
          slideImageUrls: { [slideNum]: slideUrl },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');

      if (data.annotations?.length > 0) {
        setAnnotations(prev => new Map(prev).set(slideNum, data.annotations[0].body));
        setAnnotationStatus(prev => new Map(prev).set(slideNum, 'done'));
      } else {
        // Was already cached on the server — refetch
        const refetch = await fetch(`/api/lectures/${lectureId}/annotations`);
        const { annotations: rows } = await refetch.json();
        const match = (rows ?? []).find((r: SlideAnnotation) => r.slide_number === slideNum);
        if (match) {
          setAnnotations(prev => new Map(prev).set(slideNum, match.body));
          setAnnotationStatus(prev => new Map(prev).set(slideNum, 'done'));
        } else {
          setAnnotationStatus(prev => new Map(prev).set(slideNum, 'error'));
        }
      }
    } catch {
      setAnnotationStatus(prev => new Map(prev).set(slideNum, 'error'));
    }
  }, [lectureId, annotationStatus]);

  useEffect(() => {
    if (slideStatus !== 'ready' || urls.length === 0) return;
    const url = urls[currentSlide - 1];
    if (!url) return;
    const status = annotationStatus.get(currentSlide);
    if (status !== 'done' && status !== 'loading') {
      generateAnnotation(currentSlide, url);
    }
    setImageError(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlide, slideStatus, urls]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') { setCurrentSlide(s => Math.max(1, s - 1)); }
      if (e.key === 'ArrowRight') { setCurrentSlide(s => Math.min(totalSlides || s, s + 1)); }
      if (e.key === 'Escape') { onClose?.(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalSlides, onClose]);

  const slideUrl = urls[currentSlide - 1];
  const annotation = annotations.get(currentSlide);
  const annStatus = annotationStatus.get(currentSlide) ?? 'idle';

  const canPrev = currentSlide > 1;
  const canNext = totalSlides > 0 && currentSlide < totalSlides;

  return (
    <div className="srw-shell" ref={containerRef}>
      <style>{reviewCss}</style>

      {/* ── Header ── */}
      <div className="srw-header">
        <button className="srw-back-btn" onClick={onClose} aria-label="Close review">
          ← Back
        </button>
        <div className="srw-header-info">
          <span className="srw-header-icon">{lectureIcon ?? '📖'}</span>
          <span className="srw-header-title">{lectureTitle}</span>
        </div>
        <div className="srw-slide-counter">
          {slideStatus === 'ready' && totalSlides > 0
            ? `${currentSlide} / ${totalSlides}`
            : '…'}
        </div>
      </div>

      {/* ── Main split ── */}
      <div className="srw-main">
        {/* Slide image panel */}
        <div className="srw-image-panel">
          {slideStatus === 'loading' && (
            <div className="srw-image-skeleton srw-pulse" />
          )}
          {slideStatus === 'empty' && (
            <div className="srw-empty">No slides available for this lecture.</div>
          )}
          {slideStatus === 'ready' && slideUrl && !imageError && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="srw-slide-img"
              src={slideUrl}
              alt={`Slide ${currentSlide}`}
              onError={() => setImageError(true)}
            />
          )}
          {imageError && (
            <div className="srw-empty">Slide image unavailable.</div>
          )}
        </div>

        {/* Annotation + notes panel */}
        <div className="srw-annotation-panel">
          <div className="srw-annotation-label">Clinical Note</div>
          {annStatus === 'loading' || annStatus === 'idle' ? (
            <div className="srw-ann-skeleton">
              <div className="srw-pulse" style={{ height: 14, width: '90%', borderRadius: 6, marginBottom: 10 }} />
              <div className="srw-pulse" style={{ height: 14, width: '80%', borderRadius: 6, marginBottom: 10 }} />
              <div className="srw-pulse" style={{ height: 14, width: '85%', borderRadius: 6, marginBottom: 10 }} />
              <div className="srw-pulse" style={{ height: 14, width: '60%', borderRadius: 6 }} />
              <div className="srw-ann-generating">Generating annotation…</div>
            </div>
          ) : annStatus === 'error' ? (
            <div className="srw-ann-error">
              Couldn&apos;t generate annotation. You may have hit today&apos;s AI usage limit.
              <button className="srw-retry-btn" onClick={() => {
                setAnnotationStatus(prev => { const n = new Map(prev); n.delete(currentSlide); return n; });
              }}>
                Retry
              </button>
            </div>
          ) : (
            <div className="srw-ann-body">
              {annotation ? renderMarkdown(annotation) : null}
            </div>
          )}

          <div className="srw-notes-divider" />
          <div className="srw-notes-header">
            <span className="srw-annotation-label">My Notes</span>
            <span className={`srw-notes-status srw-notes-status--${noteSaveStatus}`}>
              {noteSaveStatus === 'saving' && 'Saving…'}
              {noteSaveStatus === 'saved' && 'Saved'}
              {noteSaveStatus === 'error' && 'Save failed'}
            </span>
          </div>
          <textarea
            className="srw-notes-input"
            value={noteDraft}
            placeholder="Write a note for this slide — it stays with you and syncs across devices."
            onChange={(e) => onNoteChange(e.target.value)}
            onBlur={() => {
              if (noteTimerRef.current) { clearTimeout(noteTimerRef.current); noteTimerRef.current = null; }
              if (noteDraft !== (notes.get(currentSlide) ?? '')) {
                saveNote(currentSlide, noteDraft);
              }
            }}
            rows={5}
          />
        </div>
      </div>

      {/* ── Navigation footer ── */}
      <div className="srw-nav">
        <button
          className="srw-nav-btn"
          disabled={!canPrev}
          onClick={() => setCurrentSlide(s => s - 1)}
          aria-label="Previous slide"
        >
          ← Prev
        </button>

        {/* Dot row — max 20 visible dots */}
        {totalSlides > 0 && totalSlides <= 20 && (
          <div className="srw-dot-row" aria-label={`Slide ${currentSlide} of ${totalSlides}`}>
            {Array.from({ length: totalSlides }, (_, i) => (
              <button
                key={i + 1}
                className={`srw-dot${i + 1 === currentSlide ? ' active' : ''}`}
                onClick={() => setCurrentSlide(i + 1)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        )}
        {totalSlides > 20 && (
          <span className="srw-slide-counter-inline">
            Slide {currentSlide} of {totalSlides}
          </span>
        )}

        <button
          className="srw-nav-btn"
          disabled={!canNext}
          onClick={() => setCurrentSlide(s => s + 1)}
          aria-label="Next slide"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const reviewCss = `
.srw-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--bg, #0f0f12);
  color: var(--text, #f0f0f0);
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
}

/* Header */
.srw-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
  flex-shrink: 0;
}
.srw-back-btn {
  background: none;
  border: 1.5px solid var(--border, rgba(255,255,255,.12));
  color: var(--text-muted, rgba(240,240,240,.55));
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 160ms, color 160ms;
}
.srw-back-btn:hover { background: var(--surface2, rgba(255,255,255,.07)); color: var(--text, #f0f0f0); }
.srw-header-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.srw-header-icon { font-size: 18px; flex-shrink: 0; }
.srw-header-title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.srw-slide-counter {
  font-size: 13px;
  color: var(--text-muted, rgba(240,240,240,.55));
  flex-shrink: 0;
}

/* Main split */
.srw-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  gap: 0;
}

/* Image panel */
.srw-image-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface, rgba(255,255,255,.03));
  overflow: hidden;
  padding: 16px;
}
.srw-slide-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 4px 32px rgba(0,0,0,.4);
}
.srw-image-skeleton {
  width: 100%;
  height: 100%;
  max-width: 560px;
  border-radius: 12px;
  background: var(--surface2, rgba(255,255,255,.07));
}
.srw-empty {
  color: var(--text-muted, rgba(240,240,240,.55));
  font-size: 14px;
  text-align: center;
}

/* Annotation panel */
.srw-annotation-panel {
  width: 340px;
  flex-shrink: 0;
  border-left: 1px solid var(--border, rgba(255,255,255,.08));
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 20px;
  gap: 12px;
}
.srw-annotation-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--accent, #5b8dee);
}
.srw-ann-body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text, #f0f0f0);
}
.srw-ann-skeleton { display: flex; flex-direction: column; gap: 0; }
.srw-ann-generating {
  font-size: 12px;
  color: var(--text-muted, rgba(240,240,240,.55));
  margin-top: 16px;
  font-style: italic;
}
.srw-ann-error {
  font-size: 13px;
  color: var(--danger, #ef4444);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.srw-retry-btn {
  background: none;
  border: 1.5px solid var(--danger, #ef4444);
  color: var(--danger, #ef4444);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  align-self: flex-start;
}

/* Student notes block */
.srw-notes-divider {
  height: 1px;
  background: var(--border, rgba(255,255,255,.08));
  margin: 16px 0 4px;
}
.srw-notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.srw-notes-status {
  font-size: 11px;
  color: var(--text-muted, rgba(240,240,240,.55));
  transition: opacity 200ms;
  min-height: 14px;
}
.srw-notes-status--saved { color: var(--accent, #5b8dee); }
.srw-notes-status--error { color: var(--danger, #ef4444); }
.srw-notes-input {
  width: 100%;
  resize: vertical;
  min-height: 110px;
  border: 1.5px solid var(--border, rgba(255,255,255,.12));
  background: var(--surface, rgba(255,255,255,.03));
  color: var(--text, #f0f0f0);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  box-sizing: border-box;
  transition: border-color 160ms;
}
.srw-notes-input:focus {
  outline: none;
  border-color: var(--accent, #5b8dee);
}
.srw-notes-input::placeholder {
  color: var(--text-muted, rgba(240,240,240,.45));
  font-style: italic;
}

/* Navigation footer */
.srw-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--border, rgba(255,255,255,.08));
  flex-shrink: 0;
  gap: 16px;
}
.srw-nav-btn {
  background: none;
  border: 1.5px solid var(--border, rgba(255,255,255,.12));
  color: var(--text, #f0f0f0);
  border-radius: 8px;
  padding: 7px 20px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  transition: background 160ms, border-color 160ms;
  flex-shrink: 0;
}
.srw-nav-btn:hover:not(:disabled) { background: var(--surface2, rgba(255,255,255,.07)); border-color: var(--accent, #5b8dee); }
.srw-nav-btn:disabled { opacity: .35; cursor: default; }
.srw-dot-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  flex: 1;
}
.srw-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  background: var(--surface2, rgba(255,255,255,.18));
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background 160ms, transform 120ms;
}
.srw-dot.active { background: var(--accent, #5b8dee); transform: scale(1.3); }
.srw-dot:hover:not(.active) { background: var(--text-muted, rgba(240,240,240,.45)); }
.srw-slide-counter-inline {
  flex: 1;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted, rgba(240,240,240,.55));
}

/* Pulse skeleton animation */
@keyframes srw-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .4; }
}
.srw-pulse { animation: srw-pulse 1.6s ease infinite; background: var(--surface2, rgba(255,255,255,.07)); }

/* Mobile: stack image above annotation */
@media (max-width: 768px) {
  .srw-main {
    flex-direction: column;
    overflow-y: auto;
  }
  .srw-image-panel {
    flex: none;
    min-height: 240px;
    max-height: 45dvh;
    padding: 12px;
  }
  .srw-annotation-panel {
    width: 100%;
    border-left: none;
    border-top: 1px solid var(--border, rgba(255,255,255,.08));
    flex: none;
    min-height: 160px;
    overflow-y: visible;
  }
}
`;
