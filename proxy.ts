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
 * - GET /api/admin/whoami — returns auth + role debug info (no auth required)
 *
 * Uses getUser() (not getSession()) — re-validates token server-side.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const { pathname } = request.nextUrl

  // ── Debug endpoint: GET /api/admin/whoami ──────────────────────────────
  // Returns JSON showing exactly what the proxy sees for this session.
  // Remove this block once admin routing is confirmed working.
  if (pathname === '/api/admin/whoami') {
    const supabase = createMiddlewareClient(request, response)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    let profile = null
    let profileErr = null
    if (user) {
      const result = await supabase
        .from('user_profiles')
        .select('role, display_name, email')
        .eq('user_id', user.id)
        .single()
      profile = result.data
      profileErr = result.error?.message ?? null
    }
    return NextResponse.json({
      authed: !!user,
      userId: user?.id ?? null,
      authError: authErr?.message ?? null,
      profile,
      profileError: profileErr,
      wouldRouteTo: profile?.role === 'admin' ? '/admin' : '/app',
    })
  }

  const supabase = createMiddlewareClient(request, response)

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

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
