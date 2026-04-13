// components/Header.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import PomodoroTimer from './PomodoroTimer';
import { ThemePicker } from './ThemePicker';
import type { Theme } from '@/types';

interface HeaderProps {
  lectureCount: number;
  loading?: boolean;
  userId: string;
  initialTheme: Theme;
  onUploadClick?: () => void;
  /** Optional: shown as a small spinner next to the upload button when true */
  isProcessing?: boolean;
}

export default function Header({
  lectureCount: _lectureCount,   // reserved for future display use
  loading: _loading = false,
  userId,
  initialTheme,
  onUploadClick,
  isProcessing = false,
}: HeaderProps) {
  const router = useRouter();

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

          {/* Upload — text+icon on desktop, icon-only on mobile */}
          {onUploadClick && (
            <button
              className="smd-hdr-btn smd-hdr-upload"
              onClick={onUploadClick}
              aria-label="Upload lecture"
              title="Upload Lecture"
            >
              {isProcessing ? (
                <span className="smd-hdr-spinner" aria-hidden="true" />
              ) : (
                <span className="smd-hdr-icon" aria-hidden="true">⬆</span>
              )}
              <span className="smd-hdr-desktop smd-hdr-btn-label">Upload</span>
              {isProcessing && (
                <span className="smd-hdr-desktop smd-hdr-btn-label" style={{ fontSize: 11, opacity: 0.7 }}>
                  Processing…
                </span>
              )}
            </button>
          )}

          {/* Theme picker — delegated to ThemePicker component */}
          <div className="smd-hdr-tool">
            <ThemePicker userId={userId} initialTheme={initialTheme} />
          </div>

          {/* Pomodoro timer */}
          <div className="smd-hdr-tool">
            <PomodoroTimer />
          </div>

          {/* Sign out */}
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

.smd-hdr-signout:hover {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.18);
  color: var(--text, #e8eaf0);
}

/* ── Icon inside button ────────────────────────────────────────────── */
.smd-hdr-icon {
  font-size: 15px;
  line-height: 1;
  flex-shrink: 0;
}

/* ── Processing spinner ────────────────────────────────────────────── */
.smd-hdr-spinner {
  display: inline-block;
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255,255,255,0.15);
  border-top-color: var(--accent, #5b8dee);
  border-radius: 50%;
  animation: smd-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes smd-spin { to { transform: rotate(360deg); } }

/* ── Desktop-only label ────────────────────────────────────────────── */
.smd-hdr-desktop { display: inline; }

/* ═══════════════════════════════════════════════════════════════════
   MOBILE  (< 768px)
   — icon-only buttons, tighter gap, 44 × 44 minimum touch targets
═══════════════════════════════════════════════════════════════════ */
@media (max-width: 767px) {
  /* Hide all text labels */
  .smd-hdr-desktop { display: none !important; }

  /* Header itself */
  .smd-header { padding: 10px 16px; }

  /* Icon buttons become square, 44 px */
  .smd-hdr-btn {
    padding: 0;
    width: 44px;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
    border-radius: 10px;
  }

  /* Slightly larger icon at mobile size */
  .smd-hdr-icon { font-size: 18px; }

  /* Tighter gap between controls */
  .smd-header-right { gap: 6px; }
}
`;
