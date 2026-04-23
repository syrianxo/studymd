// components/PageFooter.tsx
// Horizontal, single-row footer used across signed-in pages.
// Left: brand + status. Right: inline navigation links.
// Bottom: copyright + credit.
//
// Differences vs. the legacy Dashboard-inline footer:
//   · No "Clear Cache" button (removed; localStorage cache-only is a footgun).
//   · No "Reset Progress" button (moved to /app/profile Danger Zone).
//   · Subscriptions link lives here, not in the main header nav.
'use client';

import Link from 'next/link';

export function PageFooter() {
  return (
    <>
      <style>{footerCss}</style>
      <footer className="pf-footer">
        <div className="pf-inner">
          <div className="pf-row">
            <div className="pf-brand">
              <div className="smd-logo">
                <span className="smd-logo-study">Study</span>
                <span className="smd-logo-md">MD</span>
              </div>
              <div className="pf-status">
                <span className="pf-dot" />
                Platform active
              </div>
            </div>

            <nav className="pf-links" aria-label="Footer navigation">
              <Link href="/app" className="pf-link" prefetch={false}>Dashboard</Link>
              <Link href="/app/lectures" className="pf-link" prefetch={false}>Lectures</Link>
              <Link href="/app/plans" className="pf-link" prefetch={false}>Plans</Link>
              <Link href="/app/progress" className="pf-link" prefetch={false}>Progress</Link>
              <Link href="/app/subscriptions" className="pf-link" prefetch={false}>Subscriptions</Link>
              <Link href="/app/upload" className="pf-link" prefetch={false}>Upload</Link>
              <Link href="/app/profile" className="pf-link" prefetch={false}>Profile</Link>
            </nav>
          </div>

          <div className="pf-bottom">
            <span>© 2026 StudyMD. All rights reserved.</span>
            <span className="pf-credit">
              Built with{' '}
              <a href="https://anthropic.com" target="_blank" rel="noopener noreferrer" className="pf-link-inline">
                Anthropic Claude
              </a>{' '}
              — a{' '}
              <a href="https://tutormd.com" target="_blank" rel="noopener noreferrer" className="pf-link-inline">
                TutorMD
              </a>{' '}
              product
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}

const footerCss = `
.pf-footer {
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 60%, var(--bg));
  margin-top: 80px;
}
.pf-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px 40px 20px;
}

/* ── Horizontal row: brand + links side-by-side ────────────────────────── */
.pf-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 20px;
}

.pf-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.pf-status {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.pf-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--success, #10b981);
  box-shadow: 0 0 8px var(--success, #10b981);
  animation: pf-pulse 2s infinite;
}
@keyframes pf-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.5; }
}

/* ── Inline links (horizontal) ─────────────────────────────────────────── */
.pf-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 18px;
  justify-content: flex-end;
}
.pf-link {
  font-size: 13px;
  color: var(--text-dim, #9ca3af);
  text-decoration: none;
  font-family: 'Outfit', sans-serif;
  line-height: 1.4;
  padding: 4px 2px;
  transition: color 0.15s;
}
.pf-link:hover { color: var(--text); }

/* ── Bottom row: copyright + credit ────────────────────────────────────── */
.pf-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  border-top: 1px solid var(--border);
  padding-top: 16px;
  font-size: 12px;
  color: var(--text-muted);
}
.pf-credit { color: var(--text-muted); }
.pf-link-inline {
  color: var(--accent);
  text-decoration: none;
  transition: opacity 0.15s;
}
.pf-link-inline:hover { opacity: 0.8; }

/* ── Mobile ────────────────────────────────────────────────────────────── */
@media (max-width: 767px) {
  .pf-inner { padding: 24px 16px 16px; }
  .pf-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }
  .pf-links { justify-content: flex-start; gap: 4px 14px; }
  .pf-bottom {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
`;
