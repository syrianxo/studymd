import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './supabase'

/**
 * Use in Server Components, Route Handlers, and Server Actions ONLY.
 *
 * This file imports 'next/headers' which is only available in the App Router
 * server context. Keep it isolated here — never import it from client
 * components, proxy.ts, or anywhere that runs in the browser/middleware.
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
        // Server Components cannot set cookies — mutations happen in proxy.ts
        // and Server Actions only.
        setAll() {},
      },
    }
  )
}
