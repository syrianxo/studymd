'use client';

import React, { useState, useEffect, useCallback } from 'react';
// Call API route — cannot import supabase-server in a client component
async function saveUserTheme(userId: string, theme: string): Promise<void> {
  await fetch('/api/preferences/theme', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, theme }),
  });
}
import type { Theme } from '@/types';

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
  { id: 'lavender', label: 'Lavender', swatch: '#a78bfa', glow: '#a78bfa44' },
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
    if (t === 'midnight' || t === 'lavender' || t === 'forest') {
      document.documentElement.dataset.theme = t;
    } else {
      document.documentElement.dataset.theme = 'midnight';
    }
  } catch(e) {
    document.documentElement.dataset.theme = 'midnight';
  }
})();
`.trim();
