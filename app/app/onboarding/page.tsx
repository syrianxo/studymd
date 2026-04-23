'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300&family=Outfit:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d0f14; --surface: #13161d; --surface2: #1a1e27;
    --border: rgba(255,255,255,0.07); --accent: #5b8dee;
    --accent-dim: rgba(91,141,238,0.15); --accent-glow: rgba(91,141,238,0.35);
    --text: #e8eaf0; --text-muted: #6b7280;
    --error: #f87171; --error-bg: rgba(248,113,113,0.08);
  }
  body { font-family: 'Outfit', sans-serif; background: var(--bg); color: var(--text); min-height: 100dvh; }
  .page { min-height: 100dvh; display: grid; place-items: center; padding: 1.5rem;
    background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(91,141,238,0.12) 0%, transparent 70%), var(--bg); }
  .card { width: 100%; max-width: 440px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 2.5rem 2rem; box-shadow: 0 24px 64px rgba(0,0,0,0.5);
    animation: fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  .logo-wrap { display: flex; align-items: center; gap: 10px; margin-bottom: 2rem; }
  .logo-mark { width: 36px; height: 36px; border-radius: 9px;
    background: linear-gradient(135deg, var(--accent), #3b6fd4); display: grid; place-items: center;
    flex-shrink: 0; box-shadow: 0 4px 16px var(--accent-glow); }
  .logo-mark svg { width: 20px; height: 20px; }
  .logo-text { font-family: 'Fraunces', serif; font-size: 1.25rem; font-weight: 300; color: var(--text); }
  .logo-text em { font-style: italic; color: var(--accent); }
  .heading { font-family: 'Fraunces', serif; font-size: 1.6rem; font-weight: 300;
    line-height: 1.2; margin-bottom: 0.4rem; color: var(--text); }
  .subheading { font-size: 0.88rem; color: var(--text-muted); margin-bottom: 2rem; line-height: 1.5; }
  .form { display: flex; flex-direction: column; gap: 1rem; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .label { font-family: 'DM Mono', monospace; font-size: 0.7rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--text-muted); }
  .input { width: 100%; padding: 0.7rem 0.9rem; background: var(--surface2); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 0.95rem;
    outline: none; transition: border-color 0.18s, box-shadow 0.18s; -webkit-appearance: none; }
  .input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .error-box { padding: 0.75rem 0.9rem; background: var(--error-bg);
    border: 1px solid rgba(248,113,113,0.2); border-radius: 8px; font-size: 0.85rem; color: var(--error); }
  .btn { margin-top: 0.5rem; width: 100%; padding: 0.8rem; background: var(--accent); color: #fff;
    border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 500; cursor: pointer;
    transition: opacity 0.18s, transform 0.18s; box-shadow: 0 4px 20px var(--accent-glow); }
  .btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-inner { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff; border-radius: 50%; animation: spin 0.65s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .signout-link { margin-top: 1.5rem; text-align: center; font-size: 0.8rem; color: var(--text-muted); }
  .signout-link button { background: none; border: none; color: var(--text-muted);
    text-decoration: underline; cursor: pointer; font-size: inherit; }
  .signout-link button:hover { color: var(--text); }
`;

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace('/login');
        return;
      }
      setEmail(user.email ?? '');
      const emailPrefix = user.email?.split('@')[0] ?? '';
      setDisplayName(emailPrefix);
      setChecking(false);
      setTimeout(() => nameRef.current?.focus(), 50);
    })();
    return () => { cancelled = true; };
  }, [router, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch('/api/profile/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName.trim() }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    router.push('/app');
    router.refresh();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (checking) {
    return (
      <>
        <style>{styles}</style>
        <div className="page">
          <div className="card"><div className="spinner" /></div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="page">
        <div className="card">
          <div className="logo-wrap">
            <div className="logo-mark">
              <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="8.5" y="2" width="3" height="16" rx="1" fill="white" fillOpacity="0.9"/>
                <rect x="2" y="8.5" width="16" height="3" rx="1" fill="white" fillOpacity="0.9"/>
              </svg>
            </div>
            <span className="logo-text">Study<em>MD</em></span>
          </div>

          <h1 className="heading">Welcome.</h1>
          <p className="subheading">
            One quick step before you start studying — tell us what to call you.
          </p>

          <form className="form" onSubmit={handleSubmit} noValidate>
            {error && <div className="error-box">{error}</div>}

            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" type="email" value={email} disabled />
            </div>

            <div className="field">
              <label className="label" htmlFor="display_name">Display name</label>
              <input
                ref={nameRef}
                className="input"
                id="display_name"
                type="text"
                maxLength={60}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="e.g. Haley"
                required
                disabled={loading}
              />
            </div>

            <button className="btn" type="submit" disabled={loading || displayName.trim().length === 0}>
              <span className="btn-inner">
                {loading && <span className="spinner" aria-hidden="true" />}
                {loading ? 'Setting up…' : 'Continue to StudyMD →'}
              </span>
            </button>
          </form>

          <div className="signout-link">
            Wrong account? <button type="button" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </div>
    </>
  );
}
