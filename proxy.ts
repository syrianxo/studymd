import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase-middleware'

/**
 * StudyMD Auth Proxy (Next.js 16+)
 *
 * THIS IS THE MIDDLEWARE FILE FOR THIS PROJECT.
 * Next.js on Vercel uses "proxy.ts" (not "middleware.ts") — do NOT create
 * a middleware.ts alongside this file; the build will fail with a conflict.
 *
 * Responsibilities:
 * - Refreshes Supabase session cookies on every request
 * - Protects /app/* and /admin/* — unauthenticated visitors → /login
 * - /login while authed → /app (role-based routing handled by each page)
 *
 * NOTE: Role checks (admin vs user) are intentionally NOT done here.
 * The middleware runs on the Edge and its Supabase client cannot reliably
 * query user_profiles on every request. Role enforcement is handled by
 * each protected server component (app/admin/page.tsx redirects non-admins
 * to /app; app/app/page.tsx redirects unauthenticated users to /login).
 *
 * Uses getUser() (not getSession()) — re-validates token server-side.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createMiddlewareClient(request, response)

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthed = !error && !!user

  // ── Guard: /app/* and /admin/* require authentication ──────────────────
  if (pathname.startsWith('/app') || pathname.startsWith('/admin')) {
    if (!isAuthed) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // ── /login: redirect already-authed users → /admin ──────────────────
  // /admin page server component handles role check and redirects
  // non-admins to /app, so we always bounce here rather than trying
  // to query user_profiles from the Edge runtime.
  if (pathname === '/login' && isAuthed) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
