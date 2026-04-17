# CLAUDE.md

Guidance for Claude Code sessions (and human contributors) working in this repository. Read this file before making changes.

---

## Project overview

**StudyMD** is a private, single-cohort medical-education web app. A small group of Physician Assistant students upload their lecture slides; the app uses Claude to convert each lecture into flashcards, board-style practice questions, and a study schedule. The primary user is **Haley** (flagged with `is_primary = true` in `user_profiles`); other students share the same cohort.

The app is in active development. v2 (admin dashboard, plans, polish) and v2.5 (feedback widget, primary-user greetings) shipped recently. v3 is planned next — see `development_plan_v3.md`.

---

## Tech stack (pinned versions in `package.json`)

| Layer | Choice |
|---|---|
| Framework | Next.js **16.2.3** (App Router) |
| UI | React **19.2.4**, Tailwind CSS **v4** (PostCSS plugin), hand-rolled CSS in `styles/*.css` |
| Language | TypeScript **5.x**, strict mode, `@/` path alias from project root |
| Auth + DB + Storage | Supabase (`@supabase/ssr` 0.10.0, `@supabase/supabase-js` 2.102.1) |
| AI | `@anthropic-ai/sdk` **0.88.0**. Default model: `claude-haiku-4-5-20251001`. Fallback: `claude-sonnet-4-6`. |
| Drag & drop | `@dnd-kit/core`, `sortable`, `utilities` |
| Charts | `recharts` 2.15.3 (admin dashboard only) |
| PDF rendering | `pdfjs-dist` 5.6.205 |
| Hosting | Vercel |

Available scripts: only `dev`, `build`, `start`. **No `test`, `lint`, or `typecheck` scripts exist** — see "Conventions" below.

---

## Architecture in 60 seconds

- **App Router** under `app/`. Three top-level route trees: `app/` (root, marketing landing), `app/app/*` (signed-in user area), `app/admin/*` (admin only). API routes under `app/api/*`.
- **Server components by default.** Client components are explicit (`'use client'`) and limited to interactive UI (Dashboard, FlashcardView, Modals, etc.).
- **Auth middleware lives in `proxy.ts` at the project root — NOT `middleware.ts`.** Vercel's Next.js 16 build expects this filename for this project. Do not add a `middleware.ts` alongside it; the build will fail with a duplicate-middleware conflict (see commit `5226520`).
- **Supabase clients** come in three flavors and live in `lib/`:
  - `lib/supabase-server.ts` → `createServerComponentClient()` for Server Components and route handlers (cookie-based session).
  - `lib/supabase-browser.ts` → `createClient()` for Client Components (anon key).
  - `lib/supabase-middleware.ts` → `createMiddlewareClient(req, res)` for `proxy.ts` only.
  - Service-role client (bypasses RLS) is created inline in admin routes via `@supabase/supabase-js` `createClient` with `SUPABASE_SERVICE_ROLE_KEY`.
- **Lecture content is immutable**, stored in `public.lectures.json_data` (JSONB). **Per-user customization** lives in `public.user_lecture_settings` (display order, visibility, archive, tags, color override, custom title, course override, future folder via `group_id`). Don't mutate the lectures table on behalf of a single user.
- **Progress** is local-first: written to `localStorage` immediately, then synced to `public.user_progress` via `lib/progress-sync.ts` (last-write-wins on `updated_at`).
- **Anthropic calls** all go through `app/api/generate/route.ts`. They MUST be cost-recorded via the `increment_api_usage` Postgres RPC after each call (see `lib/api-limits.ts` for limits).

---

## Conventions Claude must follow

### Routing & middleware
- **`proxy.ts` is the middleware.** Never create a `middleware.ts`. Both will conflict on Vercel.
- Role checks (admin vs student) happen in **page-level Server Components**, not in `proxy.ts`. The Edge runtime cannot reliably query `user_profiles`. See `proxy.ts:16` for the rationale.
- `proxy.ts` calls `getUser()` (not `getSession()`) so the token is server-validated.

### Supabase access
- In a Server Component or route handler: `await createServerComponentClient()`.
- In a Client Component: `createClient()` from `@/lib/supabase` (browser barrel). Never import from `@supabase/supabase-js` directly in app code.
- Admin operations (read/write across all users) require the service role. Wrap each admin route in `requireAdmin()` from `lib/admin-auth.ts` before any data access.
- Every user-scoped query MUST `.eq('user_id', user.id)` even when RLS would catch it. Belt-and-suspenders.

### AI calls (cost discipline)
- Every Anthropic call is gated by `checkLimits(userId)` from `lib/api-limits.ts` BEFORE the call.
- Every Anthropic call MUST record usage via the `increment_api_usage` Postgres RPC AFTER the call. Falling back to a manual `api_usage` UPSERT is acceptable if the RPC errors.
- Default to `MODEL_DEFAULT` (Haiku 4.5). Use `MODEL_FALLBACK` (Sonnet 4.6) only via the validation-then-retry path in `app/api/generate/route.ts`.
- The system prompt for lecture processing lives in `lib/lecture-processor-prompt.ts` and is wrapped with `cache_control: 'ephemeral'` via `buildSystemWithCache()`. Do not inline a different system prompt.
- Pricing constants in `lib/api-limits.ts` are the source of truth — update there when models change.

### Schema changes
- **There is no migrations directory.** Schema lives only in the production Supabase project (`vimuhpoeuvfzpzfeorsw`). When you change the schema, do it via the Supabase MCP (`apply_migration` or `execute_sql`) AND record the change in `decisions.md` with the SQL inline so it's reproducible.
- JSONB shape changes (e.g. `user_progress.flashcard_progress`) MUST be backwards-compatible — readers should tolerate old shapes — because there is no migration runner to rewrite existing rows.

