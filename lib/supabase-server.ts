import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { createServerClient as createMiddlewareClient } from "@supabase/ssr";

/**
 * Supabase server client — use in Server Components and Route Handlers.
 * Reads cookies from the Next.js cookie store.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Cookies can't be set in Server Components — safe to ignore here
            // as middleware refreshes the session cookie on every request.
          }
        },
      },
    }
  );
}

/**
 * Supabase middleware client — use in middleware.ts only.
 * Requires the mutable NextRequest / NextResponse pair.
 */
export function createMiddlewareSupabaseClient(
  request: NextRequest,
  response: NextResponse
) {
  return createMiddlewareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );
}
