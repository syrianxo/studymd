'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface SignOutButtonProps {
  /** Override default label */
  label?: string
  /** Optional extra class names on the button element */
  className?: string
  /** Where to redirect after sign-out. Defaults to '/login'. */
  redirectTo?: string
}

/**
 * SignOutButton
 *
 * Drop into any Client Component in the dashboard header (or anywhere else).
 *
 * Usage:
 *   import { SignOutButton } from '@/components/SignOutButton'
 *   <SignOutButton />
 *
 * The button calls supabase.auth.signOut(), which instructs @supabase/ssr to
 * clear the httpOnly auth cookies, then redirects to /login.
 */
export function SignOutButton({
  label = 'Sign Out',
  className,
  redirectTo = '/login',
}: SignOutButtonProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    await supabase.auth.signOut()
    router.push(redirectTo)
    router.refresh() // clear server-component session cache
  }

  return (
    <>
      <style>{`
        .sign-out-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0.45rem 0.9rem;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 7px;
          color: #6b7280;
          font-family: 'Outfit', sans-serif;
          font-size: 0.82rem;
          font-weight: 400;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
          white-space: nowrap;
        }

        .sign-out-btn:hover:not(:disabled) {
          color: #e8eaf0;
          border-color: rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.04);
        }

        .sign-out-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .sign-out-spinner {
          width: 12px;
          height: 12px;
          border: 1.5px solid rgba(255,255,255,0.2);
          border-top-color: currentColor;
          border-radius: 50%;
          animation: so-spin 0.6s linear infinite;
        }

        @keyframes so-spin { to { transform: rotate(360deg); } }
      `}</style>

      <button
        className={`sign-out-btn${className ? ` ${className}` : ''}`}
        onClick={handleSignOut}
        disabled={loading}
        aria-label="Sign out of StudyMD"
      >
        {loading ? (
          <>
            <span className="sign-out-spinner" aria-hidden="true" />
            Signing out…
          </>
        ) : (
          <>
            {/* Exit arrow icon */}
            <svg
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 2H2.5A1.5 1.5 0 001 3.5v6A1.5 1.5 0 002.5 11H5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="M8.5 9L12 6.5 8.5 4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="12"
                y1="6.5"
                x2="5"
                y2="6.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            {label}
          </>
        )}
      </button>
    </>
  )
}
