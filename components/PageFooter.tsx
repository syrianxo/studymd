// components/PageFooter.tsx
// Horizontal footer used across signed-in pages.
// Left: brand + dedication. Right: inline navigation links with active highlighting.
// Bottom: copyright + credit.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/app',               label: 'Dashboard' },
  { href: '/app/lectures',      label: 'Lectures' },
  { href: '/app/plans',         label: 'Plans' },
  { href: '/app/progress',      label: 'Progress' },
  { href: '/app/subscriptions', label: 'Subscriptions' },
  { href: '/app/upload',        label: 'Upload' },
  { href: '/app/profile',       label: 'Profile' },
];

export function PageFooter() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/app') return pathname === '/app';
    return pathname?.startsWith(href) ?? false;
  }

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
              <div className="pf-dedication">Designed for Haley Lange</div>
            </div>

            <nav className="pf-links" aria-label="Footer navigation">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`pf-link${isActive(href) ? ' pf-link--active' : ''}`}
                  prefetch={false}
                >
                  {label}
                </Link>
              ))}
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
  gap: 14px;
  flex-shrink: 0;
}

.pf-dedication {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
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
.pf-link--active { color: var(--accent, #5b8dee); }

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
