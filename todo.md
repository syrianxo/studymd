# Todo — Living working checklist

> Items get added/closed as work happens. Keep it small. Move from **Backlog** → **Next** → **Now** as priorities firm up. Close items in the same commit that closes the work. Larger commitments belong in [`plan.md`](./plan.md); cross-cutting backlog lives in [`recommendations.md`](./recommendations.md); v3 specifics in [`development_plan_v3.md`](./development_plan_v3.md).

---

## 🚧 Now (in flight)

_(nothing active — pick next item from Next up)_

---

## ✅ Recently shipped

### Slice 12 — F2 Lecture-package subscriptions (ADR-032)
- [x] `lecture_packages` + `user_package_access` tables + RLS (`supabase/migrations/20260422_s12_lecture_packages.sql`)
- [x] Package-scoped `lectures` SELECT policy (replaces open authenticated-read)
- [x] Seed `pa-year-1-fall-2026` with all 19 current lectures; backfill to all non-admin users
- [x] `handle_new_user()` trigger: auto-grants default package on signup + ensures `user_preferences`
- [x] `GET /api/packages` — user-facing package list with access metadata
- [x] `GET/POST /api/admin/packages` — admin list + create
- [x] `GET/PATCH/DELETE/POST /api/admin/packages/[id]` — admin detail, update, delete, grant/revoke
- [x] `app/app/subscriptions/page.tsx` — user subscriptions page
- [x] Admin Packages tab (📦) in `AdminClient.tsx`
- [x] Header nav: Subscriptions link added (mobile drawer + desktop nav)

---

## ✅ Recently shipped

### Slice 10 — F4 + F5 Review mode + 3-tab lecture grid (ADR-029, ADR-030)
- [x] `slide_annotations` table + RLS + migration (`supabase/migrations/20260422_slide_annotations.sql`)
- [x] `lib/slide-annotation-prompt.ts` — clinical annotation system prompt (3–5 sentences, mnemonic, cached)
- [x] `GET/POST /api/lectures/[id]/annotations` — lazy generation with cost gating + `increment_api_usage`
- [x] `components/study/SlideReviewView.tsx` — slide-by-slide viewer: image left, annotation right; keyboard nav; lazy generation; mobile stacked layout
- [x] `app/app/study/review/page.tsx` — entry route reading `?lecture=&slide=`
- [x] Dashboard: segmented mode selector (Review / Learn / Practice) above FolderBar
- [x] `LectureCard`: mode-aware primary button + "⋯" details button always opens LectureViewModal
- [x] `LectureGrid`: threads `studyMode`, `onStudyAction`, `onStartReview` props
- [x] `LectureViewModal`: Review Slides button + active mode highlighting

### Slice F1 — Flashcard/exam missed-only mode
- [x] `FlashcardConfig` gains `cardMode: 'all'|'new'|'missed'`; `FlashcardConfigModal` shows 3-option mode selector with live counts
- [x] `ExamConfig` gains `questionMode: 'all'|'new'|'missed'`; `ExamConfigModal` defaults to `new` when prior attempts exist
- [x] `ExamView.onSessionComplete` extended with `attemptedIds` + `missedIds`
- [x] `examProgress` JSONB gains `attempted_question_ids[]` + `missed_question_ids[]` (backwards-compat, ADR-031)
- [x] `flash/page.tsx` + `exam/page.tsx` filter decks by mode using existing progress
- [x] `StudyConfigManager` passes progress counts to config modals
- [x] `CustomSessionModal` adds card/question pool mode tabs; `custom/page.tsx` filters per-lecture

---

## ✅ Recently shipped

### Slice A1 — Admin upload limit bypass (ADR-028)
- [x] `lib/api-limits.ts`: `ADMIN_DAILY_SANITY_CAP`, `ADMIN_MAX_FILE_SIZE_BYTES`, `userIsAdmin()`, extended `checkLimits({ adminBypass })`
- [x] `/api/upload`: dynamic file-size cap + `adminBypass` in `checkLimits`
- [x] `/api/generate`: admin bypass in local `checkRateLimits`
- [x] `/app/upload/page.tsx`: query `user_profiles` on mount, show "max 250 MB" hint for admins

### Slice 9 — F3 Lecture-grid folders (ADR-027)
- [x] DB migration: `folders` table + `group_id` FK upgrade
- [x] API: `GET/POST /api/folders` + `PATCH/DELETE /api/folders/[id]` with cycle prevention
- [x] `hooks/useFolders.ts` + `Folder` type + `FolderTile` / `FolderTree` / `FolderBar` / `NewFolderModal` components
- [x] Dashboard FolderBar pill row (replaced folder tiles), folder navigation + breadcrumb
- [x] dnd-kit drag-to-folder + `CustomSessionModal` folder picker
- [x] UX polish: suppress skeleton flash on background refresh, fix layout shift on folder switch

