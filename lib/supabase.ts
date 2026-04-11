import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ─── Browser / Client Components ──────────────────────────────────────────
// Used in 'use client' components: login page, study pages, hooks
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// ─── Server Components ─────────────────────────────────────────────────────
// Used in server components and API routes that need cookie-based auth
export async function createServerComponentClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component — mutations are expected to be no-ops here
        }
      },
    },
  });
}

// ─── Middleware ────────────────────────────────────────────────────────────
// Used in proxy.ts / middleware.ts for session refresh on every request
export function createMiddlewareClient(request: NextRequest, response: NextResponse) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });
}

// ─── Service Role (API routes only — never client-side) ───────────────────
// Uses service role key to bypass RLS. Only call from server-side routes.
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient(supabaseUrl, serviceKey);
}

// ─── updateLectureSettings ────────────────────────────────────────────────
// Kept here so existing imports from '@/lib/supabase' continue to resolve.
export async function updateLectureSettings(
  userId: string,
  internalId: string,
  settings: Record<string, unknown>
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('user_lecture_settings')
    .update(settings)
    .eq('user_id', userId)
    .eq('internal_id', internalId);
}
