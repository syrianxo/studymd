import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/supabase-server";

/**
 * StudyMD Auth Middleware
 *
 * Protects all routes under /app/* — redirects unauthenticated visitors
 * to /login. Also refreshes the Supabase session cookie on every request
 * so the session doesn't silently expire mid-session.
 *
 * Routes protected:  /app, /app/*, /app/upload, etc.
 * Routes public:     /, /login, /api/*, everything else
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createMiddlewareSupabaseClient(request, response);

  // Refresh the session — this updates the cookie if it's close to expiry.
  // Must be called before checking session to ensure we have the latest state.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;

  // ── Protected routes ───────────────────────────────────────────────────────
  if (pathname.startsWith("/app")) {
    if (!session) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      // Preserve the original destination so we can redirect back after login
      loginUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── Redirect logged-in users away from /login ──────────────────────────────
  if (pathname === "/login" && session) {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/app";
    appUrl.search = "";
    return NextResponse.redirect(appUrl);
  }

  return response;
}

export const config = {
  /*
   * Run middleware on /app and all sub-paths.
   * Explicitly exclude Next.js internals and static files.
   */
  matcher: [
    "/app/:path*",
    "/login",
    /*
     * Exclude:
     *   - _next/static  (static files)
     *   - _next/image   (image optimization)
     *   - favicon.ico
     *   - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
