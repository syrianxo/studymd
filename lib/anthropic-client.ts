/**
 * lib/anthropic-client.ts
 *
 * Single factory for the Anthropic SDK client so every server route
 * instantiates it the same way. Previously three routes each created
 * their own client (lib/job-runner.ts, app/api/admin/reprocess/*, and
 * app/api/lectures/[id]/annotations/*) — consolidated here.
 *
 * Server-only. Do not import from client components.
 */

import Anthropic from '@anthropic-ai/sdk';

let cachedClient: Anthropic | null = null;

/**
 * Returns a process-singleton Anthropic client.
 * Throws if ANTHROPIC_API_KEY is not set.
 */
export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY environment variable.');
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── Feature flags ────────────────────────────────────────────────────────────
// Both default OFF. Flip per-environment in Vercel once verified in preview.

/** When on, pass `output_config.format` so Claude is schema-locked server-side. */
export const STRUCTURED_OUTPUTS_ENABLED =
  process.env.STUDYMD_STRUCTURED_OUTPUTS === '1';

/**
 * When on, upload the PDF via the Files API and reference it by file_id in
 * subsequent calls instead of re-base64-ing on every retry / reprocess.
 * Requires the `files-api-2025-04-14` beta header (added automatically when
 * this path is taken in job-runner.ts).
 */
export const FILES_API_ENABLED =
  process.env.STUDYMD_FILES_API === '1';

export const FILES_API_BETA_HEADER = 'files-api-2025-04-14';
