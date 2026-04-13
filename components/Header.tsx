// components/Header.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import PomodoroTimer from './PomodoroTimer';
import { ThemePicker } from './ThemePicker';
import type { GlobalStats } from '@/hooks/useProgress';
import type { Theme } from '@/types';

interface HeaderProps {
  globalStats: GlobalStats;
  lectureCount: number;
  loading?: boolean;
  userId: string;
  initialTheme: Theme;
  onUploadClick?: () => void;
}

export default function Header({
  globalStats,
  lectureCount,
  loading = false,
  userId,
  initialTheme,
  onUploadClick,
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
        {/* Logo — links back to homepage */}
        <Link href="/" className="smd-header-logo-link">
          <div className="smd-logo">
            <span className="smd-logo-study">Study</span>
            <span className="smd-logo-md">MD</span>
          </div>
          {/* Subtitle hidden on mobile */}
          <div className="smd-header-subtitle smd-desktop-only">
            Lecture Mastery Platform
          </div>
        </Link>

        {/* Right side controls */}
        <div className="smd-header-right">
          {/* Upload button — text on desktop, icon on mobile */}
          {onUploadClick && (
            <button
              className="smd-header-upload-btn"
              onClick={onUploadClick}
              aria-label="Upload lecture"
              title="Upload Lecture"
            >
              <span className="smd-header-icon-only" aria-hidden="true">⬆</span>
              <span className="smd-desktop-only smd-header-btn-label">Upload</span>
            </button>
          )}

          {/* Theme picker */}
          <div className="smd-header-tool">
            <ThemePicker userId={userId} initialTheme={initialTheme} />
          </div>

          {/* Pomodoro timer */}
          <div className="smd-header-tool">
            <PomodoroTimer />
          </div>

          {/* Sign out — icon only on mobile */}
          <button
            className="smd-header-signout-btn"
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <span className="smd-header-icon-only" aria-hidden="true">↪</span>
            <span className="smd-desktop-only smd-header-btn-label">Sign out</span>
          </button>
        </div>
      </header>
    </>
  );
}

const headerCss = `
.smd-header-logo-link {
  display: flex;
  flex-direction: column;
  text-decoration: none;
  gap: 2px;
}
.smd-header-logo-link:hover .smd-logo-study {
  opacity: 0.85;
}

/* Shared icon-style button used for upload and sign-out */
.smd-header-upload-btn,
.smd-header-signout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: var(--text-muted, #6b7280);
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 7px 14px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
  /* Minimum touch target */
  min-height: 40px;
}
.smd-header-upload-btn:hover {
  background: rgba(91,141,238,0.12);
  border-color: rgba(91,141,238,0.35);
  color: var(--accent, #5b8dee);
}
.smd-header-signout-btn:hover {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.18);
  color: var(--text, #e8eaf0);
}

.smd-header-tool {
  display: flex;
  align-items: center;
}

/* Desktop-only label (hidden below 768px) */
.smd-desktop-only {
  display: inline;
}

/* Icon-only element (always visible) */
.smd-header-icon-only {
  font-size: 15px;
  line-height: 1;
}

/* ── Mobile overrides (< 768px) ── */
@media (max-width: 767px) {
  .smd-desktop-only {
    display: none !important;
  }

  /* Tighter header padding */
  .smd-header {
    padding: 10px 16px;
  }

  /* Icon-only buttons need to be square and hit 44px */
  .smd-header-upload-btn,
  .smd-header-signout-btn {
    padding: 0;
    width: 44px;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
    border-radius: 10px;
  }

  .smd-header-icon-only {
    font-size: 18px;
  }

  /* Tighten gap between right-side icons */
  .smd-header-right {
    gap: 6px;
  }
}
`;
