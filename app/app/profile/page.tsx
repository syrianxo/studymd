// app/app/profile/page.tsx
// User profile page — editable display name, username, email, password,
// theme selection, account info, study stats, danger zone.
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { applyTheme } from '@/components/ThemePicker';
import type { Theme } from '@/types';

interface ProfileData {
  userId: string;
  displayName: string | null;
  username: string | null;
  role: string;
  isPrimary: boolean;
  createdAt: string;
}
interface AuthData   { email: string | undefined; memberSince: string; }
interface StatsData  { totalFlashcards: number; totalExams: number; avgScore: number | null; }

const AVATAR_COLORS = ['#5b8dee','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16'];
function avatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const THEMES: { id: Theme; label: string; bg: string; accent: string; surface: string }[] = [
  { id: 'midnight', label: 'Midnight', bg: '#0d0f14', accent: '#5b8dee', surface: '#13161d' },
  { id: 'pink',     label: 'Lavender', bg: '#0f0d14', accent: '#c084fc', surface: '#16131d' },
  { id: 'forest',   label: 'Forest',   bg: '#0a0f0d', accent: '#34d399', surface: '#0f1610' },
];

function SectionDivider() { return <div className="prf-divider" />; }

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const [profile, setProfile]         = useState<ProfileData | null>(null);
  const [auth, setAuth]               = useState<AuthData | null>(null);
  const [stats, setStats]             = useState<StatsData | null>(null);
  const [activeTheme, setActiveTheme] = useState<Theme>('midnight');

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername]       = useState('');
  const [newEmail, setNewEmail]       = useState('');
  const [pwNew, setPwNew]             = useState('');
  const [pwConfirm, setPwConfirm]     = useState('');
  const [pwVisible, setPwVisible]     = useState(false);

  const [saving, setSaving]               = useState<string | null>(null);
  const [feedback, setFeedback]           = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [deleteModalOpen, setDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/profile');
      if (res.status === 401) {
        // Truly unauthenticated — redirect to login
        router.replace('/login');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error ?? `Server error ${res.status}`);
        return;
      }
      const data = await res.json();
      setProfile(data.profile);
      setAuth(data.auth);
      setStats(data.stats);
      setDisplayName(data.profile.displayName ?? '');
      setUsername(data.profile.username ?? '');
    } catch (e) {
      setLoadError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('studymd_theme') as Theme | null;
      const t = stored ?? 'midnight';
      setActiveTheme(t);
      applyTheme(t);
    } catch {}
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setMsg(key: string, ok: boolean, msg: string) {
    setFeedback(f => ({ ...f, [key]: { ok, msg } }));
    setTimeout(() => setFeedback(f => { const n = { ...f }; delete n[key]; return n; }), 4000);
  }

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function saveProfile(field: 'displayName' | 'username') {
    setSaving(field);
    try {
      const body = field === 'displayName' ? { displayName } : { username };
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(field, false, data.error); return; }
      setMsg(field, true, 'Saved!');
    } finally { setSaving(null); }
  }

  async function saveEmail() {
    if (!newEmail || newEmail === auth?.email) { setMsg('email', false, 'No change.'); return; }
    setSaving('email');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) { setMsg('email', false, error.message); return; }
      setMsg('email', true, 'Confirmation email sent. Check your inbox.');
      setNewEmail('');
    } finally { setSaving(null); }
  }

  async function savePassword() {
    if (pwNew.length < 8)     { setMsg('password', false, 'Min 8 characters.'); return; }
    if (pwNew !== pwConfirm)  { setMsg('password', false, 'Passwords do not match.'); return; }
    setSaving('password');
    try {
      const res = await fetch('/api/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: pwNew }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg('password', false, data.error); return; }
      setMsg('password', true, 'Password updated!');
      setPwNew(''); setPwConfirm('');
    } finally { setSaving(null); }
  }

  function switchTheme(t: Theme) {
    setActiveTheme(t);
    applyTheme(t);
    localStorage.setItem('studymd_theme', t);
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: t }),
    }).catch(() => {});
  }

  async function deleteAccount() {
    if (deleteConfirmText !== 'DELETE') return;
    setSaving('delete');
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/');
    } finally { setSaving(null); }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const avatarLetter = (displayName || username || auth?.email || '?')[0].toUpperCase();
  const avatarBg     = avatarColor(profile?.userId ?? 'x');

  function Msg({ k }: { k: string }) {
    const m = feedback[k];
    if (!m) return null;
    return <span className={`prf-feedback ${m.ok ? 'ok' : 'err'}`}>{m.msg}</span>;
  }

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <style>{profileCss}</style>
        <div className="prf-loading"><div className="prf-spinner" /></div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <style>{profileCss}</style>
        <div className="prf-loading" style={{ flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 36 }}>⚠️</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: 'var(--text)' }}>
            Could not load profile
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{loadError}</p>
          <button className="prf-action-btn" onClick={load} style={{ minWidth: 120 }}>
            Try again
          </button>
          <Link href="/app" className="prf-nav-back" style={{ marginTop: 8 }}>
            ← Back to Dashboard
          </Link>
        </div>
      </>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <>
      <style>{profileCss}</style>

      <nav className="prf-nav">
        <Link href="/app" className="prf-nav-back">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
            <path fillRule="evenodd" clipRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" />
          </svg>
          Dashboard
        </Link>
        <div className="prf-nav-title">Profile &amp; Settings</div>
        <div style={{ width: 80 }} />
      </nav>

      <main className="prf-main">

        {/* ── Avatar ──────────────────────────────────────────────────── */}
        <section className="prf-section prf-avatar-section">
          <div className="prf-avatar" style={{ background: avatarBg }}>{avatarLetter}</div>
          <div className="prf-avatar-meta">
            <div className="prf-avatar-name">
              {displayName || username || auth?.email?.split('@')[0] || 'User'}
            </div>
            <div className="prf-avatar-sub">
              <span className={`prf-role-badge prf-role-${profile?.role}`}>{profile?.role}</span>
              {profile?.isPrimary && <span className="prf-primary-badge">⭐ primary</span>}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── Identity ────────────────────────────────────────────────── */}
        <section className="prf-section">
          <h2 className="prf-section-title">Identity</h2>

          <div className="prf-field-group">
            <label className="prf-label" htmlFor="display-name">Display Name</label>
            <div className="prf-inline-row">
              <input id="display-name" className="prf-input" type="text"
                value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Your full name" maxLength={64} />
              <button className="prf-save-btn" onClick={() => saveProfile('displayName')}
                disabled={saving === 'displayName'}>
                {saving === 'displayName' ? '…' : 'Save'}
              </button>
            </div>
            <Msg k="displayName" />
          </div>

          <div className="prf-field-group">
            <label className="prf-label" htmlFor="username">Username</label>
            <div className="prf-inline-row">
              <div className="prf-input-prefix-wrap">
                <span className="prf-input-prefix">@</span>
                <input id="username" className="prf-input prf-input-with-prefix" type="text"
                  value={username} onChange={e => setUsername(e.target.value.toLowerCase())}
                  placeholder="your_username" maxLength={32} />
              </div>
              <button className="prf-save-btn" onClick={() => saveProfile('username')}
                disabled={saving === 'username'}>
                {saving === 'username' ? '…' : 'Save'}
              </button>
            </div>
            <p className="prf-hint">Lowercase letters, numbers, and underscores only.</p>
            <Msg k="username" />
          </div>
        </section>

        <SectionDivider />

        {/* ── Email ───────────────────────────────────────────────────── */}
        <section className="prf-section">
          <h2 className="prf-section-title">Email</h2>
          <div className="prf-field-group">
            <label className="prf-label">Current Email</label>
            <div className="prf-current-value">{auth?.email}</div>
          </div>
          <div className="prf-field-group">
            <label className="prf-label" htmlFor="new-email">Change Email</label>
            <div className="prf-inline-row">
              <input id="new-email" className="prf-input" type="email"
                value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="new@email.com" />
              <button className="prf-save-btn" onClick={saveEmail} disabled={saving === 'email'}>
                {saving === 'email' ? '…' : 'Update'}
              </button>
            </div>
            <p className="prf-hint">A confirmation link will be sent to both addresses.</p>
            <Msg k="email" />
          </div>
        </section>

        <SectionDivider />

        {/* ── Password ────────────────────────────────────────────────── */}
        <section className="prf-section">
          <h2 className="prf-section-title">Password</h2>
          <div className="prf-field-group">
            <label className="prf-label" htmlFor="pw-new">New Password</label>
            <div className="prf-pw-wrap">
              <input id="pw-new" className="prf-input"
                type={pwVisible ? 'text' : 'password'}
                value={pwNew} onChange={e => setPwNew(e.target.value)}
                placeholder="Min 8 characters" autoComplete="new-password" />
              <button className="prf-pw-toggle" onClick={() => setPwVisible(v => !v)} type="button"
                aria-label={pwVisible ? 'Hide password' : 'Show password'}>
                {pwVisible ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div className="prf-field-group">
            <label className="prf-label" htmlFor="pw-confirm">Confirm New Password</label>
            <input id="pw-confirm" className="prf-input"
              type={pwVisible ? 'text' : 'password'}
              value={pwConfirm} onChange={e => setPwConfirm(e.target.value)}
              placeholder="Repeat new password" autoComplete="new-password" />
          </div>
          <button className="prf-action-btn" onClick={savePassword} disabled={saving === 'password'}>
            {saving === 'password' ? 'Updating…' : 'Update Password'}
          </button>
          <Msg k="password" />
        </section>

        <SectionDivider />

        {/* ── Theme ───────────────────────────────────────────────────── */}
        <section className="prf-section">
          <h2 className="prf-section-title">Theme</h2>
          <p className="prf-hint" style={{ marginBottom: 16 }}>Click a palette to switch immediately.</p>
          <div className="prf-theme-row">
            {THEMES.map(t => (
              <button key={t.id}
                className={`prf-theme-card ${activeTheme === t.id ? 'active' : ''}`}
                onClick={() => switchTheme(t.id)} aria-pressed={activeTheme === t.id}>
                <div className="prf-theme-preview" style={{ background: t.bg }}>
                  <div className="prf-theme-bar" style={{ background: t.surface }} />
                  <div className="prf-theme-dot" style={{ background: t.accent }} />
                </div>
                <span className="prf-theme-label">{t.label}</span>
                {activeTheme === t.id && <span className="prf-theme-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        <SectionDivider />

        {/* ── Account info ────────────────────────────────────────────── */}
        <section className="prf-section">
          <h2 className="prf-section-title">Account</h2>
          <div className="prf-info-grid">
            <div className="prf-info-item">
              <span className="prf-info-label">Member since</span>
              <span className="prf-info-value">
                {auth?.memberSince
                  ? new Date(auth.memberSince).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                  : '—'}
              </span>
            </div>
            <div className="prf-info-item">
              <span className="prf-info-label">Role</span>
              <span className={`prf-role-badge prf-role-${profile?.role}`}>{profile?.role}</span>
            </div>
            <div className="prf-info-item">
              <span className="prf-info-label">User ID</span>
              <span className="prf-info-value prf-mono" title={profile?.userId}>
                {profile?.userId?.slice(0, 8)}…
              </span>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── Study stats ─────────────────────────────────────────────── */}
        <section className="prf-section">
          <h2 className="prf-section-title">Study Summary</h2>
          <div className="prf-stats-grid">
            <div className="prf-stat-card">
              <span className="prf-stat-val">{stats?.totalFlashcards ?? 0}</span>
              <span className="prf-stat-label">Flashcards studied</span>
            </div>
            <div className="prf-stat-card">
              <span className="prf-stat-val">{stats?.totalExams ?? 0}</span>
              <span className="prf-stat-label">Exams taken</span>
            </div>
            <div className="prf-stat-card">
              <span className="prf-stat-val accent">
                {stats?.avgScore != null ? `${stats.avgScore}%` : '—'}
              </span>
              <span className="prf-stat-label">Average score</span>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── Danger zone ─────────────────────────────────────────────── */}
        <section className="prf-section prf-danger-section">
          <h2 className="prf-section-title danger">Danger Zone</h2>
          <p className="prf-hint" style={{ marginBottom: 16 }}>
            Deleting your account permanently removes all your progress and data. This cannot be undone.
          </p>
          <button className="prf-danger-btn" onClick={() => setDeleteModal(true)}>
            Delete Account
          </button>
        </section>

      </main>

      {/* ── Delete modal ────────────────────────────────────────────────── */}
      {deleteModalOpen && (
        <div className="prf-modal-overlay" onClick={() => setDeleteModal(false)}>
          <div className="prf-modal" onClick={e => e.stopPropagation()}>
            <div className="prf-modal-icon">⚠️</div>
            <h3 className="prf-modal-title">Delete your account?</h3>
            <p className="prf-modal-body">
              This will permanently delete all your progress, settings, and data. Cannot be undone.
            </p>
            <label className="prf-label" htmlFor="delete-confirm" style={{ marginBottom: 6, display: 'block' }}>
              Type <strong style={{ color: '#f87171' }}>DELETE</strong> to confirm
            </label>
            <input id="delete-confirm" className="prf-input" type="text"
              value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE" />
            <div className="prf-modal-actions">
              <button className="prf-modal-cancel"
                onClick={() => { setDeleteModal(false); setDeleteConfirmText(''); }}>
                Cancel
              </button>
              <button className="prf-danger-btn" onClick={deleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || saving === 'delete'}
                style={{ opacity: deleteConfirmText !== 'DELETE' ? 0.4 : 1 }}>
                {saving === 'delete' ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const profileCss = `
.prf-loading {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
}
.prf-spinner {
  width: 32px; height: 32px;
  border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--accent);
  border-radius: 50%; animation: prf-spin 0.7s linear infinite;
}
@keyframes prf-spin { to { transform: rotate(360deg); } }

.prf-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 40px; border-bottom: 1px solid var(--border);
  background: var(--bg); position: sticky; top: 0; z-index: 100;
}
.prf-nav-back {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--text-muted); text-decoration: none;
  min-height: 44px; padding: 0 4px; transition: color 0.15s;
}
.prf-nav-back:hover { color: var(--text); }
.prf-nav-title {
  font-family: 'Fraunces', serif; font-size: 16px;
  font-weight: 700; color: var(--text);
}

.prf-main { max-width: 660px; margin: 0 auto; padding: 40px 24px 80px; }

.prf-section { padding: 28px 0; }
.prf-section-title {
  font-family: 'Fraunces', serif; font-size: 18px;
  font-weight: 700; color: var(--text); margin-bottom: 20px;
}
.prf-section-title.danger { color: #f87171; }
.prf-divider { height: 1px; background: var(--border); }

.prf-avatar-section { display: flex; align-items: center; gap: 20px; padding-top: 16px; }
.prf-avatar {
  width: 72px; height: 72px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Fraunces', serif; font-size: 30px; font-weight: 700;
  color: #fff; flex-shrink: 0;
}
.prf-avatar-name {
  font-family: 'Fraunces', serif; font-size: 22px;
  font-weight: 700; color: var(--text); margin-bottom: 6px;
}
.prf-avatar-sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.prf-role-badge {
  font-family: 'DM Mono', monospace; font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.08em; padding: 3px 8px; border-radius: 100px; font-weight: 500;
}
.prf-role-admin   { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
.prf-role-student { background: rgba(91,141,238,0.15); color: var(--accent); border: 1px solid rgba(91,141,238,0.25); }
.prf-role-demo    { background: rgba(156,163,175,0.12); color: var(--text-muted); border: 1px solid rgba(156,163,175,0.2); }
.prf-primary-badge { font-size: 11px; color: var(--warning, #f59e0b); font-family: 'Outfit', sans-serif; }

.prf-field-group { margin-bottom: 20px; }
.prf-label {
  display: block; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.1em; font-weight: 700; color: var(--text-dim, #9ca3af);
  margin-bottom: 8px; font-family: 'DM Mono', monospace;
}
.prf-input {
  width: 100%; padding: 11px 14px;
  background: var(--surface2, #1a1e27); border: 1px solid var(--border);
  border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif;
  font-size: 14px; outline: none; transition: border-color 0.15s;
  min-height: 44px; box-sizing: border-box;
}
.prf-input:focus { border-color: var(--accent); }
.prf-input::placeholder { color: var(--text-muted); }
.prf-input-prefix-wrap { position: relative; flex: 1; }
.prf-input-prefix {
  position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
  color: var(--text-muted); font-family: 'DM Mono', monospace; font-size: 14px; pointer-events: none;
}
.prf-input-with-prefix { padding-left: 28px; }

.prf-inline-row { display: flex; gap: 8px; align-items: stretch; }
.prf-inline-row .prf-input { flex: 1; }

.prf-save-btn {
  padding: 0 18px; min-height: 44px; min-width: 64px;
  background: rgba(91,141,238,0.12); border: 1px solid rgba(91,141,238,0.25);
  border-radius: 10px; color: var(--accent); font-family: 'Outfit', sans-serif;
  font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: background 0.15s; flex-shrink: 0;
}
.prf-save-btn:hover:not(:disabled) { background: rgba(91,141,238,0.22); }
.prf-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.prf-action-btn {
  padding: 12px 20px; min-height: 44px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; margin-top: 4px;
}
.prf-action-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
.prf-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.prf-pw-wrap { position: relative; }
.prf-pw-toggle {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer; font-size: 16px; padding: 4px;
  min-height: 44px; min-width: 44px; display: flex; align-items: center; justify-content: center;
}

.prf-hint { font-size: 12px; color: var(--text-muted); margin-top: 6px; line-height: 1.5; }
.prf-current-value {
  font-family: 'DM Mono', monospace; font-size: 13px; color: var(--text-dim);
  padding: 11px 14px; background: var(--surface2, #1a1e27);
  border: 1px solid var(--border); border-radius: 10px;
}
.prf-feedback { display: block; font-size: 12px; margin-top: 6px; }
.prf-feedback.ok  { color: var(--success, #10b981); }
.prf-feedback.err { color: #f87171; }

.prf-theme-row { display: flex; gap: 12px; flex-wrap: wrap; }
.prf-theme-card {
  flex: 1 1 140px; max-width: 180px;
  background: var(--surface2, #1a1e27); border: 2px solid transparent;
  border-radius: 14px; padding: 12px; cursor: pointer;
  transition: border-color 0.15s, transform 0.12s; position: relative;
  text-align: center; min-height: 44px;
}
.prf-theme-card:hover { transform: translateY(-2px); }
.prf-theme-card.active { border-color: var(--accent); }
.prf-theme-preview {
  width: 100%; aspect-ratio: 16/9; border-radius: 8px;
  margin-bottom: 8px; position: relative; overflow: hidden;
}
.prf-theme-bar  { position: absolute; top: 0; left: 0; right: 0; height: 28%; }
.prf-theme-dot  { position: absolute; bottom: 12%; right: 12%; width: 20%; aspect-ratio: 1; border-radius: 50%; opacity: 0.85; }
.prf-theme-label { font-size: 12px; font-weight: 600; color: var(--text-dim); font-family: 'Outfit', sans-serif; }
.prf-theme-check { position: absolute; top: 8px; right: 10px; font-size: 12px; color: var(--accent); font-weight: 700; }

.prf-info-grid { display: flex; flex-direction: column; gap: 12px; }
.prf-info-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: var(--surface2, #1a1e27);
  border: 1px solid var(--border); border-radius: 10px;
  gap: 12px; flex-wrap: wrap; min-height: 44px;
}
.prf-info-label {
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
  font-weight: 600; color: var(--text-muted); font-family: 'DM Mono', monospace; white-space: nowrap;
}
.prf-info-value { font-size: 13px; color: var(--text); }
.prf-mono { font-family: 'DM Mono', monospace; font-size: 12px; }

.prf-stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.prf-stat-card {
  background: var(--surface2, #1a1e27); border: 1px solid var(--border);
  border-radius: 12px; padding: 18px 14px;
  display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center;
}
.prf-stat-val {
  font-family: 'DM Mono', monospace; font-size: 28px;
  font-weight: 500; color: var(--text); line-height: 1;
}
.prf-stat-val.accent { color: var(--accent); }
.prf-stat-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--text-muted); font-weight: 500;
}

.prf-danger-section {
  background: rgba(239,68,68,0.04); border: 1px solid rgba(239,68,68,0.15);
  border-radius: 14px; padding: 24px; margin-top: 8px;
}
.prf-danger-btn {
  padding: 11px 22px; min-height: 44px;
  background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3);
  border-radius: 10px; color: #f87171; font-family: 'Outfit', sans-serif;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s;
}
.prf-danger-btn:hover:not(:disabled) { background: rgba(239,68,68,0.22); }
.prf-danger-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.prf-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.75);
  backdrop-filter: blur(8px); z-index: 9999;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.prf-modal {
  background: var(--surface); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 18px; padding: 28px 24px; max-width: 420px; width: 100%;
  animation: prf-modal-in 0.18s ease;
}
@keyframes prf-modal-in {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.prf-modal-icon  { font-size: 40px; text-align: center; margin-bottom: 12px; }
.prf-modal-title {
  font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700;
  color: var(--text); text-align: center; margin-bottom: 10px;
}
.prf-modal-body {
  font-size: 13px; color: var(--text-muted); text-align: center;
  line-height: 1.6; margin-bottom: 20px;
}
.prf-modal-actions { display: flex; gap: 10px; margin-top: 18px; }
.prf-modal-cancel {
  flex: 1; padding: 12px; min-height: 44px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif;
  font-size: 14px; font-weight: 500; cursor: pointer;
}
.prf-modal-cancel:hover { background: rgba(255,255,255,0.1); }

@media (max-width: 767px) {
  .prf-nav  { padding: 12px 16px; }
  .prf-main { padding: 24px 16px 80px; }
  .prf-stats-grid { grid-template-columns: repeat(2, 1fr); }
  .prf-stats-grid .prf-stat-card:last-child { grid-column: 1 / -1; }
  .prf-theme-row { gap: 8px; }
  .prf-theme-card { flex: 1 1 100px; padding: 10px 8px; }
  .prf-inline-row { flex-direction: column; }
  .prf-inline-row .prf-save-btn { width: 100%; }
  .prf-modal { border-radius: 18px 18px 0 0; position: fixed; bottom: 0; left: 0; right: 0; max-width: 100%; }
  .prf-modal-overlay { align-items: flex-end; padding: 0; }
  .prf-modal-actions { flex-direction: column; }
}
@media (max-width: 375px) {
  .prf-stats-grid { grid-template-columns: 1fr; }
  .prf-stats-grid .prf-stat-card:last-child { grid-column: auto; }
}
`;
