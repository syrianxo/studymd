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
 * - Protects /app/*   — unauthenticated visitors → /login
 * - Protects /admin/* — unauthenticated → /login, non-admin → /app
 * - /login while authed: admins → /admin, everyone else → /app
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

  // ── Guard: /admin/* additionally requires role = 'admin' ───────────────
  // The own_read RLS policy on user_profiles lets the anon client read the
  // current user's own row, so no service key is needed here.
  if (pathname.startsWith('/admin') && isAuthed) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user!.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.redirect(new URL('/app', request.url))
    }
  }

  // ── /login: redirect already-authed users based on role ────────────────
  if (pathname === '/login' && isAuthed) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user!.id)
      .single()

    const dest = profile?.role === 'admin' ? '/admin' : '/app'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
