/**
 * lib/admin-auth.ts
 *
 * Shared helper: verifies the calling user has role = 'admin'
 * in the user_profiles table. Used by all /api/admin/* routes.
 *
 * Returns the admin user's ID on success, or throws/returns null on failure.
 */

import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Browser-session client (respects RLS, used to verify identity) */
async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {}
      },
    },
  });
}

/** Service client — bypasses RLS, for admin data queries */
export function createServiceClient() {
  return createSupabaseClient(supabaseUrl, serviceKey);
}

/**
 * Checks that the current session user is an admin.
 * Returns { userId, supabase } on success, or a NextResponse error on failure.
 */
export async function requireAdmin(): Promise<
  | { ok: true; userId: string; supabase: ReturnType<typeof createServiceClient> }
  | { ok: false; response: NextResponse }
> {
  const sessionClient = await createSessionClient();
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const supabase = createServiceClient();

  // Check user_profiles for role = 'admin'
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id, supabase };
}
