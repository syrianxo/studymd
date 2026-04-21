# Todo — Living working checklist

> Items get added/closed as work happens. Keep it small. Move from **Backlog** → **Next** → **Now** as priorities firm up. Close items in the same commit that closes the work. Larger commitments belong in [`plan.md`](./plan.md); cross-cutting backlog lives in [`recommendations.md`](./recommendations.md); v3 specifics in [`development_plan_v3.md`](./development_plan_v3.md).

---

## 🚧 Now (in flight)

_(Slice 8 — Editable topics shipped; moving to next slice)_

---

## ▶️ Next up (committed, not started)

### v3 prerequisites — security, correctness, hygiene

- [ ] **Enable RLS + policies on `subscription_tiers`** — blocks v3 Feature #2. SQL in [`recommendations.md`](./recommendations.md#11-🔴-enable-rls-on-subscription_tiers).
- [ ] **Replace hard-coded admin UUID in `api_usage` policy** — use the `EXISTS user_profiles WHERE role='admin'` pattern. SQL in [`recommendations.md`](./recommendations.md#12-🔴-replace-hard-coded-admin-uuid-in-api_usage-policy).
- [ ] **Tighten `slides` storage bucket SELECT policy** — currently allows directory listing. Decide between option A (drop the broad SELECT) or option B (private + signed URLs). See [`recommendations.md`](./recommendations.md#13-🔴-tighten-slides-storage-bucket-select-policy).
- [ ] **Add `system_config` policy** — currently RLS-on, no-policy. See [`recommendations.md`](./recommendations.md#14-🔴-add-a-policy-for-system_config-or-document-the-design).
- [ ] **Set `search_path` on all 6 SECURITY DEFINER functions** — `ensure_user_preferences`, `increment_api_usage`, `set_updated_at`, `update_study_plans_updated_at`, `update_user_card_overrides_updated_at`, `update_user_profiles_updated_at`. See [`recommendations.md`](./recommendations.md#15-🔴-set-search_path-on-the-6-public-functions).
- [ ] **Resolve `is_primary` source-of-truth** — confirm column lives only on `user_profiles`; remove any reference to `user_preferences.is_primary` in code. See [`recommendations.md`](./recommendations.md#17-🔴-resolve-is_primary-source-of-truth-confusion).
- [ ] **Enable HaveIBeenPwned password protection** — Supabase dashboard toggle. See [`recommendations.md`](./recommendations.md#16-🟡-enable-haveibeenpwned-leaked-password-protection).

### Tooling

- [ ] **Add `lint`, `typecheck`, `test` scripts to `package.json`** — wire Vitest, run tsc --noEmit. See [`recommendations.md`](./recommendations.md#21-🟡-add-lint-typecheck-and-test-scripts).
- [ ] **Adopt `supabase/migrations/` workflow** — `supabase db pull`, commit, repeat for every change. See [`recommendations.md`](./recommendations.md#18-🟡-add-a-migrations-workflow).

### v3 features (in suggested implementation order — see [`development_plan_v3.md`](./development_plan_v3.md))

- [ ] **F1 — Per-user randomized greetings** — `lib/greetings.ts`, replace inline affirmations in `Dashboard.tsx`.
- [ ] **F9 + F10 — Header nav + dashboard layout polish** — ship together; one UX sprint.
- [x] **F8 — Editable lecture topics** — `topics_override` jsonb column in `user_lecture_settings`; edit UI (dnd-kit reorder) in `LectureViewModal`; inline panel in `ManageLectureCard`. See ADR-023.
- [ ] **F3 — Lecture-grid folders** — `folders` table; convert `group_id` to uuid+FK; `FolderTree` and `FolderTile` components.
- [ ] **F5 + F6 — Three-tab Lecture Grid + Worksheets** — adds `lectures.kind`; tabs in `Dashboard`.
- [ ] **F4 — Review tab with AI annotations** — `slide_annotations` table; `SlideReviewView` component; new `lib/slide-annotation-prompt.ts`.
- [ ] **F2 — Lecture-package subscriptions** — `lecture_packages` + `user_package_access`; revise `lectures` RLS.
- [ ] **F7 — OSCE preparation (Option B first)** — `osce_cases`, `osce_checklist_items`, `osce_attempts`, `osce_attempt_scores`; `/app/osce/*`.

### v3 bug-fix bundle

- [ ] **Implement or delete `LoginForm.tsx`** — it's a placeholder.
- [ ] **Render `planNextReview` / `planTestDate` badges on `LectureCard`** — props are passed but unused.
- [ ] **One-time backfill: `lectures.slide_count`** — to stop the wasteful slide-count probing.
- [ ] **Decide fate of unused tables** — `sr_card_state`, `shared_decks`. Implement (per recommendations §6.1, §6.2) or drop.

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

## ✅ Recently completed

- [x] **Slice 8 — F8 editable lecture topics** — `topics_override jsonb` DB column, `PUT /api/lectures/settings` topicsOverride field, dnd-kit topic editor in `LectureViewModal`, inline panel in `ManageLectureCard`. ADR-026.
- [x] **Slice 5, Fix #11 — internal_id** — extracted `generateLectureInternalId()` into [`lib/id-generator.ts`](./lib/id-generator.ts) with date-prefixed format `lec_YYYYMMDD_xxxxxx`. Updated [`/api/upload`](./app/api/upload/route.ts) and regen-id validator. DB audit: all 17 existing lectures already have IDs set, no backfill needed.
- [x] **Slice 5, Fix #9 — slide_number** — added `slide_number` (required positive integer) to flashcard + question schema in [`lib/lecture-processor-prompt.ts`](./lib/lecture-processor-prompt.ts) and validator in [`lib/validate-lecture.ts`](./lib/validate-lecture.ts). Missing slide_number now fails validation → triggers Sonnet fallback. Added [`POST /api/admin/reprocess/[internalId]`](./app/api/admin/reprocess/[internalId]/route.ts) to backfill existing 17 lectures (run each one to get slide refs).
- [x] **Slice 3 — Kebab menu correctness** — Removed spurious `[menuRef.current]` useEffect causing menu position jump on click; added `onMouseEnter` hover-to-expand on Change Course / Change Color submenus. Commits `fix(kebab)`.
- [x] **N10 — Color persistence** — `Dashboard.handleChangeColor` now calls `refetch()`; `LectureViewModal` triggers `onChangeColor` after API success; ManageMode closing also calls `refetch()`. Color changes from all entry points now persist.
- [x] **iOS modal flexbox fixes** — `FlashcardConfigModal`, `ExamConfigModal`, `CustomSessionModal` converted from `position:sticky` to flexbox column layout. Close `[X]` always visible on real iOS Safari.
- [x] **Mobile lecture section header** — single-row on ≤479px (`flex-wrap: nowrap`); filter pills horizontal-scroll on ≤639px; Archived toggle only in Manage Mode.
- [x] **Theme palette upgrade** — Pink = pinks/purples/reds; Forest = greens/browns/yellows; Midnight keeps blues/purples. Consistent across `ManageLectureCard`, `LectureViewModal`.
- [x] **Per-theme lecture default colors** — Added `theme_colors` JSONB column to `lectures` table; seeded palette-cycled defaults for all existing lectures; cleared `user_lecture_settings.color_override` for fresh start. `resolveColor()` now: `color_override[theme]` → `theme_colors[theme]` → `var(--accent)`. Dropped legacy `lectures.color` TEXT column.
- [x] **4.4 Admin "click to edit" removed** — Admin sidebar name now links to `/app/profile` instead of opening a redundant in-admin modal. "Click to edit ✏️" label text removed.
- [x] **Aurora rename + theme registry** — `lib/themes.ts` created as single source of truth; `pink` theme id renamed to `aurora` across all 9 files, CSS, and DB; `migrateThemeId('pink')` → `'aurora'` handles stale localStorage values. ADR-025.
- [x] **Slice 4 complete (4.1/4.3/4.2/4.5)** — Mobile dashboard padding reduced to 16px gutter; theme-aware `::selection` added to `themes.css`; profile page "Lavender" → "Pink"/"Aurora" with correct preview swatch colors; filter bar horizontal-scroll cleanup pass verified.
- [x] Comprehensive documentation pass — README, CLAUDE.md, architecture.md, documentation.md, recommendations.md, development_plan_v3.md, decisions.md, todo.md (this file).

---

## Conventions for this file

- **Now** has at most 2–3 items. If you're starting something new, finish or drop something first.
- **Next up** is the committed queue — items here have been thought through and are ready to start.
- **Backlog** is "yes, eventually". Items here are ideas, not commitments.
- **Recently completed** — keep a short tail (last 5–10 items). Older items move to git history.
- Format an item with enough context to be actionable: file paths, links to related docs, one-line "why".
- Cross-link aggressively: `[`recommendations.md`](./recommendations.md#anchor)`, `[Feature 3](./development_plan_v3.md#feature-3)`, `[`Dashboard.tsx`](./components/Dashboard.tsx)`.
