# Claude Code Execution Guide — StudyMD v3 (Revised after screenshot audit)

**Revision note:** This is a revision of the original execution guide after auditing live screenshots. Several fixes from the original guide are already shipped (Fix #12 mobile gear/theme picker, partial mobile kebab behavior) or need to be reframed. New bugs surfaced in the screenshots are folded in.

**North star — minimalism.** StudyMD has a lot of features. Users will be overwhelmed if the UI shows everything at once. Every slice in this guide is judged against: *does this reduce visual density, reduce decision load, and surface the right thing at the right time?* When two approaches are equally correct, pick the one with **fewer visible controls**.

**Authoritative references (read before coding):**
- [`CLAUDE.md`](./CLAUDE.md), [`architecture.md`](./architecture.md), [`documentation.md`](./documentation.md)
- [`development_plan_v3.md`](./development_plan_v3.md), [`recommendations.md`](./recommendations.md)
- [`decisions.md`](./decisions.md), [`plan.md`](./plan.md), [`todo.md`](./todo.md)

---

## 🚨 Hard rules — unchanged

1. **Middleware filename is `proxy.ts`.** Never create `middleware.ts`. The exported function is `proxy`, not `middleware`. See ADR-006.
2. **Role checks never in `proxy.ts`.** Edge runtime can't query Postgres reliably. See ADR-007.
3. **One commit per feature or fix.** After every change: `git add <files>`, `git commit -m "<type>(<scope>): <summary>"`, `git push origin <branch>`. Use conventional prefixes.
4. **Schema changes are dual-tracked** — MCP `apply_migration` + `decisions.md` ADR + (once P8 lands) `supabase/migrations/` file.
5. **Anthropic call discipline** — `checkLimits` before, `increment_api_usage` after, `MODEL_DEFAULT` (Haiku), `buildSystemWithCache()` for system prompts.
6. **Every new table** gets RLS + at least one policy in the same migration.
7. **Theme key is `'pink'`** (not `'lavender'`) in the schema; UI label must read **Pink**.
8. **Mobile breakpoint: 768px.** Test on iPhone 14 Pro (390×844) and iPad Mini (768×1024) simulations.
9. **`npm run build` before every commit** (until P7 adds `typecheck` / `lint`). A failed build is a failed commit.
10. **Filesystem MCP:** batch reads with `read_multiple_files`; atomic multi-location patches with `edit_file`.

---

## What the screenshots confirm is already done (removed from the guide)

| Originally in | Status | Evidence |
|---|---|---|
| **Slice 1, Fix #12** — mobile settings gear + theme picker | ✅ **Done** | Image 3 shows a working settings dropdown on mobile with Midnight/Pink/Forest picker, Profile & Settings link, Sign out. **Removed from guide.** |
| **Slice 3, Fix #10** — double-tap kebab | ✅ **Partially done** — opens on first tap (Image 7). The original double-tap bug is fixed. A **new** positioning bug is not. **Rewritten in Slice 3.** |
| **Slice 4, Fix #23** — "Lavender" → "Pink" | ⚠️ **Partially done.** Mobile settings dropdown (Image 3) correctly shows "Pink". Profile page (Image 4) still shows "Lavender". **Narrowed to profile page only.** |
| **Slice 1, Fix #14** — thin iOS header | ⚠️ **Unverifiable from screenshots; keep as-is.** |
| **Slice 1, Fix #21** — wordmark → dashboard link | ⚠️ **Unverifiable.** Keep in guide; low cost to re-check. |

---

## New bugs surfaced in screenshots (added to the guide)

| New # | Bug | Slice |
|---|---|---|
| N1 | Greeting shows username (`hnlange98`) instead of display name | 1 |
| N2 | Title/subtitle/stats left-aligned; should be centered (see §Minimalism) | 1 |
| N3 | Study Plan widget bleeds off screen on mobile (Image 1: "58 DAYS TO TEST" cut off) | 1 |
| N4 | Filter bar + "Your Lectures" / "Course" labels not aligned | 4 |
| N5 | Manage Lectures / Custom Session / My Lectures are hidden behind a `⋯` button next to "Your Lectures" (Image 2) — reveal them | 1 |
| N6 | Theme-picker "Saving…" appears below colors; should be left of "Theme" title | 2 |
| N7 | Kebab menu opens misaligned and shifts when submenu opens (Image 7) | 3 |
| N8 | Selected-text highlight is nearly invisible (Image 5, "PAS 5216 Chp 19") | 4 |
| N9 | Theme color resets to previous when returning to Dashboard | 2 |
| N10 | Lecture card color changes only persist via right-click / Manage Mode, not via kebab | 3 |
| N11 | Admin upload should bypass standard cost limits | new Slice A1 |
| N12 | Upload processing should continue if user navigates away | new Slice A2 |
| N13 | "Running Claude" progress step is too vague | new Slice A2 |
| N14 | Desktop header: greeting wraps awkwardly; timer + stats crowd right side | 1 |
| N15 | Admin panel needs a Courses section (or merge into Lectures) | new Slice A3 |
| N16 | Admin should be able to reach `/admin` from `/app` dashboard | new Slice A3 |
| N17 | Flashcards need a "Review missed only" mode | new Slice F1 |

---

## Revised execution order — 13 slices (was 11 + 3 new admin/flashcard slices)

| # | Slice | Scope | Est. commits |
|---|---|---|---|
| 0 | Prereqs (unchanged) | P1–P8 | 8 |
| 1 | **Dashboard simplification** (new) | N1, N2, N3, N5, N14, #21, #8-stub | 6 |
| 2 | Mobile modal correctness | #16, #17, #19, #20, N6, N9 | 5 |
| 3 | Kebab menu correctness | N7, N10, #18 | 2 |
| 4 | Global polish | #15, #22, #23, N4, N8 | 5 |
| 5 | Slide ref + internal_id fixes | #9, #11 | 2 |
| 6 | Feat #1 — Random greetings (with display name) | Feature 1 + N1 integration | 2 |
| 7 | Feat #8 — Header nav expansion (full) | Feature 9 + 10 + #8 finalization | 3 |
| 8 | Feat #7 — Topic editing | Feature 8 | 3 |
| 9 | Feat #3 — Folders | Feature 3 | 5 |
| 10 | Feat #4,#5 — Review mode + 3-tab grid | Features 4 + 5 | 6 |
| 11 | Feat #6 — Worksheets | Feature 6 | 3 |
| 12 | Feat #2 — Lecture packages | Feature 2 | 5 |
| 13 | Feat #6-OSCE — Case-based practice | Feature 7 (Option B) | 6 |
| A1 | **Admin upload path** (new) | N11 | 2 |
| A2 | **True background processing** (new) | N12, N13 | 4 |
| A3 | **Admin panel additions** (new) | N15, N16 | 3 |
| F1 | **Flashcards: missed-only mode** (new) | N17 | 1 |

Admin and flashcard slices (A1–A3, F1) ship after Slice 5 but before Slice 10 (they don't block each other).

---

## Slice 0 — Prerequisites (unchanged)

See original guide §Slice 0. Eight commits: P1 RLS on `subscription_tiers`; P2 admin UUID replacement; P3 tighten `slides` bucket; P4 `system_config` documentation; P5 `search_path` on SECURITY DEFINER; P6 `is_primary` source-of-truth; P7 typecheck/lint/test scripts; P8 migrations workflow.

---

## Slice 1 — Dashboard simplification ⭐ (new)

Branch: `feat/dashboard-simplification`. **This is the biggest single UX move of v3.** Every change here serves minimalism: fewer hidden controls, better alignment, fewer awkward wraps.

### Design principle for the dashboard
Before coding, read this and pin it:
- **One primary action row, always visible.** Upload + Custom Session + Manage (pencil) never hide behind a `⋯`.
- **Centered hero.** Title, subtitle, and stats share a centered column on both mobile and desktop.
- **Responsive Study Plan card.** Never clips. Days-to-test badge moves below the title on narrow viewports instead of being cut off.
- **Pomodoro + stats demote to right-of-widget** on desktop, and **below the plan card** on mobile. They are not the star of the screen; the lectures are.

### Target layout (desktop ≥1024px)
```
┌───────────────────────────────────────────────────────────────────┐
│ Header: [StudyMD]  [My Lectures | My Plans | Progress]  [↑][⚙]    │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│                 Welcome back, Haley — master your                 │
│                        lectures with ease.                        │
│              0% AVG · 17 LECTURES · 🔥 0 DAY STREAK               │
│                                                                   │
│ ┌───────────────────────────────────────┐  ┌────────────────────┐ │
│ │ TODAY'S PLAN                          │  │  25:00             │ │
│ │ Quarter 2 A&P           58 days to test│  │  STUDY BLOCK    ▶  │ │
│ │ 1  🧠 The Brain                       │  └────────────────────┘ │
│ │ [▶ Start Today's Review]  View plan → │                         │
│ └───────────────────────────────────────┘                         │
│                                                                   │
│     [↑ Upload]  [Custom Session]  [✎ Manage]                      │
│     All · Anatomy & Physiology · Demo · Lab · Physical · Archived │
├───────────────────────────────────────────────────────────────────┤
│                         Lecture grid                              │
└───────────────────────────────────────────────────────────────────┘
```

### Target layout (mobile ≤768px)
```
┌──────────────────────┐
│ [StudyMD]    [↑][⚙] │ ← existing gear stays (Fix #12 already done)
├──────────────────────┤
│ Welcome back, Haley  │   (centered)
│ master your lectures │
│  0% · 17 · 🔥0       │   (centered, stats one line)
├──────────────────────┤
│ TODAY'S PLAN         │
│ Quarter 2 A&P        │
│           58 DAYS    │   (days badge below on narrow)
│ 1 🧠 The Brain       │
│ [▶ Start] View →     │
├──────────────────────┤
│ [↑][Custom][✎]       │   (single row, always visible)
│ All · A&P · Demo …   │   (horizontal scroll pills)
├──────────────────────┤
│ Lecture grid         │
└──────────────────────┘
```

### Commits

**Commit 1.1 — Fix greeting to use display name (N1)**
**Files:** `components/Dashboard.tsx`, `lib/supabase-server.ts`.

The greeting currently reads `user.user_metadata.username` or similar. It should read the user's display name from `user_profiles.display_name` (already exists per ADR-004). If `display_name` is null, fall back to the first name from email (`emailLocalPart.split('.')[0]`), never the full username.

```ts
function getDisplayName(profile: UserProfile, user: User): string {
  if (profile?.display_name?.trim()) return profile.display_name.trim();
  const emailLocal = user.email?.split('@')[0] ?? '';
  const firstPart = emailLocal.split(/[._-]/)[0];
  return firstPart
    ? firstPart.charAt(0).toUpperCase() + firstPart.slice(1)
    : 'there';
}
```
Wire it into the Dashboard's Server Component via `fetchUserProfile()`.
**Commit:** `fix(dashboard): greet users by display_name, not username`.

**Commit 1.2 — Center hero block (N2)**
**Files:** `components/Dashboard.tsx`, `styles/themes.css` or inline style.

Wrap title + subtitle + stats in a single centered column:
```tsx
<section className="smd-hero">
  <h1 className="smd-hero-title">Welcome back, {name} — master your <em>lectures</em> with ease.</h1>
  <p className="smd-hero-subtitle">Select a lecture below to study with adaptive flashcards or challenge yourself with a practice exam.</p>
  <div className="smd-hero-stats">
    <span><strong>{avgScore}%</strong> avg</span>
    <span aria-hidden>·</span>
    <span><strong>{lectureCount}</strong> lectures</span>
    <span aria-hidden>·</span>
    <span>🔥 <strong>{streak}</strong> day streak</span>
  </div>
</section>
```
```css
.smd-hero { text-align: center; max-width: 860px; margin: 2rem auto 1.5rem; }
.smd-hero-title { font-size: clamp(1.5rem, 3.5vw, 2.75rem); line-height: 1.2; }
.smd-hero-subtitle { color: var(--smd-text-muted); margin-top: 0.5rem; }
.smd-hero-stats { display: flex; justify-content: center; gap: 0.75rem; margin-top: 1rem; color: var(--smd-text-muted); }
```
**Commit:** `feat(dashboard): center hero title, subtitle, and stats row`.

**Commit 1.3 — Move Pomodoro + stats pills into dashboard right column on desktop, below plan on mobile (N14)**
**Files:** `components/Dashboard.tsx`, `components/PomodoroPill.tsx` (if the Pomodoro lives in Header today, lift it into the dashboard area instead).

Currently Pomodoro + stats sit to the right of the hero on desktop, compressing the title into an awkward wrap (Image 6: "Welcome back, hnlange98, master your" / "lectures with ease."). Move them:

- **Desktop:** right of the Today's Plan card (a two-column grid below the centered hero).
- **Mobile:** stacked directly below the plan card.

```tsx
<div className="smd-dashboard-columns">
  <div className="smd-plan-col"><TodaysPlanCard /></div>
  <aside className="smd-side-col">
    <PomodoroPill />
    <StatsPill avg={avgScore} lectures={lectureCount} streak={streak} />
  </aside>
</div>
```
```css
.smd-dashboard-columns { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 1024px) {
  .smd-dashboard-columns { grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr); align-items: start; }
}
```
**Important:** the stats pill was rendered inline inside the hero in Commit 1.2 — that was the placeholder. When this commit lands, move the stats rendering into `<aside className="smd-side-col">` and remove the inline stats from the hero. The hero ends up with just title + subtitle (no stats).

**Note about user request N14 / user's new-feature #7:** the user said "the pomodoro timer and stats can be moved down to the right of the widget." This commit is that move.
**Commit:** `feat(dashboard): two-column layout — plan left, pomodoro + stats right (desktop); stacked on mobile`.

**Commit 1.4 — Responsive Study Plan card (N3)**
**Files:** `components/TodaysPlanCard.tsx` (or wherever the plan renders).

Image 1 shows "58 DAYS TO TEST" clipped off the right edge on mobile. Fix:
```css
.smd-plan-card {
  container-type: inline-size;
}
.smd-plan-card-head {
  display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start;
  gap: 0.5rem 1rem;
}
.smd-plan-days {
  font-size: clamp(1.5rem, 4cqw, 2.75rem); /* shrinks inside the card's inline size */
  white-space: nowrap;
}
@container (max-width: 380px) {
  .smd-plan-days-wrapper { width: 100%; text-align: right; }
  .smd-plan-days { font-size: 1.5rem; }
}
```
Use container queries (supported in all modern browsers as of 2026-04) so the card responds to its own width, not the viewport's. This is safer than breakpoint-tied rules.
**Commit:** `fix(plan-card): responsive days-to-test badge using container queries`.

**Commit 1.5 — Reveal Upload / Custom Session / Manage as an action row (N5)**
**Files:** `components/Dashboard.tsx`, `components/FilterBar.tsx`, and wherever the `⋯` menu currently hides these.

Image 2 shows a `⋯` button next to "Your Lectures" (17) that hides Upload, Custom Session, and Manage Lectures. **Surface them as a single visible action row.** Per the user's direction:
- **Upload** — primary button, always visible.
- **Custom Session** — secondary button, always visible.
- **Manage Lectures** — pencil icon button (discrete), always visible on desktop AND mobile.
- **My Lectures** — keep accessible from the header dropdown (already addressed by the gear menu in Image 3; needs a "My Lectures" link added per Slice 7).

Delete the `⋯` menu near "Your Lectures" entirely.
```tsx
<div className="smd-action-row">
  <button className="smd-btn-primary" onClick={openUpload}>
    <UploadIcon /> Upload
  </button>
  <button className="smd-btn-secondary" onClick={openCustomSession}>
    Custom Session
  </button>
  <button className="smd-icon-btn" onClick={toggleManageMode} aria-label="Manage lectures" title="Manage lectures">
    <PencilIcon />
  </button>
</div>
```
```css
.smd-action-row {
  display: flex; gap: 0.5rem; align-items: center;
  margin: 1rem 0 0.75rem;
}
.smd-icon-btn {
  width: 44px; height: 44px;
  display: grid; place-items: center;
  border: 1px solid var(--smd-border); border-radius: 10px;
  background: transparent; color: var(--smd-text);
}
.smd-icon-btn:hover { background: var(--smd-surface-hover); }
```
**Commit:** `feat(dashboard): expose Upload, Custom Session, and Manage (pencil) as a visible action row`.

**Commit 1.6 — Wordmark link + header nav stubs (#21, #8 partial)**
**Files:** `components/Header.tsx`.
```tsx
<Link href={user ? "/app" : "/"} className="smd-header-logo" prefetch={false}>StudyMD</Link>
<nav className="smd-header-nav">
  <NavLink href="/app">My Lectures</NavLink>
  <NavLink href="/app/plans">My Plans</NavLink>
</nav>
```
The "My Lectures" link also appears inside the gear drawer on mobile (per user's instruction — mobile can keep it in the dropdown). Full nav treatment with active-state styling lands in Slice 7.
**Commit:** `feat(header): wordmark links to dashboard; add My Lectures and My Plans nav stubs`.

**End of Slice 1.** Smoke test on iPhone 14 Pro and iPad Mini and desktop 1440px. Push.

---

## Slice 2 — Mobile modal correctness + theme persistence

Branch: `fix/modals-and-theme-persistence`. Combines the original modal slice with two new theme bugs.

### Commits

**Commit 2.1 — `useModalShell` hook (#17)**
Unchanged from original guide: scroll-lock + `100dvh` + safe-area padding + sticky close. See original Slice 2.
**Commit:** `fix(modals): mobile Chrome full-screen modals fit viewport and lock background scroll`.

**Commit 2.2 — Sticky header with drag handle + sticky footer (#16, #19)**
Unchanged from original guide.
**Commit:** `fix(modals): sticky header with drag handle; sticky primary-action footer`.

**Commit 2.3 — "Saving…" moves to top-left of Theme label, not below (N6 / user's new-bug list item #6)**
**Files:** `components/SettingsMenu.tsx` (or wherever the theme picker lives inside the gear dropdown).

User's exact wording: *"When changing colors, the 'saving' will show up below the three colors, it may be better to appear at the top to the left of the 'Theme' title."*

```tsx
<div className="smd-theme-header">
  <h3>Theme</h3>
  {saveStatus === 'saving' && <span className="smd-saving-inline">Saving…</span>}
  {saveStatus === 'saved'   && <span className="smd-saving-inline is-saved">Saved</span>}
</div>
```
```css
.smd-theme-header {
  display: flex; align-items: baseline; gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.smd-saving-inline {
  font-size: 0.75rem; color: var(--smd-text-muted);
  opacity: 0; animation: smd-fade 180ms forwards;
}
.smd-saving-inline.is-saved { color: var(--smd-accent); }
```
Position right of the "Theme" heading (not below). Fade in/out 180ms. Don't push layout — the row reserves space even when idle.
**Commit:** `fix(theme-picker): Saving indicator now appears inline next to "Theme" heading`.

**Commit 2.4 — Theme persists across route changes (N9)**
**Files:** `hooks/useTheme.ts` (or wherever theme state lives), `app/app/layout.tsx`, `styles/themes.css`.

User-reported bug: "Theme color changes are resetting upon returning to Dashboard." Likely cause: theme is stored in React state that resets when the Dashboard Server Component re-mounts, and the server-side value (`user_preferences.theme`) wasn't updated in time (optimistic client state isn't persisted).

Fix:
1. **Optimistic + persisted:** when user clicks a theme, (a) update local state via `useTheme`, (b) write to localStorage immediately as fallback, (c) fire PUT `/api/preferences` with `{ theme }`, (d) show Saving → Saved.
2. **On mount,** Server Component reads from `user_preferences.theme` as the source of truth; Client Component reconciles with localStorage for the first render to avoid FOUC.
3. **Apply theme via `data-theme` attribute on `<html>`** so it survives navigations without re-hydration flicker:
   ```ts
   // In the theme change handler:
   document.documentElement.dataset.theme = next;
   localStorage.setItem('smd_theme', next);
   await fetch('/api/preferences', { method: 'PUT', body: JSON.stringify({ theme: next }) });
   ```
4. **`app/app/layout.tsx`** writes the `data-theme` attribute in a small inline script (to beat hydration) reading from a cookie mirrored off `user_preferences`:
   ```tsx
   // In the RootLayout server component:
   const theme = await getUserTheme(); // reads user_preferences.theme
   return (
     <html lang="en" data-theme={theme}>
       <head>
         <script dangerouslySetInnerHTML={{ __html: `
           (function(){
             try {
               var t = localStorage.getItem('smd_theme');
               if (t && document.documentElement.dataset.theme !== t) {
                 document.documentElement.dataset.theme = t;
               }
             } catch(e) {}
           })();
         `}} />
       </head>
       <body>{children}</body>
     </html>
   );
   ```
5. **CSS bindings** in `styles/themes.css` use `html[data-theme="pink"] { --smd-accent: …; }` etc.

**Commit:** `fix(theme): persist theme across navigations via data-theme on <html> + localStorage + user_preferences`.

**Commit 2.5 — "Saving…" toast is for page-level saves only; theme picker uses inline indicator (N6 reinforcement)**
**Files:** `components/SaveStatusToast.tsx` (if created in original guide), wherever inline "Saving…" strings still exist.

Context: the original Slice 2 commit #2.4 proposed moving "Saving…" to a top toast. Per the user's clarification, the theme picker specifically wants an **inline** indicator next to the "Theme" heading (Commit 2.3). The toast stays for larger page-level saves (e.g., lecture settings changes that don't have an obvious local UI anchor). Both coexist.

Consolidate the rules in a comment in `SaveStatusContext`:
```ts
// Use rule:
// - Inline indicator (small, next to a local label) — preferred when the save has an obvious UI owner
//   (theme picker, tag editor, topic rename).
// - Top toast — used only for saves with no obvious anchor (bulk operations, page-level preferences).
```
**Commit:** `refactor(save-status): document inline vs toast use rule; audit for stray inline "Saving…" strings`.

**End of Slice 2.** Push.

---

## Slice 3 — Kebab menu correctness

Branch: `fix/kebab-menu`. Image 7 shows two problems:
1. The menu opens to the right of the trigger but at a seemingly arbitrary vertical offset (N7).
2. Submenu (Change Course) opens and **shifts the entire menu's position** — the parent menu reflows when the child appears.

### Commits

**Commit 3.1 — Positioning and submenu stability (N7, #18)**
**Files:** `components/KebabMenu.tsx` (or wherever per-card kebabs live, likely inside `LectureCard.tsx` and `ManageLectureCard.tsx`).

The right fix is to switch to **[Floating UI](https://floating-ui.com)** (`@floating-ui/react`) for positioning. Floating UI handles:
- Flipping when near viewport edges
- Collision detection
- Submenu placement that doesn't reflow the parent
- Focus management and outside-click dismissal

Install:
```bash
npm install @floating-ui/react
```

Rewrite the kebab:
```tsx
import { useFloating, offset, flip, shift, autoUpdate, useClick, useDismiss, useInteractions, useRole, useListNavigation, FloatingFocusManager, FloatingPortal } from '@floating-ui/react';

function KebabMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open, onOpenChange: setOpen,
    placement: 'bottom-end',
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  return (
    <>
      <button ref={refs.setReference} {...getReferenceProps()} aria-label="Card options">⋯</button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
              {items.map(item => <MenuItem key={item.id} {...item} />)}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
```

Submenus (Change Course, Change Color) each get their own floating instance keyed to their parent item, with `placement: 'right-start'`. Because each submenu is portaled, **the parent menu never reflows** when a submenu opens.

Also note: the Floating UI `useDismiss` hook handles the close-on-second-tap and close-on-outside-tap correctly via `pointerdown` under the hood.
**Commit:** `fix(kebab): replace handrolled positioning with Floating UI; stable submenu placement`.

**Commit 3.2 — Color changes from kebab persist (N10)**
**Files:** `components/LectureCard.tsx` (or the kebab's Change Color handler).

User-reported: "Lecture Card color changes are not saving/registering unless they come specifically from the right-click menu or Manage Mode."

Audit the kebab's Change Color action. Likely causes (in order of probability):
1. The kebab's color handler updates local UI state but doesn't call `PUT /api/lectures/settings` with `color_override`.
2. The handler calls the API but with the wrong payload shape (e.g. `{color: '#...'}` vs the expected `{color_override: {midnight: '#...', pink: '#...', forest: '#...'}}` JSONB).
3. The local `useUserLectures` hook doesn't refetch or merge the settings change, so the card re-renders with the old color.

Fix:
1. Pull the color-change handler out of `LectureCard`, `ManageLectureCard`, and the right-click menu into a single hook `useLectureColor(internalId)`:
   ```ts
   export function useLectureColor(internalId: string) {
     const { updateSettings } = useUserLectures();
     return useCallback(async (theme: Theme, colorHex: string) => {
       const settings = await fetch(`/api/lectures/settings/${internalId}`).then(r=>r.json());
       const next = { ...(settings.color_override ?? {}), [theme]: colorHex };
       await updateSettings(internalId, { color_override: next });
     }, [internalId, updateSettings]);
   }
   ```
2. Every entry point (kebab, right-click, Manage Mode) calls this hook. No bespoke handlers.
3. `useUserLectures.updateSettings` optimistically updates local state, fires the PUT, and rolls back on error.
4. Add a `SaveStatusToast` trigger (from Slice 2) so the user sees confirmation.

**Commit:** `fix(lecture-card): unify color-change path through useLectureColor; persist from kebab and manage mode`.

**End of Slice 3.** Push.

---

## Slice 4 — Global polish

Branch: `fix/global-polish`.

### Commits

**Commit 4.1 — Filter bar alignment (N4)**
**Files:** `components/FilterBar.tsx`, `components/Dashboard.tsx`.

"Your Lectures" header + filter bar + "COURSE" label need a shared left alignment. Today (Image 2) "Your Lectures" aligns with the outer container but "COURSE" label aligns with something else, creating visual mismatch.

Fix: wrap the section in a consistent container with identical horizontal padding:
```tsx
<section className="smd-lecture-section">
  <header className="smd-lecture-section-head">
    <h2>Your Lectures <span className="smd-count">{count}</span></h2>
  </header>
  <FilterBar />
  <LectureGrid />
</section>
```
```css
.smd-lecture-section { padding: 0 1rem; }
.smd-lecture-section-head { margin: 1rem 0 0.5rem; }
.smd-filter-bar { padding: 0; margin-bottom: 1rem; }  /* not 0 1rem — parent handles padding */
```
**Commit:** `fix(layout): unify horizontal padding across lecture section header, filter bar, and grid`.

**Commit 4.2 — Text selection highlight visibility (N8)**
**Files:** `styles/themes.css` (or equivalent global CSS).

Image 5 shows "PAS 5216 Chp 19" selected — the highlight is nearly invisible against the dark input background. Cause: no `::selection` CSS, so the browser default (which is designed for light backgrounds) is being used.

Fix — add theme-aware `::selection` rules:
```css
::selection {
  background: color-mix(in srgb, var(--smd-accent) 35%, transparent);
  color: var(--smd-text);
}
::-moz-selection {
  background: color-mix(in srgb, var(--smd-accent) 35%, transparent);
  color: var(--smd-text);
}

/* Inside form inputs specifically, bump contrast a notch */
input::selection, textarea::selection {
  background: color-mix(in srgb, var(--smd-accent) 55%, transparent);
  color: var(--smd-text-strong, #fff);
}
```
Because `--smd-accent` is theme-defined, selection colors automatically track Midnight (blue), Pink, Forest.
**Commit:** `fix(a11y): add theme-aware ::selection rules for readable text highlights`.

**Commit 4.3 — "Lavender" → "Pink" on profile page (#23)**
**Files:** `app/app/profile/page.tsx` or `ProfileClient.tsx`.
Already scoped narrowly since the mobile dropdown is correct (Image 3). Only the profile page theme card (Image 4) shows "Lavender". Fix the label:
```tsx
{ value: 'pink', label: 'Pink' }   // was 'Lavender'
```
Grep for "Lavender" / "lavender" project-wide and fix stray occurrences (the middle swatch color may also need a tiny hue shift if it doesn't match the rest of the pink theme — check by eye against Image 3's pink circle).
**Commit:** `fix(profile): theme label "Lavender" → "Pink"`.

**Commit 4.4 — Admin "click to edit" hidden from non-admins (#22)**
Unchanged from original guide §Slice 4.
**Commit:** `fix(admin): hide "click to edit" affordance from non-admin users`.

**Commit 4.5 — Filter bar cramped on mobile (#15)**
Keep the original guide §Slice 4 Fix #15 approach: establish vertical rhythm; wrap filter pills; horizontal-scroll action row if needed. **Note:** Slice 1 already handled most of this. Commit 4.5 is the cleanup pass — verify nothing regressed.
**Commit:** `fix(mobile): finalize filter bar + action row wrapping (cleanup pass)`.

**End of Slice 4.** Push.

---

## Slice 5 — Slide ref + internal_id fixes (unchanged)

See original guide §Slice 5. Two commits:
- Commit 5.1: `fix(upload): guarantee internal_id on every lecture insert; backfill legacy rows`
- Commit 5.2: `fix(ai): require slide_number on every flashcard and question in processor prompt` (plus optional admin reprocess route for backfill)

---

## Slice 6 — Random greetings (unchanged, but with N1 integration)

See original guide §Slice 6. **Change:** the `pickGreeting(userId, isPrimary)` function's output is now consumed **after** `getDisplayName(profile, user)` from Slice 1 Commit 1.1. The greeting string template becomes:

```ts
// lib/greetings.ts
export function buildGreetingLine(
  displayName: string,
  userId: string,
  isPrimary: boolean
): string {
  const greeting = pickGreeting(userId, isPrimary);
  // Template can include {name}; substitute safely
  return greeting.replace(/{name}/g, displayName);
}
```
Pool entries can now include `{name}`:
```ts
export const genericGreetings = [
  "Welcome back, {name} — ready to study?",
  "Good to see you, {name}. Pick a lecture.",
  "Let's make today count, {name}.",
  // ...
];
export const primaryGreetings = [
  "Hi Haley 💛 you've got this.",
  "Back at it, Haley — one lecture at a time.",
  // ...
];
```
Replace the Dashboard's current title with:
```tsx
<h1 className="smd-hero-title">{buildGreetingLine(displayName, user.id, isPrimary)}</h1>
```
The "master your lectures with ease" subtitle becomes separate and static (it's not part of the greeting rotation).
**Commits:**
- `feat(greetings): add greetings lib with deterministic daily rotation per user`
- `feat(dashboard): use buildGreetingLine with displayName substitution`

---

## Slice 7 — Header nav expansion (unchanged from original guide §Slice 7)

Full treatment of Feature 9 + 10. Active-route styling, mobile drawer integration, `/app/progress` stub route.

---

## Slices 8–13 — Feature work (unchanged)

- Slice 8: Editable topics (Feature 8)
- Slice 9: Folders (Feature 3)
- Slice 10: Review mode + 3-tab grid (Features 4 + 5)
- Slice 11: Worksheets (Feature 6)
- Slice 12: Lecture packages (Feature 2)
- Slice 13: OSCE (Feature 7 Option B)

See original guide for detailed plans.

---

## Slice A1 — Admin upload bypasses limits ⭐ (new)

Branch: `feat/admin-upload`. User's new-feature item #4.

### Commits

**Commit A1.1 — Admin limit bypass in `/api/upload` and `/api/generate`**
**Files:** `lib/api-limits.ts`, `app/api/upload/route.ts`, `app/api/generate/route.ts`.

Current flow: every upload calls `checkLimits(userId)` which enforces per-user daily/monthly caps. Admin uploads (the primary user seeding cohort content) legitimately need more headroom.

Fix:
```ts
// lib/api-limits.ts — extend checkLimits signature
export async function checkLimits(userId: string, opts?: { adminBypass?: boolean }): Promise<LimitResult> {
  if (opts?.adminBypass) {
    // Still record usage for cost tracking, just don't block.
    return { ok: true, bypassed: true, reason: 'admin' };
  }
  // existing body…
}
```
In route handlers:
```ts
const isAdmin = await userIsAdmin(user.id);
const limitResult = await checkLimits(user.id, { adminBypass: isAdmin });
```
**Important:** admin uploads are **still recorded** via `increment_api_usage`. The bypass only affects the *gate*, not the *accounting*. This keeps the admin dashboard's cost view accurate.

Also add a per-admin sanity cap (e.g., 100 uploads/day) to prevent a compromised admin account from nuking the API budget:
```ts
const ADMIN_DAILY_SANITY_CAP = 100;
if (opts?.adminBypass) {
  const adminTodayCount = await getAdminTodayCount(userId);
  if (adminTodayCount >= ADMIN_DAILY_SANITY_CAP) {
    return { ok: false, reason: 'admin_sanity_cap' };
  }
  return { ok: true, bypassed: true, reason: 'admin' };
}
```
**Commit:** `feat(admin): upload bypasses per-user limits but still records usage and respects a sanity cap`.

**Commit A1.2 — Higher file-size cap for admins**
**Files:** `components/UploadModal.tsx`, `app/api/upload/route.ts`.

Standard cap is 50 MB. Admins should be able to go to 250 MB (covers most medical-school PPTX decks).
```ts
const MAX_UPLOAD_BYTES = isAdmin ? 250 * 1024 * 1024 : 50 * 1024 * 1024;
```
Display the cap dynamically in the UploadModal hint text. Server-side check is authoritative; client hint is UX.
**Commit:** `feat(admin): increase upload file-size cap to 250MB for admin users`.

**End of Slice A1.** Push.

---

## Slice A2 — True background processing + detailed progress ⭐ (new)

Branch: `feat/background-processing`. User's new-feature items #5 and #6.

### Problem statement
Currently: upload → navigate away → processing silently dies (or: processing completes but the user doesn't know because the UI that polled status has unmounted). Also: the progress UI says "Running Claude" with no sub-step detail.

### Architecture decision
This is substantive enough to warrant an ADR entry. Options considered:
- **(A) In-request synchronous processing** — current approach. Dies on navigation.
- **(B) Vercel Cron + `processing_jobs` table polling** — polls every minute, picks up pending jobs, runs Claude. Simple. Latency: up to 60s before processing starts.
- **(C) Direct webhook from Supabase on INSERT to `processing_jobs`** — requires Supabase Webhooks → Vercel edge function. Lowest latency. More moving parts.
- **(D) QStash / Upstash workflow** — dedicated queue with retries. Costs money. Overkill for current scale.

**Decision: start with (B) Vercel Cron** + keep the current synchronous path as a fast-start optimization (kick off processing in-request; if the request is interrupted, the cron picks it up on next tick). This gives zero-cost background processing.

### Commits

**Commit A2.1 — `processing_jobs` idempotency + heartbeat columns**
**Files:** Supabase MCP `apply_migration`, `decisions.md`, `supabase/migrations/`.
```sql
ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text,        -- request id or cron run id
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS processing_jobs_status_idx
  ON public.processing_jobs(status, created_at)
  WHERE status IN ('pending', 'running');
```
Jobs are "claimed" for 5 minutes at a time. If `claim_expires_at` passes without `completed_at`, the cron re-claims and retries.
**Commit:** `feat(db): add heartbeat and claim columns to processing_jobs for background worker`.

**Commit A2.2 — Refactor `/api/generate` into a job runner**
**Files:** `lib/job-runner.ts` (new), `app/api/generate/route.ts`.

Extract the per-job logic into `runProcessingJob(jobId)`:
```ts
export async function runProcessingJob(jobId: string, runId: string): Promise<void> {
  // 1. Claim the job atomically
  const claimed = await supabaseAdmin.rpc('claim_processing_job', { p_job_id: jobId, p_run_id: runId });
  if (!claimed) return;

  // 2. Run each stage, updating status_detail after each:
  await updateProgress(jobId, 'extracting_text', 'Extracting slide text…');
  const text = await extractText(job);
  await updateProgress(jobId, 'processing_slides', `Processed ${n} of ${total} slides`);
  // …etc
  await updateProgress(jobId, 'generating_flashcards', 'Generating flashcards (Haiku 4.5)…');
  await updateProgress(jobId, 'generating_questions', 'Generating board-style questions…');
  await updateProgress(jobId, 'validating', 'Validating structured output…');
  await updateProgress(jobId, 'saving', 'Saving to database…');
  await markComplete(jobId);
}
```
`/api/generate` becomes a thin wrapper: start the run, fire and forget if the client disconnects.
**Commit:** `refactor(generate): extract runProcessingJob with stage-level progress updates`.

**Commit A2.3 — Vercel Cron for orphan recovery**
**Files:** `app/api/cron/process-jobs/route.ts` (new), `vercel.json`.

```ts
// app/api/cron/process-jobs/route.ts
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });

  const { data: jobs } = await supabaseAdmin
    .from('processing_jobs')
    .select('id')
    .or('status.eq.pending,and(status.eq.running,claim_expires_at.lt.now())')
    .order('created_at', { ascending: true })
    .limit(5);

  const runId = `cron_${Date.now()}`;
  await Promise.all(jobs.map(j => runProcessingJob(j.id, runId)));
  return Response.json({ processed: jobs.length });
}
```
```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/process-jobs", "schedule": "* * * * *" }
  ]
}
```
Add `CRON_SECRET` to Vercel env.
**Commit:** `feat(cron): add per-minute orphan-job recovery via Vercel Cron`.

**Commit A2.4 — Detailed progress UI with step names and sub-progress (N13)**
**Files:** `components/UploadModal.tsx`, `components/ProcessingProgress.tsx` (new if needed).

Current UI says "Running Claude." Replace with a stage list that checks off as each stage completes:
```tsx
const STAGES = [
  { id: 'uploading',              label: 'Uploading file' },
  { id: 'extracting_text',        label: 'Extracting slide text' },
  { id: 'processing_slides',      label: 'Processing slide images' },
  { id: 'generating_flashcards',  label: 'Generating flashcards with Claude' },
  { id: 'generating_questions',   label: 'Generating practice questions' },
  { id: 'validating',             label: 'Validating structured output' },
  { id: 'saving',                 label: 'Saving to your library' },
];
```
Show current stage with a spinner; completed stages with a checkmark; pending stages faded. Include the sub-detail message (e.g., "Processed 14 of 32 slides") beneath the current stage.

Also handle navigation-away gracefully: the UploadModal displays "This will keep running if you navigate away — you'll see it in Recent Uploads."
```tsx
<p className="smd-processing-reassurance">
  Safe to navigate away. Processing continues in the background.
</p>
```
**Commit:** `feat(upload): detailed stage-by-stage progress UI with navigation-away reassurance`.

**End of Slice A2.** Push.

---

## Slice A3 — Admin panel additions ⭐ (new)

Branch: `feat/admin-panel-courses-and-entry`. User's new-feature items #8 and #9.

### Commits

**Commit A3.1 — Admin link surfaces on `/app` dashboard for admins (N16)**
**Files:** `components/Header.tsx`, potentially `components/AdminBadge.tsx` (new).

Today, admins have to know the `/admin` URL. Surface it as a header link **only when `user_profiles.role === 'admin'`**.
```tsx
{isAdmin && <NavLink href="/admin" className="smd-header-admin-link">Admin</NavLink>}
```
Style it subtly distinct (e.g., small `ADMIN` tag next to the label) so it's obviously an elevated route.
**Commit:** `feat(header): surface Admin link on main dashboard for admin users`.

**Commit A3.2 — Admin Courses section (N15)**
**Files:** new SQL migration; `app/admin/courses/page.tsx`; `components/admin/CoursesTab.tsx`; update `AdminClient.tsx` tab list.

Decision: **separate Courses tab**, not merged into Lectures. Reason: courses are a taxonomy that lectures belong to, and mixing taxonomy management with per-lecture CRUD clutters both.

Schema:
```sql
CREATE TABLE IF NOT EXISTS public.courses (
  id text PRIMARY KEY,                  -- e.g. 'physical-diagnosis-1'
  name text NOT NULL,
  code text,                            -- e.g. 'PAS 5216'
  description text,
  display_order integer NOT NULL DEFAULT 0,
  color text,                           -- theme-agnostic hex; used for lecture card accent
  created_at timestamptz DEFAULT now(),
  archived_at timestamptz
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read courses" ON public.courses
  FOR SELECT TO authenticated USING (archived_at IS NULL);
CREATE POLICY "admin manages courses" ON public.courses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles
                 WHERE user_id = auth.uid() AND role = 'admin'));

-- Backfill from existing string courses
INSERT INTO public.courses (id, name) VALUES
  ('physical-diagnosis-1', 'Physical Diagnosis I'),
  ('anatomy-physiology',   'Anatomy & Physiology'),
  ('laboratory-diagnosis', 'Laboratory Diagnosis')
ON CONFLICT DO NOTHING;
```

`lectures.course` is currently a free-text string. Gradual migration:
- Keep `lectures.course` for now.
- Add `lectures.course_id text REFERENCES public.courses(id)`.
- Backfill: `UPDATE lectures SET course_id = CASE course WHEN 'Physical Diagnosis I' THEN 'physical-diagnosis-1' ...`
- New code writes to `course_id`; keep reading `course` as fallback for a transition period.

API routes under `/api/admin/courses`:
- `GET /api/admin/courses` — list (including archived).
- `POST /api/admin/courses` — create.
- `PATCH /api/admin/courses/[id]` — rename, recolor, archive.
- `POST /api/admin/courses/[id]/assign-lectures` — body `{ lectureIds: string[] }` updates `lectures.course_id` in bulk.
- `POST /api/admin/courses/[id]/unassign-lectures` — same, but sets `course_id` to null.

UI: `app/admin/courses/page.tsx` shows a list of courses with inline edit + a "Lectures" drawer that lists assigned lectures and has a "+ Add lecture" multi-select from unassigned lectures.
**Commit 1:** `feat(db): courses table + lectures.course_id FK; backfill`.
**Commit 2:** `feat(admin): Courses tab with CRUD and lecture assignment UI`.

**End of Slice A3.** Push.

---

## Slice F1 — Flashcards: review missed only ⭐ (new)

Branch: `feat/flashcards-missed-only`. User's new-feature item #10.

### Commits

**Commit F1.1 — "Missed only" mode in FlashcardConfigModal**
**Files:** `components/FlashcardConfigModal.tsx`, `components/study/FlashcardView.tsx`, `hooks/useFlashcardSession.ts` (or equivalent).

Current flashcard config lets the user pick: all cards vs new cards (and maybe filter by topic/difficulty). Add a third top-level mode:
```tsx
const MODES = [
  { id: 'all',       label: 'All cards',    hint: 'Study every card in this lecture' },
  { id: 'new',       label: 'New only',     hint: 'Only cards you haven\'t seen yet' },
  { id: 'missed',    label: 'Missed only',  hint: 'Only cards you\'ve previously missed' },
];
```

Consume `user_progress.flashcard_progress.missed_ids[]` for this lecture (already the source of truth per ADR-005). If empty, disable the radio option with a tooltip: "You haven't missed any cards yet."

In the session hook:
```ts
const sessionCards = useMemo(() => {
  switch (mode) {
    case 'all':    return allCards;
    case 'new':    return allCards.filter(c => !gotItIds.has(c.id) && !missedIds.has(c.id));
    case 'missed': return allCards.filter(c => missedIds.has(c.id));
  }
}, [mode, allCards, gotItIds, missedIds]);
```

Mark "missed" cards specially when they're shown: a small badge in the corner of the card that says "Previously missed" (subtle; doesn't dominate). If the user gets it right this session, promote it out of `missed_ids` into `got_it_ids` (union-merge semantics still apply).

**Commit:** `feat(flashcards): add "Missed only" study mode with promotion semantics`.

---

## Minimalism audit — things to cut or collapse

Per the user's minimalism direction, these items from the original guide are flagged for **review before implementation** — they might add more surface area than they remove:

| Item | Slice | Minimalism note |
|---|---|---|
| `/app/progress` route | 7 | A new page is a new destination. Consider: can progress live as a collapsible panel on the main dashboard instead of a separate route? Decide before building. |
| Folder tree + folder tiles | 9 | Two UIs (sidebar tree + in-grid tiles) for the same data. Pick one — the in-grid tile is more discoverable; skip the sidebar tree until users ask. |
| Three-tab lecture grid | 10 | Tabs add chrome. Before building, validate: does the Review-tab-only filter actually matter to users, or should Review be a modal launched from any card regardless of tab? |
| Worksheets as separate `kind` | 11 | Adding a type system is expensive. Consider: can a worksheet just be a lecture with zero flashcards? Decide before schema change. |
| OSCE cases | 13 | Big surface area. Stage it: ship case *viewing* only in the first release (no grading, no AI feedback) and iterate. |
| Slide annotations as separate table | 10 | Adds a table and an API call per slide. Could live in `lectures.json_data.slide_annotations`? Consider; decide. |

**Action:** before starting each of slices 7, 9, 10, 11, 13, re-read the corresponding row above and decide whether to trim scope. Document the decision in `decisions.md` under a new ADR titled "ADR-XXX: Slice N scope trim for minimalism."

---

## Mapping — all 23 original items + 17 new items → slices

### Original 23 (from previous message)
| # | Item | Slice | Status change |
|---|---|---|---|
| 1 | Random greetings | 6 | unchanged |
| 2 | Lecture packages | 12 | unchanged |
| 3 | Folders | 9 | flagged for minimalism review |
| 4 | Review mode | 10 | flagged for minimalism review |
| 5 | Worksheets | 11 | flagged for minimalism review |
| 6 | OSCE | 13 | scope trim — viewing only first |
| 7 | Topic editing | 8 | unchanged |
| 8 | My Plans / My Lectures in header | 1 (stub) + 7 (full) | unchanged |
| 9 | No slide ref | 5 | unchanged |
| 10 | Double-tap kebab | 3 | **mostly fixed in production**; Slice 3 now targets N7 + N10 |
| 11 | internal_ids | 5 | unchanged |
| 12 | Mobile gear + theme | — | **already done; removed from guide** |
| 13 | Mobile pomodoro | 1 | **now part of N14** (moved out of header) |
| 14 | iOS header banner | 2 (modal shell work covers safe-area) | kept |
| 15 | Mobile layout cramped | 1 + 4 | reframed as Dashboard simplification (Slice 1) |
| 16 | Swipe-down dismiss | 2 | unchanged |
| 17 | Modal X hidden | 2 | unchanged |
| 18 | Kebab close | 3 | **bundled with N7** |
| 19 | Custom Session close | 2 | unchanged |
| 20 | Saving… jitter | 2 | **narrowed to theme picker per user spec** |
| 21 | Wordmark → dashboard | 1 | moved into Slice 1 |
| 22 | Admin click-to-edit | 4 | unchanged |
| 23 | Lavender → Pink | 4 | **narrowed to profile page only** |

### New 17
| # | Item | Slice |
|---|---|---|
| N1 | Greeting display name | 1 (Commit 1.1) |
| N2 | Center hero | 1 (Commit 1.2) |
| N3 | Responsive plan widget | 1 (Commit 1.4) |
| N4 | Filter bar alignment | 4 (Commit 4.1) |
| N5 | Expose Upload / Custom / Manage | 1 (Commit 1.5) |
| N6 | Theme Saving inline | 2 (Commit 2.3) |
| N7 | Kebab positioning + submenu stability | 3 (Commit 3.1) |
| N8 | Text selection visibility | 4 (Commit 4.2) |
| N9 | Theme resets on navigation | 2 (Commit 2.4) |
| N10 | Kebab color changes don't save | 3 (Commit 3.2) |
| N11 | Admin upload bypass | A1 |
| N12 | True background processing | A2 |
| N13 | Detailed progress | A2 |
| N14 | Pomodoro + stats placement | 1 (Commit 1.3) |
| N15 | Admin Courses section | A3 |
| N16 | Admin entry from /app | A3 |
| N17 | Flashcards missed-only | F1 |

---

## Per-commit checklist (unchanged)

- [ ] `npm run build` succeeds.
- [ ] `npm run typecheck` clean (once P7 lands).
- [ ] Anthropic calls gated by `checkLimits` and recorded via `increment_api_usage` (A1 exception still records usage).
- [ ] New tables have RLS + at least one policy.
- [ ] Schema changes in `decisions.md` + `supabase/migrations/`.
- [ ] `todo.md` updated.
- [ ] `plan.md` checkbox flipped if applicable.
- [ ] Commit message: conventional prefix, body explains why, references slice.
- [ ] `git push origin <branch>`.

---

## When in doubt

- **Conflict between this guide and `CLAUDE.md`** → `CLAUDE.md` wins.
- **Conflict between this guide and `development_plan_v3.md`** → plan wins for design, guide wins for execution order.
- **Adding scope mid-slice** → don't; finish the slice, commit, then start a new slice.
- **Minimalism in doubt** → cut the feature, don't add chrome. The user has repeated this explicitly.

---

*End of revised execution guide (v3.1). Update `todo.md` and `decisions.md` as you work. Commit often; push often.*
