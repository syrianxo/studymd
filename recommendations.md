# StudyMD Recommendations

A prioritized backlog of improvements: security, code quality, performance, cost discipline, UX, and new-feature ideas. Each item names the problem, the location, and a concrete fix. Tagged by priority:

- 🔴 **Critical** — security or correctness; ship before v3.
- 🟡 **Important** — meaningful improvement; ship during or alongside v3.
- 🟢 **Nice** — useful but not blocking.

---

## 1. Critical security & infrastructure

### 1.1 🔴 Enable RLS on `subscription_tiers`
**Problem.** Live Supabase advisor flags this table as `rls_disabled_in_public` (ERROR-level). Anyone with the anon key can write to it.
**Fix.** Before launching the v3 subscription feature:
```sql
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read subscription tiers"
  ON public.subscription_tiers FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Service role manages tiers"
  ON public.subscription_tiers FOR ALL
  TO public
  USING (auth.role() = 'service_role');
```

### 1.2 🔴 Replace hard-coded admin UUID in `api_usage` policy
**Problem.** The `api_usage: admin read only` policy compares `auth.uid()` to the literal UUID `930150fc-372b-4b61-98db-10e9ee25bdc4`. If that user is deleted or another admin is added, the policy breaks.
**Fix.** Replace with the role-based pattern already used on `user_profiles`:
```sql
DROP POLICY "api_usage: admin read only" ON public.api_usage;

CREATE POLICY "api_usage: admin read"
  ON public.api_usage FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

### 1.3 🔴 Tighten `slides` storage bucket SELECT policy
**Problem.** The `Public can read slides` policy allows directory listing of `slides/<internal_id>/`, leaking the set of lecture IDs. Supabase advisor flags this as `public_bucket_allows_listing`.
**Fix (option A — keep public, restrict listing).** Replace the broad SELECT policy with one that requires a known object key:
```sql
DROP POLICY "Public can read slides" ON storage.objects;
-- (No replacement needed — public access via direct URL still works once you know the URL.
--  Remove the SELECT policy entirely; Supabase Storage serves objects via URL without needing a SELECT policy when the bucket is public.)
```
**Fix (option B — switch to signed URLs).** Make the `slides` bucket private and serve thumbnails via signed URLs from a route handler. Higher friction, higher security.

### 1.4 🔴 Add a policy for `system_config` (or document the design)
**Problem.** RLS is enabled but no policies exist (`rls_enabled_no_policy`). The table is unreachable for non-service-role clients. If user-facing code ever needs to read a config row, it must go through an API.
**Fix.** Either add a `SELECT` policy for `authenticated` users on whitelisted keys, or document that all `system_config` reads go through `/api/admin/config` and `/api/preferences`.

### 1.5 🔴 Set `search_path` on the 6 public functions
**Problem.** Six functions (`ensure_user_preferences`, `increment_api_usage`, `set_updated_at`, `update_*_updated_at`) have a mutable search_path. A malicious schema in the search path could shadow `public.*` references inside the function. Supabase advisor flags this as `function_search_path_mutable` (WARN).
**Fix.** Recreate each function with `SET search_path = public, pg_temp`:
```sql
CREATE OR REPLACE FUNCTION public.increment_api_usage(...)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- existing body
$$;
```
Repeat for the other five.

### 1.6 🟡 Enable HaveIBeenPwned leaked-password protection
**Problem.** Supabase Auth has this off by default and it's flagged.
**Fix.** Supabase Dashboard → Auth → Password Security → enable "Check passwords against HaveIBeenPwned". One-click; no code change.

### 1.7 🔴 Resolve `is_primary` source-of-truth confusion
**Problem.** Production schema has `is_primary` on `user_profiles`. Recent commit message (`f784bc9`) says "fetch is_primary flag from user_preferences" — but `user_preferences` does not have that column in the live schema. Some code paths probably read `null`.
**Fix.**
1. Confirm with `\d user_preferences` (Supabase MCP `list_tables verbose`) that `is_primary` is not on `user_preferences`.
2. Update `fetchUserPreferences()` in `lib/supabase-server.ts` to read `is_primary` from `user_profiles` in the same query.
3. Drop any references to `user_preferences.is_primary` in code.

### 1.8 🟡 Add a `migrations/` workflow
**Problem.** Schema lives only in the production Supabase project. There's no checked-in DDL. New environments cannot be bootstrapped reproducibly. Schema drift is invisible in code review.
**Fix.** Adopt `supabase` CLI workflow:
```bash
supabase init
supabase db pull              # snapshot current prod schema → supabase/migrations/<ts>_init.sql
supabase migration new <name> # for each future change
```
Commit `supabase/` to the repo. Keep `apply_migration` via MCP as the deployment path; the CLI is for tracking and dev-environment provisioning.

---

## 2. Code quality

### 2.1 🟡 Add `lint`, `typecheck`, and `test` scripts
**Problem.** `package.json` only has `dev`, `build`, `start`. There's no automated quality bar.
**Fix.**
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:e2e": "playwright test"
}
```
Wire up Vitest with two priorities:
1. **`lib/validate-lecture.ts`** — pure function, easy to fixture, gates the AI pipeline.
2. **`lib/api-limits.ts`** — `estimateTokensFromBytes`, `estimateCost` (both overloads), `checkLimits` (mocked Supabase).

