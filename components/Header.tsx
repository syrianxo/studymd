// components/Header.tsx
// Mobile: logo (left) + icon-only row (right) — no text labels below 768px
// Desktop: full labels + subtitle
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { PomodoroMiniPill } from '@/components/PomodoroTimer';
import { ThemePicker } from './ThemePicker';
import type { Theme } from '@/types';

interface HeaderProps {
  lectureCount: number;
  loading?: boolean;
  userId: string;
  initialTheme: Theme;
  /** @deprecated — kept for backward compat; ignored */
  onUploadClick?: () => void;
  isProcessing?: boolean;
  /** Hide the Upload button entirely (used on /app/upload itself) */
  hideUploadButton?: boolean;
}

export default function Header({
  lectureCount: _lectureCount,
  loading: _loading = false,
  userId,
  initialTheme,
  isProcessing = false,
  hideUploadButton = false,
}: HeaderProps) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent | TouchEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown as EventListener, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown as EventListener);
    };
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <style>{headerCss}</style>
      <header className="smd-header">

        {/* ── Logo ── */}
        <Link href={userId ? "/app" : "/"} prefetch={false} className="smd-header-logo-link" aria-label="StudyMD — home">
          <div className="smd-logo">
            <span className="smd-logo-study">Study</span>
            <span className="smd-logo-md">MD</span>
          </div>
          {/* Subtitle hidden on mobile via CSS */}
          <div className="smd-header-subtitle smd-hdr-desktop-only">
            Lecture Mastery Platform
          </div>
        </Link>

        {/* ── Nav links — desktop only; full treatment (active state, mobile drawer) in Slice 7 ── */}
        <nav className="smd-header-nav smd-hdr-desktop-only" aria-label="Main navigation">
          <Link href="/app" className="smd-header-navlink" prefetch={false}>My Lectures</Link>
          <Link href="/app/plans" className="smd-header-navlink" prefetch={false}>My Plans</Link>
        </nav>

        {/* ── Right controls ── */}
        <div className="smd-header-right">

          {/* 1. Upload — icon-only on mobile, icon+label on desktop */}
          {!hideUploadButton && (
            <Link
              href="/app/upload"
              className="smd-hdr-btn smd-hdr-upload"
              aria-label={isProcessing ? 'Processing lecture…' : 'Upload lecture'}
              title="Upload Lecture"
            >
              {isProcessing
                ? <span className="smd-hdr-spinner" aria-hidden="true" />
                : (
                  /* Upload icon SVG — works at any size, scales with CSS */
                  <svg className="smd-hdr-icon-svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M10 3a1 1 0 01.707.293l4 4a1 1 0 01-1.414 1.414L11 6.414V13a1 1 0 11-2 0V6.414L6.707 8.707A1 1 0 015.293 7.293l4-4A1 1 0 0110 3z" />
                    <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                  </svg>
                )}
              <span className="smd-hdr-label smd-hdr-desktop-only">
                {isProcessing ? 'Processing…' : 'Upload'}
              </span>
            </Link>
          )}

          {/* 2. Pomodoro mini-pill — hidden <768px by design (120px+ min-width collides with mobile icons).
               Timer state persists because PomoProvider wraps the whole app (see layout.tsx).
               Accessible via /app/focus in a future release (v3.1). ADR-022. */}
          <PomodoroMiniPill />

          {/* 3. Settings/Theme — gear icon opens panel with theme picker, profile, sign-out */}
          <div className="smd-hdr-settings-wrap" ref={settingsRef}>
            <button
              className="smd-hdr-gear"
              onClick={() => setSettingsOpen(o => !o)}
              aria-label="Settings"
              title="Settings"
              aria-expanded={settingsOpen}
            >
              {/* Gear icon — shown on all screen sizes */}
              <svg
                className="smd-hdr-gear-icon"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                />
              </svg>
            </button>

            {settingsOpen && (
              <div className="smd-hdr-settings-panel" role="dialog" aria-label="Settings">
                <div className="smd-hdr-panel-label">Theme</div>
                <ThemePicker
                  userId={userId}
                  initialTheme={initialTheme}
                  variant="panel"
                />
                <div className="smd-hdr-panel-divider" />
                {/* Profile link */}
                <Link href="/app/profile" className="smd-hdr-panel-link" onClick={() => setSettingsOpen(false)}>
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
                    <path fillRule="evenodd" clipRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                  </svg>
                  Profile & Settings
                </Link>
                <div className="smd-hdr-panel-divider" />
                <button className="smd-hdr-panel-signout" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>


        </div>
      </header>
    </>
  );
}

