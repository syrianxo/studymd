// components/Header.tsx
// Desktop: logo (left) | centered nav | right controls (upload + pomodoro + gear)
// Mobile:  hamburger (left) | centered logo | gear (right) — nav + upload live in left drawer
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { PomodoroMiniPill } from '@/components/PomodoroTimer';
import { ProcessingPill } from '@/components/ProcessingPill';
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
  /** Called immediately when user picks a new theme (before API save). */
  onThemeChange?: (theme: import('@/types').Theme) => void;
  /** Show Admin link in nav */
  isAdmin?: boolean;
  /** Display name shown next to the settings gear (desktop only). */
  displayName?: string;
}

/** Active-route-aware nav link */
function NavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  // Exact match for /app (dashboard); prefix match for all other routes
  const isActive = href === '/app'
    ? pathname === '/app'
    : !!pathname?.startsWith(href + '/') || pathname === href;
  return (
    <Link
      href={href}
      className={`smd-header-navlink${isActive ? ' smd-header-navlink--active' : ''}`}
      prefetch={false}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

export default function Header({
  lectureCount: _lectureCount,
  loading: _loading = false,
  userId,
  initialTheme,
  isProcessing = false,
  hideUploadButton = false,
  onThemeChange,
  isAdmin = false,
  displayName,
}: HeaderProps) {
  const firstName = (displayName ?? '').trim().split(/\s+/)[0] ?? '';
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close settings panel on outside click/tap
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

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const uploadHref = '/app/upload';

  return (
    <>
      <style>{headerCss}</style>

      {/* ── Mobile left drawer ────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="smd-drawer-overlay"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}
      <nav
        className={`smd-drawer${drawerOpen ? ' smd-drawer--open' : ''}`}
        aria-label="Mobile navigation"
        aria-hidden={!drawerOpen}
      >
        <div className="smd-drawer-title">StudyMD</div>
        <NavLink href="/app" onClick={() => setDrawerOpen(false)}>My Dashboard</NavLink>
        <NavLink href="/app/lectures" onClick={() => setDrawerOpen(false)}>My Lectures</NavLink>
        <NavLink href="/app/plans" onClick={() => setDrawerOpen(false)}>My Plans</NavLink>
        <NavLink href="/app/progress" onClick={() => setDrawerOpen(false)}>My Progress</NavLink>
        {isAdmin && (
          <NavLink href="/admin" onClick={() => setDrawerOpen(false)}>
            Admin <span className="smd-admin-badge">ADMIN</span>
          </NavLink>
        )}
        {!hideUploadButton && (
          <div className="smd-drawer-divider" />
        )}
        {!hideUploadButton && (
          <Link
            href={uploadHref}
            className="smd-drawer-upload"
            onClick={() => setDrawerOpen(false)}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M10 3a1 1 0 01.707.293l4 4a1 1 0 01-1.414 1.414L11 6.414V13a1 1 0 11-2 0V6.414L6.707 8.707A1 1 0 015.293 7.293l4-4A1 1 0 0110 3z" />
              <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
            </svg>
            {isProcessing ? 'Processing…' : 'Upload Lecture'}
          </Link>
        )}
      </nav>

      {/* ── Header bar ───────────────────────────────────────────────── */}
      <header className="smd-header">

        {/* Left: hamburger (mobile) / logo (desktop) */}
        <div className="smd-hdr-left">
          {/* Mobile hamburger */}
          <button
            className="smd-hdr-hamburger smd-hdr-mobile-only"
            onClick={() => setDrawerOpen(o => !o)}
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? (
              /* X icon when open */
              <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            ) : (
              /* Hamburger icon */
              <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
              </svg>
            )}
          </button>

          {/* Desktop logo */}
          <Link href="/app" className="smd-header-logo-link smd-hdr-desktop-only" aria-label="StudyMD — dashboard" prefetch={false}>
            <div className="smd-logo">
              <span className="smd-logo-study">Study</span>
              <span className="smd-logo-md">MD</span>
            </div>
            <div className="smd-header-subtitle">
              Lecture Mastery Platform
            </div>
          </Link>
        </div>

        {/* Center: nav (desktop) / logo (mobile) */}
        <div className="smd-hdr-center">
          {/* Desktop nav */}
          <nav className="smd-header-nav smd-hdr-desktop-only" aria-label="Main navigation">
            <NavLink href="/app">My Dashboard</NavLink>
            <NavLink href="/app/lectures">My Lectures</NavLink>
            <NavLink href="/app/plans">My Plans</NavLink>
            <NavLink href="/app/progress">My Progress</NavLink>
            {isAdmin && (
              <NavLink href="/admin">
                Admin <span className="smd-admin-badge">ADMIN</span>
              </NavLink>
            )}
          </nav>

          {/* Mobile centered logo */}
          <Link href="/app" className="smd-hdr-mobile-logo smd-hdr-mobile-only" aria-label="StudyMD — dashboard" prefetch={false}>
            <div className="smd-logo">
              <span className="smd-logo-study">Study</span>
              <span className="smd-logo-md">MD</span>
            </div>
          </Link>
        </div>

        {/* Right: upload (desktop only) + pomodoro + gear */}
        <div className="smd-header-right">

          {/* Upload — desktop only (mobile version lives in drawer).
               Hidden when a job is processing — the ProcessingPill takes its place.
               Also hidden when on /app/upload itself (hideUploadButton). */}
          {!hideUploadButton && !isProcessing && (
            <Link
              href={uploadHref}
              className="smd-hdr-btn smd-hdr-upload smd-hdr-desktop-only"
              aria-label="Upload lecture"
              title="Upload Lecture"
            >
              <svg className="smd-hdr-icon-svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M10 3a1 1 0 01.707.293l4 4a1 1 0 01-1.414 1.414L11 6.414V13a1 1 0 11-2 0V6.414L6.707 8.707A1 1 0 015.293 7.293l4-4A1 1 0 0110 3z" />
                <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
              </svg>
              <span className="smd-hdr-label">Upload</span>
            </Link>
          )}

          {/* Background-processing pill — polls DB; visible on all pages when a job is in flight.
              When visible it sits in the Upload button's slot (the button is hidden above). */}
          {userId && <ProcessingPill userId={userId} />}

          {/* Pomodoro mini-pill — hidden <768px (120px+ min-width collides with mobile icons). ADR-022. */}
          <PomodoroMiniPill />

          {/* Settings/Theme — gear icon opens panel with theme picker, profile, sign-out */}
          <div className="smd-hdr-settings-wrap" ref={settingsRef}>
            <button
              className={`smd-hdr-gear${firstName ? ' smd-hdr-gear--named' : ''}`}
              onClick={() => setSettingsOpen(o => !o)}
              aria-label={firstName ? `Settings for ${firstName}` : 'Settings'}
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
              {firstName && (
                <span className="smd-hdr-gear-name smd-hdr-desktop-only">{firstName}</span>
              )}
            </button>

            {settingsOpen && (
              <div className="smd-hdr-settings-panel" role="dialog" aria-label="Settings">
                <ThemePicker
                  userId={userId}
                  initialTheme={initialTheme}
                  variant="panel"
                  onThemeChange={onThemeChange}
                />
                <div className="smd-hdr-panel-divider" />
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

/* ── Header bar layout ─────────────────────────────────────────────── */
.smd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.smd-hdr-left {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.smd-hdr-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
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

/* Mobile logo (no subtitle) */
.smd-hdr-mobile-logo {
  text-decoration: none;
  outline: none;
}

/* ── Desktop center nav ────────────────────────────────────────────── */
.smd-header-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 16px;
}

.smd-header-navlink {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted, #6b7280);
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
  position: relative;
}
.smd-header-navlink:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text, #e8eaf0);
}
.smd-header-navlink--active {
  color: var(--text, #e8eaf0);
}
.smd-header-navlink--active::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 14px;
  right: 14px;
  height: 2px;
  background: var(--accent, #5b8dee);
  border-radius: 1px;
}

/* Admin nav link badge — elevated route indicator */
.smd-admin-badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.07em;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
  vertical-align: middle;
  margin-left: 4px;
  line-height: 1.5;
}

/* ── Right row ─────────────────────────────────────────────────────── */
.smd-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Shared SVG icon sizing ────────────────────────────────────────── */
.smd-hdr-icon-svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* ── Upload button (desktop) ───────────────────────────────────────── */
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

/* ── Hamburger button (mobile) ─────────────────────────────────────── */
.smd-hdr-hamburger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  background: none;
  border: none;
  border-radius: 10px;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  padding: 0;
  transition: color 0.15s, background 0.15s;
}
.smd-hdr-hamburger:hover,
.smd-hdr-hamburger[aria-expanded="true"] {
  color: var(--text, #e8eaf0);
  background: rgba(255,255,255,0.06);
}

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

/* When the gear carries a name, let it auto-size and show the pill form */
.smd-hdr-gear--named {
  width: auto;
  padding: 0 12px 0 10px;
  gap: 8px;
}
.smd-hdr-gear-name {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: inherit;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* ── Mobile left drawer ────────────────────────────────────────────── */
.smd-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9998;
  animation: smd-fade-in 0.18s ease;
}
@keyframes smd-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.smd-drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 260px;
  background: var(--surface, #13161d);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 9999;
  transform: translateX(-100%);
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  padding: 0 12px 24px;
  overflow-y: auto;
}
.smd-drawer--open {
  transform: translateX(0);
}

.smd-drawer-title {
  font-family: 'Fraunces', serif;
  font-size: 18px;
  font-weight: 700;
  color: var(--text, #e8eaf0);
  padding: 20px 8px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  margin-bottom: 8px;
}

/* Drawer nav links reuse smd-header-navlink but full-width */
.smd-drawer .smd-header-navlink {
  width: 100%;
  justify-content: flex-start;
  padding: 10px 12px;
  font-size: 14px;
}
.smd-drawer .smd-header-navlink--active::after {
  bottom: 4px;
  left: 12px;
  right: 12px;
}

.smd-drawer-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.07);
  margin: 8px 0;
}

.smd-drawer-upload {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--accent, #5b8dee);
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
  min-height: 44px;
}
.smd-drawer-upload:hover {
  background: rgba(91, 141, 238, 0.1);
}

/* ── Mobile overrides (< 768px) ────────────────────────────────────── */
@media (max-width: 767px) {
  .smd-header { padding: 10px 16px; }
  .smd-header-right { gap: 2px; }

  /* Settings panel: shift to stay in viewport on narrow screens */
  .smd-hdr-settings-panel {
    right: -8px;
    max-width: calc(100vw - 24px);
  }
}
`;
