# StudyMD Master Plan

The cross-version roadmap. Items from v2, v2.5, v3, and the v4 backlog with checkbox completion state.

> **Legend:**
> - `[x]` = shipped (verified against git history or live code)
> - `[~]` = partially shipped (some sub-items done; unfinished work tracked below)
> - `[ ]` = not started
> - 🔴 = security / correctness blocker
> - 🟡 = important
> - 🟢 = nice-to-have
>
> See [`development_plan_v3.md`](./development_plan_v3.md) for v3 feature designs, [`recommendations.md`](./recommendations.md) for the broader backlog, [`todo.md`](./todo.md) for the active working list, and [`decisions.md`](./decisions.md) for ADRs.

---

## v1 → v2 Migration (April 2026, complete)

The original v2 master plan (STUDYMD_V2_DEVELOPMENT_PLAN.md, dated 2026-04-07) covered six workstreams. All shipped.

### Workstream 0 — Project Setup & Migration

- [x] Initialize Next.js 14+ project with TypeScript and Tailwind — *commit `92e524b`, `5ac5d7f` (2026-04-08)*
- [x] Set up Supabase project (Postgres, Auth, Storage) — *commit `12221a1` "working v2 foundation"*
- [x] Database schema: `lectures`, `user_lecture_settings`, `user_progress`, `user_preferences`, `api_usage` — *all 5 tables present in live DB*
- [x] Migrate v1 lecture data to Supabase — *17 lectures live in `lectures` table*
- [x] Port front-end from `index.html` + `app.js` to React components — *commit `16be9de` "port dashboard and study views from v1"*
- [x] Verify parity with v1 site — *implicit; v2 launched*

### Workstream 1 — Automated Lecture Upload & Processing

- [x] `POST /api/upload` endpoint — *commits `46b753a`, `9adfd34`, current `app/api/upload/route.ts`*
- [x] Background processing via `processing_jobs` polling pattern — *table live; client polls `/api/upload/status`*
- [x] Slide conversion pipeline (PDF.js client-side) — *`lib/slide-converter.ts` (246 lines)*
- [x] PPTX text extraction (server-side ZIP parser) — *commits `10847c9`, `9a45ddf`, `29ee2bc`; `lib/pptx-extractor.ts` (257 lines)*
- [x] Claude API content generation — *commit `f4a8d93` "Claude API Integration for Lecture Processing"; `app/api/generate/route.ts`*
- [x] Upload UI (UploadModal) with file picker, course dropdown, progress — *`components/UploadModal.tsx` (~22KB)*
- [x] Direct-to-storage upload flow — *commit `b7f2236` (ADR-009)*

### Workstream 2 — Cross-Device Progress Sync

- [x] `POST /api/progress/save`, `GET /api/progress/load` — *both present*
- [x] Local-first sync wrapper — *`lib/progress-sync.ts` (278 lines)*
- [x] Last-write-wins on `updated_at` — *commit `3714c10` "store individual card IDs for true cross-device mastery sync" (ADR-005)*
- [x] Offline queue + `navigator.onLine` listener — *`setupOnlineListener` in `progress-sync.ts`*

### Workstream 3 — Authentication & Security

- [x] Supabase Auth (email/password) — *live*
- [x] Login page (`/login`) — *exists*
- [x] Route protection via middleware (`proxy.ts`) — *commits `5226520`, `76f01b8` (ADR-006, ADR-007)*
- [x] Server-side auth refresh on every request — *`proxy.ts` calls `getUser()` not `getSession()`*
- [x] RLS enabled on most user-scoped tables — *15 RLS policies across 11 tables*
- [~] RLS hardening — *ERROR: `subscription_tiers` RLS disabled; `system_config` RLS-on-no-policy; `slides` bucket allows listing — see [todo.md](./todo.md)*
- [x] CSP / HSTS / X-Frame-Options security headers — *`next.config.ts`*
- [ ] HaveIBeenPwned leaked-password protection — *Supabase dashboard toggle*

### Workstream 4 — Claude API Cost Controls

- [x] Model selection: Haiku 4.5 default, Sonnet 4.6 fallback — *`lib/api-limits.ts:35-41`*
- [x] Daily caps: 5 calls, 500K input tokens, 150K output tokens — *`API_LIMITS`*
- [x] Monthly cap: $5 USD — *`MAX_MONTHLY_COST_USD`*
- [x] Prompt caching via `cache_control: 'ephemeral'` — *`lib/lecture-processor-prompt.ts:144`*
- [x] Token pre-flight (`estimateTokensFromBytes`) — *commit `9adfd34`*
- [x] Server-side rate limiting (`checkLimits`) — *`lib/api-limits.ts:184`*
- [x] `api_usage` table + `increment_api_usage` RPC — *both live*
- [x] Admin usage dashboard — *commit `8149f51` "full v2 admin dashboard"*
- [ ] Batch API enabled — *`BATCH_API_ENABLED: false` deliberately (ADR-013)*

