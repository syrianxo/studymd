import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './supabase'

/**
 * Use in Server Components — read-only cookies (cannot set).
 * Session refresh is handled by middleware on every request.
 */
export async function createServerComponentClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )
}

/**
 * Use in Route Handlers (API routes) ONLY.
 * Unlike Server Components, Route Handlers CAN set cookies,
 * which is required for Supabase to refresh expired session tokens.
 * Without this, getUser() returns null after token expiry → 401 errors.
 */
export async function createRouteHandlerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Route Handlers can set cookies — this should not throw,
            // but we catch defensively.
          }
        },
      },
    }
  )
}
