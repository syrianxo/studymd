# Claude Code Execution Guide — StudyMD v3

**Audience:** Claude Code sessions working in the `studymd` repo.
**Scope:** 7 new features + 16 bug fixes, grouped into shippable slices.
**Authoritative references (read these before touching code):**
- [`CLAUDE.md`](./CLAUDE.md) — conventions, gotchas, middleware warning
- [`architecture.md`](./architecture.md) — system diagrams
- [`documentation.md`](./documentation.md) — file-by-file reference
- [`development_plan_v3.md`](./development_plan_v3.md) — feature designs
- [`recommendations.md`](./recommendations.md) — security / code-quality backlog
- [`decisions.md`](./decisions.md) — ADRs
- [`plan.md`](./plan.md), [`todo.md`](./todo.md) — tracking

---

## 🚨 Hard rules — read before every session

1. **Middleware filename is `proxy.ts`.** Never create `middleware.ts`. The Next.js 16 build in this project resolves middleware from `proxy.ts` only; creating both produces a hard build failure:
   > Error: Both middleware file "./middleware.ts" and proxy file "./proxy.ts" are detected. Please use "./proxy.ts" only.
   The exported function must be named `proxy` (not `middleware`). The `config` export stays as-is. All auth guards, redirects, and cookie refresh live there. See ADR-006.

2. **Role checks never go in `proxy.ts`.** Edge runtime cannot reliably query `user_profiles`. Role gating happens in page-level Server Components via `requireAdmin()` / `requireUser()`. See ADR-007.

3. **Commit discipline — one feature or fix per commit.** After every code change (feature or fix), run:
   ```bash
   git add <specific-files>
   git commit -m "<type>: <scope> — <one-line summary>

   <2-5 line body explaining the why, not the what.
    Reference the execution guide slice number and any
    relevant ADR / recommendation section.>"
   ```
   Use conventional prefixes: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `perf:`. After each commit, push to `origin main` unless told to hold.

4. **Schema changes are dual-tracked.** Apply via Supabase MCP (`apply_migration`) AND append the SQL verbatim to `decisions.md` under a new ADR entry. Once the `supabase/migrations/` workflow lands (prereq P8), also commit a migration file.

5. **Every Anthropic call** must (a) call `checkLimits(userId)` from `lib/api-limits.ts` first, (b) call `increment_api_usage` RPC after, (c) default to `MODEL_DEFAULT` (Haiku 4.5), (d) use `buildSystemWithCache()` for system prompts.

6. **Every new table** gets RLS enabled and at least one policy in the same migration. No exceptions.