For E2E, add Playwright covering the upload → study flow.

### 2.2 🟢 Drop the `color_override_legacy` column
**Problem.** TEXT-typed legacy override on `user_lecture_settings`. Replaced by jsonb `color_override` (theme-keyed). Still in the schema.
**Fix.** After confirming no code reads it (`grep -ri color_override_legacy`), drop the column:
```sql
ALTER TABLE public.user_lecture_settings DROP COLUMN color_override_legacy;
```

### 2.3 🟡 Consolidate `processing_jobs` duplicated columns
**Problem.** Three pairs of duplicated columns:
- `original_file` vs `original_filename`
- `internal_id` vs `lecture_id`
- `estimated_cost` vs `estimated_cost_usd`

**Fix.** Pick the more recent column in each pair (`original_filename`, `lecture_id`, `estimated_cost_usd`). Backfill from the old column where present, then drop the old column. Update all readers and writers.

### 2.4 🟡 Move admin UUIDs and other magic strings to `system_config`
**Problem.** `lib/api-limits.ts` references `Khalid` as the admin to contact in error messages. Some hard-coded UUIDs and emails leak into code.
**Fix.** Read these from `system_config` rows (`admin_email`, `admin_display_name`, `support_url`) at startup.

### 2.5 🟢 Add `app/sitemap.ts` and `app/robots.ts`
**Problem.** No sitemap, no `robots.txt`. Mostly cosmetic for a private app, but defensible to have.
**Fix.** Stock Next.js App Router boilerplate.

### 2.6 🟡 Split `Dashboard.tsx` (33KB) and `ManageLectureCard.tsx` (45KB)
**Problem.** Both files are larger than ideal for navigation and review. `ManageLectureCard.tsx` mixes display, flashcard editing, question editing, color picking, and icon picking.
**Fix.**
- `Dashboard.tsx`: extract `<DashboardHeader>`, `<DashboardSidebar>` (Pomodoro + StudyConfig + TodaysPlan), `<DashboardGreeting>`. Keep `Dashboard.tsx` as the layout assembler.
- `ManageLectureCard.tsx`: split into `ManageLectureSummary`, `ManageFlashcardEditor`, `ManageQuestionEditor`, `ManageMetadataEditor`, `IconPicker`. Compose in a parent `ManageLectureCard.tsx` that's < 200 lines.

### 2.7 🟢 Extract `lib/storage.ts`
**Problem.** Storage path conventions (`uploads/<user_id>/<ts>_<name>`, `slides/<internal_id>/slide_NN.jpg`) are duplicated as string templates across multiple files.
**Fix.** Centralize:
```ts
export const storage = {
  uploadPath: (userId: string, filename: string) =>
    `${userId}/${Date.now()}_${filename}`,
  slidePath: (internalId: string, slideNumber: number) =>
    `${internalId}/slide_${String(slideNumber).padStart(2, '0')}.jpg`,
  buckets: { uploads: 'uploads', slides: 'slides' } as const,
};
```

### 2.8 🟡 Implement or delete `LoginForm.tsx`
**Problem.** Placeholder per "TODO Workstream 3" thread. `app/login/page.tsx` may inline its own form, leaving the placeholder stale.
**Fix.** Either move the form into the component, or delete the file.

---

## 3. Performance

### 3.1 🟡 Reconsider permanently-mounted `LectureViewModal`
**Problem.** `LectureGrid` mounts `LectureViewModal` (32KB component) once and toggles its visibility. With many lectures, this adds non-trivial DOM weight.
**Fix.** Profile the current cost. If non-negligible, switch to on-demand mounting with React's `<Suspense>` and `lazy()`:
```tsx
const LectureViewModal = lazy(() => import('./LectureViewModal'));
{openLecture && (
  <Suspense fallback={null}>
    <LectureViewModal lecture={openLecture} ... />
  </Suspense>
)}
```

