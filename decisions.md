# Architecture Decision Records

A lightweight ADR log for StudyMD. Append a new entry whenever you make a non-obvious architectural choice. Format per entry: **Title · Date · Status · Context · Decision · Consequences**.

Dates reflect when the decision landed in the repo (from git history) or, for undated early decisions, the best-available approximation.

---

## ADR-001 · Use Supabase as the primary backend
- **Date:** 2026-04-08 (project inception)
- **Status:** Accepted
- **Context:** StudyMD needs auth, a relational database, and file storage for a small cohort. Alternatives considered: Firebase (poor SQL), custom Postgres on Railway (more ops), Convex (less mature), PlanetScale + Clerk + S3 (more moving parts).
- **Decision:** Use Supabase for Postgres, Auth, and Storage in a single managed service.
- **Consequences:**
  - (+) Unified auth/DB/storage with row-level security.
  - (+) Free tier is sufficient for current scale.
  - (+) Postgres means real SQL, real constraints, real RLS policies.
  - (−) Vendor lock-in for auth. Migrating off requires re-issuing sessions.
  - (−) Edge runtime can't query Postgres reliably; role checks must live in page Server Components (see ADR-007).

---

## ADR-002 · Use Next.js 16 App Router
- **Date:** 2026-04-08 (initial scaffold)
- **Status:** Accepted
- **Context:** Team is small; server-rendered pages with streaming and co-located data-fetch are desirable. Pages Router considered but passed over.
- **Decision:** App Router with server components by default.
- **Consequences:**
  - (+) Simpler data-fetching model (async Server Components).
  - (+) Route handlers (`app/api/*`) replace the old Pages API routes.
  - (−) Fewer community patterns than Pages Router.
  - (−) Middleware file is named `proxy.ts` on this project (see ADR-006).

---

## ADR-003 · Use Anthropic Claude over OpenAI
- **Date:** 2026-04-12 (commit `f4a8d93` — "Claude API Integration for Lecture Processing")
- **Status:** Accepted
- **Context:** The app converts dense medical-lecture PDFs into structured JSON. Needs strong long-document comprehension, large output budget, and native PDF support. OpenAI's function-calling was an alternative.
- **Decision:** Anthropic Claude, defaulting to **Haiku 4.5** (`claude-haiku-4-5-20251001`) with **Sonnet 4.6** (`claude-sonnet-4-6`) as a validation-failure fallback.
- **Consequences:**
  - (+) Native `document` content blocks let us send a PDF directly (no OCR pipeline).
  - (+) Haiku's cost (~$1/MTok input, $5/MTok output) is sufficient for ~90% of lectures.
  - (+) `cache_control: ephemeral` saves ~90% on repeated system-prompt reads.
  - (−) Haiku's 8K output cap forces a Sonnet retry on dense lectures (40+ flashcards + 25+ questions).
  - (−) Only one provider; no LiteLLM-style fallback. (Acceptable given current cost.)

---

## ADR-004 · Lecture content is immutable; per-user customization lives in a side table
- **Date:** 2026-04-09 (commit `646bd65` — "align all queries with real Supabase schema (internal_id, json_data columns)")
- **Status:** Accepted
- **Context:** Multiple users study the same lecture; one user's edits (custom title, color, visibility) must not affect others'. Alternative: denormalize per-user lecture rows (expensive, duplicates bulky `json_data`).
- **Decision:** Store canonical lecture content in `public.lectures` (immutable after upload). Store per-user display preferences in `public.user_lecture_settings` keyed by `(user_id, internal_id)`.
- **Consequences:**
  - (+) Zero duplication of large `json_data` blobs.
  - (+) Clean RLS story: `lectures` readable by all; `user_lecture_settings` readable only by owner.
  - (−) Feature #8 (editable topics) requires a `topics_override` column — can't just edit `lectures.topics`.
  - (−) Any per-card edit needs a `user_card_overrides` table (already scaffolded for this reason).

---

## ADR-005 · Progress sync is localStorage-first with periodic server upsert
- **Date:** 2026-04-09 (commit `3714c10` — "store individual card IDs for true cross-device mastery sync")
- **Status:** Accepted
- **Context:** Students study on multiple devices (phone, iPad, laptop). Real-time websocket sync (Supabase Realtime) was considered but adds infra complexity. The requirement is "if I mark a card on device A, I want to see it on device B within a minute or two".
- **Decision:** Write progress to `localStorage` immediately; enqueue a server UPSERT (`/api/progress/save`) that's debounced / flushed on visibility change. Conflict resolution: last-write-wins via `updated_at`. Individual card IDs (not aggregate counters) are stored for set-union on reconciliation.
- **Consequences:**
  - (+) Zero-latency UI on the study loop.
  - (+) Works offline; queue flushes when back online.
  - (−) Two devices studying the same lecture simultaneously may briefly diverge; last-write-wins.
  - (−) A bug in the sync layer can delete progress — partial mitigation: always merge server set into local (additive for got-it), never replace.

