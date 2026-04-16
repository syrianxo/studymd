import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase-middleware'

/**
 * StudyMD Auth Middleware (Next.js 16+)
 *
 * - Refreshes Supabase session cookies on every request
 * - Protects /app/* — unauthenticated visitors redirected to /login
 * - Protects /admin/* — unauthenticated OR non-admin redirected away
 * - /login redirects already-authed users based on role:
 *     role = 'admin' → /admin
 *     everyone else  → /app
 *
 * Uses getUser() (not getSession()) — re-validates token server-side.
 */
export async function middleware(request: NextRequest) {
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
  // The user's own profile row is readable via RLS, so the anon client works.
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
    /*
     * Match all paths except Next.js internals and static assets so that
     * session cookies are refreshed on every navigation.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
