'use client';

// components/LectureCard.tsx
// v2.6: Restored v1-style expand panel with slide thumbnail strip + lightbox.
//       Added full mobile responsive layout per HIG touch-target requirements.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createClient } from '@/lib/supabase';
import type { LectureWithSettings, Course } from '@/types';

const COURSES: Course[] = [
  'Physical Diagnosis I',
  'Anatomy & Physiology',
  'Laboratory Diagnosis',
];

const PRESET_COLORS = [
  '#5b8dee', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

// ─── Shared menu sizing constants ─────────────────────────────────────────────
const MENU_ITEM_PADDING = '10px 16px';
const MENU_ITEM_MIN_HEIGHT = '42px';
const MENU_FONT_SIZE = '13px';

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardCss = `
.lc-card {
  position: relative;
  background: var(--surface, #13161d);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px; padding: 20px; cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
  overflow: visible; user-select: none;
}
.lc-card:hover:not(.lc-dragging):not(.lc-expanded) { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.35); }
.lc-card.lc-manage-mode { cursor: default; }
.lc-card.lc-dragging { opacity: 0.5; box-shadow: 0 16px 48px rgba(0,0,0,0.6); z-index: 999; }
.lc-card.lc-archived { opacity: 0.55; border-style: dashed; }
.lc-card.lc-menu-open { z-index: 200; }
.lc-card.lc-expanded { border-color: rgba(255,255,255,0.12); box-shadow: 0 12px 40px rgba(0,0,0,0.4); cursor: default; }

.lc-accent-bar {
  position: absolute; top: 0; left: 20px; right: 20px;
  height: 3px; border-radius: 0 0 4px 4px;
  transition: left 0.2s, right 0.2s, background 0.3s;
}
.lc-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; margin-top: 8px; }
.lc-icon { font-size: 28px; line-height: 1; flex-shrink: 0; }
.lc-title-block { flex: 1; min-width: 0; }
.lc-title {
  font-family: 'Fraunces', Georgia, serif; font-size: 16px; font-weight: 600;
  color: var(--text, #e8eaf0); line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.lc-course-badge {
  display: inline-block; font-family: 'DM Mono', monospace;
  font-size: 10px; letter-spacing: 0.04em; padding: 2px 7px;
  border-radius: 100px; margin-top: 5px; opacity: 0.85; cursor: pointer;
  transition: opacity 0.15s, box-shadow 0.15s, background 0.3s, color 0.3s;
}
.lc-course-badge:hover { opacity: 1; box-shadow: 0 0 0 2px rgba(255,255,255,0.2); }

.lc-progress-row { display: flex; gap: 8px; margin-bottom: 12px; }
.lc-progress-item { flex: 1; font-family: 'DM Mono', monospace; font-size: 10px; color: var(--text-muted, #6b7280); }
.lc-progress-bar-bg { height: 4px; background: rgba(255,255,255,0.07); border-radius: 2px; margin-top: 3px; overflow: hidden; }
.lc-progress-bar-fill { height: 100%; border-radius: 2px; transition: width 0.4s ease, background 0.3s; }

.lc-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.lc-tag {
  font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 500;
  padding: 2px 8px; border-radius: 100px;
  background: rgba(255,255,255,0.07); color: var(--text-muted, #6b7280);
  border: 1px solid rgba(255,255,255,0.06);
}
.lc-slide-count { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--text-muted, #6b7280); margin-top: 10px; }

.lc-drag-handle {
  position: absolute; top: 14px; left: 12px; color: var(--text-muted, #6b7280);
  cursor: grab; font-size: 16px; line-height: 1; opacity: 0.5; transition: opacity 0.15s; z-index: 5; display: none;
}
.lc-drag-handle:active { cursor: grabbing; }
.lc-manage-mode .lc-drag-handle { display: block; }
.lc-manage-mode .lc-drag-handle:hover { opacity: 1; }

/* Kebab — manage mode ONLY */
.lc-kebab-btn {
  position: absolute; top: 12px; right: 12px; background: none; border: none;
  color: var(--text-muted, #6b7280); font-size: 18px; line-height: 1; cursor: pointer;
  padding: 4px 6px; border-radius: 6px; transition: opacity 0.15s, background 0.15s; z-index: 6;
  min-width: 32px; min-height: 32px; display: none; align-items: center; justify-content: center;
}
.lc-manage-mode .lc-kebab-btn { display: flex; opacity: 0.7; }
.lc-kebab-btn:hover { opacity: 1 !important; background: rgba(255,255,255,0.07); }
@media (max-width: 639px) {
  .lc-manage-mode .lc-kebab-btn { min-width: 44px; min-height: 44px; top: 6px; right: 6px; font-size: 20px; }
}

/* Expand chevron — non-manage mode */
.lc-expand-indicator {
  position: absolute; bottom: 14px; right: 14px;
  font-size: 11px; color: var(--text-muted, #6b7280); opacity: 0.5;
  transition: opacity 0.15s, transform 0.22s ease;
  pointer-events: none;
  display: block;
}
.lc-manage-mode .lc-expand-indicator { display: none; }
.lc-card:hover:not(.lc-manage-mode) .lc-expand-indicator { opacity: 0.9; }
.lc-expanded .lc-expand-indicator { transform: rotate(180deg); opacity: 0.9; }

/* ── Expand panel ─────────────────────────────────────────────────────────── */
.lc-expand-panel {
  max-height: 0; overflow: hidden;
  transition: max-height 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}
.lc-expand-panel.open { max-height: 900px; }

.lc-expand-inner {
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.07);
  margin-top: 14px;
}

.lc-expand-section-label {
  font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--text-muted, #6b7280);
  margin-bottom: 10px; font-weight: 700;
}

/* Study mode buttons — v1 style: stacked icon+label */
.lc-study-btns {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px;
}
.lc-study-btn {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
  padding: 14px 12px; border-radius: 10px; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.1);
  background: var(--surface2, #1a1e27);
  font-family: 'Outfit', sans-serif;
  color: var(--text, #e8eaf0);
  transition: all 0.15s; min-height: 44px;
}
.lc-study-btn .lc-btn-icon { font-size: 20px; line-height: 1; margin-bottom: 2px; }
.lc-study-btn .lc-btn-label { font-size: 13px; font-weight: 600; }
.lc-study-btn .lc-btn-sub { font-size: 10px; color: var(--text-muted, #6b7280); margin-top: 1px; }
.lc-study-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.2); }
.lc-study-btn.flash {
  border-color: rgba(91,141,238,0.3);
}
.lc-study-btn.flash:hover { background: rgba(91,141,238,0.1); border-color: #5b8dee; }
.lc-study-btn.exam {
  border-color: rgba(139,92,246,0.3);
}
.lc-study-btn.exam:hover { background: rgba(139,92,246,0.1); border-color: #8b5cf6; }
@media (max-width: 480px) {
  .lc-study-btns { grid-template-columns: 1fr 1fr; gap: 8px; }
  .lc-study-btn { padding: 12px 8px; }
}

/* ── Slide strip ──────────────────────────────────────────────────────────── */
.lc-slide-strip {
  display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent;
  -webkit-overflow-scrolling: touch;
}
.lc-slide-strip::-webkit-scrollbar { height: 4px; }
.lc-slide-strip::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

.lc-slide-thumb {
  flex-shrink: 0; width: 120px; cursor: pointer;
  border-radius: 8px; overflow: hidden;
  border: 2px solid transparent;
  transition: border-color 0.18s, transform 0.15s;
  position: relative;
}
.lc-slide-thumb:hover { border-color: var(--accent, #5b8dee); transform: scale(1.03); }
.lc-slide-thumb img { width: 100%; display: block; border-radius: 6px; }
.lc-slide-num {
  position: absolute; bottom: 4px; right: 4px;
  background: rgba(0,0,0,0.72); color: #fff;
  font-size: 9px; font-family: 'DM Mono', monospace;
  padding: 1px 5px; border-radius: 4px; pointer-events: none;
}
.lc-slide-loading {
  font-family: 'DM Mono', monospace; font-size: 11px;
  color: var(--text-muted, #6b7280); padding: 8px 0;
  display: flex; align-items: center; gap: 6px;
}
.lc-slide-none {
  font-size: 12px; color: var(--text-muted, #6b7280);
  font-style: italic; padding: 8px 0;
}

/* ── Lightbox ─────────────────────────────────────────────────────────────── */
.lc-lightbox-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.88);
  backdrop-filter: blur(10px); z-index: 99999;
  display: flex; align-items: center; justify-content: center;
  animation: lc-lb-in 0.15s ease;
}
@keyframes lc-lb-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.lc-lightbox {
  position: relative; max-width: min(90vw, 900px); max-height: 90vh;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.lc-lightbox img {
  max-width: 100%; max-height: 75vh; border-radius: 10px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.7);
  object-fit: contain;
}
.lc-lightbox-controls {
  display: flex; align-items: center; gap: 12px;
}
.lc-lightbox-btn {
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
  color: #fff; border-radius: 8px; cursor: pointer;
  font-size: 18px; line-height: 1;
  min-width: 44px; min-height: 44px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.lc-lightbox-btn:hover { background: rgba(255,255,255,0.2); }
.lc-lightbox-btn:disabled { opacity: 0.3; cursor: default; }
.lc-lightbox-counter {
  font-family: 'DM Mono', monospace; font-size: 13px; color: rgba(255,255,255,0.7);
  min-width: 60px; text-align: center;
}
.lc-lightbox-close {
  position: absolute; top: -40px; right: 0;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
  color: #fff; border-radius: 8px; cursor: pointer;
  font-size: 18px; line-height: 1;
  min-width: 44px; min-height: 44px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.lc-lightbox-close:hover { background: rgba(255,255,255,0.2); }

/* ── Kebab dropdown ─────────────────────────────────────────────────────── */
.lc-menu {
  position: absolute; top: 44px; right: 8px; background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.45); z-index: 300; min-width: 200px;
  overflow: visible; animation: lc-menu-in 0.12s ease;
}
@keyframes lc-menu-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.lc-menu-row { position: relative; }
.lc-menu-row-inner { overflow: hidden; border-radius: 0; }
.lc-menu > .lc-menu-row:first-child .lc-menu-row-inner { border-radius: 9px 9px 0 0; }
.lc-menu > .lc-menu-row:last-child  .lc-menu-row-inner { border-radius: 0 0 9px 9px; }

.lc-menu-item {
  display: flex; align-items: center; gap: 10px;
  padding: ${MENU_ITEM_PADDING};
  font-family: 'Outfit', sans-serif; font-size: ${MENU_FONT_SIZE};
  color: var(--text, #e8eaf0); cursor: pointer;
  transition: background 0.1s; border: none; background: none;
  width: 100%; text-align: left; min-height: ${MENU_ITEM_MIN_HEIGHT}; white-space: nowrap;
}
.lc-menu-item:hover { background: rgba(255,255,255,0.06); }
.lc-menu-item.active { background: rgba(255,255,255,0.04); }
.lc-menu-item.danger { color: #f87171; }
.lc-menu-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 2px 0; }
@media (max-width: 639px) { .lc-menu-item { min-height: 44px; font-size: 14px; padding: 10px 18px; } }

/* Submenu */
.lc-submenu {
  position: absolute; top: 0; right: calc(100% + 4px); background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.45); z-index: 400; min-width: 210px;
  overflow: hidden; animation: lc-menu-in 0.1s ease;
}
@media (max-width: 639px) {
  .lc-submenu {
    position: static !important; right: auto !important; top: auto !important;
    width: 100% !important; box-shadow: none; border: none;
    border-left: 2px solid rgba(255,255,255,0.1); border-radius: 0; animation: none;
    background: rgba(255,255,255,0.02);
  }
  .lc-submenu .lc-menu-item { padding-left: 32px; }
}

.lc-color-row { display: flex; gap: 8px; padding: 10px 16px; flex-wrap: wrap; }
.lc-color-swatch {
  width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
  border: 2px solid transparent; transition: transform 0.12s, border-color 0.12s; flex-shrink: 0;
}
.lc-color-swatch:hover { transform: scale(1.18); }
.lc-color-swatch.selected { border-color: rgba(255,255,255,0.7); box-shadow: 0 0 0 1px rgba(255,255,255,0.3); }

.lc-restore-btn {
  display: block; width: 100%; text-align: center; margin-top: 10px; padding: 6px;
  font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
  color: var(--accent, #5b8dee); background: rgba(91,141,238,0.1);
  border: 1px solid rgba(91,141,238,0.2); border-radius: 8px; cursor: pointer; transition: background 0.15s;
  min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 6px;
}
.lc-restore-btn:hover { background: rgba(91,141,238,0.18); }

/* ── Portal context menu ── */
.lc-ctx {
  position: fixed; background: var(--surface2, #1a1e27);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
  z-index: 99999; min-width: 200px; overflow: hidden; padding-bottom: 4px;
  animation: lc-ctx-in 0.12s ease;
}
@keyframes lc-ctx-in {
  from { opacity: 0; transform: scale(0.97) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.lc-ctx-label {
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em;
  color: var(--text-muted, #6b7280); padding: 10px 16px 4px; text-transform: uppercase;
}
.lc-ctx-colors { display: flex; gap: 7px; flex-wrap: wrap; padding: 6px 16px 10px; }
.lc-ctx-swatch {
  width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
  border: 2px solid transparent; transition: transform 0.12s, border-color 0.12s; flex-shrink: 0;
}
.lc-ctx-swatch:hover { transform: scale(1.2); }
.lc-ctx-swatch.selected { border-color: rgba(255,255,255,0.75); box-shadow: 0 0 0 1px rgba(255,255,255,0.3); }
@media (max-width: 639px) { .lc-ctx-swatch { width: 32px; height: 32px; } .lc-ctx-colors { gap: 9px; } }

.lc-ctx-item {
  display: flex; align-items: center; gap: 10px;
  padding: ${MENU_ITEM_PADDING};
  font-family: 'Outfit', sans-serif; font-size: ${MENU_FONT_SIZE};
  color: var(--text, #e8eaf0); cursor: pointer;
  transition: background 0.1s; border: none; background: none;
  width: 100%; text-align: left; min-height: ${MENU_ITEM_MIN_HEIGHT}; white-space: nowrap;
}
.lc-ctx-item:hover { background: rgba(255,255,255,0.06); }
.lc-ctx-item.danger { color: #f87171; }
.lc-ctx-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 2px 0; }
@media (max-width: 639px) { .lc-ctx-item { min-height: 44px; font-size: 14px; padding: 10px 18px; } }
`;

// ─── Lightbox ─────────────────────────────────────────────────────────────────

interface LightboxProps {
  slides: string[];
  initialIndex: number;
  onClose: () => void;
}

function Lightbox({ slides, initialIndex, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx(i => Math.min(slides.length - 1, i + 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, slides.length]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="lc-lightbox-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label="Slide viewer"
    >
      <div className="lc-lightbox">
        <button className="lc-lightbox-close" onClick={onClose} aria-label="Close">✕</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slides[idx]} alt={`Slide ${idx + 1}`} />
        <div className="lc-lightbox-controls">
          <button
            className="lc-lightbox-btn"
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0} aria-label="Previous slide"
          >‹</button>
          <span className="lc-lightbox-counter">{idx + 1} / {slides.length}</span>
          <button
            className="lc-lightbox-btn"
            onClick={() => setIdx(i => Math.min(slides.length - 1, i + 1))}
            disabled={idx === slides.length - 1} aria-label="Next slide"
          >›</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── SlideStrip ───────────────────────────────────────────────────────────────

interface SlideStripProps {
  internalId: string;
  slideCount: number;
  accentColor: string;
}

type SlideState = 'loading' | 'loaded' | 'empty';

function SlideStrip({ internalId, slideCount, accentColor }: SlideStripProps) {
  const [slideUrls, setSlideUrls] = useState<string[]>([]);
  const [state, setState] = useState<SlideState>('loading');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    async function loadSlides() {
      const supabase = createClient();
      const count = Math.max(slideCount ?? 0, 1);
      const urls: string[] = [];

      for (let i = 1; i <= count; i++) {
        const paddedNum = String(i).padStart(2, '0');
        const path = `slides/${internalId}/slide_${paddedNum}.jpg`;
        const { data } = supabase.storage.from('studymd').getPublicUrl(path);
        if (data?.publicUrl) urls.push(data.publicUrl);
      }

      // Probe the first URL to see if slides actually exist
      if (urls.length > 0) {
        try {
          const res = await fetch(urls[0], { method: 'HEAD' });
          if (!res.ok) { setState('empty'); return; }
        } catch {
          setState('empty'); return;
        }
      }

      if (urls.length === 0) { setState('empty'); return; }
      setSlideUrls(urls);
      setState('loaded');
    }

    loadSlides();
  }, [internalId, slideCount]);

  return (
    <>
      {state === 'loading' && (
        <div className="lc-slide-loading">
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          Loading slides…
        </div>
      )}
      {state === 'empty' && (
        <div className="lc-slide-none">No slide images available</div>
      )}
      {state === 'loaded' && (
        <div className="lc-slide-strip" role="list" aria-label="Lecture slides">
          {slideUrls.map((url, i) => (
            <div
              key={i}
              className="lc-slide-thumb"
              role="listitem"
              tabIndex={0}
              aria-label={`Slide ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIdx(i); } }}
              style={{ borderColor: lightboxIdx === i ? accentColor : undefined }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Slide ${i + 1}`} loading="lazy" />
              <span className="lc-slide-num">{i + 1}</span>
            </div>
          ))}
        </div>
      )}

      {lightboxIdx !== null && (
        <Lightbox
          slides={slideUrls}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

// ─── ContextMenu via Portal ────────────────────────────────────────────────

interface ContextMenuProps {
  x: number; y: number;
  currentColor: string; currentCourse: Course;
  showColor: boolean; showCourse: boolean; showVisibility: boolean;
  isArchived: boolean; isHidden: boolean;
  onChangeCourse: (c: Course) => void; onChangeColor: (c: string) => void;
  onHide: () => void; onArchive: () => void; onRestore: () => void;
  onClose: () => void;
}

function ContextMenu({
  x, y, currentColor, currentCourse,
  showColor, showCourse, showVisibility,
  isArchived, isHidden,
  onChangeCourse, onChangeColor, onHide, onArchive, onRestore, onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    if (!ref.current) return;
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    const vw = window.innerWidth, vh = window.innerHeight;
    setPos({
      x: x + w > vw - 8 ? Math.max(4, vw - w - 8) : x,
      y: y + h > vh - 8 ? Math.max(4, vh - h - 8) : y,
    });
  }, [x, y]);

  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 0);
    const onDown = (e: MouseEvent) => {
      if (!active) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey    = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onCtx    = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('contextmenu', onCtx);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
    };
  }, [onClose]);

  const menu = (
    <div ref={ref} className="lc-ctx" style={{ left: pos.x, top: pos.y }}
      role="menu" onContextMenu={(e) => e.preventDefault()}>

      {showColor && (
        <>
          <div className="lc-ctx-label">Color</div>
          <div className="lc-ctx-colors">
            {PRESET_COLORS.map(c => (
              <button key={c}
                className={`lc-ctx-swatch${currentColor === c ? ' selected' : ''}`}
                style={{ background: c }} aria-label={`Color ${c}`}
                onClick={() => { onChangeColor(c); onClose(); }} />
            ))}
          </div>
          {(showCourse || showVisibility) && <div className="lc-ctx-divider" />}
        </>
      )}

      {showCourse && (
        <>
          <div className="lc-ctx-label">Course</div>
          {COURSES.map(c => (
            <button key={c} className="lc-ctx-item" role="menuitem"
              onClick={() => { onChangeCourse(c); onClose(); }}>
              <span style={{ opacity: c === currentCourse ? 1 : 0, width: 16, flexShrink: 0 }}>✓</span>
              {c}
            </button>
          ))}
          {showVisibility && <div className="lc-ctx-divider" />}
        </>
      )}

      {showVisibility && (
        isArchived || isHidden ? (
          <button className="lc-ctx-item" role="menuitem" onClick={() => { onRestore(); onClose(); }}>
            <span>↩️</span> {isArchived ? 'Restore' : 'Unhide'}
          </button>
        ) : (
          <>
            <button className="lc-ctx-item" role="menuitem" onClick={() => { onHide(); onClose(); }}>
              <span>👁</span> Hide
            </button>
            <button className="lc-ctx-item danger" role="menuitem" onClick={() => { onArchive(); onClose(); }}>
              <span>📦</span> Archive
            </button>
          </>
        )
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(menu, document.body);
}

// ─── KebabMenu (manage mode only) ────────────────────────────────────────────

interface KebabMenuProps {
  anchorRect: DOMRect;
  lecture: LectureWithSettings;
  onHide: () => void; onArchive: () => void; onRestore: () => void;
  onEditTags: () => void;
  onChangeCourse: (course: Course) => void;
  onChangeColor: (color: string) => void;
  onClose: () => void;
}

function KebabMenu({ anchorRect, lecture, onHide, onArchive, onRestore, onEditTags, onChangeCourse, onChangeColor, onClose }: KebabMenuProps) {
  const [showCourse, setShowCourse] = useState(false);
  const [showColor, setShowColor] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    const menuEl = menuRef.current;
    if (!menuEl) {
      setPos({ top: anchorRect.bottom + 6, left: anchorRect.right - 200 });
      return;
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = menuEl.offsetWidth || 200, mh = menuEl.offsetHeight || 160;
    let left = anchorRect.right - mw, top = anchorRect.bottom + 6;
    if (left < 8) left = 8;
    if (left + mw > vw - 8) left = vw - mw - 8;
    if (top + mh > vh - 8) top = anchorRect.top - mh - 6;
    setPos({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
    };
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current || !pos) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = menuRef.current.offsetWidth, mh = menuRef.current.offsetHeight;
    let left = anchorRect.right - mw, top = anchorRect.bottom + 6;
    if (left < 8) left = 8;
    if (left + mw > vw - 8) left = vw - mw - 8;
    if (top + mh > vh - 8) top = anchorRect.top - mh - 6;
    setPos({ top, left });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuRef.current]);

  if (typeof document === 'undefined' || !pos) return null;

  const menu = (
    <div className="lc-menu" ref={menuRef} role="menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}>
      <div className="lc-menu-row"><div className="lc-menu-row-inner">
        <button className="lc-menu-item" onClick={onEditTags} role="menuitem"><span>🏷</span> Edit Tags</button>
      </div></div>

      <div className="lc-menu-row"
        onMouseEnter={() => { setShowCourse(true); setShowColor(false); }}
        onMouseLeave={() => setShowCourse(false)}>
        <div className="lc-menu-row-inner">
          <button className={`lc-menu-item${showCourse ? ' active' : ''}`}
            onClick={() => { setShowCourse(v => !v); setShowColor(false); }}
            role="menuitem" aria-haspopup="true" aria-expanded={showCourse}>
            <span>📚</span> Change Course
            <span style={{ marginLeft: 'auto', opacity: 0.5 }}>›</span>
          </button>
        </div>
        {showCourse && (
          <div className="lc-submenu">
            {COURSES.map(c => (
              <button key={c} className="lc-menu-item"
                onClick={() => { onChangeCourse(c); onClose(); }} role="menuitem">
                <span style={{ opacity: c === lecture.display_course ? 1 : 0, width: 16, flexShrink: 0 }}>✓</span> {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lc-menu-row"
        onMouseEnter={() => { setShowColor(true); setShowCourse(false); }}
        onMouseLeave={() => setShowColor(false)}>
        <div className="lc-menu-row-inner">
          <button className={`lc-menu-item${showColor ? ' active' : ''}`}
            onClick={() => { setShowColor(v => !v); setShowCourse(false); }}
            role="menuitem" aria-haspopup="true" aria-expanded={showColor}>
            <span>🎨</span> Change Color
            <span style={{ marginLeft: 'auto', opacity: 0.5 }}>›</span>
          </button>
        </div>
        {showColor && (
          <div className="lc-submenu">
            <div className="lc-color-row">
              {PRESET_COLORS.map(c => (
                <button key={c}
                  className={`lc-color-swatch${lecture.display_color === c ? ' selected' : ''}`}
                  style={{ background: c }} aria-label={`Color ${c}`}
                  onClick={() => { onChangeColor(c); onClose(); }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="lc-menu-divider" />

      {lecture.settings.archived ? (
        <div className="lc-menu-row"><div className="lc-menu-row-inner">
          <button className="lc-menu-item" onClick={() => { onRestore(); onClose(); }} role="menuitem"><span>↩️</span> Restore</button>
        </div></div>
      ) : !lecture.settings.visible ? (
        <div className="lc-menu-row"><div className="lc-menu-row-inner">
          <button className="lc-menu-item" onClick={() => { onRestore(); onClose(); }} role="menuitem"><span>👁</span> Unhide</button>
        </div></div>
      ) : (
        <>
          <div className="lc-menu-row"><div className="lc-menu-row-inner">
            <button className="lc-menu-item" onClick={() => { onHide(); onClose(); }} role="menuitem"><span>👁</span> Hide</button>
          </div></div>
          <div className="lc-menu-row"><div className="lc-menu-row-inner">
            <button className="lc-menu-item danger" onClick={() => { onArchive(); onClose(); }} role="menuitem"><span>📦</span> Archive</button>
          </div></div>
        </>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}

// ─── LectureCard ──────────────────────────────────────────────────────────────

interface LectureCardProps {
  lecture: LectureWithSettings;
  isManageMode: boolean;
  flashcardProgress?: number;
  examProgress?: number;
  /** @deprecated use onFlashcards / onExam instead; kept for backward-compat */
  onOpen?: () => void;
  onFlashcards?: () => void;
  onExam?: () => void;
  onHide: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onEditTags: () => void;
  onChangeCourse: (course: Course) => void;
  onChangeColor: (color: string) => void;
}

export function LectureCard({
  lecture, isManageMode,
  flashcardProgress = 0, examProgress = 0,
  onOpen, onFlashcards, onExam,
  onHide, onArchive, onRestore, onEditTags,
  onChangeCourse, onChangeColor,
}: LectureCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [kebabRect, setKebabRect] = useState<DOMRect | null>(null);
  const [expanded, setExpanded] = useState(false);
  const kebabRef = useRef<HTMLButtonElement>(null);

  const [localColor, setLocalColor] = useState<string | null>(null);
  const [localCourse, setLocalCourse] = useState<Course | null>(null);
  useEffect(() => { setLocalColor(null); }, [lecture.display_color]);
  useEffect(() => { setLocalCourse(null); }, [lecture.display_course]);

  const displayColor = localColor ?? lecture.display_color;
  const displayCourse = localCourse ?? lecture.display_course;

  const handleChangeColor = useCallback((c: string) => { setLocalColor(c); onChangeColor(c); }, [onChangeColor]);
  const handleChangeCourse = useCallback((c: Course) => { setLocalCourse(c); onChangeCourse(c); }, [onChangeCourse]);

  type CtxMode = { x: number; y: number; showColor: boolean; showCourse: boolean; showVisibility: boolean } | null;
  const [ctxMenu, setCtxMenu] = useState<CtxMode>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lecture.internal_id, disabled: !isManageMode });

  const isMenuActive = menuOpen || !!ctxMenu;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isMenuActive ? 200 : undefined,
  };

  const classNames = [
    'lc-card',
    isManageMode ? 'lc-manage-mode' : '',
    isDragging ? 'lc-dragging' : '',
    lecture.settings.archived ? 'lc-archived' : '',
    isMenuActive ? 'lc-menu-open' : '',
    expanded && !isManageMode ? 'lc-expanded' : '',
  ].filter(Boolean).join(' ');

  function openFullCtx(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    setMenuOpen(false);
    setCtxMenu({ x: e.clientX, y: e.clientY, showColor: true, showCourse: true, showVisibility: true });
  }

  function openCourseCtx(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    setMenuOpen(false);
    setCtxMenu({ x: e.clientX, y: e.clientY, showColor: false, showCourse: true, showVisibility: false });
  }

  // Card click: toggle expand (non-manage). Backward-compat: if no expand handlers provided, fall back to onOpen.
  function handleCardClick() {
    if (isManageMode || isMenuActive) return;
    if (onFlashcards || onExam) {
      setExpanded((v) => !v);
    } else {
      onOpen?.();
    }
  }

  function handleFlashcardsClick(e: React.MouseEvent) {
    e.stopPropagation();
    onFlashcards?.();
  }

  function handleExamClick(e: React.MouseEvent) {
    e.stopPropagation();
    onExam?.();
  }

  const hasStudyActions = !!(onFlashcards || onExam);

  return (
    <>
      <style>{cardCss}</style>
      <div
        ref={setNodeRef} style={style} className={classNames}
        onClick={handleCardClick}
        onContextMenu={openFullCtx}
        role={isManageMode ? 'listitem' : 'button'}
        tabIndex={isManageMode ? -1 : 0}
        onKeyDown={(e) => {
          if (!isManageMode && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleCardClick();
          }
        }}
      >
        <div className="lc-accent-bar" style={{ background: displayColor, left: isManageMode ? 32 : 20 }} />

        {isManageMode && (
          <div className="lc-drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">≡</div>
        )}

        <button className="lc-kebab-btn"
          ref={kebabRef}
          onClick={(e) => {
            e.stopPropagation();
            const rect = kebabRef.current?.getBoundingClientRect() ?? null;
            setKebabRect(rect);
            setMenuOpen(v => !v);
          }}
          aria-label="Lecture options" aria-haspopup="true" aria-expanded={menuOpen}>⋮</button>

        {menuOpen && kebabRect && (
          <KebabMenu
            anchorRect={kebabRect}
            lecture={{ ...lecture, display_color: displayColor, display_course: displayCourse }}
            onHide={onHide} onArchive={onArchive} onRestore={onRestore}
            onEditTags={onEditTags}
            onChangeCourse={handleChangeCourse} onChangeColor={handleChangeColor}
            onClose={() => setMenuOpen(false)}
          />
        )}

        {ctxMenu && (
          <ContextMenu
            x={ctxMenu.x} y={ctxMenu.y}
            currentColor={displayColor} currentCourse={displayCourse}
            showColor={ctxMenu.showColor} showCourse={ctxMenu.showCourse}
            showVisibility={ctxMenu.showVisibility}
            isArchived={lecture.settings.archived}
            isHidden={!lecture.settings.visible}
            onChangeCourse={handleChangeCourse} onChangeColor={handleChangeColor}
            onHide={onHide} onArchive={onArchive} onRestore={onRestore}
            onClose={() => setCtxMenu(null)}
          />
        )}

        <div className="lc-header" style={{ paddingLeft: isManageMode ? 20 : 0 }}>
          <div className="lc-icon">{lecture.icon}</div>
          <div className="lc-title-block">
            <div className="lc-title">{lecture.display_title}</div>
            <span
              className="lc-course-badge"
              style={{ background: `${displayColor}22`, color: displayColor }}
              onClick={openCourseCtx}
              onContextMenu={openFullCtx}
              title="Click to change course · Right-click for all options"
            >
              {displayCourse}
            </span>
          </div>
        </div>

        <div className="lc-progress-row">
          <div className="lc-progress-item">
            <span>Flashcards</span>
            <div className="lc-progress-bar-bg">
              <div className="lc-progress-bar-fill"
                style={{ width: `${flashcardProgress}%`, background: displayColor, opacity: 0.75 }} />
            </div>
          </div>
          <div className="lc-progress-item">
            <span>Exam</span>
            <div className="lc-progress-bar-bg">
              <div className="lc-progress-bar-fill"
                style={{ width: `${examProgress}%`, background: displayColor, opacity: 0.75 }} />
            </div>
          </div>
        </div>

        {lecture.settings.tags.length > 0 && (
          <div className="lc-tags" aria-label="Tags">
            {lecture.settings.tags.map(tag => <span key={tag} className="lc-tag">{tag}</span>)}
          </div>
        )}

        <div className="lc-slide-count">{lecture.slide_count} slides</div>

        {/* ── Expand panel: Study Mode + Slide strip ── */}
        {hasStudyActions && !isManageMode && (
          <div className={`lc-expand-panel${expanded ? ' open' : ''}`}>
            <div className="lc-expand-inner">

              {/* STUDY MODE */}
              <div className="lc-expand-section-label">Study Mode</div>
              <div className="lc-study-btns">
                <button
                  className="lc-study-btn flash"
                  onClick={handleFlashcardsClick}
                  aria-label={`Study flashcards for ${lecture.display_title}`}
                >
                  <span className="lc-btn-icon">📇</span>
                  <span className="lc-btn-label">Flashcards</span>
                  <span className="lc-btn-sub">Review & memorize</span>
                </button>
                <button
                  className="lc-study-btn exam"
                  onClick={handleExamClick}
                  aria-label={`Practice exam for ${lecture.display_title}`}
                >
                  <span className="lc-btn-icon">📝</span>
                  <span className="lc-btn-label">Practice Exam</span>
                  <span className="lc-btn-sub">Test your knowledge</span>
                </button>
              </div>

              {/* LECTURE SLIDES */}
              <div className="lc-expand-section-label">Lecture Slides</div>
              {expanded && (
                <SlideStrip
                  internalId={lecture.internal_id}
                  slideCount={lecture.slide_count ?? 0}
                  accentColor={displayColor}
                />
              )}

            </div>
          </div>
        )}

        {/* Expand chevron indicator */}
        {hasStudyActions && !isManageMode && (
          <div className="lc-expand-indicator" aria-hidden="true">
            {expanded ? '▲' : '▼'}
          </div>
        )}

        {lecture.settings.archived && (
          <button className="lc-restore-btn" onClick={(e) => { e.stopPropagation(); onRestore(); }}>↩ Restore</button>
        )}
        {!lecture.settings.visible && !lecture.settings.archived && (
          <button className="lc-restore-btn" onClick={(e) => { e.stopPropagation(); onRestore(); }}>👁 Unhide</button>
        )}
      </div>
    </>
  );
}