### Slice 8 — F8 Editable lecture topics (ADR-026)
- [x] DB: `user_lecture_settings.topics_override` jsonb column
- [x] API: `PUT /api/lectures/settings` accepts `topicsOverride`
- [x] `TopicEditor.tsx` component with dnd-kit reorder; integrated into `LectureViewModal` and `ManageLectureCard`

### Slices 6–7 — F1 Greetings + F9/F10 Header nav
- [x] `lib/greetings.ts`: 8 time-of-day buckets, display_name substitution, session-stable
- [x] `Header.tsx`: desktop nav with active-route styling, mobile hamburger drawer, My Lectures + My Plans + Progress links
- [x] `/app/progress` stub page

---

## ▶️ Next up (committed, in order)

### ~~Slice A2 — True background processing~~ ✅ Done
- [x] Processing continues if user navigates away — `lib/job-runner.ts` + Vercel Cron orphan recovery
- [x] 6-stage progress UI in UploadModal with live polling + "Safe to navigate away" message
- [x] ADR-029, `supabase/migrations/20260421_a2_processing_jobs_background_worker.sql`

### Slice A3 — Admin panel additions ✅
- [x] Courses section in admin — separate Courses tab (🗂️) with CRUD, color, archive, lecture-assignment drawer — N15
- [x] Admin link in header nav with amber ADMIN badge (desktop nav + mobile drawer) — N16
- [x] `public.courses` table + RLS + 4 seeds; `lectures.course_id` FK + full backfill — ADR-030
- [x] API: `GET/POST /api/admin/courses`, `PATCH/DELETE /api/admin/courses/[id]`, assign/unassign-lectures sub-routes

### Slice 10 — F4 + F5 Review mode + 3-tab lecture grid ✅ DONE

### ~~Slice F1 — Flashcard missed-only mode~~ ✅ Done
- [x] `FlashcardConfigModal` All/New/Missed mode selector with live counts
- [x] `ExamConfigModal` All/New/Missed with "new" as default when prior exams exist
- [x] `CustomSessionModal` card/question pool tabs; all study pages filter accordingly

### Slice 11 — F6 Worksheet uploads (Practice-only mode)
- [ ] `lectures.kind` column (`'lecture' | 'worksheet'`)
- [ ] `lib/worksheet-processor-prompt.ts`
- [ ] Upload UI: worksheet type selection; worksheet cards render as Practice Exam only (no flashcard mode)

### ~~Slice 12 — F2 Lecture-package subscriptions~~ ✅ Done
- [x] `lecture_packages` + `user_package_access` tables + RLS
- [x] Package-scoped `lectures` RLS policy (replaces open authenticated-read)
- [x] Admin UI: packages tab with lecture assignment + user grant/revoke — ADR-032

### Slice 13 — F7 OSCE preparation (Option B)
- [ ] `osce_cases`, `osce_checklist_items`, `osce_attempts`, `osce_attempt_scores` tables + RLS
- [ ] `/app/osce/*` pages
- [ ] Admin: create/manage OSCE cases

### Remaining bug fixes
- [ ] **Implement or delete `LoginForm.tsx`** — it's a placeholder.
- [ ] **Render `planNextReview` / `planTestDate` badges on `LectureCard`** — props are passed but unused.
- [ ] **One-time backfill: `lectures.slide_count`** — stop wasteful slide-count probing.
- [ ] **Decide fate of unused tables** — `sr_card_state`, `shared_decks`. Implement or drop.

---

## 🗂 Backlog (ideas, not committed)

### Code quality

- [ ] Drop `color_override_legacy` column once no readers remain.
- [ ] Consolidate `processing_jobs` duplicate columns (`original_file`/`original_filename`, `internal_id`/`lecture_id`, `estimated_cost`/`estimated_cost_usd`).
- [ ] Move admin email + UUIDs out of code into `system_config`.
- [ ] Add `app/sitemap.ts` + `app/robots.ts`.
- [ ] Split `Dashboard.tsx` (33KB) and `ManageLectureCard.tsx` (45KB) into focused subcomponents.
- [ ] Extract `lib/storage.ts` for path conventions.

### Performance

- [ ] Profile `LectureViewModal` mount cost; consider on-demand mount with `lazy()` + `<Suspense>`.
- [ ] Evaluate Recharts vs uPlot/vega-lite-tiny for admin charts.
- [ ] Audit `<img>` → `<Image>` conversion.
- [ ] Add HTTP caching headers to GET endpoints.

### Cost

- [ ] Enable Anthropic Batch API for non-interactive reprocessing.
- [ ] Add per-user monthly cost cap (in addition to global).
- [ ] Verify cache-control hits via `usage.cache_read_input_tokens`; surface "cache hit %" in admin Usage tab.
- [ ] Move `MODEL_DEFAULT` / `MODEL_FALLBACK` to `system_config` for runtime swap.

### UX (independent of v3)