---

## ADR-006 · Auth middleware is `proxy.ts`, not `middleware.ts`
- **Date:** 2026-04-?? (commit `5226520` — "remove middleware.ts, proxy.ts is the correct Next.js middleware file for this project")
- **Status:** Accepted
- **Context:** Vercel + Next.js 16 on this project resolves the middleware from `proxy.ts`. An earlier attempt (`1741f4c`) placed it at `middleware.ts` and the build failed with a duplicate-middleware conflict. Both files cannot coexist.
- **Decision:** The project's auth middleware lives at `/proxy.ts`. Do not introduce a `middleware.ts`.
- **Consequences:**
  - (+) Builds cleanly on Vercel.
  - (−) New contributors reflexively create `middleware.ts`; must be called out in `CLAUDE.md` (done).
  - (−) IDE search for "middleware" misses the file; keyword "proxy" is a better anchor.

---

## ADR-007 · Role checks happen in page Server Components, not in `proxy.ts`
- **Date:** 2026-04-?? (commit `76f01b8` — "move role check out of proxy into page server components, fixes /app/admin redirect loop")
- **Status:** Accepted
- **Context:** An earlier design tried to enforce role-based redirect (admin → `/admin`, student → `/app`) inside `proxy.ts`. The Edge runtime could not reliably query `user_profiles` on every request, causing redirect loops when the query returned null.
- **Decision:** `proxy.ts` only checks "are you logged in?". Role-based branching happens in each protected page's Server Component. `/admin/page.tsx` calls `requireAdmin()` and redirects non-admins; `/app/page.tsx` assumes any authenticated user is allowed.
- **Consequences:**
  - (+) No redirect loops.
  - (+) Middleware stays lightweight.
  - (−) Every admin page must remember to call `requireAdmin()`.
  - (−) A brief flicker on unauthenticated-to-admin-page requests because the middleware catches them first; fine in practice.

---

## ADR-008 · Themes via CSS custom properties + `resolveColor` helper
- **Date:** 2026-04-11 (commit `56e5443` — "feat(ws5): lecture customization — manage mode, themes, tags, filters")
- **Status:** Accepted
- **Context:** Three themes (midnight, pink, forest) need to apply across dashboard, cards, modals, session UI. CSS-in-JS was considered but rejected for bundle size; Tailwind-only themes rejected because per-lecture color overrides (per theme) complicate class-based switching.
- **Decision:** CSS custom properties (`--smd-*`) in `styles/themes.css`, toggled by setting properties on `document.documentElement`. TypeScript bridge via `resolveColor(lecture, theme)` in `hooks/useUserLectures.ts`. Per-lecture overrides are stored as `user_lecture_settings.color_override` (jsonb, keyed by theme).
- **Consequences:**
  - (+) Zero-cost theme switching (one DOM operation).
  - (+) Per-lecture per-theme overrides are straightforward to read.
  - (−) Themes drift if new components forget to use the `--smd-*` variables; convention-dependent.
  - (−) A legacy `color_override_legacy` TEXT column still exists from an earlier design; deprecated but not dropped.

---

## ADR-009 · Direct-to-Storage upload flow
- **Date:** 2026-04-?? (commit `b7f2236` — "feat(upload/page): switch to direct-to-storage upload flow")
- **Status:** Accepted
- **Context:** Earlier design POSTed the file to `/api/upload`, which then pushed to Supabase Storage. Vercel's body-size limit for API routes capped this at ~4.5 MB, blocking larger PDFs. Alternative: raise the limit via a serverless function, but that's fragile.
- **Decision:** Client uploads directly to Supabase Storage via the browser Supabase client. The API route only records the `processing_jobs` row and kicks off generation.
- **Consequences:**
  - (+) File size cap is now Supabase Storage's 50 MB, not Vercel's body limit.
  - (+) The upload progress event comes from Supabase Storage directly — more accurate.
  - (−) Requires the bucket's RLS INSERT policy to use `(auth.uid()::text = (string_to_array(name, '/'))[1])` — a path-prefix check by user UUID. Non-obvious.

