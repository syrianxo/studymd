import { createBrowserClient, createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Database = any // Replace with your generated Supabase types

// ─── Browser / Client Component ──────────────────────────────────────────────

/**
 * Use in Client Components ("use client").
 * Auth tokens are managed via httpOnly cookies by @supabase/ssr.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Middleware / Proxy ───────────────────────────────────────────────────────

/**
 * Use exclusively in proxy.ts.
 * Needs both req and res so it can read AND write auth cookies (token refresh).
 * Does NOT import next/headers — safe to use in the proxy/middleware context.
 */
export function createMiddlewareClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            })
          )
        },
      },
    }
  )
}