7. **Theme-aware colors use `resolveColor(color, theme)`** from `hooks/useUserLectures.ts`. Never hard-code hex. Theme values are `'midnight' | 'pink' | 'forest'`. (Note: fix #23 clarifies that "lavender" is a UI label typo — the internal key stays `'pink'`.)

8. **Mobile breakpoint is 768px.** All mobile fixes in this guide target `≤768px`. Test with Chrome DevTools iPhone 14 Pro (390×844) and iPad Mini (768×1024) simulation.

9. **No tests, lint, or typecheck scripts exist yet.** Prereq P7 adds them. Until then, run `npm run build` before every commit as your smoke test — a failed `build` is a failed commit.

10. **Use `read_multiple_files` (Filesystem MCP) in batches**, not sequential reads. Use `edit_file` with multiple `oldText/newText` pairs for atomic multi-location patches.

---

## Execution order — the 23 items, grouped

The 23 items collapse into 11 shippable slices. Ship them in order; each slice ends with a green `npm run build` and a push.

| # | Slice | Contains | Est. commits |
|---|---|---|---|
| 0 | Prereqs | P1–P8 (v3 §0) | 8 |
| 1 | Quick header & routing fixes | Fixes #21, #8 (partial), #12, #13, #14 | 5 |
| 2 | Mobile modal correctness | Fixes #16, #17, #19, #20 | 4 |
| 3 | Mobile kebab menu | Fixes #10, #18 | 2 |
| 4 | Mobile layout polish | Fixes #15, #22, #23 | 3 |
| 5 | Slide ref + internal_id fixes | Fixes #9, #11 | 2 |
| 6 | Feat #1 — Random greetings | Feature 1 | 2 |
| 7 | Feat #8 — Header nav (My Plans / My Lectures) | Feature 9 + 10 + Fix #8 | 4 |
| 8 | Feat #7 — Topic editing | Feature 8 | 3 |
| 9 | Feat #3 — Folders | Feature 3 | 5 |
| 10 | Feat #4,#5 — Review mode + 3-tab grid | Features 4 + 5 | 6 |
| 11 | Feat #6 — Worksheets | Feature 6 | 3 |
| 12 | Feat #2 — Lecture packages | Feature 2 | 5 |
| 13 | Feat #6 OSCE — Case-based practice | Feature 7 (Option B) | 6 |

Fix numbers below match the user's numbered list.

---

## Slice 0 — Prerequisites (before any feature work)

Branch: `chore/v3-prereqs`. Do all eight, commit each separately, then merge.

### P1 — Enable RLS on `subscription_tiers` 🔴
**Recommendation:** §1.1. **Commit:** `chore(db): enable RLS and policies on subscription_tiers`.
```sql
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read subscription tiers"
  ON public.subscription_tiers FOR SELECT TO public USING (true);
CREATE POLICY "Service role manages tiers"
  ON public.subscription_tiers FOR ALL TO public
  USING (auth.role() = 'service_role');
```
Apply via MCP `apply_migration`. Append to `decisions.md` as ADR entry.

### P2 — Replace hard-coded admin UUID in `api_usage` 🔴
**Recommendation:** §1.2. **Commit:** `chore(db): replace hard-coded admin UUID in api_usage policy with role-based pattern`.
```sql
DROP POLICY "api_usage: admin read only" ON public.api_usage;
CREATE POLICY "api_usage: admin read"
  ON public.api_usage FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles
                 WHERE user_id = auth.uid() AND role = 'admin'));
```

### P3 — Tighten `slides` bucket SELECT policy 🔴
**Recommendation:** §1.3. Take **option A** (drop broad SELECT; bucket stays public, direct-URL access continues to work). Document decision in `decisions.md`.
```sql
DROP POLICY "Public can read slides" ON storage.objects;
```

### P4 — `system_config` policy 🔴
**Recommendation:** §1.4. Document that all reads go through `/api/admin/config` + `/api/preferences`. Add a comment to the table in SQL and a note in `documentation.md`. **Commit:** `docs(db): document system_config access pattern (service-role only)`.

### P5 — `search_path` on SECURITY DEFINER functions 🔴
**Recommendation:** §1.5. Recreate all six with `SET search_path = public, pg_temp`:
- `ensure_user_preferences`
- `increment_api_usage`
- `set_updated_at`
- `update_study_plans_updated_at`
- `update_user_card_overrides_updated_at`
- `update_user_profiles_updated_at`

### P6 — `is_primary` source-of-truth 🔴
**Recommendation:** §1.7. Blocks Feature 1 (greetings).
1. Confirm via MCP `list_tables` that `is_primary` lives on `user_profiles` only.
2. Grep for `user_preferences.is_primary` in code — remove any hits.
3. Update `lib/supabase-server.ts` `fetchUserPreferences()` to return `is_primary` via a join on `user_profiles`.
4. **Commit:** `fix(auth): fetch is_primary from user_profiles (authoritative source)`.

### P7 — Add `typecheck`, `lint`, `test` scripts 🟡
**Recommendation:** §2.1.
```json
// package.json additions
"scripts": {
  "typecheck": "tsc --noEmit",
  "lint": "next lint",
  "test": "vitest run"
}
```
Install `vitest` + `@vitest/ui`. Add `vitest.config.ts`. Add one smoke test (`__tests__/smoke.test.ts` asserting `1 + 1 === 2`) to prove the pipe works. **Commit:** `chore(tooling): add typecheck, lint, test scripts`.

### P8 — Adopt `supabase/migrations/` workflow 🟡
**Recommendation:** §1.8.
```bash
supabase init
supabase db pull  # writes supabase/migrations/<ts>_init.sql
git add supabase/
git commit -m "chore(db): snapshot production schema as initial migration"
```
From this point on, every schema change gets a migration file committed alongside the `apply_migration` call.

**End of Slice 0.** Run `npm run build`, `npm run typecheck`. Open PR, merge to `main`.

---

## Slice 1 — Quick header & routing fixes

Branch: `fix/header-quick-wins`. These are low-risk, high-visibility UI fixes.

### Fix #21 — `StudyMD` link → dashboard
**Files:** `components/Header.tsx`.
The logo/wordmark must be an `<Link href="/app">` (signed-in) or `<Link href="/">` (signed-out). Currently it's likely a plain `<h1>` or links to `/`.
```tsx
// Before
<h1 className="smd-header-logo">StudyMD</h1>
// After
<Link href={user ? "/app" : "/"} className="smd-header-logo">StudyMD</Link>
```
Add `prefetch={false}` to avoid unnecessary data fetches.
**Commit:** `fix(header): studyMD wordmark links to dashboard when signed in`.

### Fix #14 — Header banner too thin + fails to cover content on iOS/Safari
**Files:** `components/Header.tsx`, `styles/themes.css` (or the component's inline `<style>`).

Symptom: On iOS Safari, page content scrolls *over* the fixed header (header is thin, backdrop fails, content shows through above it).

Root cause is almost always one of:
1. Header uses `position: sticky` but ancestor has `overflow: hidden` → Safari drops stickiness.
2. Header background uses `backdrop-filter: blur()` without the `-webkit-` prefix.
3. Header height is smaller than iOS Safari's URL bar hide/show delta.

Fix:
```css
.smd-header {
  position: sticky;
  top: 0;
  z-index: 50;
  min-height: 56px;                 /* was likely ~44px */
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  background: color-mix(in srgb, var(--smd-bg) 85%, transparent);
  border-bottom: 1px solid var(--smd-border);
  /* iOS safe area */
  padding-top: env(safe-area-inset-top);
}

/* If a parent uses overflow: hidden, move sticky up to <body> level. */
body { overflow-x: hidden; overflow-y: auto; }
```
If there's a parent with `overflow: hidden`, hoist the header out of it or change the parent to `overflow-x: clip` (Safari respects that without breaking sticky).
**Commit:** `fix(header): solidify mobile Safari banner (sticky, blur, min-height, safe-area)`.

### Fix #12 — Mobile header missing settings gear + theme picker
**Files:** `components/Header.tsx`, `components/SettingsMenu.tsx` (if split).

Currently mobile header shows Upload + Sign Out only. Needed: settings gear (opens dropdown with theme picker, profile link, sign out). Upload stays; Custom Session moves out per Feature 10 (deferred to Slice 7).

Mobile pattern (≤768px):
```tsx
{isMobile ? (
  <>
    <IconButton icon={UploadIcon} onClick={openUpload} aria-label="Upload" />
    <IconButton icon={SettingsIcon} onClick={() => setMenuOpen(v=>!v)} aria-label="Settings" />
    {menuOpen && <MobileSettingsDrawer onClose={() => setMenuOpen(false)} />}
  </>
) : (
  <>{/* existing desktop buttons */}</>
)}
```
The `MobileSettingsDrawer` contains: Theme picker (Midnight / Pink / Forest radio), My Profile link, My Plans link (comes in Slice 7), Sign out. Reuse the existing theme-picker component — don't duplicate color tokens.

Minimum touch target on every button: 44×44 px.
**Commit:** `fix(mobile): restore settings gear and theme picker in mobile header`.

### Fix #13 — Mobile Pomodoro timer absent — confirm intentional
**Files:** `components/Header.tsx`, `components/PomodoroPill.tsx`.

The Pomodoro pill is hidden below 768px today. **This is intentional** (the pill is 120px wide minimum and collides with the mobile header icons). Document it:
1. Add a comment in `Header.tsx` at the Pomodoro render site: `// Pomodoro pill hidden <768px by design — see Fix #13 rationale. Accessible via /app/focus page (TODO v3.1).`
2. Add an entry in `decisions.md` — ADR-XXX: Pomodoro hidden on mobile header (acknowledged gap, not broken).
3. Confirm the underlying Pomodoro state still advances (timer continues even when pill is hidden) by checking the `usePomodoro` hook behavior on resize.

**No UI change required.** If the timer *state* is broken on mobile (hook unmounting on resize), that's a real bug — fix by hoisting the hook to a provider that lives above the responsive branch.
**Commit:** `docs(pomodoro): document intentional mobile hide; verify hook persists across resize`.

### Fix #8 (partial) — Header My Plans / My Lectures placeholder
Stub the nav items only (no routing yet — full work is Slice 7). This is cheap and unblocks visual review of Slice 1.
```tsx
<nav className="smd-header-nav">
  <NavLink href="/app">My Lectures</NavLink>
  <NavLink href="/app/plans">My Plans</NavLink>
</nav>
```
Both routes exist today (`/app` and `/app/plans`). The full treatment (active-state styling, mobile drawer integration) comes in Slice 7.
**Commit:** `feat(header): add My Lectures and My Plans nav links`.

**End of Slice 1.** `npm run build` → smoke test on mobile viewport → push.

---

## Slice 2 — Mobile modal correctness

Branch: `fix/mobile-modals`. Four related bugs in modal behavior on mobile.

### Fix #17 — Full-screen modal hides (X) on mobile Chrome; background scrolls behind
**Files:** every modal component (`LectureViewModal.tsx`, `FlashcardConfigModal.tsx`, `ExamConfigModal.tsx`, `UploadModal.tsx`, `CustomSessionModal.tsx`, `ProfileModal.tsx` if exists).

Root causes:
1. Modal uses `height: 100vh` which mobile Chrome computes against a URL-bar-hidden viewport (so content exceeds visible area, pushing X offscreen).
2. Background scroll-lock missing — `document.body` keeps scrolling when you swipe on the modal.

**Fix — create `hooks/useModalShell.ts`:**
```ts
// Centralizes: scroll-lock, iOS bounce fix, dynamic viewport height.
export function useModalShell(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);
}
```

**Fix modal CSS — use `100dvh` (dynamic viewport height), not `100vh`:**
```css
.smd-modal-fullscreen {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100dvh;                  /* dynamic viewport — excludes URL bar */
  display: flex;
  flex-direction: column;
  z-index: 100;
}
.smd-modal-header {
  position: sticky;
  top: 0;
  padding: env(safe-area-inset-top) 1rem 0.75rem;
  background: var(--smd-bg);
  z-index: 2;
}
.smd-modal-close {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 0.5rem);
  right: 0.75rem;
  min-width: 44px;
  min-height: 44px;
}
```

Wire `useModalShell(isOpen)` into every modal. Replace every `height: 100vh` with `height: 100dvh`. Pin close button sticky inside modal header.
**Commit:** `fix(modals): mobile Chrome full-screen modals now fit viewport and lock background scroll`.

### Fix #16 — Swipe-down-to-dismiss doesn't work on mobile
**Files:** introduce `components/BottomSheet.tsx` or extend the existing shell.

Two acceptable approaches:
- **A (recommended, low-effort):** Don't implement swipe-down at all; make the close button obviously tappable and document "tap X to close." Users universally understand the X.
- **B (nicer):** Add swipe-down dismissal for bottom-sheet-style modals (Custom Session, Upload on mobile). Use `framer-motion`'s `drag="y"` with `dragConstraints` and a velocity threshold.

**Pick A for v3.** Add a sticky header bar with a centered drag handle + X — this communicates the close affordance without the implementation cost of real swipe gestures. Drag-to-close is a Slice-13 enhancement if users request it.

```tsx
<div className="smd-modal-header">
  <div className="smd-modal-handle" aria-hidden />
  <h2>{title}</h2>
  <button className="smd-modal-close" onClick={onClose} aria-label="Close">×</button>
</div>
```
```css
.smd-modal-handle {
  width: 36px; height: 4px; border-radius: 2px;
  background: var(--smd-border); margin: 6px auto 10px;
}
```
**Commit:** `fix(modals): add visible drag handle + sticky close (A-path for swipe dismiss)`.

### Fix #19 — Custom Session modal has no close function at top; not pinned
**Files:** `components/CustomSessionModal.tsx`.

Apply the same modal shell pattern from Fix #17. The close button must be sticky inside the modal header, not buried at the bottom of a scrolling list of lecture checkboxes. Also verify on mobile that the "Start Session" action button stays visible — pin it as a sticky footer:
```tsx
<div className="smd-modal-footer">
  <button onClick={onStart} disabled={!canStart}>Start Session</button>
</div>
```
```css
.smd-modal-footer {
  position: sticky;
  bottom: 0;
  padding: 0.75rem 1rem env(safe-area-inset-bottom);
  background: var(--smd-bg);
  border-top: 1px solid var(--smd-border);
}
```
**Commit:** `fix(custom-session): pin close button to top and Start Session to bottom on mobile`.

### Fix #20 — "Saving…" indicator + menu size jitter
**Files:** wherever "Saving…" appears. Likely `components/Dashboard.tsx`, `ManageLectureCard.tsx`, `ProfileClient.tsx`, or a shared `<SaveStatus>` component.

Two problems combined:
1. "Saving…" is placed inline and pushes the menu below it, causing layout shift.
2. Kebab / dropdown menus change size based on whether "Saving…" is visible.

Fix:
1. Move "Saving…" to a fixed-position toast at the top of the page (top: 12px; center horizontally; z-index above header).
2. Create/update `components/SaveStatusToast.tsx` as the one source of "Saving…" / "Saved ✓" / "Save failed" UI.
3. Remove inline "Saving…" text from every spot that has it; dispatch via a context (`SaveStatusContext`) or a lightweight zustand store.
4. For kebab menus, set `min-width: 180px` so they don't resize based on their contents (the "got it"/"missed" counters are what was causing variable width).

```tsx
// App-shell provider
<SaveStatusProvider>
  <Header />
  {children}
</SaveStatusProvider>

// Anywhere that saves:
const { setStatus } = useSaveStatus();
setStatus('saving'); await save(); setStatus('saved');
```
**Commit:** `fix(ui): move Saving indicator to top toast; standardize kebab menu width`.

**End of Slice 2.** Smoke test every modal on mobile viewport. Push.

---

## Slice 3 — Mobile kebab menu

Branch: `fix/mobile-kebab`. Fixes #10 and #18 are the same underlying issue on iOS — the first tap fires `onMouseEnter` (opening a tooltip), the second tap fires `onClick`.

### Fix #10 — iOS requires double-tap to open kebab
### Fix #18 — Kebab doesn't close on second tap
**Files:** `components/KebabMenu.tsx` (or wherever per-card menus live — likely inside `LectureCard.tsx`).

Root cause: iOS Safari synthesizes a `mousemove`/`mouseenter` from the first tap and fires `click` on the second tap. Any `onMouseEnter` handler on the trigger steals the first tap.

Fix:
```tsx
// BEFORE — fragile
<button onMouseEnter={() => setOpen(true)}>⋮</button>

// AFTER — robust
<button
  onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
  onTouchEnd={(e) => e.preventDefault()}  // prevent synthesized click
  aria-expanded={open}
  aria-haspopup="menu"
  className="smd-kebab-trigger"
>
  ⋮
</button>
```

Close-on-outside-click / close-on-second-tap:
```tsx
useEffect(() => {
  if (!open) return;
  const handler = (e: PointerEvent) => {
    if (!triggerRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)) {
      setOpen(false);
    }
  };
  document.addEventListener('pointerdown', handler);
  return () => document.removeEventListener('pointerdown', handler);
}, [open]);
```
Use `pointerdown`, not `click` — `click` on iOS can miss the outside-tap when it lands on another interactive element.

For tap-to-close on the trigger, the `onClick` with `setOpen(v => !v)` above already handles it.
**Commit:** `fix(mobile): kebab opens on first tap and closes on second tap (pointerdown-based)`.

**Add a regression test note** in the commit body: "Manual: iOS Safari + Android Chrome, tap kebab → opens; tap kebab again → closes; tap outside → closes. Desktop hover preserved."

**End of Slice 3.** Push.

---

## Slice 4 — Mobile layout polish

Branch: `fix/mobile-layout`. Misc UI fixes that don't fit the other slices.

### Fix #15 — Mobile title, filter bar, Manage Lectures, Custom Study Schedule cramped
**Files:** `components/Dashboard.tsx`, `components/FilterBar.tsx`.

Symptom: on phone, the stack goes: big title → filter pills overflowing right → Manage Lectures button somewhere → Custom Study button somewhere. No hierarchy.

Fix — establish a vertical rhythm and wrap the filter row:
```tsx
<header className="smd-dashboard-head">
  <h1 className="smd-dashboard-title">My Lectures</h1>
  <p className="smd-dashboard-subtitle">{greeting /* Slice 6 */}</p>
</header>

{/* Action row — single horizontal-scroll strip on mobile, inline on desktop */}
<div className="smd-action-row">
  <button>Upload</button>
  <button>Custom Session</button>
  <button className="smd-icon-btn" aria-label="Manage lectures"><PencilIcon/></button>
</div>

<FilterBar /> {/* wraps to multiple rows on mobile; horizontal scroll for pills */}
```
```css
.smd-action-row {
  display: flex; gap: 0.5rem; align-items: center;
  overflow-x: auto; scrollbar-width: none;
  padding: 0.5rem 1rem;
}
.smd-action-row::-webkit-scrollbar { display: none; }

@media (max-width: 768px) {
  .smd-dashboard-title { font-size: 1.25rem; line-height: 1.3; }
  .smd-filter-bar { flex-wrap: wrap; gap: 0.5rem; }
  .smd-filter-pill { font-size: 0.8125rem; padding: 0.25rem 0.625rem; }
}
```
Replace the verbose "Manage Lectures" text button with a pencil icon button (per Feature 10 design) — this also delivers part of Feature 10 early.
**Commit:** `fix(mobile): establish dashboard vertical rhythm; pencil-icon manage button`.

### Fix #22 — Admin "click to edit" affordance appears for non-admin users
**Files:** `components/Dashboard.tsx`, `components/LectureCard.tsx`, possibly `ManageLectureCard.tsx`.

Grep for `click to edit` or similar copy. Wrap in `{isAdmin && (...)}` or lift to a prop.
```tsx
{isAdmin && <div className="smd-edit-hint">Click to edit</div>}
```
Determine `isAdmin` from the same auth/profile fetch that already powers the admin nav. If it's not available on the Dashboard, add it to the Server Component that renders it and pass as prop.
**Commit:** `fix(admin): hide "click to edit" affordance from non-admin users`.

### Fix #23 — Profile theme shows "lavender" instead of "pink"
**Files:** `app/app/profile/page.tsx` or `ProfileClient.tsx` (wherever the theme picker lives).

The theme enum is `'midnight' | 'pink' | 'forest'`. The display label got typo'd or renamed to "lavender" at some point. Fix the label only; the underlying key stays `'pink'` to avoid a breaking schema change on `user_preferences.theme`.

```tsx
const THEME_OPTIONS = [
  { value: 'midnight', label: 'Midnight' },
  { value: 'pink',     label: 'Pink' },     // was 'Lavender'
  { value: 'forest',   label: 'Forest' },
];
```
Also grep for the word "Lavender" / "lavender" project-wide and update any stray references in CSS comments, ADRs, or docs that aren't reporting the bug itself.
**Commit:** `fix(profile): theme label "Lavender" → "Pink" (internal key unchanged)`.

**End of Slice 4.** Push.

---

## Slice 5 — Slide ref + internal_id fixes

Branch: `fix/slide-refs-internal-ids`. Two data-integrity fixes.

### Fix #11 — Lecture `internal_id` not being set
**Files:** `app/api/upload/route.ts`, `app/api/generate/route.ts`, `lib/id-generator.ts` (create if missing).

Diagnose first:
1. Query Supabase for a recent lecture: `SELECT internal_id, title, created_at FROM lectures ORDER BY created_at DESC LIMIT 5;`
2. If `internal_id` is null or an empty string: identify which code path dropped it. Possibilities:
   - `/api/upload` creates the `lectures` row without `internal_id`.
   - `/api/generate` produces `json_data` but doesn't UPDATE the `internal_id` column.
   - ID is generated client-side and never persisted.

Establish canonical generator:
```ts
// lib/id-generator.ts
import { randomBytes } from 'crypto';
export function generateLectureInternalId(): string {
  // Example format: lec_20260417_a3f9b2
  const d = new Date();
  const date = d.toISOString().slice(0,10).replace(/-/g,'');
  const suffix = randomBytes(3).toString('hex');
  return `lec_${date}_${suffix}`;
}
```
Wire it into `/api/upload`:
```ts
const internalId = generateLectureInternalId();
const { error } = await supabase.from('lectures').insert({
  internal_id: internalId,
  title, course, uploaded_by: user.id, json_data: null,
});
```
Return `internalId` in the response; pass through to `/api/generate`.

**Backfill** any rows with null/empty `internal_id`:
```sql
UPDATE public.lectures
SET internal_id = 'lec_legacy_' || substr(md5(random()::text), 1, 6)
WHERE internal_id IS NULL OR internal_id = '';
```
If `internal_id` is a PK (check schema), this needs care — do the backfill in a transaction, then apply a `CHECK (internal_id <> '')` constraint.

**Commit:** `fix(upload): guarantee internal_id on every lecture insert; backfill legacy rows`.

### Fix #9 — No slide ref on flashcards
**Files:** `lib/lecture-processor-prompt.ts`, `lib/schema-validators.ts`, `components/study/FlashcardView.tsx` (wherever slide refs are consumed).

Diagnose: open `lectures.json_data` for a recent lecture. Inspect a flashcard — does it have `slide_number` / `slide_ref` / similar? If missing or always null:

1. **Prompt fix:** `lib/lecture-processor-prompt.ts` must explicitly require `slide_number` (integer) on every flashcard and every question. Add to the JSON schema section of the prompt:
   ```
   Every flashcard MUST include "slide_number" (1-indexed integer) pointing
   to the slide the fact came from. If the fact spans multiple slides, use
   the earliest. Never emit a flashcard with slide_number: null or missing.
   ```
2. **Validator fix:** `validateLectureJson()` rejects any card without `slide_number`. If rejected, re-prompt with Sonnet (existing fallback path).
3. **Renderer fix:** `FlashcardView.tsx` uses `card.slide_number` to show the slide thumbnail. If missing, show a "No slide reference" placeholder instead of erroring.
4. **Backfill:** run a one-shot reprocess on existing lectures (admin-only endpoint `/api/admin/reprocess/[internalId]`) to regenerate `json_data` with slide refs. Expensive — do it opportunistically, not automatically.

**Commit 1:** `fix(ai): require slide_number on every flashcard and question in processor prompt`.
**Commit 2:** `feat(admin): add /api/admin/reprocess/[internalId] for slide-ref backfill`.

**End of Slice 5.** Push.

---

## Slice 6 — Random greetings (Feature 1)

Branch: `feat/random-greetings`. Small, satisfying warm-up.

### Plan
Follow development_plan_v3 §1 exactly.

1. Create `lib/greetings.ts`:
   ```ts
   export const genericGreetings: string[] = [
     "Welcome back — ready to study?",
     "Good to see you. Pick a lecture.",
     "Let's make today count.",
     // ... 15-20 total
   ];
   export const primaryGreetings: string[] = [
     "Hi Haley 💛 you've got this.",
     "Back at it, Haley. One lecture at a time.",
     // ... 15-20 Haley-specific
   ];

   function hash(s: string): number {
     let h = 2166136261;
     for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
     return h >>> 0;
   }

   export function pickGreeting(userId: string, isPrimary: boolean): string {
     if (!userId) return genericGreetings[0];
     const utcDay = new Date().toISOString().slice(0,10);
     const seed = hash(userId + '|' + utcDay);
     const pool = isPrimary ? primaryGreetings : genericGreetings;
     return pool[seed % pool.length];
   }
   ```
2. Update `components/Dashboard.tsx` — replace the inline Haley-only affirmations array with `pickGreeting(user.id, isPrimary)`. `isPrimary` comes from the `user_profiles.is_primary` column (resolved in prereq P6).
3. Add `__tests__/greetings.test.ts` (vitest, wired in P7) asserting determinism for same-day same-user and variation across users/days.

**Commit 1:** `feat(greetings): add greetings lib with deterministic daily rotation per user`.
**Commit 2:** `feat(dashboard): use pickGreeting for primary and generic users`.

**End of Slice 6.** Push.

---

## Slice 7 — Header nav + layout polish (Features 9, 10; Fix #8)

Branch: `feat/header-nav-and-layout`. Biggest UX shift of v3.

### Plan
Follow development_plan_v3 §9 and §10.

1. **Header nav desktop.** Add nav between wordmark and right-side controls:
   ```tsx
   <nav className="smd-header-nav">
     <NavLink href="/app">My Lectures</NavLink>
     <NavLink href="/app/plans">My Plans</NavLink>
     <NavLink href="/app/progress">Progress</NavLink> {/* new route */}
     {isAdmin && <NavLink href="/admin">Admin</NavLink>}
   </nav>
   ```
   Active route gets an underline accent (use `usePathname()` to compare).

2. **Header nav mobile.** The settings gear (added in Slice 1) opens a drawer that contains the same nav + theme picker + sign-out.

3. **Create `/app/progress`** — stub for now: `app/app/progress/page.tsx` renders a "Coming soon" or a basic mastery-by-lecture table. The `GET /api/progress/summary` endpoint can be deferred to a follow-up commit.

4. **Dashboard layout changes** (Feature 10):
   - Remove Upload + Custom Session buttons from header (they're now in the action row below tabs — which are added in Slice 10). For now, place the action row above the filter bar:
     ```tsx
     <div className="smd-action-row">
       <button className="smd-btn-primary" onClick={openUpload}>Upload</button>
       <button className="smd-btn-secondary" onClick={openCustom}>Custom Session</button>
       <button className="smd-icon-btn" aria-label="Manage lectures" onClick={toggleManage}>
         <PencilIcon/>
       </button>
     </div>
     ```
   - Remove "My Lectures" and "Manage Lectures" buttons from anywhere they duplicate these.

**Commit 1:** `feat(header): add desktop nav with active-route styling`.
**Commit 2:** `feat(header): mobile drawer with nav + theme + sign-out`.
**Commit 3:** `feat(dashboard): move Upload and Custom Session out of header into action row`.
**Commit 4:** `feat(routes): add /app/progress stub route`.

**End of Slice 7.** Push.

---

## Slice 8 — Editable lecture topics (Feature 8 from plan; item #7 in user list)

Branch: `feat/editable-topics`. Required for the Review tab topic navigation (Slice 10).

### Plan
Follow development_plan_v3 §8.

**Schema migration (commit with SQL in `decisions.md` and `supabase/migrations/`):**
```sql
ALTER TABLE public.user_lecture_settings
  ADD COLUMN IF NOT EXISTS topics_override jsonb;
-- null = use lectures.topics; jsonb string[] = override
```

**API:** `PUT /api/lectures/settings` already accepts partial updates — add `topics_override` to its allowed fields (null or `string[]`).

**Components:**
- `components/LectureViewModal.tsx` — add "Edit topics" toggle. Edit mode: each topic becomes an editable row with rename / reorder (dnd-kit) / delete / add. Save → PUT `/api/lectures/settings` with `{ topics_override }`.
- `components/ManageLectureCard.tsx` — same edit UI, inline.
- `hooks/useUserLectures.ts` — resolve `display_topics = settings.topics_override ?? lectures.topics`. Add to the returned lecture object.
- Every consumer of `lecture.topics` for **display** switches to `lecture.display_topics`. Consumers that need the canonical server-side topic list (flashcard filtering, progress aggregation) keep reading `lectures.topics` — the rename-orphans issue is handled by a translation layer: `originalIndex → displayName`.

**Translation layer** in `useUserLectures.ts`:
```ts
function resolveDisplayTopic(
  originalTopic: string,
  originalIndex: number,
  topics: string[],
  override: string[] | null
): string {
  if (!override) return originalTopic;
  return override[originalIndex] ?? '(untitled)';
}
```
Store overrides **index-aligned** with `lectures.topics`. To delete: set that index to empty string and filter at display time → "Uncategorized" for associated cards.

**Commit 1:** `feat(db): add user_lecture_settings.topics_override`.
**Commit 2:** `feat(api): accept topics_override in /api/lectures/settings`.
**Commit 3:** `feat(topics): editable topics UI in LectureViewModal and ManageLectureCard`.

**End of Slice 8.** Push.

---

## Slice 9 — Lecture-grid folders (Feature 3; item #3)

Branch: `feat/folders`. Non-trivial; budget a day.

### Plan
Follow development_plan_v3 §3 exactly.

**Schema migration** (three SQL statements, commit all together):
```sql
CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text DEFAULT '📁',
  color text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own folders" ON public.folders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Convert user_lecture_settings.group_id from text to uuid
ALTER TABLE public.user_lecture_settings
  ALTER COLUMN group_id TYPE uuid USING NULLIF(group_id, '')::uuid,
  ADD CONSTRAINT user_lecture_settings_group_fk
    FOREIGN KEY (group_id) REFERENCES public.folders(id) ON DELETE SET NULL;

CREATE TRIGGER folders_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

**API routes:**
- `GET /api/folders` — tree for current user.
- `POST /api/folders` — create. Validate: no cycle (no self-parent; reject if parent_id points into own subtree).
- `PATCH /api/folders/[id]` — rename, recolor, move parent (run cycle check).
- `DELETE /api/folders/[id]` — cascade deletes subfolders; sets child lectures' `group_id` to null.
- Extend `PUT /api/lectures/settings` to accept `group_id` updates.

**Cycle prevention** in POST/PATCH:
```ts
async function wouldCreateCycle(folderId: string, newParentId: string | null, supabase): Promise<boolean> {
  if (!newParentId) return false;
  if (folderId === newParentId) return true;
  let cursor = newParentId;
  while (cursor) {
    if (cursor === folderId) return true;
    const { data } = await supabase.from('folders').select('parent_id').eq('id', cursor).maybeSingle();
    cursor = data?.parent_id ?? null;
  }
  return false;
}
```

**Components:**
- `components/FolderTree.tsx` — recursive tree for `/app` sidebar (collapsible on mobile).
- `components/FolderTile.tsx` — folder tile in the main grid.
- `components/Dashboard.tsx` / `LectureGrid.tsx` — filter by current folder (URL state `?folder=<uuid>`), breadcrumb navigation, mixed rendering of `FolderTile` + `LectureCard`.
- `components/CustomSessionModal.tsx` — "From folder" picker pre-selects folder's lectures.
- Study-plan creation — folder picker expands to its lectures.

**dnd-kit drag-to-container:** wrap `LectureGrid` in a `DndContext`; each `FolderTile` is a `useDroppable`; each `LectureCard` is a `useDraggable`. On drop, PATCH lecture `group_id`.

**Commit 1:** `feat(db): folders table + group_id foreign key`.
**Commit 2:** `feat(api): /api/folders CRUD with cycle prevention`.
**Commit 3:** `feat(folders): FolderTree and FolderTile components`.
**Commit 4:** `feat(folders): dashboard filters by folder; breadcrumb navigation`.
**Commit 5:** `feat(folders): drag-to-folder and folder picker in Custom Session`.

**End of Slice 9.** Push.

---

## Slice 10 — Review mode + 3-tab grid (Features 4, 5; items #4, #5 partial)

Branch: `feat/review-and-tabs`. This is the biggest AI-dependent feature.

### Plan
Ship tabs first (Feature 5), then Review with annotations (Feature 4). Split across multiple commits.

**Tabs (Feature 5) — no schema, no API changes:**

1. Modify `components/Dashboard.tsx` — add tab strip above action row:
   ```tsx
   const [tab, setTab] = useState<'review'|'learn'|'practice'>(searchParams.get('tab') as any || 'learn');
   <div role="tablist" className="smd-tabs">
     <button role="tab" aria-selected={tab==='review'}   onClick={() => setTab('review')}>Review</button>
     <button role="tab" aria-selected={tab==='learn'}    onClick={() => setTab('learn')}>Learn</button>
     <button role="tab" aria-selected={tab==='practice'} onClick={() => setTab('practice')}>Practice</button>
   </div>
   ```
   URL state: `?tab=learn` (push to URL, don't replace, for back-button).

2. Modify `components/LectureCard.tsx` — remove per-card Flashcards / Exam buttons. Card body becomes a click target; click fires the tab-appropriate modal:
   - `tab === 'review'` → open `SlideReviewView` (pre-built next).
   - `tab === 'learn'` → open `FlashcardConfigModal`.
   - `tab === 'practice'` → open `ExamConfigModal`.

3. Modify `components/LectureViewModal.tsx` — existing "Flashcards" / "Practice Exam" buttons become "Review" / "Learn" / "Practice".

**Commit 1:** `feat(dashboard): add Review/Learn/Practice tab strip with URL state`.
**Commit 2:** `feat(lecture-card): whole-card click opens tab-appropriate modal`.

**Review tab + annotations (Feature 4):**

**Schema migration:**
```sql
CREATE TABLE public.slide_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_id text NOT NULL REFERENCES public.lectures(internal_id) ON DELETE CASCADE,
  slide_number integer NOT NULL,
  body text NOT NULL,
  model_used text NOT NULL,
  generated_at timestamptz DEFAULT now(),
  UNIQUE (internal_id, slide_number)
);
ALTER TABLE public.slide_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read annotations" ON public.slide_annotations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service role writes annotations" ON public.slide_annotations
  FOR ALL TO public USING (auth.role() = 'service_role');
```

**API:**
- `GET /api/lectures/[id]/annotations` — returns all annotations.
- `POST /api/lectures/[id]/annotations` — body `{ slideNumbers?: number[] }`. For each slide, skip if annotation exists; else call Claude with slide image URL + lecture title + topics.
  - Gate with `checkLimits(userId)`.
  - Use `MODEL_DEFAULT` (Haiku).
  - Use `buildSystemWithCache()` with the new prompt.
  - After each successful call, `increment_api_usage`.

**New prompt:** `lib/slide-annotation-prompt.ts`. 3–5 sentence markdown explanation, plain English, clinical context, mnemonic if apt. Cap ~500 output tokens per slide.

**Components:**
- `components/study/SlideReviewView.tsx` — slide-by-slide viewer. Left: slide image (uses existing slide thumbnail URLs). Right: annotation markdown (react-markdown). Arrow keys / swipe to navigate. Skeleton shown while annotation loads; triggers POST if missing.
- `app/app/study/review/page.tsx` — route entry; reads `?lectureId=` from URL.

**Commit 3:** `feat(db): slide_annotations table with RLS`.
**Commit 4:** `feat(api): /api/lectures/[id]/annotations with cost gating and cache-control`.
**Commit 5:** `feat(ai): slide annotation prompt with medical-student voice`.
**Commit 6:** `feat(review): SlideReviewView component + /app/study/review route`.

**End of Slice 10.** Push.

---

## Slice 11 — Worksheets (Feature 6; item #5)

Branch: `feat/worksheets`.

### Plan
Follow development_plan_v3 §6.

**Schema:**
```sql
ALTER TABLE public.lectures
  ADD COLUMN kind text NOT NULL DEFAULT 'lecture'
    CHECK (kind IN ('lecture', 'worksheet'));
```

**API:**
- `POST /api/upload` accepts `kind` field.
- `POST /api/generate` branches on `kind`. For `worksheet`, uses `lib/worksheet-processor-prompt.ts` (new) which requests only `questions[]` (no flashcards, no slide extraction).
- `GET /api/lectures` returns `kind`.

**New prompt:** `lib/worksheet-processor-prompt.ts`. Inputs: worksheet PDF/text. Outputs: board-style questions (MCQ, short-answer), each with explanation.

**Components:**
- `components/UploadModal.tsx` — add "Content type" radio: Lecture / Worksheet.
- `components/LectureCard.tsx` — worksheets get a "Worksheet" badge.
- `components/Dashboard.tsx` — worksheets hidden in Review and Learn tabs; only appear in Practice.
- `components/LectureViewModal.tsx` — "Change type" action (lecture ↔ worksheet).

**Commit 1:** `feat(db): lectures.kind (lecture | worksheet)`.
**Commit 2:** `feat(ai): worksheet processor prompt (questions only)`.
**Commit 3:** `feat(upload): content-type picker; Worksheet badge; Practice-only rendering`.

**End of Slice 11.** Push.

---

## Slice 12 — Lecture packages / subscriptions (Feature 2; item #2)

Branch: `feat/lecture-packages`. Depends on Prereq P1.

### Plan
Follow development_plan_v3 §2.

**Schema:**
```sql
CREATE TABLE public.lecture_packages (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  lecture_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.lecture_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read packages" ON public.lecture_packages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin writes packages" ON public.lecture_packages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles
                 WHERE user_id = auth.uid() AND role = 'admin'));

CREATE TABLE public.user_package_access (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id text REFERENCES public.lecture_packages(id) ON DELETE CASCADE,
  source text NOT NULL,
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (user_id, package_id)
);
ALTER TABLE public.user_package_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own access" ON public.user_package_access
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin manages access" ON public.user_package_access
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles
                 WHERE user_id = auth.uid() AND role = 'admin'));

