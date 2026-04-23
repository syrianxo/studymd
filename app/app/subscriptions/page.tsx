'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase';
import { migrateThemeId } from '@/lib/themes';
import type { Theme } from '@/types';

interface PackageAccess {
  id: string;
  name: string;
  description: string | null;
  lecture_ids: string[];
  created_at: string;
  access: {
    source: string;
    granted_at: string;
    expires_at: string | null;
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SubscriptionsPage() {
  const [userId, setUserId] = useState('');
  const [theme, setTheme] = useState<Theme>('midnight');
  const [packages, setPackages] = useState<PackageAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);

      const [prefsResult, pkgResult] = await Promise.all([
        supabase.from('user_preferences').select('theme').eq('user_id', data.user.id).single(),
        fetch('/api/packages'),
      ]);

      if (prefsResult.data?.theme) {
        setTheme(migrateThemeId(prefsResult.data.theme) as Theme);
      }

      const pkgJson = await pkgResult.json().catch(() => ({}));
      if (!pkgResult.ok) {
        setError(pkgJson.error ?? 'Failed to load packages');
      } else {
        setPackages(pkgJson.packages ?? []);
      }
      setLoading(false);
    });
  }, []);

  return (
    <>
      <style>{css}</style>
      <Header
        lectureCount={0}
        userId={userId}
        initialTheme={theme}
        onThemeChange={setTheme}
        hideUploadButton={false}
      />
      <main className="sub-main">
        <div className="sub-header">
          <h1 className="sub-title">My Subscriptions</h1>
          <p className="sub-sub">Lecture packages you have access to.</p>
        </div>

        {loading ? (
          <div className="sub-loading">Loading…</div>
        ) : error ? (
          <div className="sub-error">{error}</div>
        ) : packages.length === 0 ? (
          <div className="sub-empty">
            <div className="sub-empty-icon">📭</div>
            <div className="sub-empty-text">No packages assigned yet. Contact your administrator.</div>
          </div>
        ) : (
          <div className="sub-list">
            {packages.map(pkg => (
              <div key={pkg.id} className="sub-card">
                <div className="sub-card-top">
                  <div>
                    <div className="sub-card-name">{pkg.name}</div>
                    {pkg.description && (
                      <div className="sub-card-desc">{pkg.description}</div>
                    )}
                  </div>
                  <div className="sub-card-badge">
                    {pkg.access.expires_at
                      ? `Expires ${fmtDate(pkg.access.expires_at)}`
                      : 'Active'}
                  </div>
                </div>

                <div className="sub-card-meta">
                  <span className="sub-meta-item">
                    📚 {pkg.lecture_ids.length} lecture{pkg.lecture_ids.length !== 1 ? 's' : ''}
                  </span>
                  <span className="sub-meta-item">
                    Granted {fmtDate(pkg.access.granted_at)}
                  </span>
                  <span className="sub-meta-item sub-meta-source">
                    via {pkg.access.source}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

const css = `
.sub-main {
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 20px 80px;
}
.sub-header {
  margin-bottom: 32px;
}
.sub-title {
  font-family: 'Fraunces', serif;
  font-size: 28px;
  font-weight: 700;
  color: var(--text, #e8eaf0);
  margin: 0 0 6px;
}
.sub-sub {
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  color: var(--text-muted, #6b7280);
  margin: 0;
}
.sub-loading,
.sub-error {
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  color: var(--text-muted, #6b7280);
  padding: 40px 0;
  text-align: center;
}
.sub-error { color: #f87171; }
.sub-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 20px;
  text-align: center;
}
.sub-empty-icon { font-size: 40px; }
.sub-empty-text {
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  color: var(--text-muted, #6b7280);
}
.sub-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sub-card {
  background: var(--surface, #13161d);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 14px;
  padding: 20px 24px;
}
.sub-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.sub-card-name {
  font-family: 'Outfit', sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: var(--text, #e8eaf0);
}
.sub-card-desc {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  color: var(--text-muted, #6b7280);
  margin-top: 4px;
  line-height: 1.5;
}
.sub-card-badge {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(91,141,238,0.12);
  color: var(--accent, #5b8dee);
  white-space: nowrap;
  flex-shrink: 0;
}
.sub-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.08));
  padding-top: 12px;
}
.sub-meta-item {
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  color: var(--text-muted, #6b7280);
}
.sub-meta-source {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
}
@media (max-width: 480px) {
  .sub-card-top { flex-direction: column; }
  .sub-card-badge { align-self: flex-start; }
}
`;
