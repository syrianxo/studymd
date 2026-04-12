/**
 * lib/supabase.ts
 *
 * BROWSER-SAFE ONLY. This file is imported by client components.
 * It must never re-export anything from supabase-server.ts because
 * that module imports next/headers (server-only) and Turbopack will
 * break any client bundle that transitively reaches it.
 *
 * Import rules:
 *   Client components / hooks  → import { createClient } from '@/lib/supabase'
 *   Server components          → import directly from '@/lib/supabase-server'
 *   API routes                 → import directly from '@/lib/supabase-server'
 *   Middleware / proxy.ts      → import directly from '@/lib/supabase-middleware'
 */

export { createClient } from './supabase-browser';