-- Revise lectures SELECT
DROP POLICY IF EXISTS "lectures: authenticated users can read" ON public.lectures;
CREATE POLICY "lectures: package-scoped read" ON public.lectures
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_package_access upa
      JOIN public.lecture_packages lp ON lp.id = upa.package_id
      WHERE upa.user_id = auth.uid()
        AND lectures.internal_id = ANY(lp.lecture_ids)
        AND (upa.expires_at IS NULL OR upa.expires_at > now())
    )
    OR EXISTS (SELECT 1 FROM public.user_profiles
               WHERE user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM public.user_lecture_settings uls
               WHERE uls.user_id = auth.uid() AND uls.internal_id = lectures.internal_id)
  );
```

**User list framed this as:** *"user_lecture_settings should subscribe users to lecture packages, which would be JSON with all lectures accessible (i.e. PA lectures would be collated in one JSON)."* That matches `lecture_packages.lecture_ids text[]` + `user_package_access` above. The "collated JSON" is `lecture_packages.lecture_ids` — a JSON array of `internal_id` strings. Seed a `pa-year-1-fall-2026` package with all current PA lectures.

**Bootstrap seed package** (apply via admin UI or migration):
```sql
INSERT INTO public.lecture_packages (id, name, description, lecture_ids)
SELECT
  'pa-year-1-fall-2026',
  'PA Year 1 — Fall 2026',
  'All Physical Diagnosis I, Anatomy & Physiology, and Laboratory Diagnosis lectures for PA students.',
  ARRAY(SELECT internal_id FROM public.lectures WHERE course IN
    ('Physical Diagnosis I','Anatomy & Physiology','Laboratory Diagnosis'));

