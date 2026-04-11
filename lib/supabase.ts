/**
 * lib/supabase.ts — re-export barrel.
 *
 * Import rules:
 *   Client components / hooks → import { createClient } from '@/lib/supabase'
 *   Server components         → import { createServerComponentClient, fetchLecturesWithSettings, ... } from '@/lib/supabase'
 *   API routes (server-only)  → import { createServiceClient, updateLectureSettings, ... } from '@/lib/supabase'
 *   Middleware / proxy.ts     → import { createMiddlewareClient } from '@/lib/supabase-middleware'
 *
 * NOTE: proxy.ts must import directly from '@/lib/supabase-middleware', not here,
 * because the middleware runtime cannot bundle next/headers even lazily.
 */

// Browser client — safe for client components
export { createClient } from './supabase-browser';

// Server-only exports
export {
  createServerComponentClient,
  createServiceClient,
  fetchLecturesWithSettings,
  fetchUserPreferences,
  updateLectureSettings,
  reorderLectures,
  fetchAllTags,
  saveUserTheme,
} from './supabase-server';