### Workstream 5 — Lecture Customization

- [x] `GET /api/lectures`, `PUT /api/lectures/settings`, `PUT /api/lectures/reorder` — *all present*
- [x] Drag-and-drop reorder with `@dnd-kit` — *commit `56e5443` "lecture customization — manage mode, themes, tags, filters"*
- [x] Hide / Archive — *both columns + UI live*
- [~] Grouping — *`group_id` column exists but unused in UI; folder feature in v3 will fill this in*
- [x] Tagging — *`TagEditor.tsx` + `tags` jsonb column*
- [x] Course reassignment via `course_override` — *commit `56e5443`*
- [x] Three themes (midnight, pink, forest) with CSS custom properties — *`styles/themes.css` + `ThemePicker.tsx` (ADR-008)*
  - Note: original v2 plan said "lavender"; final implementation is `pink`. The `user_preferences.theme` column comment is still stale.

### Workstream 6 — StudyMD Homepage & Multi-Student Architecture

- [x] Homepage (`/`) with hero, features, footer — *`app/page.tsx` (~49KB)*
- [x] Demo experience with sample flashcards — *part of `app/page.tsx`*
- [x] Multi-user routing (`/`, `/login`, `/app`, `/admin`) — *all four route trees live*
- [x] Personalized experience for primary user — *`is_primary` flag flow (ADR-014)*
- [ ] Custom domain `studymd.com` — *not acquired; current URL is Vercel-provided*

---

## v2.5 — Polish, Fix, Extend (April 2026, mostly complete)

The v2.5 master plan (STUDYMD_V2.5_DEVELOPMENT_PLAN.md, dated 2026-04-12) had 6 categories. Most shipped; some items deferred or rolled forward into v3.

### Category A — Dashboard Fixes & Redesign

- [x] **A.1** Fix Change Course / Change Color in kebab menu — *commit `56e5443`*
- [x] **A.2** Fix Theme Picker — *`ThemePicker.tsx` live*
- [x] **A.3** Move Upload button to Header — *`Header.tsx` "Upload" button*
- [x] **A.4** Remove session count pill — *`StatsRow.tsx` redesign*
- [~] **A.5** Redesign stats section — *partially done; further polish in v3 Feature #10*
- [x] **A.6** Add "Continue Studying" button — *Dashboard tracks `studymd_last_activity` in localStorage*
- [x] **A.7** Logo links to homepage — *`Header.tsx:65` `<Link href="/">`*
- [x] **A.8** Lecture count in section header — *implicit in dashboard*

### Category B — Restore Missing v1 Features

- [x] **B.1** Flashcard & Exam count selection (config modals) — *`FlashcardConfigModal.tsx`, `ExamConfigModal.tsx`*
- [x] **B.2** Topic selection for sessions — *via `CustomSessionModal.tsx`*
- [~] **B.3** Expandable lecture cards — *replaced with `LectureViewModal` (modal-based, not inline expand)*
- [x] **B.4** Random vs sequential order — *`StudyConfigManager.tsx`*
- [x] **B.5** Question type selection (MCQ / T/F / matching / fill-in) — *in `ExamConfigModal.tsx`*
- [~] **B.6** Footer — *not visible at every route; needs audit*
- [x] **B.7** Pomodoro Timer placement — *`PomodoroTimer.tsx` mini-pill in header (~17KB component)*

### Category C — Homepage Overhaul

- [~] **C.1** Remove PA-specific language — *needs review against current `app/page.tsx`*
- [~] **C.2** Medical demo content — *needs review*
- [~] **C.3** Fix demo subtitle — *needs review*
- [~] **C.4** Add Got It / Still Learning to demo — *needs review*
- [~] **C.5** Pricing page link — *`/pricing` route exists; content TBD*
- [~] **C.6** Top navigation menu (Features / Pricing / Sign Up / Sign In) — *needs review*

### Category D — Upload System Improvements