-- Grant to all existing non-admin users
INSERT INTO public.user_package_access (user_id, package_id, source)
SELECT user_id, 'pa-year-1-fall-2026', 'admin_grant'
FROM public.user_profiles
WHERE role IS DISTINCT FROM 'admin'
ON CONFLICT DO NOTHING;
```

**API routes:**
- `GET /api/packages` — list.
- `POST /api/packages/subscribe` — self-grant free tiers.
- `GET /api/admin/packages`, `POST /api/admin/packages`, `PATCH /api/admin/packages/[id]`.

**New-user trigger** — extend `handle_new_user()` or `ensure_user_preferences` to auto-grant `pa-year-1-fall-2026`:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
  INSERT INTO public.user_package_access (user_id, package_id, source)
    VALUES (NEW.id, 'pa-year-1-fall-2026', 'admin_grant')
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
-- Trigger already exists; this is just CREATE OR REPLACE of the function body.
```

**Components:**
- `app/app/subscriptions/page.tsx` — browse packages, show current access.
- `app/admin/packages/page.tsx` + tab in `AdminClient.tsx`.

**Commit 1:** `feat(db): lecture_packages + user_package_access tables with RLS`.
**Commit 2:** `feat(db): package-scoped lectures SELECT policy; admin and self-upload bypass`.
**Commit 3:** `feat(db): seed pa-year-1-fall-2026 package and auto-grant trigger`.
**Commit 4:** `feat(api): /api/packages and /api/admin/packages`.
**Commit 5:** `feat(ui): user subscriptions page and admin package management`.

