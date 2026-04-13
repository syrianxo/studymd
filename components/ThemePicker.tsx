// components/ThemePicker.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

async function saveUserTheme(userId: string, theme: string): Promise<void> {
  await fetch('/api/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme }),
  });
}
import type { Theme } from '@/types';

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

// ── Component ──────────────────────────────────────────────────────────────────
// Design: one circle showing the current theme color.
// Click it → the other two choices fan out inline to the left.
// Clicking another circle selects it; clicking outside collapses.

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

  // Close on outside click
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

  const activeDef  = THEMES.find(t => t.id === active)!;
  const otherThemes = THEMES.filter(t => t.id !== active);

  return (
    <>
      <style>{pickerCss}</style>
      <div className="tp-wrap" ref={wrapRef} aria-label="Theme picker">

        {/* Other choices — revealed on expand, fan to the left */}
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

        {/* Active dot — always visible, click to expand/collapse */}
        <button
          type="button"
          className={`tp-dot tp-active${expanded ? ' tp-active-open' : ''}`}
          style={{
            background: activeDef.swatch,
            boxShadow: expanded
              ? `0 0 0 3px ${activeDef.glow}, 0 0 14px ${activeDef.glow}`
              : `0 0 0 2px ${activeDef.glow}`,
          } as React.CSSProperties}
          aria-label={`Current theme: ${activeDef.label}. Click to change.`}
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
  flex-direction: row-reverse; /* active dot rightmost, others fan left */
  position: relative;
}

/* Shared dot base */
.tp-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
  /* 44px touch target via padding trick */
  padding: 0;
  position: relative;
}
.tp-dot::after {
  content: '';
  position: absolute;
  inset: -11px;
  border-radius: 50%;
}

/* Active dot */
.tp-active {
  transform: scale(1);
}
.tp-active:hover {
  transform: scale(1.15);
}
.tp-active-open {
  transform: scale(1.1);
}

/* Other dots — hidden by default, revealed on expand */
.tp-other {
  opacity: 0;
  transform: scale(0.5);
  pointer-events: none;
  width: 18px;
  height: 18px;
}
.tp-other.tp-visible {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}
.tp-other.tp-visible:hover {
  transform: scale(1.2);
}

.tp-saving {
  font-size: 10px;
  color: var(--text-muted, #6b7280);
  font-family: 'DM Mono', monospace;
  opacity: 0.7;
  white-space: nowrap;
}
`;

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

// ─── Theme Definitions ──────────────────────────────────────────────────────

interface ThemeDef {
  id: Theme;
  label: string;
  /** The visual swatch color shown in the picker */
  swatch: string;
  /** Secondary accent for the ring glow */
  glow: string;
}

const THEMES: ThemeDef[] = [
  { id: 'midnight', label: 'Midnight', swatch: '#5b8dee', glow: '#5b8dee44' },
  { id: 'pink',     label: 'Pink',     swatch: '#f472b6', glow: '#f472b644' },
  { id: 'forest',   label: 'Forest',   swatch: '#10b981', glow: '#10b98144' },
];

// ─── Inline Styles ──────────────────────────────────────────────────────────
// We use inline styles to avoid any CSS-variable dependency for the picker UI
// itself (it needs to be readable in all themes).

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,

  circle: (active: boolean, swatch: string, glow: string): React.CSSProperties => ({
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: swatch,
    cursor: 'pointer',
    border: active ? `2px solid ${swatch}` : '2px solid transparent',
    outline: active ? `3px solid ${glow}` : '3px solid transparent',
    outlineOffset: '1px',
    boxShadow: active ? `0 0 12px ${glow}` : 'none',
    transition: 'all 0.18s ease',
    position: 'relative',
    flexShrink: 0,
  }),

  tooltip: {
    position: 'absolute',
    bottom: '130%',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.85)',
    color: '#e8eaf0',
    fontSize: '11px',
    fontFamily: 'Outfit, sans-serif',
    padding: '3px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
    zIndex: 100,
  } as React.CSSProperties,
} as const;

// ─── Theme Application ──────────────────────────────────────────────────────

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  // Persist to localStorage as fast fallback before server load
  try {
    localStorage.setItem('studymd_theme', theme);
  } catch {}
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ThemePickerProps {
  userId: string;
  initialTheme: Theme;
}

export function ThemePicker({ userId, initialTheme }: ThemePickerProps) {
  const [active, setActive] = useState<Theme>(initialTheme);
  const [hoveredId, setHoveredId] = useState<Theme | null>(null);
  const [saving, setSaving] = useState(false);

  // Apply initial theme on mount (redundant if SSR script ran, but safe)
  useEffect(() => {
    applyTheme(initialTheme);
  }, [initialTheme]);

  const handleSelect = useCallback(
    async (theme: Theme) => {
      if (theme === active) return;

      // 1. Apply immediately (no flicker)
      setActive(theme);
      applyTheme(theme);

      // 2. Persist to server (fire-and-forget with feedback)
      setSaving(true);
      try {
        await saveUserTheme(userId, theme);
      } catch (err) {
        console.error('Failed to save theme preference:', err);
        // Non-critical — localStorage already updated
      } finally {
        setSaving(false);
      }
    },
    [active, userId]
  );

  return (
    <div style={styles.wrapper} role="group" aria-label="Color theme">
      {THEMES.map(({ id, label, swatch, glow }) => (
        <div
          key={id}
          style={{ position: 'relative' }}
          onMouseEnter={() => setHoveredId(id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          <button
            type="button"
            aria-label={`${label} theme${active === id ? ' (active)' : ''}`}
            aria-pressed={active === id}
            onClick={() => handleSelect(id)}
            style={styles.circle(active === id, swatch, glow)}
          />
          {hoveredId === id && (
            <span style={styles.tooltip} aria-hidden>
              {label}
            </span>
          )}
        </div>
      ))}
      {/* Subtle saving indicator */}
      {saving && (
        <span
          style={{
            fontSize: '10px',
            color: 'var(--text-muted, #6b7280)',
            fontFamily: 'DM Mono, monospace',
            opacity: 0.7,
          }}
        >
          saving…
        </span>
      )}
    </div>
  );
}

// ─── Server-Side Theme Script ────────────────────────────────────────────────
// Drop this <script> tag into your root layout <head> BEFORE any CSS loads.
// It reads localStorage and sets data-theme before first paint to prevent flash.

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