### 3.2 🟡 Persist `slide_count` reliably at upload
**Problem.** `LectureViewModal` probes `/api/lectures/[id]/slides` (which probes Storage) to discover the slide count when `slide_count = 0`. This is wasteful.
**Fix.** Set `slide_count` in `app/api/generate/route.ts` based on the rendered slide blob count from `slide-converter.ts`. Add a one-time backfill SQL.

### 3.3 🟢 Evaluate Recharts alternatives for the admin dashboard
**Problem.** Recharts is ~150KB gzipped and only used on `/admin`.
**Fix.** Either route-level code-split (Recharts only loads on `/admin`) — already partly the case via App Router — or evaluate `uplot` / `vega-lite-tiny` for the simple time-series.

### 3.4 🟢 Use `next/image` consistently
**Problem.** Some images use `<img>`, some use `<Image>`.
**Fix.** Audit `Grep -i "<img"` and convert to `next/image` where possible. Add Supabase's image transformation domain to `next.config.ts` if not already there.

### 3.5 🟢 Add HTTP caching to `GET /api/lectures` and similar
**Problem.** Every dashboard load fetches all lectures even if nothing changed.
**Fix.** Add `Cache-Control: private, max-age=10, stale-while-revalidate=60` headers; client-side revalidation via SWR / React Query for the few mutating screens.

---

## 4. Cost / API discipline

### 4.1 🟡 Enable Anthropic Batch API for non-interactive lecture processing
**Problem.** `BATCH_API_ENABLED: false` in `lib/api-limits.ts`. Synchronous processing is required for the foreground upload UX, but batch is great for off-peak reprocessing or worksheet conversion.
**Fix.** Add a `processing_jobs.batch_id` column. Submit jobs older than X minutes via batch (50% discount). Poll Anthropic batch results in a cron-driven `/api/batch/poll` route.

### 4.2 🟡 Per-user monthly cost cap
**Problem.** Today's caps are global (5 calls/day, $5/month across all users). One user can exhaust the quota for everyone.
**Fix.** Introduce per-user limits in `system_config` (or `subscription_tiers.monthly_call_cap`). Update `checkLimits()` to enforce both global and per-user caps.

### 4.3 🟡 Verify the `cache_control: ephemeral` is actually hitting cache
**Problem.** No instrumentation today proves the system-prompt cache is being reused across calls.
**Fix.** Log `usage.cache_creation_input_tokens` vs `usage.cache_read_input_tokens` from Anthropic's response and write to `processing_jobs`. Surface "cache hit %" on the admin Usage tab.

### 4.4 🟢 Move from Haiku 4.5 to whatever's cheapest-and-best at the time
**Problem.** Models update monthly; the constant string `claude-haiku-4-5-20251001` ages.
**Fix.** Read `MODEL_DEFAULT` and `MODEL_FALLBACK` from `system_config` so an admin can swap models without redeploy.

---

## 5. UX enhancements (independent of v3 features)