**End of Slice 12.** Push.

---

## Slice 13 — OSCE case-based practice (Feature 7 Option B; item #6)

Branch: `feat/osce`. Biggest new surface area.

### Plan
Follow development_plan_v3 §7 Option B (structured checklists + media prompts). Option A (AI patient roleplay) is a v3.1 extension.

**Schema** — four tables (`osce_cases`, `osce_checklist_items`, `osce_attempts`, `osce_attempt_scores`) with RLS. See development_plan_v3 §7 Schema block for the DDL. Each table gets at least two policies (read + write as appropriate).

**API:**
- `GET /api/osce/cases` — list.
- `GET /api/osce/cases/[id]` — detail (case + checklist items).
- `POST /api/osce/attempts` — start attempt.
- `PATCH /api/osce/attempts/[id]` — mark items complete; save reflection.
- `POST /api/osce/attempts/[id]/grade` — send reflection to Claude for AI score + feedback. Cost-gated.

**Components:**
- `app/app/osce/page.tsx` — list cases (filter by course).
- `app/app/osce/[id]/page.tsx` — attempt flow.
- `components/osce/ChecklistItem.tsx` — tickable checklist row.
- `components/osce/ScenarioMedia.tsx` — image/video/audio renderer for `prompt_media_urls`.
- Timer — reuse existing Pomodoro timer logic where possible (separate instance).

