'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300&family=Outfit:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:          #0d0f14;
    --surface:     #13161d;
    --surface2:    #1a1e27;
    --border:      rgba(255,255,255,0.07);
    --accent:      #5b8dee;
    --accent-dim:  rgba(91,141,238,0.15);
    --accent-glow: rgba(91,141,238,0.35);
    --text:        #e8eaf0;
    --text-muted:  #6b7280;
    --success:     #34d399;
    --success-bg:  rgba(52,211,153,0.08);
    --error:       #f87171;
    --error-bg:    rgba(248,113,113,0.08);
  }

  body { font-family: 'Outfit', sans-serif; background: var(--bg); color: var(--text); min-height: 100dvh; }
  .page { min-height: 100dvh; display: grid; place-items: center; padding: 1.5rem;
    background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(91,141,238,0.12) 0%, transparent 70%), var(--bg); }
  .card { width: 100%; max-width: 400px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 2.5rem 2rem; box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(91,141,238,0.06);
    animation: fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

  .logo-wrap { display: flex; align-items: center; gap: 10px; margin-bottom: 2rem; }
  .logo-mark { width: 36px; height: 36px; border-radius: 9px; background: linear-gradient(135deg, var(--accent), #3b6fd4);
    display: grid; place-items: center; flex-shrink: 0; box-shadow: 0 4px 16px var(--accent-glow); }
  .logo-mark svg { width: 20px; height: 20px; }
  .logo-text { font-family: 'Fraunces', serif; font-size: 1.25rem; font-weight: 300; letter-spacing: -0.01em; color: var(--text); }
  .logo-text em { font-style: italic; color: var(--accent); }

  .heading { font-family: 'Fraunces', serif; font-size: 1.6rem; font-weight: 300; line-height: 1.2;
    letter-spacing: -0.02em; margin-bottom: 0.4rem; color: var(--text); }
  .subheading { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 2rem; font-weight: 300; }

  .form { display: flex; flex-direction: column; gap: 1rem; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .label { font-family: 'DM Mono', monospace; font-size: 0.7rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--text-muted); }
  .input { width: 100%; padding: 0.7rem 0.9rem; background: var(--surface2); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 0.92rem;
    outline: none; transition: border-color 0.18s, box-shadow 0.18s; -webkit-appearance: none; }
  .input::placeholder { color: var(--text-muted); }
  .input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }

  .error-box { display: flex; align-items: flex-start; gap: 8px; padding: 0.75rem 0.9rem;
    background: var(--error-bg); border: 1px solid rgba(248,113,113,0.2); border-radius: 8px;
    font-size: 0.85rem; color: var(--error); }
  .success-box { display: flex; align-items: flex-start; gap: 8px; padding: 0.75rem 0.9rem;
    background: var(--success-bg); border: 1px solid rgba(52,211,153,0.2); border-radius: 8px;
    font-size: 0.85rem; color: var(--success); }

  .btn { margin-top: 0.5rem; width: 100%; padding: 0.75rem; background: var(--accent); color: #fff;
    border: none; border-radius: 8px; font-family: 'Outfit', sans-serif; font-size: 0.95rem;
    font-weight: 500; cursor: pointer; transition: opacity 0.18s, transform 0.18s, box-shadow 0.18s;
    box-shadow: 0 4px 20px var(--accent-glow); }
  .btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); box-shadow: 0 6px 24px var(--accent-glow); }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-inner { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
    border-radius: 50%; animation: spin 0.65s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .footer-note { margin-top: 1.75rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);
    border-top: 1px solid var(--border); padding-top: 1.25rem; }
  .footer-note a { color: var(--accent); text-decoration: none; font-weight: 500; }
  .footer-note a:hover { text-decoration: underline; }
  .hint { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
`

function Logo() {
  return (
    <div className="logo-wrap">
      <div className="logo-mark">
        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8.5" y="2" width="3" height="16" rx="1" fill="white" fillOpacity="0.9"/>
          <rect x="2" y="8.5" width="16" height="3" rx="1" fill="white" fillOpacity="0.9"/>
        </svg>
      </div>
      <span className="logo-text">Study<em>MD</em></span>
    </div>
  )
}

function SignupForm() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmEmail, setConfirmEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => { emailRef.current?.focus() }, [])

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/app/onboarding` },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      router.push('/app/onboarding')
      router.refresh()
      return
    }

    setConfirmEmail(true)
    setLoading(false)
  }

  if (confirmEmail) {
    return (
      <>
        <h1 className="heading">Check your email.</h1>
        <p className="subheading">
          We sent a confirmation link to <strong style={{ color: 'var(--text)' }}>{email}</strong>.
          Click it to activate your account, then sign in.
        </p>
        <div className="success-box">✓ Account created. Confirmation required.</div>
        <p className="footer-note">
          <a href="/login">Back to sign in</a>
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="heading">Create an account.</h1>
      <p className="subheading">Start turning lectures into flashcards and practice exams.</p>

      <form className="form" onSubmit={handleSignUp} noValidate>
        {error && <div className="error-box">{error}</div>}

        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            ref={emailRef}
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <p className="hint">Minimum 8 characters.</p>
        </div>

        <button className="btn" type="submit" disabled={loading || !email || password.length < 8}>
          <span className="btn-inner">
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? 'Creating account…' : 'Create Account'}
          </span>
        </button>
      </form>

      <p className="footer-note">
        Already have an account? <a href="/login">Sign in</a>
      </p>
    </>
  )
}

export default function SignupPage() {
  return (
    <>
      <style>{styles}</style>
      <div className="page">
        <div className="card">
          <Logo />
          <Suspense fallback={<div style={{minHeight: '280px'}} />}>
            <SignupForm />
          </Suspense>
        </div>
      </div>
    </>
  )
}