- [x] **D.1** Dedicated upload page (`/app/upload`) — *`app/app/upload/page.tsx` live*
- [x] **D.2** Non-blocking processing — *processing_jobs polling pattern*
- [ ] **D.3** Batch upload — *single-file only today*
- [x] **D.4** Review Claude API prompt — *`lib/lecture-processor-prompt.ts` (151 lines, 6 sections, validated against original)*

### Category E — New Pages & Features

- [x] **E.1** Profile / Settings page (`/app/profile`) — *commit `16a939b` "user profile page", `62f6a8f` "GET/PUT /api/profile and POST change-password"*
- [x] **E.2** Lecture Management page (`/app/lectures`) — *commit `6e78caa` "user lecture management page + per-user card overrides"*
- [x] **E.3** Study Plan generator (`/app/plans`) — *commits `a791166`, `f33b680` "DB migration, types, schedule generator, CRUD API routes"; `28b93d2` "3 bug fixes from feedback"*
- [x] **E.4** Spaced repetition groundwork (schema only) — *`sr_card_state` table live with SM-2 columns; algorithm not implemented (planned in v4)*
- [x] **E.5** Haley-specific touches — *commits `e0237fb` "love comment", `cab8ac8` "rotating affirmations for Haley", `771eb8c`, `f784bc9`*
- [x] **E.6** User roles (`admin` / `student` / `demo`) — *`user_profiles.role` CHECK constraint live*
- [x] **E.7** Error handling & feedback — *commit `e51b779` "feedback widget, error boundary, toast system, api call hook"; `b2e8979` "feedback widget positioning, inbox UX, and email notification system"*
- [x] **E.8** Admin Dashboard (`/admin`) — *commit `8149f51` "full v2 admin dashboard — all 18 improvements"; 7 tabs (overview, usage, users, lectures, feedback, config, progress)*

### Category F — v3/v4 Groundwork (Schema)

- [~] **F.1** Pricing & subscriptions schema (`subscription_tiers`, `user_subscriptions`) — *both tables live; `subscription_tiers` has 3 rows; **🔴 RLS DISABLED on `subscription_tiers`** — fix in v3 prereqs*
- [x] **F.2** Spaced repetition tables (`sr_card_state`) — *live, 0 rows, ready for v4*
- [x] **F.3** Collaborative features (`shared_decks`) — *table live, 0 rows*
- [x] **F.4** Feedback table — *live, 1 row, integrated with widget*

---

## v3 — Subscriptions, Folders, Review, OSCEs (planned)

Full design in [`development_plan_v3.md`](./development_plan_v3.md). Suggested implementation order is listed there.

### v3.0 Prerequisites (security & hygiene)

- [x] 🔴 Enable RLS + policies on `subscription_tiers` — *Slice 0 P1 (ADR-016)*
- [x] 🔴 Replace hard-coded admin UUID in `api_usage` policy — *Slice 0 P2 (ADR-017)*
- [x] 🔴 Tighten `slides` bucket SELECT policy — *Slice 0 P3 Option A (ADR-018)*
- [x] 🔴 Document `system_config` access pattern (intentional no-policy) — *Slice 0 P4 (ADR-019)*
- [x] 🔴 Set `search_path` on SECURITY DEFINER functions — *Slice 0 P5; 2 functions fixed (ADR-020)*
- [x] 🔴 Resolve `is_primary` source-of-truth confusion — *Slice 0 P6; now reads from `user_profiles` (ADR-021)*
- [ ] 🟡 Adopt `supabase/migrations/` workflow — *Slice 0 P8*
- [ ] 🟡 Add `lint`, `typecheck`, `test` scripts to `package.json` — *Slice 0 P7*
- [ ] 🟡 Implement or delete `LoginForm.tsx` placeholder
- [ ] 🟡 Consolidate `processing_jobs` duplicated columns
- [ ] 🟡 Render `planNextReview` / `planTestDate` badges on `LectureCard`
- [ ] 🟡 One-time backfill of `lectures.slide_count`

### v3 Features (10)