**New prompt:** `lib/osce-grader-prompt.ts`. Inputs: case title, scenario, checklist, user's reflection. Outputs: AI score (0–100) + feedback markdown + per-item flags.

**Admin UI for case management** — defer to a follow-up mini-sprint; seed a few cases manually via SQL or Supabase UI so the student surface can ship first.

**Commit 1:** `feat(db): osce_cases, osce_checklist_items, osce_attempts, osce_attempt_scores with RLS`.
**Commit 2:** `feat(api): /api/osce/cases and /api/osce/attempts CRUD`.
**Commit 3:** `feat(ai): OSCE reflection grader prompt + /api/osce/attempts/[id]/grade`.
**Commit 4:** `feat(osce): /app/osce list and detail pages with timer`.
**Commit 5:** `feat(osce): checklist item and scenario media components`.
**Commit 6:** `feat(osce): seed three starter cases (Chest pain, Abdominal pain, SOB)`.

**End of Slice 13.** Push.

---

## Mapping — user's 23 items → slices

| User item | Category | Slice |
|---|---|---|
| 1. Random greetings | feat | 6 |
| 2. Lecture packages | feat | 12 |
| 3. Folders | feat | 9 |
| 4. Review mode | feat | 10 |
| 5. Worksheets | feat | 11 |
| 6. OSCE practice | feat | 13 |
| 7. Topic editing | feat | 8 |
| 8. My Plans / My Lectures in header | feat | 1 (stub) + 7 (full) |
| 9. No slide ref (flashcards) | fix | 5 |
| 10. Double-tap kebab | fix | 3 |
| 11. internal_ids not set | fix | 5 |
| 12. Mobile header missing gear + theme | fix | 1 |
| 13. Mobile pomodoro absent | fix (docs only) | 1 |
| 14. Header banner thin on iOS | fix | 1 |
| 15. Mobile layout cramped | fix | 4 |
| 16. Swipe-down modal dismiss | fix | 2 |
| 17. Modal X hidden on mobile Chrome | fix | 2 |
| 18. Kebab won't close on second tap | fix | 3 |
| 19. Custom Session close not pinned | fix | 2 |
| 20. Saving… indicator jitter | fix | 2 |
| 21. StudyMD wordmark → dashboard | fix | 1 |
| 22. Admin "click to edit" visible to users | fix | 4 |
| 23. Profile theme "lavender" → "pink" | fix | 4 |

