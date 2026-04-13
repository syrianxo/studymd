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

// ── Props ────────────────────────────────────────────────────────────────────
// variant='compact'  — single dot on the header bar; click expands the others
// variant='panel'    — all three swatches shown at once (for use inside a menu)

interface ThemePickerProps {
  userId: string;
  initialTheme: Theme;
  variant?: 'compact' | 'panel';
}

export function ThemePicker({ userId, initialTheme, variant = 'compact' }: ThemePickerProps) {
  const [active, setActive]     = useState<Theme>(initialTheme);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving]     = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Only apply initialTheme if the DOM has no saved theme already set.
  // This prevents the server-default 'midnight' from overwriting the user's
  // localStorage theme on every mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('studymd_theme') as Theme | null;
      if (saved === 'midnight' || saved === 'pink' || saved === 'forest') {
        setActive(saved);
        applyTheme(saved);
      } else {
        applyTheme(initialTheme);
      }
    } catch {
      applyTheme(initialTheme);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // compact-only: collapse on outside click
  useEffect(() => {
    if (variant !== 'compact') return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [variant]);

  const handleSelect = useCallback(async (theme: Theme) => {
    if (theme === active && variant === 'compact') { setExpanded(false); return; }
    setActive(theme);
    applyTheme(theme);
    if (variant === 'compact') setExpanded(false);
    setSaving(true);
    try { await saveUserTheme(userId, theme); }
    catch (err) { console.error('Failed to save theme:', err); }
    finally { setSaving(false); }
  }, [active, userId, variant]);

  // ── Panel variant: all swatches always visible ───────────────────────────
  if (variant === 'panel') {
    return (
      <>
        <style>{pickerCss}</style>
        <div className="tp-panel-wrap" aria-label="Theme picker">
          {THEMES.map(t => (
            <button
              key={t.id}
              type="button"
              className={`tp-panel-swatch${active === t.id ? ' tp-panel-active' : ''}`}
              style={{ '--swatch': t.swatch, '--glow': t.glow } as React.CSSProperties}
              aria-label={`${t.label} theme${active === t.id ? ' (active)' : ''}`}
              aria-pressed={active === t.id}
              title={t.label}
              onClick={() => handleSelect(t.id)}
            >
              <span className="tp-panel-dot" style={{ background: t.swatch }} />
              <span className="tp-panel-label">{t.label}</span>
              {active === t.id && <span className="tp-panel-check" aria-hidden>✓</span>}
            </button>
          ))}
          {saving && <span className="tp-saving" aria-live="polite">saving…</span>}
        </div>
      </>
    );
  }

  // ── Compact variant: single dot, expands on click ────────────────────────
  const activeDef   = THEMES.find(t => t.id === active)!;
  const otherThemes = THEMES.filter(t => t.id !== active);

  return (
    <>
      <style>{pickerCss}</style>
      <div className="tp-wrap" ref={wrapRef} aria-label="Theme picker">
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
        {saving && <span className="tp-saving" aria-live="polite">saving…</span>}
      </div>
    </>
  );
}

const pickerCss = `
/* ── Compact variant ─────────────────────────────────────────────────── */
.tp-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-direction: row-reverse;
  position: relative;
}
.tp-dot {
  border-radius: 50%;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.2s ease;
  padding: 0;
  position: relative;
}
.tp-dot::after {
  content: '';
  position: absolute;
  inset: -11px;
  border-radius: 50%;
}
.tp-active       { width: 22px; height: 22px; }
.tp-active:hover { transform: scale(1.15); }
.tp-active-open  { transform: scale(1.08); }
.tp-other {
  width: 18px; height: 18px;
  opacity: 0; transform: scale(0.4); pointer-events: none;
}
.tp-other.tp-visible              { opacity: 1; transform: scale(1); pointer-events: auto; }
.tp-other.tp-visible:hover        { transform: scale(1.2); }

/* ── Panel variant ───────────────────────────────────────────────────── */
.tp-panel-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tp-panel-swatch {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: none;
  cursor: pointer;
  transition: background 0.13s, border-color 0.13s;
  width: 100%;
  text-align: left;
  min-height: 44px;
}
.tp-panel-swatch:hover {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.1);
}
.tp-panel-swatch.tp-panel-active {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.14);
}
.tp-panel-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.12);
  transition: box-shadow 0.15s;
}
.tp-panel-swatch.tp-panel-active .tp-panel-dot {
  box-shadow: 0 0 0 2px var(--swatch), 0 0 10px var(--glow);
}
.tp-panel-label {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted, #6b7280);
  flex: 1;
  transition: color 0.13s;
}
.tp-panel-swatch.tp-panel-active .tp-panel-label {
  color: var(--text, #e8eaf0);
}
.tp-panel-check {
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  flex-shrink: 0;
}

/* ── Shared ──────────────────────────────────────────────────────────── */
.tp-saving {
  font-size: 10px;
  color: var(--text-muted, #6b7280);
  font-family: 'DM Mono', monospace;
  opacity: 0.7;
  white-space: nowrap;
  margin-top: 4px;
}
`;

// ── SSR flash-prevention script ──────────────────────────────────────────────
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
