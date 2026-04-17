# Todo — Living working checklist

> Items get added/closed as work happens. Keep it small. Move from **Backlog** → **Next** → **Now** as priorities firm up. Close items in the same commit that closes the work. Larger commitments belong in [`plan.md`](./plan.md); cross-cutting backlog lives in [`recommendations.md`](./recommendations.md); v3 specifics in [`development_plan_v3.md`](./development_plan_v3.md).

---

## 🚧 Now (in flight)

- [~] **Slice 1 — Header & routing fixes** — Fix #21, #14, #12, #13, #8(partial) done. Awaiting push to `origin`.

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
- [ ] **F8 — Editable lecture topics** — adds `topics_override` jsonb column; UI in `LectureViewModal` and `ManageLectureCard`.
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

- [x] **Slice 1 — Header & routing fixes** — Fix #21 (logo→/app), #14 (iOS Safari banner), #12 (mobile gear+theme), #13 (Pomodoro docs+ADR-022), #8-partial (nav links). `components/Header.tsx`, `styles/dashboard.css`, `app/globals.css`, `decisions.md`. Build green.
- [x] **v3 prereqs (Slice 0)** — P1–P6 (RLS, policies, search_path, is_primary). ADR-015–ADR-021 in decisions.md.
- [x] Comprehensive documentation pass — README, CLAUDE.md, architecture.md, documentation.md, recommendations.md, development_plan_v3.md, decisions.md, todo.md (this file).

---

## Conventions for this file

- **Now** has at most 2–3 items. If you're starting something new, finish or drop something first.
- **Next up** is the committed queue — items here have been thought through and are ready to start.
- **Backlog** is "yes, eventually". Items here are ideas, not commitments.
- **Recently completed** — keep a short tail (last 5–10 items). Older items move to git history.
- Format an item with enough context to be actionable: file paths, links to related docs, one-line "why".
- Cross-link aggressively: `[`recommendations.md`](./recommendations.md#anchor)`, `[Feature 3](./development_plan_v3.md#feature-3)`, `[`Dashboard.tsx`](./components/Dashboard.tsx)`.