### Themes & colors
- Theme values are `'midnight' | 'pink' | 'forest'` (defined in `types/index.ts`). Stored in `user_preferences.theme`.
- **Never hard-code hex values for theme-aware colors.** Use `resolveColor(color, theme)` from `hooks/useUserLectures.ts`.
- Lecture color overrides live in `user_lecture_settings.color_override` (JSONB keyed by theme). The legacy column `color_override_legacy` (TEXT) is still in the DB but should be treated as deprecated.
- CSS variables (`--smd-…`) defined in `styles/themes.css` are the bridge between TypeScript and CSS. New theme tokens belong there.

### Styling
- Tailwind v4 is configured via `postcss.config.mjs`. Most components also have hand-rolled CSS in the `styles/*.css` files.
- Don't add a CSS-in-JS library. Don't add Sass.
- Component-scoped styles are inlined as `<style>{cssString}</style>` near the component (see `Header.tsx:60-74` for the pattern).
- Mobile-first responsive design; the breakpoint is 768px.

### Code style
- TypeScript strict; explicit prop types on every component.
- Named exports for utilities and types; default export for pages and large components.
- File extensions: `.tsx` for any file containing JSX; `.ts` for pure logic.
- Prefer composition over abstraction. Small components > big switches.
- Run nothing automatically — there's no formatter step in the pipeline. Match the surrounding file's style by hand.

### Testing
- **No test suite exists.** This is acknowledged tech debt (see `recommendations.md`).
- When adding logic, include a manual-verification recipe in your PR description (or in the relevant feature's section of `documentation.md`).

### Comments
- Don't write comments that restate the code. Do write comments that explain why a non-obvious decision was made (e.g. `proxy.ts:16-22` is a great template).
- Do not leave behind decision-history comments — those belong in `decisions.md`.

---

## Common pitfalls (history-based)

1. **PPTX text extraction edge cases.** `lib/pptx-extractor.ts` parses the ZIP central directory. PPTXs whose slides are mostly images-of-text will yield <200 chars total and the route returns a polite "please export as PDF" error. If you change the extractor, preserve that error path.
2. **Vercel build cache occasionally serves stale routes.** Several commits (`fcefd56`, `6e069f8`) had to "bust" the cache by adding a no-op comment. If you suspect this, add a single-line comment and redeploy before debugging further.
3. **`/admin` redirect loop.** A previous architecture had role checks inside `proxy.ts`, which caused redirect loops when the Edge runtime couldn't query `user_profiles`. Role checks now happen in page Server Components only (commit `76f01b8`). Keep them there.
4. **`is_primary` source-of-truth confusion.** Recent commit messages say "fetch is_primary from user_preferences" but the live schema has `is_primary` on `user_profiles`. When in doubt, check `user_profiles` — that's the production schema. See `documentation.md` for the cleanup plan.
5. **Hard-coded admin UUID in RLS.** The `api_usage` table's "admin read only" policy compares `auth.uid()` against the literal UUID `930150fc-372b-4b61-98db-10e9ee25bdc4`. This is fragile; v3 should replace it with the `EXISTS user_profiles WHERE role = 'admin'` pattern already used elsewhere.
6. **`processing_jobs` cost columns.** Two columns (`estimated_cost` and `estimated_cost_usd`) coexist. New code should write to `estimated_cost_usd`; old code may still read `estimated_cost`. Plan to consolidate.
7. **`color_override_legacy` column.** Still present, no longer written to. Treat as deprecated; do not read from it.
8. **Modals are kept mounted.** `LectureGrid` keeps `LectureViewModal` permanently mounted and toggles its visibility. If you change the mount strategy, profile carefully — the current pattern was chosen to avoid expensive re-mounts.

---

## Where to look for what

| Need | File |
|---|---|
| Add a new API route | `app/api/<domain>/route.ts` |
| Add a new page | `app/app/<route>/page.tsx` (user) or `app/admin/<route>/page.tsx` (admin) |
| Modify the dashboard | `components/Dashboard.tsx` (33KB — be surgical) |
| Modify a lecture card | `components/LectureCard.tsx` or `components/ManageLectureCard.tsx` (45KB) |
| Modify the upload pipeline | `components/UploadModal.tsx`, `app/api/upload/route.ts`, `app/api/generate/route.ts` |
| Modify the AI prompt | `lib/lecture-processor-prompt.ts` |
| Modify cost limits | `lib/api-limits.ts` |
| Modify themes | `styles/themes.css` (CSS) + `hooks/useUserLectures.ts` (`resolveColor`) |
| Add a custom hook | `hooks/<name>.ts` |
| Define a shared type | `types/index.ts` |

---

## Memory & decision log

This repo's "memory" lives in markdown files at the root:
- **`decisions.md`** — Architecture Decision Records (ADRs). Append a new entry whenever you make a non-obvious architectural choice.
- **`todo.md`** — the living working checklist (Now / Next / Backlog).
- **`plan.md`** — the master roadmap with checkboxes.
- **`recommendations.md`** — the improvement backlog (security, code quality, performance, new features).

When you finish a meaningful change, update `todo.md` and `decisions.md` (if applicable) in the same commit as the change.

---

## Required environment variables

| Variable | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Both client and server | Safe to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Both client and server | Safe to expose; scoped by RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (admin routes, `lib/api-limits.ts`) | **Never expose.** Bypasses RLS. |
| `ANTHROPIC_API_KEY` | Server only (`app/api/generate/route.ts`) | **Never expose.** |

`SUPABASE_URL` (without the `NEXT_PUBLIC_` prefix) is also read in some server-only paths as a fallback — set both for safety.
