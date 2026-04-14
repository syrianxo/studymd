// components/Lightbox.tsx
// Shared full-screen image lightbox with keyboard navigation.
// Used by LectureViewModal and anywhere slides need full-screen viewing.
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface LightboxProps {
  slides: string[];
  initialIndex: number;
  onClose: () => void;
}

export default function Lightbox({ slides, initialIndex, onClose }: LightboxProps) {
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
      className="smd-lightbox-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Slide viewer"
    >
      <style>{lightboxCss}</style>
      <div className="smd-lightbox-inner">
        <button className="smd-lightbox-close" onClick={onClose} aria-label="Close">✕</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slides[idx]} alt={`Slide ${idx + 1}`} />
        <div className="smd-lightbox-controls">
          <button
            className="smd-lightbox-btn"
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0}
            aria-label="Previous slide"
          >‹</button>
          <span className="smd-lightbox-counter">{idx + 1} / {slides.length}</span>
          <button
            className="smd-lightbox-btn"
            onClick={() => setIdx(i => Math.min(slides.length - 1, i + 1))}
            disabled={idx === slides.length - 1}
            aria-label="Next slide"
          >›</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const lightboxCss = `
.smd-lightbox-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.88);
  backdrop-filter: blur(10px);
  z-index: 99999;
  display: flex; align-items: center; justify-content: center;
  animation: smd-lb-in 0.15s ease;
}
@keyframes smd-lb-in { from { opacity: 0; } to { opacity: 1; } }
.smd-lightbox-inner {
  position: relative;
  max-width: min(90vw, 900px); max-height: 90vh;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.smd-lightbox-inner img {
  max-width: 100%; max-height: 75vh;
  border-radius: 10px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.7);
  object-fit: contain;
}
.smd-lightbox-controls { display: flex; align-items: center; gap: 12px; }
.smd-lightbox-btn {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  color: #fff; border-radius: 8px; cursor: pointer;
  font-size: 18px; line-height: 1;
  min-width: 44px; min-height: 44px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.smd-lightbox-btn:hover { background: rgba(255,255,255,0.2); }
.smd-lightbox-btn:disabled { opacity: 0.3; cursor: default; }
.smd-lightbox-counter {
  font-family: 'DM Mono', monospace; font-size: 13px;
  color: rgba(255,255,255,0.7); min-width: 60px; text-align: center;
}
.smd-lightbox-close {
  position: absolute; top: -40px; right: 0;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  color: #fff; border-radius: 8px; cursor: pointer;
  font-size: 18px; line-height: 1;
  min-width: 44px; min-height: 44px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.smd-lightbox-close:hover { background: rgba(255,255,255,0.2); }
`;
