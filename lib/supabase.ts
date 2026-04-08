import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client — use in Client Components and browser-side logic.
 * Reads NEXT_PUBLIC_ env vars, safe to call anywhere on the client.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Typed helper re-exported for convenience so imports stay short:
 *   import { createClient } from '@/lib/supabase'
 */
export type SupabaseClient = ReturnType<typeof createClient>;
