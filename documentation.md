# StudyMD — Engineering Documentation

A comprehensive reference for software engineers new to the StudyMD codebase. This document covers the entire app: file audit, API reference, function registry, database reference, top-feature execution traces, known inconsistencies, and local-development setup.

> **For high-level system design**, see [`architecture.md`](./architecture.md).
> **For conventions and gotchas**, see [`CLAUDE.md`](./CLAUDE.md).
> **For improvements and v3 plans**, see [`recommendations.md`](./recommendations.md) and [`development_plan_v3.md`](./development_plan_v3.md).

---

## Table of contents

1. [System overview](#1-system-overview)
2. [File audit](#2-file-audit)
3. [API reference](#3-api-reference)
4. [Function registry](#4-function-registry)
5. [Database reference](#5-database-reference)
6. [Top-feature walkthroughs](#6-top-feature-walkthroughs)
7. [Inconsistencies, magic values, and gotchas](#7-inconsistencies-magic-values-and-gotchas)
8. [Environment variables](#8-environment-variables)
9. [Local development](#9-local-development)

---

## 1. System overview

StudyMD is a Next.js 16 (App Router) + React 19 + TypeScript web application backed by Supabase (Postgres, Auth, Storage) and the Anthropic Claude API. It runs on Vercel.

```
Browser ──HTTPS──▶ Vercel (Next.js App Router)
                       │
                       ├─ proxy.ts (Edge middleware: session refresh + auth guards)
                       ├─ Server Components (createServerComponentClient)
                       ├─ Route Handlers /api/*  (data fetch + Anthropic calls)
                       └─ Client Components ('use client')
                              │
              ┌───────────────┴────────────────┐
              ▼                                 ▼
    Supabase (DB / Auth / Storage)    Anthropic API (Claude Haiku 4.5 / Sonnet 4.6)
```

There are three top-level URL trees:

- `/` and `/login` — public.
- `/app/*` — signed-in users.
- `/admin/*` — admins only.

`proxy.ts` only enforces "are you logged in?". Role checks (`admin` vs `student`) happen in each protected page's Server Component to avoid Edge-runtime database queries that previously caused redirect loops.

---

## 2. File audit

Every meaningful file in the repo, grouped by directory. For each: 1-line purpose and key exports.

### 2.1 Top-level configuration

| File | Purpose | Notes |
|---|---|---|
| `package.json` | Dependency manifest, scripts | Only `dev`, `build`, `start`. **No `test` / `lint` / `typecheck`.** |
| `tsconfig.json` | TypeScript compiler config | ES2017 target, strict mode, `@/*` → root path alias |
| `next.config.ts` | Next.js config | Security headers (CSP, HSTS, X-Frame-Options), image domains for Supabase |
| `postcss.config.mjs` | PostCSS pipeline | Tailwind v4 plugin |
| `proxy.ts` | **Auth middleware (NOT `middleware.ts`)** | Session refresh + auth guards. See [`CLAUDE.md`](./CLAUDE.md) for the rationale |
| `eslint.config.mjs` | ESLint config | Present but no `lint` script wired |
| `.gitignore` | Standard Next.js + macOS ignores | |

### 2.2 `app/` — App Router pages and routes

| Path | Purpose |
|---|---|
| `app/layout.tsx` | Root layout. Loads global CSS, sets fonts, includes a "love note" comment for the primary user |
| `app/page.tsx` | Marketing/landing page (~49KB single file) |
| `app/globals.css` | Global resets / utility classes |
| `app/favicon.ico` | Favicon |
| `app/login/page.tsx` | Login form (Supabase email/password) |
| `app/pricing/page.tsx` | Pricing page (mostly static) |
| `app/app/layout.tsx` | Authenticated user shell: Header, ToastContainer wrapper |
| `app/app/page.tsx` | Dashboard server component: fetches user, prefs, lectures, plan; passes to `DashboardClient` |
| `app/app/DashboardClient.tsx` | Client wrapper around `Dashboard` (passes `initialTheme`, `userName`, `isPrimary`) |
| `app/app/lectures/page.tsx` | "My Lectures" management page (drag-reorder, hide/archive/tag, customize) |
| `app/app/upload/page.tsx` | Upload form: client-side direct-to-Storage flow + status polling |
| `app/app/study/flash/page.tsx` | Flashcard session route (renders `FlashcardView`) |
| `app/app/study/exam/page.tsx` | Exam session route (renders `ExamView`) |
| `app/app/study/custom/page.tsx` | Custom session builder route (renders `CustomSessionModal` results) |
| `app/app/plans/page.tsx` | Study plan management page |
| `app/app/profile/page.tsx` | Profile: theme, display name, password change |
| `app/admin/page.tsx` | Admin dashboard server component (role check + fetch initial data) |
| `app/admin/AdminClient.tsx` | Admin dashboard UI: 7 tabs (overview, usage, users, lectures, feedback, config, progress) |

### 2.3 `app/api/` — Route handlers

37 route files. Full reference is in [Section 3](#3-api-reference). Grouped here:

| Group | Files |
|---|---|
| **Lectures** | `app/api/lectures/route.ts`, `[id]/route.ts`, `reorder/route.ts`, `settings/route.ts`, `tags/route.ts`, `[id]/flashcards/route.ts`, `[id]/flashcards/[fcId]/route.ts`, `[id]/questions/route.ts`, `[id]/questions/[qId]/route.ts`, `[id]/slides/route.ts`, `[id]/slides/[slideNum]/route.ts` |
| **Upload + Generate** | `app/api/upload/route.ts`, `upload/status/route.ts`, `generate/route.ts` |
| **Plans** | `app/api/plans/route.ts`, `plans/[id]/route.ts` |
| **Progress** | `app/api/progress/save/route.ts`, `progress/load/route.ts` |
| **Profile + Preferences** | `app/api/profile/route.ts`, `profile/change-password/route.ts`, `preferences/route.ts`, `usage/route.ts` |
| **Feedback** | `app/api/feedback/notify/route.ts` |
| **Admin** | `app/api/admin/overview/route.ts`, `config/route.ts`, `feedback/route.ts`, `users/route.ts`, `users/create/route.ts`, `users/lectures/route.ts`, `users/progress/route.ts`, `users/theme/route.ts`, `lectures/route.ts`, `lectures/add/route.ts`, `lectures/card/route.ts`, `lectures/detail/route.ts`, `lectures/regen-id/route.ts` |
| **Debug** | `app/api/debug/pptx-extract/route.ts` |

### 2.4 `components/` — React components

| File | Size | Purpose |
|---|---|---|
| `Dashboard.tsx` | ~33KB | Main dashboard: filters, grid, study buttons, popovers, manage-mode toggle |
| `LectureGrid.tsx` | medium | Grid of `LectureCard`s; keeps `LectureViewModal` permanently mounted |
| `LectureCard.tsx` | medium | Individual lecture tile with progress bars and three-dot menu |
| `LectureViewModal.tsx` | ~32KB | Full-screen modal: lecture info, slides, study buttons, edit |
| `ManageLectureCard.tsx` | ~45KB | Detailed admin/manage card: edit title, color, icon, flashcards, questions |
| `ManageMode.tsx` | ~19KB | Bulk-edit mode wrapper for the manage page |
| `Header.tsx` | medium | Top nav: logo, theme picker, sign-out, settings popover |
| `FilterBar.tsx` | small | Course pills + tag filter + show archived/hidden toggles |
| `UploadModal.tsx` | ~22KB | File picker + progress timeline + course/title metadata form |
| `PomodoroTimer.tsx` | ~17KB | Context provider + UI for 25/5 pomodoro; mini-pill in header |
| `CustomSessionModal.tsx` | medium | Build a custom flashcard or exam session across lectures |
| `FeedbackWidget.tsx` | ~14KB | Floating feedback button + form; exports `openFeedbackWidget()` |
| `TodaysPlanWidget.tsx` | small | Renders today's lectures from the active study plan |
| `ThemePicker.tsx` | small | Dropdown for theme switching (midnight/pink/forest) |
| `TagEditor.tsx` | small | Multi-select tag input |
| `StudyConfigManager.tsx` | medium | Pomodoro on/off, toast on/off, sound on/off |
| `ErrorBoundary.tsx` | small | React error boundary fallback |
| `Toast.tsx` | small | Single toast UI |
| `SignOutButton.tsx` | small | Sign-out button (clears session) |
| `StatsRow.tsx` | small | Aggregate stats display (cards reviewed, exams taken, streak) |
| `Lightbox.tsx` (root) | small | Generic lightbox (separate from `study/Lightbox.tsx`) |
| `LoginForm.tsx` | placeholder | TODO from "Workstream 3" — currently minimal |
| `AppBootstrap.tsx` | small | One-time app bootstrap (e.g. progress online listener setup) |

#### `components/study/` — Study session UI

| File | Purpose |
|---|---|
| `FlashcardView.tsx` | Flashcard session: flip animation, keyboard shortcuts, slide sidebar, lightbox |
| `ExamView.tsx` | Exam session: 4 question types, immediate feedback, review mode, score screen |
| `FlashcardConfigModal.tsx` | Pre-session config: card count, difficulty filter, randomize |
| `ExamConfigModal.tsx` | Pre-session config: question count, time limit, type mix |
| `Lightbox.tsx` | Slide-image full-screen viewer (used by both Flashcard and Exam) |
| `ToastContainer.tsx` | Renders the `useToast` queue |

### 2.5 `lib/` — Business logic

| File | Lines | Purpose |
|---|---|---|
| `supabase.ts` | 16 | Browser-client barrel re-export |
| `supabase-browser.ts` | 12 | `createClient()` for Client Components |
| `supabase-middleware.ts` | 24 | `createMiddlewareClient(req, res)` for `proxy.ts` |
| `supabase-server.ts` | 121 | Server-component client + data-fetch helpers |
| `admin-auth.ts` | 76 | `requireAdmin()` guard, service-client factory |
| `api-limits.ts` | 226 | Cost controls: limits, pricing, token estimation, `checkLimits()` |
| `lecture-processor-prompt.ts` | 151 | Anthropic system prompt + `buildSystemWithCache()` wrapper |
| `validate-lecture.ts` | 278 | Validates Claude's lecture JSON output |
| `pptx-extractor.ts` | 257 | ZIP-parses PPTX → text per slide |
| `slide-converter.ts` | 246 | PDF → slide image conversion + Storage upload |
| `progress-sync.ts` | 278 | localStorage-first progress sync with offline queue |
| `schedule-generator.ts` | 150 | Spreads lectures across study-plan days |

### 2.6 `hooks/` — Custom React hooks

| File | Purpose |
|---|---|
| `useUserLectures.ts` | Fetches lectures+settings, applies theme color, exports `resolveColor`, `getSlideThumbUrl` |
| `useProgress.ts` | Loads progress (local-first), computes mastery %, study streak, global stats |
| `useToast.ts` | Toast queue context |
| `useApiCall.ts` | Wrapper around `fetch` with loading/error state |

### 2.7 `types/` — Shared TypeScript types

| File | Exports |
|---|---|
| `types/index.ts` | `Course`, `Theme`, `Lecture`, `LectureData`, `Flashcard`, `Question`, `UserLectureSettings`, `LectureWithSettings`, `UserPreferences`, `StudyPlan`, `StudySchedule`, `CreateStudyPlanInput` |

### 2.8 `styles/` — CSS

| File | Purpose |
|---|---|
| `themes.css` | CSS custom properties for the three themes (midnight/pink/forest) |
| `dashboard.css` | ~27KB; dashboard, grid, modals, header layout |
| `study.css` | ~18KB; flashcard flip animation, exam UI, timer |
| `globals.css` | Resets, fonts, accessibility |

### 2.9 `public/` — Static assets

| File | Purpose |
|---|---|
| `pdf.worker.min.mjs` | PDF.js worker (loaded by `slide-converter.ts` and the lightbox) |

---

## 3. API reference

All routes live under `app/api/`. Default behavior:

- **Auth required**: yes, unless noted. The route handler reads `auth.uid()` via the Supabase server client.
- **Errors**: JSON body `{ error: string }` with appropriate HTTP status (400, 401, 403, 404, 422, 429, 500).
- **Admin routes**: gated by `requireAdmin()` from `lib/admin-auth.ts`. A non-admin sees 403.

### 3.1 Lectures

| Method + Path | Purpose | Body / Params | Side effects |
|---|---|---|---|
| `GET /api/lectures` | List the current user's lectures (joined with `user_lecture_settings`) | — | — |
| `GET /api/lectures/[id]` | Fetch one lecture (json_data + settings) | path: `id` (internal_id) | — |
| `PUT /api/lectures/[id]` | Update lecture metadata (admin/owner) | body: partial lecture | UPDATE `lectures` |
| `PUT /api/lectures/reorder` | Persist drag-reorder state | body: `{ items: [{ id, display_order }] }` | UPDATE `user_lecture_settings.display_order` |
| `PUT /api/lectures/settings` | Update per-user lecture settings (visibility, archive, color, custom_title, course_override, tags) | body: partial `UserLectureSettings` | UPSERT `user_lecture_settings` |
| `GET /api/lectures/tags` | Returns the user's distinct tag set | — | — |
| `POST /api/lectures/[id]/flashcards` | Add a new flashcard | body: `{ question, answer, topic, ... }` | UPDATE `lectures.json_data.flashcards` |
| `PUT /api/lectures/[id]/flashcards/[fcId]` | Update a single flashcard | body: partial flashcard | UPDATE `lectures.json_data.flashcards` |
| `DELETE /api/lectures/[id]/flashcards/[fcId]` | Delete a flashcard | — | UPDATE `lectures.json_data.flashcards` |
| `POST /api/lectures/[id]/questions` | Add a new exam question | body: `{ type, stem, options?, correct_answer, ... }` | UPDATE `lectures.json_data.questions` |
| `PUT /api/lectures/[id]/questions/[qId]` | Update a single question | body: partial question | UPDATE `lectures.json_data.questions` |
| `DELETE /api/lectures/[id]/questions/[qId]` | Delete a question | — | UPDATE `lectures.json_data.questions` |
| `GET /api/lectures/[id]/slides` | List slide image URLs (probes Storage) | — | — |
| `POST /api/lectures/[id]/slides` | Upload a slide image (manual) | body: image | Storage `slides/<id>/...` |
| `DELETE /api/lectures/[id]/slides/[slideNum]` | Delete a slide image | — | Storage delete |

### 3.2 Upload + Generate

| Method + Path | Purpose | Body | Side effects |
|---|---|---|---|
| `POST /api/upload` | Pre-flight + create processing job | `{ originalFile, course, title, fileSizeBytes }` | `checkLimits()` → INSERT `processing_jobs` (status='pending'); returns `{ jobId, internalId, uploadUrl? }` |
| `GET /api/upload/status?jobId=…` | Poll job status | query: `jobId` | — |
| `POST /api/generate` | Process file → call Claude → store lecture | `{ fileUrl, course, title, internalId, jobId, userId, fileSizeBytes? }` | Storage read, Anthropic call, INSERT `lectures` + `user_lecture_settings`, UPDATE `processing_jobs`, RPC `increment_api_usage` |

### 3.3 Plans

| Method + Path | Purpose | Body |
|---|---|---|
| `GET /api/plans` | List the user's plans | — |
| `POST /api/plans` | Create a plan (test_date + lecture_ids → schedule via `generateSchedule`) | `{ name, testDate, lectureIds }` |
| `GET /api/plans/[id]` | Fetch a plan | — |
| `PATCH /api/plans/[id]` | Update plan (rename, mark days complete, toggle active) | partial plan |
| `DELETE /api/plans/[id]` | Delete a plan | — |

### 3.4 Progress

| Method + Path | Purpose | Body |
|---|---|---|
| `GET /api/progress/load` | Load all of the user's progress rows | — |
| `POST /api/progress/save` | Upsert one progress record (last-write-wins on `updated_at`) | `{ internal_id, flashcard_progress?, exam_progress?, last_studied? }` |

### 3.5 Profile + Preferences

| Method + Path | Purpose | Body |
|---|---|---|
| `GET /api/profile` | Returns user profile + role + is_primary | — |
| `PUT /api/profile` | Update display_name | `{ displayName }` |
| `POST /api/profile/change-password` | Change password (Supabase Auth) | `{ newPassword }` |
| `GET /api/preferences` | Get user preferences (theme, settings) | — |
| `PUT /api/preferences` | Update user preferences | partial `UserPreferences` |
| `GET /api/usage` | The user's own API usage stats | — |

### 3.6 Feedback

| Method + Path | Purpose | Body |
|---|---|---|
| `POST /api/feedback/notify` | Send admin email notification when feedback is submitted | `{ feedbackId }` |

(Feedback rows themselves are inserted client-side directly to the `feedback` table via the Supabase JS client; the route handler is for the email side-effect only.)

### 3.7 Admin

| Method + Path | Purpose |
|---|---|
| `GET /api/admin/overview` | Aggregate counters for the dashboard overview tab |
| `GET /api/admin/config` | List `system_config` rows |
| `PUT /api/admin/config` | Update one `system_config` row |
| `POST /api/admin/config` | Create a new `system_config` row |
| `GET /api/admin/feedback` | List feedback submissions |
| `PUT /api/admin/feedback` | Update feedback status (`new` → `reviewed` → `resolved`) |
| `GET /api/admin/users` | List all users with profile + counts |
| `PUT /api/admin/users` | Update a user's profile |
| `DELETE /api/admin/users` | Delete a user (cascade via auth.users FK) |
| `POST /api/admin/users/create` | Create a new user (sends invitation) |
| `GET /api/admin/users/lectures` | A specific user's lectures + settings |
| `GET /api/admin/users/progress` | A specific user's progress rows |
| `PUT /api/admin/users/theme` | Set a user's theme (admin override) |
| `GET /api/admin/lectures` | List all lectures across users |
| `DELETE /api/admin/lectures` | Delete a lecture (cascade slides + settings + progress) |
| `POST /api/admin/lectures/add` | Create a new lecture row manually (no AI processing) |
| `PUT /api/admin/lectures/card` | Edit a flashcard or question across users (admin) |
| `GET /api/admin/lectures/detail` | Full detail (all flashcards + questions) for a lecture |
| `PUT /api/admin/lectures/detail` | Update lecture detail |
| `POST /api/admin/lectures/regen-id` | Generate a new internal_id (e.g. for collisions) |

### 3.8 Debug

| Method + Path | Purpose |
|---|---|
| `GET /api/debug/pptx-extract?path=…` | Inspector endpoint for the PPTX extractor (dev only) |

---

## 4. Function registry

For each `lib/` file: exported functions/types and a one-line description. Same for `hooks/`.

### 4.1 `lib/supabase-server.ts`

```ts
createServerComponentClient(): SupabaseClient        // cookie-bound server client (read-only auth context)
createServiceClient(): SupabaseClient                // service-role client; bypasses RLS — server-only
fetchLecturesWithSettings(userId: string)            // returns lectures joined with user_lecture_settings
fetchUserPreferences(userId: string)                 // returns { theme, display_name, settings, is_primary, ... }
updateLectureSettings(userId, internalId, patch)     // upsert into user_lecture_settings
reorderLectures(userId, items)                       // updates display_order for many rows
fetchAllTags(userId): Promise<string[]>              // distinct tags across the user's lectures
saveUserTheme(userId, theme): Promise<void>          // updates user_preferences.theme
```

### 4.2 `lib/supabase-browser.ts`

```ts
createClient(): SupabaseClient                       // browser client using NEXT_PUBLIC_* env
```

### 4.3 `lib/supabase-middleware.ts`

```ts
createMiddlewareClient(req: NextRequest, res: NextResponse): SupabaseClient
                                                     // for proxy.ts only — refreshes session cookies
```

### 4.4 `lib/admin-auth.ts`

```ts
createServiceClient(): SupabaseClient                // mirror of the one in supabase-server, used in admin routes
requireAdmin(): Promise<{ user, error? }>            // returns { error: 'unauthorized' | 'forbidden' } or user
```

### 4.5 `lib/api-limits.ts`

```ts
API_LIMITS                                           // single source of truth for caps and model selection
TOKEN_PREFLIGHT_LIMIT = API_LIMITS.TOKEN_WARNING_THRESHOLD
MODEL_PRICING: Record<string, {...}>                 // input/output USD per token by model name
estimateTokensFromBytes(bytes): number               // PDF-aware byte→token estimate (5K floor, 180K ceiling)
estimateTokens(bytes): number                        // alias
estimateCost(model, inputTokens, outputTokens, isBatch?)  // overload 1: full cost
estimateCost(fileSizeBytes)                          // overload 2: rough pre-upload estimate
checkLimits(userId): Promise<{ allowed, reason? }>   // daily call cap + monthly cost cap
```

### 4.6 `lib/lecture-processor-prompt.ts`

```ts
LECTURE_PROCESSOR_PROMPT: string                     // 6-section system prompt; output schema, weighting, type mix, quality
buildSystemWithCache()                               // wraps the prompt with cache_control: 'ephemeral'
```

### 4.7 `lib/validate-lecture.ts`

```ts
LectureFlashcard / LectureQuestion / LectureJSON / ValidationResult     // types
validateLecture(data: unknown): ValidationResult     // shape check + topic-set membership check + ID sequencing
```

### 4.8 `lib/pptx-extractor.ts`

```ts
PptxSlide                                            // { slideNumber, text }
extractPptxSlides(buffer: ArrayBuffer): Promise<PptxSlide[]>
                                                     // ZIP central-directory parse → text per slide
formatSlidesForClaude(slides, title): string         // serializes slides into a single text block for Claude
```

### 4.9 `lib/slide-converter.ts`

```ts
ConversionProgressCallback / UploadProgressCallback / SlideConverterOptions
convertPdfToSlides(pdfFile, opts?): Promise<Blob[]>  // PDF.js render-to-canvas-to-blob per page
uploadSlides(internalId, blobs, onProgress?)         // pushes blobs to slides/<id>/slide_NN.jpg
isPdf(file: File): boolean
isPptx(file: File): boolean
```

### 4.10 `lib/progress-sync.ts`

```ts
ProgressRecord                                       // unified per-lecture progress shape
readLocalProgress(): Record<id, ProgressRecord>     // synchronous localStorage read
save(record: ProgressRecord): void                   // localStorage write + queue server upsert
loadAll(): Promise<Record<id, ProgressRecord>>      // server fetch + merge into localStorage
flushQueue(): Promise<void>                          // drain offline queue once back online
setupOnlineListener(): void                          // attaches window.online → flushQueue
```

### 4.11 `lib/schedule-generator.ts`

```ts
LectureWeight                                        // optional per-lecture weighting hint
generateSchedule({ testDate, lectureIds, weights? }): StudySchedule
                                                     // spreads lectures across days from now → testDate
```

### 4.12 `hooks/useUserLectures.ts`

```ts
FlashCard / ExamQuestion / Lecture / ColorOverrideMap / UseUserLecturesResult   // types
resolveColor(lecture: Lecture, activeTheme: Theme): string                       // theme-aware color resolver
useUserLectures(): UseUserLecturesResult                                         // fetches + caches user lectures
getSlideThumbUrl(internalId: string, slideNumber: number): string                // builds public Storage URL
```

### 4.13 `hooks/useProgress.ts`

```ts
LectureProgress / GlobalStats                                                    // types
useProgress(): { ... }                                                           // local-first progress + stats
```

### 4.14 `hooks/useToast.ts`

```ts
Toast                                                                            // type
useToast(): { toasts, push, dismiss }                                            // toast queue API
```

### 4.15 `hooks/useApiCall.ts`

```ts
useApiCall(): { call, loading, error, reset }                                    // fetch wrapper with state
```

---

## 5. Database reference

Supabase project: **`vimuhpoeuvfzpzfeorsw`** ("StudyMD"), region `us-east-2`, Postgres 17.6.

15 tables in `public`. RLS enabled on all except `subscription_tiers` (security gap — see [`recommendations.md`](./recommendations.md)).

### 5.1 Tables in active use

#### `lectures`
Immutable lecture content registry. Written by the server at upload time.
| Column | Type | Notes |
|---|---|---|
| `internal_id` | text PK | Format: `lec_<8 hex chars>` |
| `original_file` | text | Original filename |
| `title` | text | |
| `subtitle` | text | |
| `course` | text | One of the three course strings |
| `color` | text | Hex |
| `icon` | text | Emoji or icon name |
| `topics` | jsonb | `string[]` |
| `slide_count` | integer | |
| `json_data` | jsonb | `{ flashcards: [...], questions: [...] }` |
| `created_at` | timestamptz | |
**RLS**: `lectures: authenticated users can read` (SELECT for any authenticated user). Writes are server-only via service role.

#### `user_lecture_settings`
Per-user display preferences for each lecture.
| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK part | FK → `auth.users.id` |
| `internal_id` | text PK part | FK → `lectures.internal_id` |
| `display_order` | integer | Lower = higher in grid |
| `visible` | boolean | |
| `archived` | boolean | |
| `group_id` | text | **Unused today; reserved for v3 folders** |
| `tags` | jsonb | `string[]` |
| `course_override` | text | Overrides `lectures.course` |
| `color_override_legacy` | text | **Deprecated** |
| `custom_title` | text | Overrides `lectures.title` |
| `color_override` | jsonb | New theme-keyed color overrides (`ColorOverrideMap`) |
| `updated_at` | timestamptz | |
**RLS**: ALL with `auth.uid() = user_id`.

#### `user_progress`
Cross-device progress store (last-write-wins on `updated_at`).
| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK part | |
| `internal_id` | text PK part | |
| `flashcard_progress` | jsonb | Schema defined client-side (`{ gotItIds, missedIds, sessions, ... }`) |
| `exam_progress` | jsonb | `{ best_score, avg_score, sessions, last_attempt }` |
| `last_studied` | timestamptz | |
| `updated_at` | timestamptz | |
**RLS**: ALL with `auth.uid() = user_id`.

#### `user_preferences`
Global per-user settings synced across devices.
| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | FK → `auth.users.id` |
| `theme` | text | Default `'midnight'`. Note: comment in DB says "midnight, lavender, forest" but app code uses `'midnight' \| 'pink' \| 'forest'` — comment is stale |
| `settings` | jsonb | Free-form |
| `display_name` | text | **Duplicate** with `user_profiles.display_name` |
| `updated_at` | timestamptz | |
**RLS**: ALL with `auth.uid() = user_id`.

#### `user_profiles`
Identity layer extending `auth.users`.
| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | FK → `auth.users.id` |
| `display_name` | text | |
| `username` | text UNIQUE | |
| `role` | text | CHECK: `'admin' \| 'student' \| 'demo'`; default `'student'` |
| `is_primary` | boolean | **True for the primary user (Haley); used for personalized greetings** |
| `created_at` / `updated_at` | timestamptz | |
**RLS**: own SELECT/INSERT/UPDATE; admin SELECT everywhere via `EXISTS user_profiles WHERE role='admin'` policy.

#### `study_plans`
Test-date-driven study schedules.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `name` | text | |
| `test_date` | date | |
| `lecture_ids` | text[] | |
| `schedule` | jsonb | `Record<ISODate, internal_id[]>` |
| `completed_days` | text[] | |
| `is_active` | boolean | At most one active plan per user, by convention |
**RLS**: ALL with `auth.uid() = user_id`.

#### `feedback`
Submissions from `FeedbackWidget`.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid (nullable) | Allows anonymous submissions |
| `type` | text | `'Bug Report' \| 'Suggestion' \| 'Content Error' \| 'Other'` |
| `message` | text | |
| `page_url` | text | Captured automatically |
| `status` | text | `'new' \| 'reviewed' \| 'resolved'` |
| `created_at` | timestamptz | |
**RLS**: users INSERT their own; users SELECT their own; service role full access.

#### `processing_jobs`
Upload processing queue. Polled by the front-end.
| Column | Type | Notes |
|---|---|---|
| `job_id` | uuid PK | |
| `user_id` | uuid | |
| `status` | text | State machine: `pending → converting → generating → done \| error` |
| `storage_path` | text | `uploads/<user_id>/<ts>_filename` |
| `original_file` / `original_filename` | text | **Two columns** — needs consolidation |
| `course` / `title` | text | |
| `internal_id` / `lecture_id` | text | **Two columns** — needs consolidation |
| `slide_count` | integer | |
| `error_message` | text | |
| `model_used` | text | Which Claude model produced the output |
| `used_fallback` | boolean | True if Sonnet was used after a Haiku failure |
| `input_tokens` / `output_tokens` | integer | |
| `estimated_cost` / `estimated_cost_usd` | numeric | **Two columns** — needs consolidation |
| `file_size_bytes` / `file_type` / `estimated_tokens` | various | |
| `progress` | integer | 0–100 |
| `created_at` / `updated_at` / `completed_at` | timestamptz | |
**RLS**: users INSERT/SELECT their own; service role full access.

#### `api_usage`
Daily Claude API usage aggregates.
| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `date` | date UNIQUE | |
| `calls_count` | integer | |
| `input_tokens` / `output_tokens` | integer | |
| `estimated_cost` | numeric | |
| `updated_at` | timestamptz | |
**RLS**: service role for ALL; admin SELECT policy uses `EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin')` — role-based, not a hard-coded UUID (fixed in Slice 0 P2, see ADR-017).

#### `system_config`
Key-value config bag.
| Column | Type | Notes |
|---|---|---|
| `key` | text PK | |
| `value` | jsonb | |
| `updated_at` | timestamptz | |
**RLS**: enabled, **no policy defined — intentional** (ADR-019). All reads go through server-side API routes (`GET /api/admin/config`, `GET /api/preferences`) using the service-role client. The Supabase advisor `rls_enabled_no_policy` warning for this table is a known false-positive; do not add a user-facing SELECT policy.

#### `user_card_overrides`
Per-user overrides on individual flashcards/questions (e.g., the user has edited a card).
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `internal_id` | text | |
| `card_id` | text | `F001` or `Q001` |
| `card_type` | text | CHECK: `'flashcard' \| 'question'` |
| `overrides` | jsonb | The fields the user changed |
| `canonical_hash` | text | Hash of the original card; allows detecting upstream changes |
| `created_at` / `updated_at` | timestamptz | |
**RLS**: own SELECT/INSERT/UPDATE/DELETE.

### 5.2 Tables shipped but not yet used

These exist in the schema but no code references them today. They are scaffolding for v3 / v4 features.

| Table | Intended use |
|---|---|
| `subscription_tiers` (3 rows) | Subscription tier catalog. **RLS DISABLED — security ERROR — fix before exposing** |
| `user_subscriptions` (0 rows) | Per-user tier assignment. RLS enabled |
| `sr_card_state` (0 rows) | Spaced-repetition state (SM-2 fields: `ease_factor`, `interval_days`, `repetitions`, `lapses`, `due_date`) |
| `shared_decks` (0 rows) | Shareable lecture decks via `share_code` |

### 5.3 Storage buckets

| Bucket | Public? | Limits | Path convention |
|---|---|---|---|
| `uploads` | Private | 50 MB max; PDF/PPTX MIME only | `uploads/<user_id>/<unix_ts>_<filename>` |
| `slides` | **Public** | None | `slides/<internal_id>/slide_NN.jpg` |

**RLS on `storage.objects`:**
- `uploads`: users SELECT/INSERT/DELETE only their own folder (path-prefix equals their UUID).
- `slides`: authenticated INSERT/UPDATE; **public SELECT — currently allows directory listing**, which is a security gap (see `recommendations.md`).

### 5.4 Postgres functions and triggers

| Function | Type | Purpose |
|---|---|---|
| `ensure_user_preferences()` | function | Inserts a default `user_preferences` row for a new user |
| `increment_api_usage(p_date, p_calls, p_input_tokens, p_output_tokens, p_estimated_cost)` | function (RPC) | Atomic daily aggregation; called after every Anthropic call |
| `set_updated_at()` | trigger | Generic `updated_at = now()` trigger |
| `update_study_plans_updated_at()` | trigger | Specific to `study_plans` |
| `update_user_card_overrides_updated_at()` | trigger | Specific to `user_card_overrides` |
| `update_user_profiles_updated_at()` | trigger | Specific to `user_profiles` |

All six functions have a `mutable search_path` flagged WARN by Supabase advisors — they should set `search_path = public, pg_temp` explicitly (see `recommendations.md`).

---

## 6. Top-feature walkthroughs

End-to-end execution traces for the headline features. Use these to navigate the codebase by behavior rather than by file.

### 6.1 Lecture upload + AI generation

1. **User opens the upload page** (`app/app/upload/page.tsx`) and selects a PDF or PPTX in `UploadModal`.
2. **Client uploads directly to Supabase Storage** (`uploads/<user_id>/<timestamp>_<filename>`) using the browser Supabase client. This is the "direct-to-storage" pattern adopted in commit `b7f2236` to avoid Vercel's body-size limits.
3. **Client POSTs to `/api/upload`** with `{ originalFile, course, title, fileSizeBytes }`. The route:
   - Calls `checkLimits(userId)` from `lib/api-limits.ts` (rejects with 429 if daily/monthly cap is hit).
   - Generates `internal_id = lec_<8 hex>`.
   - INSERTs a `processing_jobs` row with `status='pending'`.
   - Returns `{ jobId, internalId }`.
4. **Client POSTs to `/api/generate`** with `{ jobId, fileUrl, course, title, internalId, userId, fileSizeBytes }`.
5. **`/api/generate`** (in `app/api/generate/route.ts`):
   - UPDATEs job to `status='converting'`.
   - Fetches the file from Storage via signed URL.
   - **PPTX path**: `extractPptxSlides()` from `lib/pptx-extractor.ts`. If total text < 200 chars → return 422 "please export as PDF".
   - **PDF path**: read as base64, build a `document` content block.
   - UPDATEs job to `status='generating'`.
   - Calls `Anthropic.messages.create({ model: MODEL_DEFAULT, system: buildSystemWithCache(), messages: [...content, "Process as lecture lec_xxx ..."], max_tokens: API_LIMITS.MAX_OUTPUT_TOKENS })`.
   - Runs `validateLecture(json)`. If invalid OR truncated, **retry once with `MODEL_FALLBACK`** (Sonnet 4.6, max 64K out).
   - INSERTs into `lectures` (`json_data` includes flashcards + questions + topics + summary).
   - INSERTs default `user_lecture_settings` row (`display_order` = max+1, `visible=true`, `archived=false`).
   - UPDATEs job to `status='complete'` with `model_used`, `used_fallback`, `input_tokens`, `output_tokens`, `estimated_cost_usd`.
   - Calls `increment_api_usage()` RPC.
6. **Client polls `/api/upload/status?jobId=…`** every ~2 seconds. When `status='complete'`, navigates to dashboard or directly to the lecture.

### 6.2 Flashcard study session

1. User clicks **Flashcards** on a lecture card. Browser navigates to `/app/study/flash?lectureId=lec_xxx`.
2. The page Server Component fetches the lecture (`lectures.json_data.flashcards`) and the user's existing progress (`user_progress.flashcard_progress`) via `createServerComponentClient()`.
3. `FlashcardView` (`components/study/FlashcardView.tsx`) receives the cards plus `initialGotItIds`.
4. User flips cards (Space), marks G/M (G/M keys). Each mark calls `onProgressUpdate({ gotItIds, missedIds })`.
5. `onProgressUpdate` writes to `localStorage` immediately (`progress-sync.ts:save()`), then queues a debounced UPSERT to `user_progress` via `POST /api/progress/save`.
6. Sidebar shows slide thumbnails; clicking opens `Lightbox` (`components/study/Lightbox.tsx`).
7. At end-of-session, `onSessionComplete` updates `last_studied` timestamp and pushes a "Continue Studying" pointer to localStorage.
8. Across devices: when the user opens a session on another device, `loadAll()` from `progress-sync.ts` fetches `user_progress` and merges with local. Last-write-wins on `updated_at`.

### 6.3 Exam study session

Same shape as flashcards, but in `ExamView`:
1. Question types are `mcq | true_false | short_answer | clinical_vignette`. Each type has its own UI in `ExamView.tsx`.
2. Submitting an answer immediately reveals correctness + the explanation.
3. After the last question, a **score screen** rates performance (Excellent / Great / Solid / Keep studying / More review) based on percentage correct.
4. `onSessionComplete` writes `{ score, attempted_at }` into `user_progress.exam_progress` (which keeps best + average + sessions count).

### 6.4 Study plan creation and "today" rendering

1. User goes to `/app/plans` → clicks "New plan". Picks a name, test date, and a set of lectures.
2. `POST /api/plans` calls `generateSchedule({ testDate, lectureIds })` from `lib/schedule-generator.ts`. The generator produces `Record<ISODate, internal_id[]>` spread evenly across the days from today through `testDate`.
3. Plan is INSERTed into `study_plans` with `is_active=true` (and other plans deactivated).
4. On the dashboard, `Dashboard.tsx` fetches the active plan and computes `planNextReview` (lectureId → next scheduled date) for badge rendering. (Currently the badges aren't rendered — props are passed through but the LectureCard doesn't surface them yet; this is a v3 polish item.)
5. `TodaysPlanWidget` reads `plan.schedule[todayISO]` and lists the day's lectures with check-off buttons. Checking persists to `study_plans.completed_days`.

### 6.5 Auth + role-based redirect

1. Browser request hits `proxy.ts` (the project's middleware). It refreshes the session via `supabase.auth.getUser()` (validated server-side, not just session cookie).
2. **`/app/*` or `/admin/*`**: if no user, redirect to `/login?next=<original>`.
3. **`/login` while authed**: redirect to `/admin` (let the page Server Component handle the role-based bounce).
4. **`/admin/page.tsx`** Server Component calls `requireAdmin()` from `lib/admin-auth.ts`. If not admin → redirect to `/app`.
5. **`/app/page.tsx`** Server Component checks for user (already done by `proxy.ts`, but belt-and-suspenders), fetches initial data, renders `DashboardClient`.

This split (auth in middleware, role at page level) was adopted in commit `76f01b8` after a redirect-loop bug — the Edge runtime couldn't reliably query `user_profiles`.

### 6.6 Theme + `is_primary` propagation

1. **`/app/page.tsx`** Server Component:
   - Fetches `user` via `auth.getUser()`.
   - Fetches `user_preferences` row (theme, display_name, settings).
   - Fetches `user_profiles` row (`is_primary`).
2. Passes `initialTheme`, `userName`, `isPrimary` props to `DashboardClient`.
3. `DashboardClient` is a thin client wrapper that forwards props to `Dashboard`.
4. `Dashboard.tsx`:
   - Uses `initialTheme` to set CSS variables (`document.documentElement.style.setProperty('--smd-...')`).
   - Uses `isPrimary` to choose a greeting source: rotating affirmations for the primary user (Haley), generic "Hi there" for others.
5. Theme picker writes back via `PUT /api/preferences` and updates the live DOM.

### 6.7 Feedback widget → admin inbox → email

1. User clicks the floating **Feedback** button (rendered everywhere by `app/layout.tsx` or `app/app/layout.tsx`).
2. `FeedbackWidget` opens a form. Submission inserts directly into the `feedback` table via the browser Supabase client (RLS allows INSERT where `auth.uid() = user_id` or `user_id IS NULL`).
3. After insert, the widget calls `POST /api/feedback/notify { feedbackId }` which sends an email to the admin (Resend / SendGrid integration; see commit `b2e8979`).
4. In `/admin`, the **Feedback** tab in `AdminClient.tsx` lists submissions sorted by `created_at`. Status transitions (`new → reviewed → resolved`) hit `PUT /api/admin/feedback`.

---

## 7. Inconsistencies, magic values, and gotchas

A running list of pitfalls discovered during this audit. These are documented here for visibility; fixes are tracked in [`recommendations.md`](./recommendations.md) and [`development_plan_v3.md`](./development_plan_v3.md).

### 7.1 `is_primary` source-of-truth confusion
- **Live schema** has `is_primary` on `public.user_profiles` (boolean, default false).
- **Recent commit message** (`f784bc9`) says "fetch is_primary flag from user_preferences".
- **Some code paths** read it from `user_preferences`, others from `user_profiles`.
- **Resolution**: `user_profiles` is the truth. `user_preferences.is_primary` (if present) should be removed. Update `fetchUserPreferences()` accordingly.

### 7.2 Hard-coded admin UUID in RLS
The `api_usage: admin read only` policy is:
```sql
auth.uid() = '930150fc-372b-4b61-98db-10e9ee25bdc4'::uuid
```
Replace with the role-based pattern already used on `user_profiles`:
```sql
EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin')
```

### 7.3 `proxy.ts` vs `middleware.ts` history
Earlier commits (`1741f4c`) tried to use `middleware.ts`. Vercel's Next.js 16 build for this project requires `proxy.ts` (commit `5226520`). **Do not re-introduce `middleware.ts`.** This is documented in the file header of `proxy.ts:6-9`.

### 7.4 No test scripts
`package.json` has only `dev`, `build`, `start`. There are no Vitest, Jest, Playwright, or any other test config files. Adding minimal coverage for the upload + generate flow is the highest-priority test investment (see `recommendations.md`).

### 7.5 `color_override_legacy` column
Old TEXT-typed override column on `user_lecture_settings`. The current code writes to `color_override` (jsonb, theme-keyed). The legacy column is still present in the schema; treat it as deprecated.

### 7.6 `processing_jobs` duplicated columns
- `original_file` vs `original_filename`
- `internal_id` vs `lecture_id`
- `estimated_cost` vs `estimated_cost_usd`

Each pair likely originates from incremental schema changes without a migrations process. Pick the more recent column in each pair (`original_filename`, `lecture_id`, `estimated_cost_usd`) and drop the other in a future cleanup.

### 7.7 Theme value comment is stale
`user_preferences.theme` column comment says "midnight, lavender, forest". The app uses **`pink`** not `lavender`. Update the comment.

### 7.8 `slides` bucket broad SELECT policy (fixed — Slice 0 P3)
~~The `Public can read slides` policy permitted directory listing of `slides/<internal_id>/`.~~ **Fixed in Slice 0 P3 (ADR-018).** The policy was dropped; the bucket remains public for direct-URL access (slide images still load via CDN). The remaining `Users can read their own uploads` policy covers authenticated SDK reads.

### 7.9 `system_config` has RLS enabled but no policy — intentional
`system_config` RLS-on-no-policy is **intentional design** (ADR-019). No user should ever read config directly. All reads go through `GET /api/admin/config` or `GET /api/preferences` (both use the service-role client). The Supabase advisor warning is acknowledged and suppressed.

### 7.10 `subscription_tiers` RLS (fixed — Slice 0 P1)
~~`subscription_tiers` had RLS disabled (Supabase advisor ERROR).~~ **Fixed in Slice 0 P1 (ADR-016).** RLS is now enabled with a public SELECT policy and a service-role-only ALL policy.

### 7.11 LoginForm placeholder
`components/LoginForm.tsx` is a placeholder per the "TODO Workstream 3" thread. Currently `app/login/page.tsx` may inline its own form. If the placeholder remains stale, either implement it or delete it.

### 7.12 LectureCard doesn't render plan badges
`LectureGrid` accepts `planNextReview` and `planTestDate` props and forwards them, but `LectureCard.tsx` doesn't currently render the badges. v3 polish.

### 7.13 LectureGrid keeps the modal mounted
`LectureViewModal` is mounted permanently and toggled via display-style. If you swap to on-demand mounting, profile carefully — the original choice was to avoid expensive re-mounts on slide-image lazy loads.

---

## 8. Environment variables

Set these in Vercel (and in `.env.local` for development). There is no `.env.example` committed to the repo — use the table below.

| Variable | Required | Public? | Used in |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | exposed | client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | exposed | client + server |
| `SUPABASE_URL` | optional | server-only | fallback for non-`NEXT_PUBLIC_` reads |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **secret** | admin routes, `lib/api-limits.ts`, `lib/admin-auth.ts` |
| `ANTHROPIC_API_KEY` | yes | **secret** | `app/api/generate/route.ts` |

If `SUPABASE_SERVICE_ROLE_KEY` is missing in production, you'll see a clear error page (commit `7580013`) instead of a silent redirect.

---

## 9. Local development

### 9.1 Prerequisites
- Node.js 20+
- npm 10+ (or pnpm/yarn — repo uses npm by lockfile convention but doesn't ship one currently)
- A Supabase project (or share access to the prod one for read-only work)
- An Anthropic API key

### 9.2 Setup
```bash
git clone git@github.com:syrianxo/studymd.git
cd studymd
npm install
cp .env.local.example .env.local   # if you have it; otherwise create from the table above
npm run dev
```

The dev server runs at `http://localhost:3000`. Sign-in cookies are set against `localhost`, so you can log in with a Supabase user that exists in the project pointed to by your env vars.

### 9.3 Pointing at Supabase
- **Production data (read-only work):** copy the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values from Vercel into `.env.local`. Do NOT copy `SUPABASE_SERVICE_ROLE_KEY` to your local env unless you understand you're touching prod data.
- **Local Supabase (preferred for schema work):** `npx supabase init && npx supabase start` to spin up a local Postgres + Auth. Apply the schema by running the SQL embedded in `app/admin/page.tsx` or by pulling from prod via `supabase db dump`.

### 9.4 Common dev tasks

**Build a production bundle locally:**
```bash
npm run build && npm start
```

**Process a test lecture without uploading:** hit `/api/debug/pptx-extract?path=uploads/<user_id>/<file>` to inspect the extractor output.

**Reset your local progress:** in browser devtools, run:
```js
Object.keys(localStorage).filter(k => k.startsWith('studymd_')).forEach(k => localStorage.removeItem(k));
```

**Force a fresh Vercel build:** push a no-op comment change to `next.config.ts` (the existing "cache bust" line is the convention).

### 9.5 Manual verification recipes

Because there is no test suite, here are the smoke tests to run by hand after meaningful changes:

| Change | Manual test |
|---|---|
| Upload pipeline | Upload a small (~500KB) PDF lecture; confirm it appears with flashcards + questions within 60s |
| Flashcard session | Mark 3 cards G, 2 cards M; refresh page; confirm marks persist |
| Cross-device sync | Mark cards on one device, log in on another; confirm marks visible |
| Theme switching | Switch theme; confirm CSS variables update; confirm reload preserves theme |
| Admin role check | Sign in as a `student`; visit `/admin` directly; confirm redirect to `/app` |
| Cost cap | Set `MAX_DAILY_CALLS = 1` in `api-limits.ts`, upload twice; confirm second upload returns 429 |
| RLS enforcement | In SQL editor, run `SELECT * FROM user_progress;` as a `student` — should return only that user's rows |

---

End of documentation. For things this file deliberately doesn't cover — improvement backlog, v3 plan, decisions log, working todos — see the linked sibling docs.
