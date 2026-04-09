// components/study/Lightbox.tsx
'use client';

import { useEffect, useCallback } from 'react';

interface LightboxProps {
  images: string[];          // all slide URLs in current lecture
  currentIndex: number;      // -1 = closed
  onClose: () => void;
  onNavigate: (index: number) => void;
  caption?: string;
}

export default function Lightbox({
  images,
  currentIndex,
  onClose,
  onNavigate,
  caption,
}: LightboxProps) {
  const isOpen = currentIndex >= 0 && currentIndex < images.length;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  // ── Keyboard navigation ──────────────────────────────────────────────────
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1);
    },
    [isOpen, hasPrev, hasNext, currentIndex, onClose, onNavigate]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <div className={`smd-lightbox${isOpen ? ' active' : ''}`}>
      <div className="smd-lightbox-backdrop" onClick={onClose} />

      {isOpen && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="smd-lightbox-img"
          src={images[currentIndex]}
          alt={caption ?? `Slide ${currentIndex + 1}`}
          onClick={() => hasNext && onNavigate(currentIndex + 1)}
        />
      )}

      <button className="smd-lightbox-close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      <button
        className={`smd-lightbox-nav smd-lightbox-prev${hasPrev ? '' : ' hidden'}`}
        onClick={() => onNavigate(currentIndex - 1)}
        aria-label="Previous slide"
      >
        ‹
      </button>

      <button
        className={`smd-lightbox-nav smd-lightbox-next${hasNext ? '' : ' hidden'}`}
        onClick={() => onNavigate(currentIndex + 1)}
        aria-label="Next slide"
      >
        ›
      </button>

      {isOpen && (
        <>
          <div className="smd-lightbox-counter">
            {currentIndex + 1} / {images.length}
          </div>
          {caption && (
            <div className="smd-lightbox-caption">{caption}</div>
          )}
        </>
      )}
    </div>
  );
}
