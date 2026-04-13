// components/Header.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
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

  // Close settings dropdown on outside click
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

        {/* ── Right controls: Upload · Settings · Sign Out ── */}
        <div className="smd-header-right">

          {/* 1. Upload */}
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

          {/* 2. Settings gear → dropdown with theme picker */}
          <div className="smd-hdr-settings-wrap" ref={settingsRef}>
            <button
              className="smd-hdr-btn smd-hdr-settings"
              onClick={() => setSettingsOpen(o => !o)}
              aria-label="Settings"
              title="Settings"
              aria-expanded={settingsOpen}
            >
              <span className="smd-hdr-icon" aria-hidden="true">⚙</span>
              <span className="smd-hdr-desktop smd-hdr-btn-label">Settings</span>
            </button>

            {settingsOpen && (
              <div className="smd-hdr-settings-panel" role="dialog" aria-label="Settings panel">
                <div className="smd-hdr-settings-label">Theme</div>
                <ThemePicker userId={userId} initialTheme={initialTheme} />
              </div>
            )}
          </div>

          {/* 3. Sign out */}
          <button
            className="smd-hdr-btn smd-hdr-signout"
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <span className="smd-hdr-icon" aria-hidden="true">↪</span>
            <span className="smd-hdr-desktop smd-hdr-btn-label">Sign out</span>
          </button>

        </div>
      </header>
    </>
  );
}

const headerCss = `
/* ── Logo link ────────────────────────────────────────────────────────── */
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

/* ── Right row ────────────────────────────────────────────────────────── */
.smd-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.smd-hdr-tool {
  display: flex;
  align-items: center;
}

/* ── Shared button base ──────────────────────────────────────────────── */
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
  /* Desktop: comfortable padding */
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

.smd-hdr-settings:hover, .smd-hdr-settings[aria-expanded="true"] {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.18);
  color: var(--text, #e8eaf0);
}
.smd-hdr-signout:hover {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.18);
  color: var(--text, #e8eaf0);
}
.smd-hdr-icon { font-size: 15px; line-height: 1; flex-shrink: 0; }
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
.smd-hdr-desktop { display: inline; }

/* ── Settings dropdown panel ─────────────────────────────────────────── */
.smd-hdr-settings-wrap { position: relative; }
.smd-hdr-settings-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--surface, #13161d);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  z-index: 9999;
  min-width: 160px;
  animation: smd-panel-in 0.14s ease;
}
@keyframes smd-panel-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.smd-hdr-settings-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--text-muted, #6b7280);
  margin-bottom: 12px;
  font-family: 'DM Mono', monospace;
}

@media (max-width: 767px) {
  .smd-hdr-desktop { display: none !important; }
  .smd-header { padding: 10px 16px; }
  .smd-hdr-btn {
    padding: 0;
    width: 44px; min-width: 44px; min-height: 44px;
    justify-content: center;
    border-radius: 10px;
  }
  .smd-hdr-icon { font-size: 18px; }
  .smd-header-right { gap: 6px; }
  .smd-hdr-settings-panel { right: 0; left: auto; min-width: 180px; }
}
`;