---

## ADR-010 · No tests today; manual verification recipes in docs
- **Date:** 2026-04-?? (no specific commit; acknowledged state)
- **Status:** Accepted (but flagged for change — see `recommendations.md` §2.1)
- **Context:** The project shipped v2 and v2.5 without a test suite. Speed of iteration outweighed coverage at that scale (one cohort, ~5 users).
- **Decision:** For v2 and v2.5, do not block on testing. Document manual verification recipes in `documentation.md` §9.5.
- **Consequences:**
  - (+) Very fast iteration; many small bug-fix commits ship daily.
  - (−) Regressions occasionally ship (several "fix" commits reversing recent "feat" commits).
  - (−) Refactors are risky.
  - **Revisit for v3:** add minimum coverage for `lib/validate-lecture.ts`, `lib/api-limits.ts`, and one E2E for the upload→study flow.

---

## ADR-011 · Inline schema (no `supabase/migrations` directory)
- **Date:** 2026-04-?? (ongoing state)
- **Status:** Accepted (flagged as tech debt — see `recommendations.md` §1.8)
- **Context:** Schema currently lives only in the production Supabase project. Changes are made via the Supabase SQL editor or Supabase MCP; no DDL is committed to the repo.
- **Decision:** For v2/v2.5, acceptable given single-environment deploy. For v3, adopt the `supabase db pull` workflow and commit `supabase/migrations/*.sql`.
- **Consequences:**
  - (+) Zero friction during rapid early schema churn.
  - (−) New environments cannot be bootstrapped without a schema dump.
  - (−) Schema changes are invisible in code review.
  - (−) Rolling back a schema change requires manual reverse SQL.

---

## ADR-012 · Cost discipline: daily/monthly caps + model selection as code
- **Date:** 2026-04-11 (commit `9adfd34` — "feat: lecture upload system with cost controls")
- **Status:** Accepted
- **Context:** Anthropic API can get expensive fast on a small hobbyist budget. Per-user billing and Stripe metering were overkill; needed simple hard caps.
- **Decision:** Encode limits in `lib/api-limits.ts` (daily call count, daily tokens, monthly $ cap). Default model is Haiku 4.5; Sonnet 4.6 is a validation-fallback only. Every call records `api_usage` via the `increment_api_usage` RPC.
- **Consequences:**
  - (+) Predictable worst-case spend; current cap is $5/month.
  - (+) Admin dashboard renders aggregates from `api_usage` directly.
  - (−) Limits are global, not per-user — one user can exhaust the quota for everyone. Per-user caps are planned for v3 (see `recommendations.md` §4.2).

---

## ADR-013 · Lecture processing is synchronous (Batch API disabled)
- **Date:** 2026-04-11 (same as ADR-012)
- **Status:** Accepted
- **Context:** Anthropic's Batch API halves cost but adds a 24-hour processing window. Foreground UX requires a few-minutes turnaround.
- **Decision:** `BATCH_API_ENABLED: false` in `lib/api-limits.ts`. Synchronous single-call processing for all lectures.
- **Consequences:**
  - (+) User sees their lecture ready within ~60s of upload.
  - (−) Pays full price on every call.
  - **Revisit when:** background reprocessing (e.g., regenerating flashcards with a new prompt) becomes a thing. Batch API fits that workload.

---

## ADR-014 · Primary-user personalization via `is_primary` flag
- **Date:** 2026-04-?? (commits `f784bc9`, `771eb8c`, `cab8ac8`)
- **Status:** Accepted
- **Context:** The primary user (Haley) gets personalized affirmations on the dashboard; other users get a generic greeting.
- **Decision:** Single boolean `is_primary` on `user_profiles`. Fetched server-side, passed through `DashboardClient` → `Dashboard`, used in greeting selection only.
- **Consequences:**
  - (+) Simple and extendable; future personalizations can use the same flag.
  - (−) Commit history references `user_preferences.is_primary` in one place but the live column is on `user_profiles` — causing the inconsistency flagged in `documentation.md` §7.1.
  - (−) Only one primary user is supported by design today. Multi-primary is a v4+ idea.

---

