'use client';

import { useEffect } from 'react';

/**
 * Centralizes scroll-lock for modals: fixes body position, prevents
 * iOS rubber-band scroll behind modal, and restores scroll position on close.
 * Uses position:fixed + top:-scrollY so iOS Safari won't scroll the page
 * underneath. Restores original scroll position on cleanup.
 */
export function useModalShell(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const prev = {
      position: document.body.style.position,
      top:      document.body.style.top,
      width:    document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = prev.position;
      document.body.style.top      = prev.top;
      document.body.style.width    = prev.width;
      document.body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);
}