const headerCss = `
/* ── Visibility helpers ────────────────────────────────────────────── */
.smd-hdr-desktop-only { display: inline-flex; }
.smd-hdr-mobile-only  { display: none !important; }

@media (max-width: 767px) {
  .smd-hdr-desktop-only { display: none !important; }
  .smd-hdr-mobile-only  { display: flex !important; }
}

/* ── Header nav ────────────────────────────────────────────────────── */
.smd-header-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 24px;
}
.smd-header-navlink {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  min-height: 36px;
  border-radius: 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted, #6b7280);
  text-decoration: none;
  transition: background 0.13s, color 0.13s;
  white-space: nowrap;
}
.smd-header-navlink:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text, #e8eaf0);
}

/* ── Logo link ─────────────────────────────────────────────────────── */
.smd-header-logo-link {
  display: flex;
  flex-direction: column;
  text-decoration: none;
  gap: 2px;
  outline: none;
}
.smd-header-logo-link:focus-visible .smd-logo {
  outline: 2px solid var(--accent);
  border-radius: 4px;
}

/* ── Right row ─────────────────────────────────────────────────────── */
.smd-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Shared SVG icon sizing ────────────────────────────────────────── */
.smd-hdr-icon-svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* ── Upload button ─────────────────────────────────────────────────── */
.smd-hdr-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: none;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  color: var(--text-muted, #6b7280);
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 7px 14px;
  min-height: 44px;
  min-width: 44px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
  text-decoration: none;
}
.smd-hdr-upload:hover {
  background: rgba(91,141,238,0.12);
  border-color: rgba(91,141,238,0.35);
  color: var(--accent, #5b8dee);
}
.smd-hdr-label { font-size: 13px; }
.smd-hdr-spinner {
  display: inline-block;
  width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,0.15);
  border-top-color: var(--accent, #5b8dee);
  border-radius: 50%;
  animation: smd-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes smd-spin { to { transform: rotate(360deg); } }

/* ── Gear / settings button ────────────────────────────────────────── */
.smd-hdr-settings-wrap { position: relative; }
.smd-hdr-gear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  background: none;
  border: none;
  border-radius: 10px;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  padding: 0;
}
.smd-hdr-gear:hover,
.smd-hdr-gear[aria-expanded="true"] {
  color: var(--text, #e8eaf0);
  background: rgba(255,255,255,0.06);
}
.smd-hdr-gear-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.35s ease;
}
.smd-hdr-gear[aria-expanded="true"] .smd-hdr-gear-icon {
  transform: rotate(45deg);
}

/* ── Mobile sign-out icon button ───────────────────────────────────── */
.smd-hdr-signout-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  background: none;
  border: none;
  border-radius: 10px;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  padding: 0;
  transition: color 0.15s, background 0.15s;
}
.smd-hdr-signout-icon:hover {
  color: #f87171;
  background: rgba(248,113,113,0.1);
}

/* ── Settings dropdown panel ───────────────────────────────────────── */
.smd-hdr-settings-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--surface, #13161d);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  padding: 14px 12px 10px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.55);
  z-index: 9999;
  min-width: 190px;
  animation: smd-panel-in 0.14s ease;
}
@keyframes smd-panel-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.smd-hdr-panel-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--text-muted, #6b7280);
  margin-bottom: 6px;
  padding: 0 10px;
  font-family: 'DM Mono', monospace;
}
.smd-hdr-panel-divider {
  height: 1px;
  background: rgba(255,255,255,0.07);
  margin: 8px 0;
}
.smd-hdr-panel-link {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  min-height: 44px;
  background: none;
  border: none;
  border-radius: 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  transition: background 0.13s, color 0.13s;
  text-decoration: none;
}
.smd-hdr-panel-link:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text, #e8eaf0);
}
.smd-hdr-panel-signout {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 10px;
  min-height: 44px;
  background: none;
  border: none;
  border-radius: 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  transition: background 0.13s, color 0.13s;
  text-align: left;
}
.smd-hdr-panel-signout:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text, #e8eaf0);
}

/* ── Mobile (< 768px) ──────────────────────────────────────────────── */
@media (max-width: 767px) {
  .smd-header { padding: 10px 16px; }
  .smd-header-right { gap: 2px; }

  /* Upload collapses to icon-only 44×44 square */
  .smd-hdr-btn {
    padding: 0;
    width: 44px;
    border-radius: 10px;
  }

  /* Settings panel: shift to stay in viewport on narrow screens */
  .smd-hdr-settings-panel {
    right: -8px;
    max-width: calc(100vw - 24px);
  }

  .smd-hdr-gear[aria-expanded="true"] .smd-hdr-gear-icon {
    transform: rotate(45deg);
    color: var(--accent);
  }
}
`;