## ADR-015 · Feedback widget: direct-insert, with email side-effect via API
- **Date:** 2026-04-?? (commit `b2e8979` — "feat: feedback widget positioning, inbox UX, and email notification system")
- **Status:** Accepted
- **Context:** Feedback should be one click away from anywhere and not require a round-trip through an API just to record the row. But admins need email notifications.
- **Decision:** Feedback INSERT happens client-side via Supabase JS (RLS allows it). After a successful insert, the widget calls `POST /api/feedback/notify` to trigger an admin email.
- **Consequences:**
  - (+) Feedback submission is snappy; no server-side hop before acknowledging.
  - (+) Email is decoupled and can fail without affecting the feedback record.
  - (−) Two distinct code paths for feedback submission (DB and email).

---

## ADR-TBD (v3) · Folder model for lectures
- **Status:** Proposed — see `development_plan_v3.md` Feature #3.
- **Context:** Need nested organization beyond the flat `course` field.
- **Decision (proposed):** New `folders` table with optional `parent_id` (nested). Convert `user_lecture_settings.group_id` from `text` to `uuid` + FK.
- **Consequences:** Adds a real tree to the UI; slightly heavier query patterns; deletion cascade decisions matter.

---

## ADR-TBD (v3) · Package-scoped lecture access
- **Status:** Proposed — see `development_plan_v3.md` Feature #2.
- **Context:** Today's `lectures: authenticated users can read` policy lets every signed-in user see every lecture. Doesn't scale as the user base diversifies.
- **Decision (proposed):** `lecture_packages` + `user_package_access` tables. Tighten `lectures` RLS to require package access (or admin / self-uploader).
- **Consequences:** Adds a provisioning responsibility; every new user must get at least one package grant on sign-up.

---

---

## ADR-016 · Enable RLS + policies on `subscription_tiers`
- **Date:** 2026-04-17 (Slice 0 — P1)
- **Status:** Accepted
- **Context:** `subscription_tiers` had RLS disabled (Supabase advisor ERROR). Any authenticated user could read/write tier rows directly. Blocks Feature #2 (lecture packages).
- **Decision:** Enable RLS. Add a public SELECT policy (tier names are not sensitive) and a service-role-only ALL policy.
- **SQL:**
  ```sql
  ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Anyone can read subscription tiers"
    ON public.subscription_tiers FOR SELECT TO public USING (true);
  CREATE POLICY "Service role manages tiers"
    ON public.subscription_tiers FOR ALL TO public
    USING (auth.role() = 'service_role');
  ```
- **Consequences:**
  - (+) Closes an advisor ERROR; table is now safe to reference in user-facing queries.
  - (+) Consistent with `user_subscriptions` pattern.

---

## ADR-017 · Replace hard-coded admin UUID in `api_usage` policy
- **Date:** 2026-04-17 (Slice 0 — P2)
- **Status:** Accepted
- **Context:** The `api_usage: admin read only` SELECT policy compared `auth.uid()` against the literal UUID `930150fc-372b-4b61-98db-10e9ee25bdc4`. Fragile — breaks if the admin account changes; UUID is a magic value exposed in the policy.
- **Decision:** Replace with an `EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin')` check, matching the pattern used elsewhere in the schema.
- **SQL:**
  ```sql
  DROP POLICY "api_usage: admin read only" ON public.api_usage;
  CREATE POLICY "api_usage: admin read"
    ON public.api_usage FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    ));
  ```
- **Consequences:**
  - (+) Admin read access follows the user's current role, not a magic UUID.
  - (+) Adding a second admin account automatically grants `api_usage` access.

---

## ADR-018 · Drop broad `slides` bucket SELECT policy (Option A)
- **Date:** 2026-04-17 (Slice 0 — P3)
- **Status:** Accepted
- **Context:** The `Public can read slides` policy on `storage.objects` permitted unauthenticated directory listing of `slides/<internal_id>/`, leaking lecture IDs. A second "Users can read their own uploads" SELECT policy already existed. The bucket is public for direct URL access (CDN-cached slide images), so removing the broad policy leaves direct-URL access intact while blocking directory enumeration.
- **Decision:** Option A — drop the `Public can read slides` policy only. The bucket retains its public setting; direct slide image URLs continue to work via Supabase's CDN. The remaining `Users can read their own uploads` policy covers the RLS check for authenticated reads via the SDK.
- **SQL:**
  ```sql
  DROP POLICY "Public can read slides" ON storage.objects;
  ```
- **Consequences:**
  - (+) No more directory listing of lecture IDs.
  - (+) Existing slide image URLs embedded in the app continue to work (public bucket, CDN).
  - (−) Unauthenticated clients can no longer list slide objects via the Supabase SDK; direct URL access still works.

---

