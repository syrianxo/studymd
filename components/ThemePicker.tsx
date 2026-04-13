// components/ThemePicker.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Theme } from '@/types';

async function saveUserTheme(userId: string, theme: string): Promise<void> {
  await fetch('/api/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme }),
  });
}

interface ThemeDef {
  id: Theme;
  label: string;
  swatch: string;
  glow: string;
}

const THEMES: ThemeDef[] = [
  { id: 'midnight', label: 'Midnight', swatch: '#5b8dee', glow: '#5b8dee44' },
  { id: 'pink',     label: 'Pink',     swatch: '#f472b6', glow: '#f472b644' },
  { id: 'forest',   label: 'Forest',   swatch: '#10b981', glow: '#10b98144' },
];

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('studymd_theme', theme); } catch {}
}

// ── Component ────────────────────────────────────────────────────────────────
// Design: one circle showing the current theme color is always visible.
// Click it → the other two choices slide in to the left with a staggered fade.
// Click a choice to apply it; clicking outside collapses the picker.

interface ThemePickerProps {
  userId: string;
  initialTheme: Theme;
}

export function ThemePicker({ userId, initialTheme }: ThemePickerProps) {
  const [active, setActive]     = useState<Theme>(initialTheme);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving]     = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { applyTheme(initialTheme); }, [initialTheme]);

  // Collapse on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const handleSelect = useCallback(async (theme: Theme) => {
    if (theme === active) { setExpanded(false); return; }
    setActive(theme);
    applyTheme(theme);
    setExpanded(false);
    setSaving(true);
    try { await saveUserTheme(userId, theme); }
    catch (err) { console.error('Failed to save theme:', err); }
    finally { setSaving(false); }
  }, [active, userId]);

  const activeDef   = THEMES.find(t => t.id === active)!;
  const otherThemes = THEMES.filter(t => t.id !== active);

  return (
    <>
      <style>{pickerCss}</style>
      <div className="tp-wrap" ref={wrapRef} aria-label="Theme picker">

        {/* Other choices — hidden until expanded, slide in from the right */}
        {otherThemes.map((t, i) => (
          <button
            key={t.id}
            type="button"
            className={`tp-dot tp-other${expanded ? ' tp-visible' : ''}`}
            style={{
              background: t.swatch,
              transitionDelay: expanded ? `${i * 40}ms` : '0ms',
            } as React.CSSProperties}
            aria-label={`${t.label} theme`}
            title={t.label}
            onClick={() => handleSelect(t.id)}
          />
        ))}

        {/* Active dot — always visible; click to toggle expand */}
        <button
          type="button"
          className={`tp-dot tp-active${expanded ? ' tp-active-open' : ''}`}
          style={{
            background: activeDef.swatch,
            boxShadow: expanded
              ? `0 0 0 3px ${activeDef.glow}, 0 0 14px ${activeDef.glow}`
              : `0 0 0 2px ${activeDef.glow}`,
          } as React.CSSProperties}
          aria-label={`Theme: ${activeDef.label}. Click to change.`}
          aria-expanded={expanded}
          title={`Theme: ${activeDef.label}`}
          onClick={() => setExpanded(o => !o)}
        />

        {saving && (
          <span className="tp-saving" aria-live="polite">saving…</span>
        )}
      </div>
    </>
  );
}

const pickerCss = `
.tp-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-direction: row-reverse; /* active dot rightmost; others fan in to its left */
  position: relative;
}

/* ── Shared dot base ── */
.tp-dot {
  border-radius: 50%;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.2s ease;
  padding: 0;
  position: relative;
}
/* Expand touch target to 44px without affecting layout */
.tp-dot::after {
  content: '';
  position: absolute;
  inset: -11px;
  border-radius: 50%;
}

/* ── Active dot ── */
.tp-active {
  width: 22px;
  height: 22px;
}
.tp-active:hover   { transform: scale(1.15); }
.tp-active-open    { transform: scale(1.08); }

/* ── Other dots: hidden → visible ── */
.tp-other {
  width: 18px;
  height: 18px;
  opacity: 0;
  transform: scale(0.4);
  pointer-events: none;
}
.tp-other.tp-visible {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}
.tp-other.tp-visible:hover { transform: scale(1.2); }

/* ── Saving indicator ── */
.tp-saving {
  font-size: 10px;
  color: var(--text-muted, #6b7280);
  font-family: 'DM Mono', monospace;
  opacity: 0.7;
  white-space: nowrap;
}
`;

// ── SSR flash-prevention script ──────────────────────────────────────────────
// Place inside <head> before any CSS so the correct theme is applied
// synchronously before first paint — prevents flash of wrong theme.
export const THEME_INIT_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('studymd_theme');
    if (t === 'midnight' || t === 'pink' || t === 'forest') {
      document.documentElement.dataset.theme = t;
    } else {
      document.documentElement.dataset.theme = 'midnight';
    }
  } catch(e) {
    document.documentElement.dataset.theme = 'midnight';
  }
})();
`.trim();
