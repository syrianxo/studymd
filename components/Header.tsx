// components/Header.tsx
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
  onUploadClick?: () => void;
  isProcessing?: boolean;
}

export default function Header({
  lectureCount: _lectureCount,
  loading: _loading = false,
  userId,
  initialTheme,
  onUploadClick,
  isProcessing = false,
}: HeaderProps) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
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
        <Link href="/" className="smd-header-logo-link" aria-label="StudyMD — home">
          <div className="smd-logo">
            <span className="smd-logo-study">Study</span>
            <span className="smd-logo-md">MD</span>
          </div>
          <div className="smd-header-subtitle smd-hdr-desktop">
            Lecture Mastery Platform
          </div>
        </Link>

        {/* ── Right controls ── */}
        <div className="smd-header-right">

          {/* 1. Upload — icon-only on mobile, icon + label on desktop */}
          {onUploadClick && (
            <button
              className="smd-hdr-btn smd-hdr-upload"
              onClick={onUploadClick}
              aria-label="Upload lecture"
              title="Upload Lecture"
            >
              {isProcessing
                ? <span className="smd-hdr-spinner" aria-hidden="true" />
                : <span className="smd-hdr-icon" aria-hidden="true">⬆</span>}
              <span className="smd-hdr-desktop smd-hdr-btn-label">
                {isProcessing ? 'Processing…' : 'Upload'}
              </span>
            </button>
          )}

          {/* 2. Pomodoro mini-pill — only shown when timer is running */}
          <PomodoroMiniPill />

          {/* 3. Settings gear (desktop) / Sign-out icon (mobile) */}
          <div className="smd-hdr-settings-wrap" ref={settingsRef}>
            {/* Desktop: gear icon opens dropdown with theme + sign out */}
            <button
              className="smd-hdr-gear smd-hdr-desktop"
              onClick={() => setSettingsOpen(o => !o)}
              aria-label="Settings"
              title="Settings"
              aria-expanded={settingsOpen}
            >
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

            {/* Mobile: direct sign-out icon (no gear dropdown) */}
            <button
              className="smd-hdr-signout-icon smd-hdr-mobile-only"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h5a1 1 0 100-2H4V5h4a1 1 0 100-2H3z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M13.293 6.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 11H7a1 1 0 110-2h7.586l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
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
                <button
                  className="smd-hdr-panel-signout"
                  onClick={handleSignOut}
                >
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

/* ── Upload button ─────────────────────────────────────────────────── */
.smd-hdr-btn {
  display: inline-flex;
  align-items: center;
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
  min-height: 40px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.smd-hdr-upload:hover {
  background: rgba(91,141,238,0.12);
  border-color: rgba(91,141,238,0.35);
  color: var(--accent, #5b8dee);
}
.smd-hdr-icon    { font-size: 15px; line-height: 1; flex-shrink: 0; }
.smd-hdr-desktop { display: inline; }
.smd-hdr-spinner {
  display: inline-block;
  width: 15px; height: 15px;
  border: 2px solid rgba(255,255,255,0.15);
  border-top-color: var(--accent, #5b8dee);
  border-radius: 50%;
  animation: smd-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes smd-spin { to { transform: rotate(360deg); } }

/* ── Theme wrap ────────────────────────────────────────────────────── */
.smd-hdr-theme-wrap {
  display: flex;
  align-items: center;
  min-width: 44px;
  min-height: 44px;
  justify-content: center;
}

/* ── Gear button — borderless, icon only ───────────────────────────── */
.smd-hdr-gear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
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

/* ── Mobile sign-out icon ──────────────────────────────────────────── */
.smd-hdr-signout-icon {
  display: none; /* hidden on desktop */
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
.smd-hdr-signout-icon:hover {
  color: var(--text, #e8eaf0);
  background: rgba(255,255,255,0.06);
}

/* ── Mobile-only util ──────────────────────────────────────────────── */
.smd-hdr-mobile-only { display: none; }

/* ── Settings dropdown panel ───────────────────────────────────────── */
.smd-hdr-settings-wrap { position: relative; }
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
  /* Hide desktop-only elements */
  .smd-hdr-desktop { display: none !important; }
  .smd-header { padding: 10px 16px; }

  /* Upload collapses to icon-only square — 44px touch target */
  .smd-hdr-btn {
    padding: 0;
    width: 44px; min-width: 44px; min-height: 44px;
    justify-content: center;
    border-radius: 10px;
  }
  .smd-hdr-icon { font-size: 18px; }
  .smd-header-right { gap: 4px; }

  /* Show mobile sign-out icon, hide desktop gear */
  .smd-hdr-mobile-only { display: flex !important; }
  .smd-hdr-gear.smd-hdr-desktop { display: none !important; }
  .smd-hdr-settings-panel { display: none !important; }
}
`;