## ADR-019 · `system_config` access pattern: service-role only via API routes
- **Date:** 2026-04-17 (Slice 0 — P4)
- **Status:** Accepted
- **Context:** `system_config` has RLS enabled with no policies, flagged by the Supabase advisor as `rls_enabled_no_policy`. This is intentional: no user or anon client should ever read config directly. All reads go through server-side API routes (`GET /api/admin/config`, `GET /api/preferences`) which use the service-role client and perform their own auth checks.
- **Decision:** Leave the no-policy state intentional. Document clearly. Do not add a user-facing SELECT policy. If a value needs to be surfaced to clients, it must pass through a server-side API route.
- **Consequences:**
  - (+) Config values (admin email, feature flags, model overrides) cannot be read by arbitrary authenticated users.
  - (+) Centralizes config reads at the API layer, making it easy to audit access.
  - (−) Supabase advisor will continue to flag this as `rls_enabled_no_policy`; suppress/acknowledge the warning rather than "fixing" it.

---

## ADR-020 · Set `search_path` on SECURITY DEFINER functions
- **Date:** 2026-04-17 (Slice 0 — P5)
- **Status:** Accepted
- **Context:** Two functions — `ensure_user_preferences` and `increment_api_usage` — were `SECURITY DEFINER` without `SET search_path`, making them vulnerable to search_path hijacking (a malicious schema earlier in the path could shadow `user_preferences` or `api_usage`). The other four trigger functions (`set_updated_at`, `update_study_plans_updated_at`, `update_user_card_overrides_updated_at`, `update_user_profiles_updated_at`) are not SECURITY DEFINER and do not need this fix.
- **Decision:** Recreate both SECURITY DEFINER functions with `SET search_path = public, pg_temp`.
- **SQL:** See migration `p5_search_path_security_definer_functions`.
- **Consequences:**
  - (+) Closes a Supabase advisor security advisory.
  - (+) Functions are now pinned to the `public` schema regardless of caller's search_path.

---

## ADR-021 · `is_primary` source-of-truth is `user_profiles`
- **Date:** 2026-04-17 (Slice 0 — P6)
- **Status:** Accepted
- **Context:** Earlier commits referenced `user_preferences.is_primary` in comments and code, but the column only exists on `user_profiles`. `fetchUserPreferences()` in `lib/supabase-server.ts` was selecting `is_primary` from `user_preferences` — which would always return `null` (column absent). The v3 greetings feature depends on this being correct.
- **Decision:** Update `fetchUserPreferences()` to fetch `is_primary` from `user_profiles` via a parallel query. No schema change needed — column already lives on the right table.
- **Consequences:**
  - (+) `is_primary` now returns the correct value for the primary user.
  - (+) Unblocks Feature #1 (random greetings).
  - (−) Two queries instead of one; negligible cost given they run in parallel.

---

## ADR-022 · Pomodoro pill hidden on mobile header (acknowledged UX gap)
- **Date:** 2026-04-17 (Slice 1 — Fix #13)
- **Status:** Accepted
- **Context:** `PomodoroMiniPill` has a minimum width of ~120px. On mobile (≤768px) the header already contains the logo, Upload button, and Settings gear. Adding the 120px+ pill would overflow or force icons off-screen. Hiding it avoids collision without breaking timer state, because `PomoProvider` wraps the whole app in `layout.tsx` — the timer continues running even when the pill is invisible.
- **Decision:** Hide `PomodoroMiniPill` below 768px via CSS (`display: none` inside the component's responsive styles). Timer state is preserved. Expose the timer on mobile via a dedicated `/app/focus` page in v3.1.
- **Consequences:**
  - (+) Clean mobile header with no overflow.
  - (+) Timer keeps ticking — users who start a session on desktop and switch to mobile don't lose their progress.
  - (−) Mobile users cannot see the running timer in the header. Mitigated by the future `/app/focus` route.
  - Revisit when: the header nav is moved to a bottom tab bar on mobile (v4 or later), which would free up horizontal space.

---

## Template for new ADRs

Copy/paste and fill in:

```markdown
## ADR-XXX · <Title>
- **Date:** YYYY-MM-DD (commit `<shortsha>` — "<commit message>")
- **Status:** Proposed | Accepted | Superseded by ADR-YYY | Deprecated
- **Context:** What problem, what constraints, what alternatives considered.
- **Decision:** What we chose. One or two sentences.
- **Consequences:**
  - (+) Positive outcome.
  - (−) Trade-off.
  - Revisit when: <condition>.
```