### 5.1 🟡 Full-text lecture search
**Problem.** No search box on the dashboard. With 50+ lectures, browsing becomes painful.
**Fix.**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX lectures_title_trgm ON public.lectures USING gin (title gin_trgm_ops);
CREATE INDEX lectures_topics_trgm ON public.lectures USING gin (topics jsonb_path_ops);
```
Add `?q=` query param on `GET /api/lectures` that does ILIKE matching across `title`, `subtitle`, `topics`.

### 5.2 🟡 Sort options for the lecture grid
**Problem.** Only sort is manual `display_order`.
**Fix.** Add a sort menu with: Recently studied, Alphabetical, Mastery (asc/desc), Date added.

### 5.3 🟡 Bulk operations on the manage page
**Problem.** Each lecture is archived/hidden/tagged one at a time.
**Fix.** Add multi-select with checkboxes; floating action bar with "Archive selected", "Add tag…", "Move to folder…" (after v3 folders ship).

### 5.4 🟢 Keyboard shortcut help overlay
**Problem.** Shortcuts exist but are undocumented in-app.
**Fix.** `?` key toggles a modal listing all shortcuts.

### 5.5 🟢 Onboarding tour for first-time users
**Problem.** A new user lands on an empty dashboard with no guidance.
**Fix.** Light tour using a small library (`shepherd.js` or hand-rolled tooltips) that runs once on first sign-in.

### 5.6 🟢 Export progress as CSV / PDF
**Problem.** Students may want to share progress with advisors.
**Fix.** Add `GET /api/progress/export?format=csv|pdf`.

### 5.7 🟢 Show keyboard shortcuts in the FlashcardConfigModal
**Problem.** First-time users don't discover G/M/Space until they read the docs.
**Fix.** Footer of the config modal lists shortcuts.

---

## 6. New features beyond v3

### 6.1 🟢 Activate spaced repetition
**Why.** `sr_card_state` table is already in the schema with SM-2 fields (`ease_factor`, `interval_days`, `repetitions`, `lapses`, `due_date`). No code uses it.
**Fix.** Implement an SM-2 algorithm in `lib/spaced-repetition.ts`. After each flashcard mark in `FlashcardView`, update the row. Add a "Due today" filter to the dashboard.

### 6.2 🟢 Activate shared decks
**Why.** `shared_decks` table is already there with `share_code` and `is_public` columns.
**Fix.** Add a "Share" button to `LectureViewModal` that creates a `shared_decks` row and gives the user a `studymd.app/d/<share_code>` URL. Visiting the URL clones the lecture into the visitor's account.

### 6.3 🟢 Mobile PWA wrapper
**Fix.** Add `app/manifest.ts` + a service worker via `@serwist/next`. Offline support for already-loaded lectures.

### 6.4 🟢 Anki export
**Fix.** `GET /api/lectures/[id]/anki` returns a `.apkg` file (use the `genanki` JS port).

### 6.5 🟢 Multi-account linking
**Why.** `is_primary` already exists; the long-term feature is letting students link a personal account to a shared cohort account.
**Fix.** Add `linked_user_ids text[]` to `user_profiles`. Add an account-switcher in the header.

### 6.6 🟢 Real-time collaborative study sessions
**Fix.** Use Supabase Realtime channels keyed by session ID. Two students review the same flashcard set together.

### 6.7 🟢 Study buddy AI ("ask the lecture")
**Fix.** New chat panel inside `LectureViewModal`. The user asks a free-form question; Claude answers using the lecture content as context. Cost-tracked.

---

## 7. Repository structure

### 7.1 🟡 Add a `docs/` directory for long-form content
**Why.** As `documentation.md`, `architecture.md`, and `decisions.md` grow, the root gets crowded.
**Fix.** Move all docs except `README.md` and `CLAUDE.md` into `docs/`. Update internal links. Optional — keep at root if discoverability is preferred.

### 7.2 🟡 Add `CONTRIBUTING.md`
**Why.** Even for a small team, a one-page contributor guide reduces friction.
**Fix.** Cover: how to clone, env-var setup, run tests (once they exist), code style, PR template, deployment notes.

### 7.3 🟢 Add `SECURITY.md`
**Why.** GitHub will surface it on the repo page and provide a private vulnerability reporting form.
**Fix.** Single-page disclosure policy with an admin contact email.

### 7.4 🟢 Tag releases
**Why.** v2 and v2.5 happened, but no `v2.0.0` / `v2.5.0` tags exist in `git tag --list`.
**Fix.** Backfill tags for the v2 / v2.5 milestones; tag v3 once it ships.

---

## 8. Observability

### 8.1 🟡 Server-side error reporting
**Problem.** Errors in `/api/generate` are written to `processing_jobs.error_message` but not aggregated. A spike in failures is invisible.
**Fix.** Add Sentry (`@sentry/nextjs`) with the free tier. Tag events with `route`, `userId`, and `model`.

### 8.2 🟢 Client-side error reporting
**Fix.** Same Sentry setup; errors caught by `ErrorBoundary.tsx` get reported.

### 8.3 🟢 Daily admin digest
**Fix.** A scheduled function that emails the admin: yesterday's calls, cost, error rate, new feedback. Use Vercel Cron + the existing email setup.

---

## 9. Documentation upkeep

### 9.1 Maintain ADRs
Append to `decisions.md` whenever you make a non-obvious architectural choice. The cost (one paragraph per decision) is far less than the cost of someone re-litigating it.

### 9.2 Keep `todo.md` current
Move items from "Backlog" to "Next" to "Now" as they progress. Close completed items in the same commit that closes the work.

### 9.3 Update the file audit in `documentation.md`
When you add a non-trivial file, add a row to the appropriate table in Section 2 of [`documentation.md`](./documentation.md). PR review should catch missing rows.

---

End of recommendations. Items here feed into [`todo.md`](./todo.md) (active tracking) and [`plan.md`](./plan.md) (versioned roadmap).