- [ ] Full-text search via `pg_trgm` on `lectures.title` + `topics`.
- [ ] Sort options on the lecture grid (recent, A-Z, mastery%, date added).
- [ ] Bulk operations on the manage page (multi-select).
- [ ] Keyboard shortcut help overlay (`?` key).
- [ ] Onboarding tour for first-time users.
- [ ] CSV / PDF progress export.
- [ ] Footer of FlashcardConfigModal lists shortcuts.

### v4+ feature ideas

- [ ] Activate spaced repetition (`sr_card_state` already in schema — needs SM-2 in `lib/spaced-repetition.ts`).
- [ ] Activate shared decks (`shared_decks` already in schema — `share_code` URL).
- [ ] Mobile PWA wrapper.
- [ ] Anki export.
- [ ] Multi-account linking.
- [ ] Real-time collaborative study sessions.
- [ ] Study buddy AI ("ask the lecture" chat in `LectureViewModal`).
- [ ] OSCE Option A — AI patient roleplay (after Option B is in production).

### Repository structure / docs

- [ ] Move long-form docs into `docs/` (keep `README.md` + `CLAUDE.md` at root).
- [ ] Add `CONTRIBUTING.md`.
- [ ] Add `SECURITY.md`.
- [ ] Backfill git tags `v2.0.0`, `v2.5.0`; tag `v3.0.0` when it ships.

### Observability

- [ ] Sentry for server-side errors (free tier).
- [ ] Sentry for client-side errors (caught by `ErrorBoundary`).
- [ ] Daily admin email digest (Vercel Cron + existing email).

---

## ✅ Recently completed (v3 slices 0–9 + A1)

- [x] **Prereqs P1–P8** — RLS on `subscription_tiers` (P1), role-based admin policy for `api_usage` (P2), `slides` bucket tightened (P3), `system_config` policy (P4), `search_path` on 6 SECURITY DEFINER functions (P5), `is_primary` source-of-truth confirmed on `user_profiles` (P6), Vitest + lint + typecheck scripts (P7), `supabase/migrations/` workflow (P8).
- [x] **Slices 1+CSS — Dashboard simplification + mobile CSS** — display_name greeting, centered hero, two-column plan/timer layout, action row (Upload + Custom Session + Manage pencil), iOS Safari header banner fixes, mobile header refinements.
- [x] **Slice 3 — Kebab menu correctness** — removed spurious `useEffect` causing menu shift; hover-to-expand submenus for Change Course / Change Color.
- [x] **N10 — Color persistence** — `Dashboard.handleChangeColor` calls `refetch()`; `LectureViewModal` triggers `onChangeColor` after API success.
- [x] **Slice 4 — Mobile + global polish** — iOS modal flexbox fixes (FlashcardConfigModal, ExamConfigModal, CustomSessionModal), mobile section header single-row, filter pills horizontal-scroll, theme-aware `::selection`, profile page Aurora label.
- [x] **Aurora rename (ADR-025)** — `lib/themes.ts` single source of truth; `pink` → `aurora` across all files + DB; `migrateThemeId()` handles stale values.
- [x] **Per-theme lecture colors** — `lectures.theme_colors` JSONB; dropped legacy `lectures.color` TEXT; `resolveColor()` priority: override → default → `var(--accent)`.
- [x] **Slice 5 — Slide ref + internal_id** — `slide_number` required in prompt + validator; `generateLectureInternalId()` in `lib/id-generator.ts`; admin reprocess endpoint.
- [x] **Slices 6–7 — F1 Greetings + F9/F10 Header nav** — `lib/greetings.ts`, 8 time-of-day buckets; desktop nav with active-route styling; mobile hamburger drawer; `/app/progress` stub.
- [x] **Slice 8 — F8 Topic editing (ADR-026)** — `user_lecture_settings.topics_override` jsonb, `TopicEditor.tsx`, integrated into `LectureViewModal` + `ManageLectureCard`.
- [x] **Slice 9 — F3 Folders (ADR-027)** — `folders` table; `useFolders.ts`; `FolderBar` + `FolderTile` + `FolderTree` + `NewFolderModal`; drag-to-folder; folder picker in `CustomSessionModal`.
- [x] **Slice A1 — Admin upload bypass (ADR-028)** — 250 MB cap for admins; `userIsAdmin()`; `ADMIN_DAILY_SANITY_CAP`.

---

## Conventions for this file

- **Now** has at most 2–3 items. If you're starting something new, finish or drop something first.
- **Next up** is the committed queue — items here have been thought through and are ready to start.
- **Backlog** is "yes, eventually". Items here are ideas, not commitments.
- **Recently completed** — keep a short tail (last 5–10 items). Older items move to git history.
- Format an item with enough context to be actionable: file paths, links to related docs, one-line "why".
- Cross-link aggressively: `[`recommendations.md`](./recommendations.md#anchor)`, `[Feature 3](./development_plan_v3.md#feature-3)`, `[`Dashboard.tsx`](./components/Dashboard.tsx)`.