---

## Per-commit checklist

Every commit you push must pass this:

- [ ] `npm run build` succeeds (no TS errors; no Next.js build errors).
- [ ] `npm run typecheck` clean (once P7 lands).
- [ ] New Anthropic calls gated by `checkLimits` and recorded via `increment_api_usage`.
- [ ] New tables have RLS enabled and at least one policy.
- [ ] Schema changes recorded in `decisions.md` AND `supabase/migrations/` (once P8 lands).
- [ ] `todo.md` updated (move item from Next → Recently completed).
- [ ] `plan.md` checkbox flipped if the item appears there.
- [ ] Commit message follows conventional-commits; body explains the why and references the slice.
- [ ] `git push origin <branch>` (or `origin main` if working trunk-based).

---

## Verification scripts (run before merging each slice)

```bash
# Slice 0 — prereqs
npm run build
# In Supabase SQL editor:
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
SELECT proname, prosecdef, proconfig FROM pg_proc
  WHERE pronamespace='public'::regnamespace AND prosecdef=true;

# Slice 1 — header
# Chrome DevTools mobile (iPhone 14 Pro) → /app → verify gear, theme picker, wordmark link, banner sticky

# Slice 2 — modals
# Mobile viewport → open each modal → verify X always visible, background doesn't scroll, sticky footer

# Slice 3 — kebab
# iOS Safari (or DevTools touch emulation) → tap kebab (opens) → tap kebab (closes) → tap outside (closes)

# Slices 6-13 — feature-specific verification is in development_plan_v3.md's
# "Verification" subsection for each feature.
```

---

## When in doubt

- **Conflict between this guide and `CLAUDE.md`** → `CLAUDE.md` wins; it's pinned convention.
- **Conflict between this guide and `development_plan_v3.md`** → the plan wins for feature design details; this guide wins for execution ordering.
- **Something feels wrong / ambiguous** → stop, read the file the conflict points to, and if still unclear, ask the user before coding. Prefer a short clarifying question to a large rollback.

---

*End of execution guide. Update `todo.md` as you work. Append ADRs to `decisions.md` for any non-obvious choice. Commit often; push often.*
