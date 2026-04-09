import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase'

/**
 * StudyMD Auth Proxy (Next.js 16+)
 *
 * Protects all routes under /app/* — redirects unauthenticated visitors
 * to /login. Refreshes Supabase session cookies on every request.
 *
 * Uses getUser() — NOT getSession() — because getSession() only reads the
 * JWT locally and is spoofable. getUser() validates with the Auth server.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createMiddlewareClient(request, response)

  // getUser() is authoritative — it re-validates the token server-side.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── Guard: /app/* requires an authenticated session ──────────────────────
  if (pathname.startsWith('/app')) {
    if (error || !user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // ── Redirect logged-in users away from /login ─────────────────────────────
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/app', request.url))
  }

  // Return the (possibly cookie-mutated) response so refreshed tokens reach
  // the browser.
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