- [ ] **F1** Per-user randomized greetings — `lib/greetings.ts` with primary/generic pools, daily-deterministic
- [ ] **F2** Lecture-package subscriptions — `lecture_packages`, `user_package_access`, revised `lectures` RLS
- [ ] **F3** Lecture-grid folders — `folders` table, `FolderTree`/`FolderTile` components, integrate with Custom Sessions, My Lectures, Study Plans
- [ ] **F4** Review tab with AI slide annotations — `slide_annotations` table, `SlideReviewView`, new `lib/slide-annotation-prompt.ts`
- [ ] **F5** Three-tab Lecture Grid (Review / Learn / Practice) — refactor `Dashboard`, `LectureCard`, `LectureViewModal`
- [ ] **F6** Worksheet uploads → static Practice exams — `lectures.kind` column, `lib/worksheet-processor-prompt.ts`
- [ ] **F7** OSCE preparation — Option B (checklists) first, then Option A (AI patient roleplay) — `osce_*` tables, `/app/osce/*`
- [ ] **F8** Editable lecture topics — `user_lecture_settings.topics_override` jsonb, edit UI in modal + manage page
- [ ] **F9** Header navigation menu (Lectures / Study Plan / Progress) — `Header.tsx` nav links + `/app/progress` route
- [ ] **F10** Dashboard layout polish — Upload + Custom Session above grid; My Lectures → header; Manage → pencil icon in filter bar

---

## v4 — Spaced Repetition, Sharing, PWA (backlog)

Higher-effort or higher-risk features that depend on v3 stabilizing. These are scoping notes, not commitments.

### Activate dormant tables

- [ ] **Spaced repetition (SM-2)** — `sr_card_state` is already in the schema. Implement the algorithm in `lib/spaced-repetition.ts`. Add a "Due today" filter to the dashboard. Hook into `FlashcardView` mark events.
- [ ] **Shared decks** — `shared_decks` is already in the schema. Add a Share button on `LectureViewModal` → generates a `share_code` URL. Visiting clones the lecture into the visitor's account.

### New surface area

- [ ] **Mobile PWA wrapper** — `app/manifest.ts` + service worker via `@serwist/next`; offline support for already-loaded lectures
- [ ] **Anki export** — `GET /api/lectures/[id]/anki` returning a `.apkg`
- [ ] **Multi-account linking** — `linked_user_ids` on `user_profiles`; account switcher in header
- [ ] **Real-time collaborative study** — Supabase Realtime channels keyed by session ID
- [ ] **Study buddy AI ("ask the lecture")** — chat panel inside `LectureViewModal`; cost-tracked Claude calls

### UX upgrades

- [ ] Full-text lecture search (`pg_trgm` on title + topics)
- [ ] Sort options on the lecture grid (recent / A-Z / mastery% / date added)
- [ ] Bulk operations on the manage page (multi-select)
- [ ] Keyboard shortcut help overlay (`?` key)
- [ ] Onboarding tour for first-time users
- [ ] CSV / PDF progress export
- [ ] OSCE Option A — AI patient roleplay (after Option B is in production)

### Cost / API discipline

- [ ] Enable Anthropic Batch API for non-interactive reprocessing (50% discount)
- [ ] Per-user monthly cost cap (in addition to global)
- [ ] Cache-hit instrumentation (`usage.cache_read_input_tokens` → admin Usage tab)
- [ ] Move `MODEL_DEFAULT` / `MODEL_FALLBACK` to `system_config` for runtime swap

### Repository structure & ops

- [ ] Move long-form docs into `docs/` (keep `README.md` + `CLAUDE.md` at root)
- [ ] `CONTRIBUTING.md`
- [ ] `SECURITY.md`
- [ ] Backfill git tags `v2.0.0`, `v2.5.0`; tag `v3.0.0` on release
- [ ] Sentry for server- and client-side error reporting
- [ ] Daily admin email digest (Vercel Cron + existing email)

### Code quality

- [ ] Drop `color_override_legacy` column once no readers remain
- [ ] Move admin email + UUIDs out of code into `system_config`
- [ ] Add `app/sitemap.ts` + `app/robots.ts`
- [ ] Split `Dashboard.tsx` (33KB) and `ManageLectureCard.tsx` (45KB) into focused subcomponents
- [ ] Extract `lib/storage.ts` for path conventions

---

## Cross-version notes

- **v2 was scoped against v1 (the cPanel single-page app).** Original cPanel asset URL `khalidsirawan.com/hl-pa-study/` is still allowed in `next.config.ts`'s image domain list as a transitional artifact.
- **v2.5 was scoped against the live v2 codebase**, with a focus on closing UX gaps from v1 that the React port had skipped.
- **v3 is the first version with a real long-form roadmap** ([`development_plan_v3.md`](./development_plan_v3.md)) and explicit security prereqs.
- **No git tags** for v2 or v2.5 milestones exist (`git tag --list` is empty). Backfill is in the v4 ops list.

This file is the master tracking artifact. Move items to "shipped" in the same commit that ships them. New items get added to v4 (the ongoing backlog); committed v3 items move from `[ ]` to `[~]` to `[x]` over time.
