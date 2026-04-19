# StudyMD v3 Development Plan

This plan covers StudyMD v3: bug fixes, UX reorganization, and ten new features. Each feature section lists: **Why**, **Schema impact**, **API impact**, **Component impact**, **UX walkthrough**, **Edge cases**, and **Verification**.

Prerequisites that must land before v3 work starts are listed in [§0](#0-prerequisite-fixes-before-v3). Cross-references to [`recommendations.md`](./recommendations.md) are noted where applicable.

---

## 0. Prerequisite fixes (before v3)

These are not new features — they're correctness / security work that v3 depends on. Complete these in a dedicated `chore/v3-prereqs` branch before opening feature branches.

| Fix | Source | Priority |
|---|---|---|
| Enable RLS on `subscription_tiers` and add policies | [`recommendations.md`](./recommendations.md#11-🔴-enable-rls-on-subscription_tiers) | 🔴 Blocks feature #2 (subscriptions) |
| Replace hard-coded admin UUID in `api_usage` policy | [`recommendations.md`](./recommendations.md#12-🔴-replace-hard-coded-admin-uuid-in-api_usage-policy) | 🔴 |
| Tighten `slides` bucket SELECT policy | [`recommendations.md`](./recommendations.md#13-🔴-tighten-slides-storage-bucket-select-policy) | 🔴 Before slide AI annotations (feature #4) |
| Set `search_path` on 6 SECURITY DEFINER functions | [`recommendations.md`](./recommendations.md#15-🔴-set-search_path-on-the-6-public-functions) | 🔴 |
| Resolve `is_primary` source-of-truth confusion | [`recommendations.md`](./recommendations.md#17-🔴-resolve-is_primary-source-of-truth-confusion) | 🔴 Blocks feature #1 (greetings) |
| Consolidate `processing_jobs` duplicated columns | [`recommendations.md`](./recommendations.md#23-🟡-consolidate-processing_jobs-duplicated-columns) | 🟡 |
| Implement or delete `LoginForm.tsx` | [`recommendations.md`](./recommendations.md#28-🟡-implement-or-delete-loginformtsx) | 🟡 |
| Adopt `supabase/migrations/` workflow | [`recommendations.md`](./recommendations.md#18-🟡-add-a-migrations-workflow) | 🟡 Makes every v3 schema change reviewable |
| Add `typecheck`, `lint`, minimal test scripts | [`recommendations.md`](./recommendations.md#21-🟡-add-lint-typecheck-and-test-scripts) | 🟡 Gates v3 merges |

---

## Feature 1 — Per-user randomized greetings

### Why
The primary user (Haley) currently sees rotating affirmations from a hard-coded list in `Dashboard.tsx`. Other users see a generic greeting. This should be generalized: every user gets a pool of greetings; Haley gets her own affectionate pool.

### Schema impact
None. `is_primary` already exists on `user_profiles` (after prerequisite fix 1.7).

### API impact
None. Greetings are a client-only lookup.

### Component impact
- **New:** `lib/greetings.ts`
  ```ts
  export const genericGreetings: string[] = [ /* 15-20 warm greetings */ ];
  export const primaryGreetings: string[] = [ /* 15-20 Haley-specific affirmations */ ];
  export function pickGreeting(userId: string, isPrimary: boolean): string;
  ```
  Selection is seeded by `userId + dayOfYear`:
  ```ts
  const seed = hash(userId + new Date().toISOString().slice(0, 10));
  const pool = isPrimary ? primaryGreetings : genericGreetings;
  return pool[seed % pool.length];
  ```
- **Modified:** `components/Dashboard.tsx` — replace the inline affirmations logic with `pickGreeting(userId, isPrimary)`.

### UX walkthrough
User signs in → dashboard loads → sees greeting that changes daily but is stable within a session. Haley's pool contains warmer, personalized messages.

### Edge cases
- **User ID missing** — fall back to a generic "Welcome back".
- **Pools updated mid-day** — still deterministic, just the available set shifts.
- **Timezone edge** — use UTC day-of-year to avoid greeting flip at midnight local.

### Verification
- Manually: sign in as primary user; confirm Haley greeting. Change system date (or the seed logic), reload, confirm greeting changes. Sign in as non-primary; confirm generic greeting.
- Unit test `pickGreeting` (once `vitest` is wired): deterministic for same input, distributes uniformly across inputs.

---

## Feature 2 — Lecture-package subscriptions

### Why
Today, every authenticated user can see every lecture in the system (`lectures: authenticated users can read`). As the user base grows beyond Haley's cohort, users should only see the lectures their subscription grants. This also opens a path to packaging pre-built curricula (e.g., "PA Year 1 — Fall").

### Schema impact
Tables already exist (`user_subscriptions`, `subscription_tiers`). Add a package concept:

```sql
-- Catalog of bundled lecture packages
CREATE TABLE public.lecture_packages (
  id text PRIMARY KEY,                    -- e.g. 'pa-year-1-fall-2026'
  name text NOT NULL,
  description text,
  lecture_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Many-to-many: which packages a user has access to
CREATE TABLE public.user_package_access (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id text REFERENCES public.lecture_packages(id) ON DELETE CASCADE,
  source text NOT NULL,                   -- 'subscription' | 'admin_grant' | 'trial'
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz,                 -- null = never expires
  PRIMARY KEY (user_id, package_id)
);
ALTER TABLE public.user_package_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own access" ON public.user_package_access
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
```

Also revise the `lectures` SELECT policy to require package access:
```sql
DROP POLICY "lectures: authenticated users can read" ON public.lectures;
CREATE POLICY "lectures: package-scoped read" ON public.lectures
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_package_access upa
      JOIN public.lecture_packages lp ON lp.id = upa.package_id
      WHERE upa.user_id = auth.uid()
        AND lectures.internal_id = ANY(lp.lecture_ids)
        AND (upa.expires_at IS NULL OR upa.expires_at > now())
    )
    OR EXISTS (  -- admins bypass
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (  -- owners of self-uploaded lectures
      SELECT 1 FROM public.user_lecture_settings uls
      WHERE uls.user_id = auth.uid() AND uls.internal_id = lectures.internal_id
    )
  );
```

### API impact
- **New:** `GET /api/packages` — list all available packages.
- **New:** `POST /api/packages/subscribe` — grant package access to self (free tiers) or via payment webhook.
- **New (admin):** `GET /api/admin/packages`, `POST /api/admin/packages` — package management.
- **Modified:** `/api/lectures` — becomes automatically package-scoped via the new RLS policy; no code change if queries already rely on RLS.

### Component impact
- **New:** `app/app/subscriptions/page.tsx` — subscription browsing / management.
- **New (admin):** `app/admin/packages/page.tsx` + tab in `AdminClient.tsx`.

### UX walkthrough
1. New PA student signs up. A server hook (`ensure_user_preferences` extended, or a new `handle_new_user` trigger) grants access to the `pa-year-1-fall-2026` package automatically.
2. User sees only PA Year 1 lectures on dashboard.
3. If they want access to another package, they browse `/app/subscriptions` and subscribe.

### Edge cases
- **Self-uploaded lectures** — a user uploading their own lecture should always see it regardless of package (handled in the revised RLS via `user_lecture_settings` check).
- **Admin override** — admins see all lectures regardless of package (handled in RLS).
- **Package expiration** — respect `expires_at`; expired rows shouldn't grant access.
- **Removing a lecture from a package** — doesn't delete progress; the user simply can't SELECT the lecture row. Progress rows remain but become inert.

### Verification
1. Create two packages. Grant user A access to package 1, user B to package 2.
2. Confirm user A sees only package 1 lectures, user B sees only package 2.
3. As admin, confirm you see all.
4. Expire user A's grant; confirm lectures disappear on next load.

---

## Feature 3 — Lecture-grid folders

### Why
Students organize lectures by week or block, not just by course. Filtering by course handles part of this, but doesn't scale to "Show me just my Week 3 PA lectures". Folders also integrate with Custom Study Sessions, the My Lectures manage page, and Study Plans.

### Schema impact
`user_lecture_settings.group_id` **already exists** (reserved). Add a `folders` table to define the folder tree:

```sql
CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.folders(id) ON DELETE CASCADE,   -- null = root
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
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Change `user_lecture_settings.group_id` from `text` to `uuid` with a foreign key:
```sql
ALTER TABLE public.user_lecture_settings
  ALTER COLUMN group_id TYPE uuid USING group_id::uuid,
  ADD CONSTRAINT user_lecture_settings_group_fk
    FOREIGN KEY (group_id) REFERENCES public.folders(id) ON DELETE SET NULL;
```

### API impact
- **New:** `GET /api/folders` — tree for the current user.
- **New:** `POST /api/folders` — create.
- **New:** `PATCH /api/folders/[id]` — rename, recolor, move parent.
- **New:** `DELETE /api/folders/[id]` — delete (lectures inside become "unfiled").
- **Modified:** `PUT /api/lectures/settings` — accepts `group_id` updates.

### Component impact
- **New:** `components/FolderTree.tsx` — recursive sidebar tree for `/app/lectures`.
- **New:** `components/FolderTile.tsx` — folder tile rendered in the main grid (click to drill in).
- **Modified:** `components/Dashboard.tsx` / `LectureGrid.tsx` — filter by current folder, show breadcrumb, render `FolderTile` tiles alongside `LectureCard` tiles.
- **Modified:** `components/CustomSessionModal.tsx` — add a "From folder" picker that auto-selects all lectures in the folder.
- **Modified:** study-plan creation — folder pick expands to its lectures.

### UX walkthrough
1. On `/app/lectures`, user creates a folder "Week 3" (can be nested inside "Fall Block").
2. Drags lectures into the folder via dnd-kit; the `group_id` updates.
3. On dashboard, user clicks the "Week 3" folder tile and the grid filters to that folder's contents (with breadcrumb to navigate up).
4. From Custom Session, user picks "Week 3" and gets a session spanning all lectures in that folder.
5. From Study Plans, user picks "Week 3" when defining lecture scope.

### Edge cases
- **Deleting a folder with children** — RLS `ON DELETE CASCADE` will delete subfolders; lectures become `group_id = NULL`. Confirm this is the desired behavior; else warn.
- **Cycle prevention** — validate that `parent_id` doesn't create a cycle in the API handler.
- **Moving a folder across users** — not supported (RLS prevents it).
- **Dragging a lecture onto a folder tile** — use dnd-kit's drag-to-container.

### Verification
1. Create nested folders; confirm tree renders correctly.
2. Drag 3 lectures into folder A; confirm `group_id` updates.
3. From dashboard, click folder A; confirm only those 3 lectures show.
4. Custom session "From folder A"; confirm the 3 lectures are pre-selected.
5. Delete folder A; confirm lectures now show as "unfiled".

---

## Feature 4 — Review tab (slide-by-slide with AI annotations)

### Why
Flashcards and exams are active recall. Students also need passive review — going through the slides with explanatory context. AI-generated annotations overlay each slide with plain-English explanations, clinical context, and mnemonics.

### Schema impact
```sql
CREATE TABLE public.slide_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_id text NOT NULL REFERENCES public.lectures(internal_id) ON DELETE CASCADE,
  slide_number integer NOT NULL,
  body text NOT NULL,                 -- markdown
  model_used text NOT NULL,
  generated_at timestamptz DEFAULT now(),
  UNIQUE (internal_id, slide_number)
);
ALTER TABLE public.slide_annotations ENABLE ROW LEVEL SECURITY;
-- Anyone with lecture access can read (lectures RLS already handles access scoping)
CREATE POLICY "authenticated read annotations" ON public.slide_annotations
  FOR SELECT TO authenticated USING (true);
```

### API impact
- **New:** `GET /api/lectures/[id]/annotations` — returns all annotations for the lecture (empty array if none generated yet).
- **New:** `POST /api/lectures/[id]/annotations` — generates annotations for one or all slides. Calls Claude with `{ slide_image_url, lecture_title, surrounding_topics }`. Gated by `checkLimits()`; tracked via `increment_api_usage`.

Pseudocode for the generate endpoint:
```ts
const slideUrl = getSlideThumbUrl(internalId, slideNumber);
const msg = await anthropic.messages.create({
  model: API_LIMITS.MODEL_DEFAULT,
  system: [{ type: "text", text: SLIDE_ANNOTATION_PROMPT, cache_control: { type: "ephemeral" }}],
  messages: [{ role: "user", content: [
    { type: "image", source: { type: "url", url: slideUrl }},
    { type: "text", text: `Lecture: ${title}\nSurrounding topics: ${topics.join(", ")}\nProduce a 3-5 sentence explanation in markdown.` },
  ]}],
  max_tokens: 1000,
});
```

- **New prompt:** `lib/slide-annotation-prompt.ts`.

### Component impact
- **New:** `components/study/SlideReviewView.tsx` — slide-by-slide viewer with annotation pane.
- **New:** `app/app/study/review/page.tsx` — route entry.

### UX walkthrough
1. User clicks **Review** on a lecture card (enabled by Feature 5's three-tab grid).
2. `SlideReviewView` loads slide 1, shows its image + annotation. If annotation is missing, it triggers a background generate and shows a skeleton.
3. User scrolls or arrows through slides. Each slide's annotation generates on demand and caches forever (unless the lecture's slides change).
4. Optional: the user can edit the annotation inline — saving it to `slide_annotations` (with `model_used = 'user_edit'`).

### Edge cases
- **Claude refuses or errors** — fall back to "Explanation not available; click to retry".
- **Cost control** — a single lecture with 60 slides × 500 output tokens × Haiku pricing ≈ $0.15. Still modest, but over many lectures this adds up. Cache aggressively.
- **Slide image doesn't exist** — slide probing should degrade gracefully.
- **Lecture updated** — if slides change post-annotation, invalidate and regenerate; store `lectures.slides_version` and compare.

### Verification
1. Open Review on a lecture; confirm slide 1 shows image + annotation skeleton.
2. Wait for annotation; confirm it renders.
3. Refresh page; confirm annotation loads from cache (no new Anthropic call).
4. Check `api_usage` row updated appropriately.

---

## Feature 5 — Three-tab Lecture Grid (Review / Learn / Practice)

### Why
Currently every lecture card has three buttons (Flashcards, Exam, more). Adding Review makes four. A tab-based UI is cleaner: pick a mode up top, and clicks on lecture cards open that mode directly.

### Schema impact
None.

### API impact
None.

### Component impact
- **Modified:** `components/Dashboard.tsx` — add a top tab strip (`Review | Learn | Practice`). Tab selection lives in URL state (`?tab=learn`).
- **Modified:** `components/LectureCard.tsx` — remove the per-card mode buttons. The whole card becomes a click-target that opens the tab-appropriate modal:
  - Review → `SlideReviewView` (Feature 4).
  - Learn → `FlashcardConfigModal`.
  - Practice → `ExamConfigModal`.
- **Modified:** `components/LectureViewModal.tsx` — the "Flashcards" / "Practice Exam" buttons become "Review" / "Learn" / "Practice".

### UX walkthrough
User lands on dashboard → Learn tab is default → sees grid → clicks any lecture → `FlashcardConfigModal` opens immediately. No extra click to pick the mode.

### Edge cases
- **Worksheets (Feature 6)** — only render in Practice tab.
- **Lectures without slides** — Review tab disables their card or shows "No slides available".
- **Deep-linking** — `?tab=review&lectureId=lec_xxx` should open Review for that lecture on load.

### Verification
Switch tabs; confirm card behavior changes. Deep-link to `?tab=practice&lectureId=lec_xxx`; confirm ExamConfigModal opens.

---

## Feature 6 — Worksheet/assignment uploads → static Practice exams

### Why
Uploading a worksheet should produce a Practice-only card: no slides, no flashcards, no Review or Learn tab — just the exam questions derived from the worksheet.

### Schema impact
```sql
ALTER TABLE public.lectures
  ADD COLUMN kind text NOT NULL DEFAULT 'lecture'
    CHECK (kind IN ('lecture', 'worksheet'));
```

### API impact
- **Modified:** `POST /api/upload` — accepts a `kind` field.
- **Modified:** `POST /api/generate` — if `kind = 'worksheet'`, uses a different system prompt (`lib/worksheet-processor-prompt.ts`) that returns only `questions[]`.
- **Modified:** `GET /api/lectures` — returns `kind`; the dashboard uses it to filter by tab.

### Component impact
- **Modified:** `components/UploadModal.tsx` — add a "Content type" picker: *Lecture* or *Worksheet*.
- **Modified:** `components/LectureCard.tsx` — worksheets get a distinct badge ("Worksheet").
- **Modified:** `components/Dashboard.tsx` — worksheets are hidden in Review / Learn tabs; only appear in Practice.
- **New:** `lib/worksheet-processor-prompt.ts`.

### UX walkthrough
1. User uploads a worksheet, picks "Worksheet" content type.
2. Claude processes it into questions only (no flashcards, no slide extraction).
3. The worksheet appears in the dashboard's Practice tab with a "Worksheet" badge.
4. Click opens `ExamConfigModal` → student goes through the questions just like a regular exam.

### Edge cases
- **Worksheet with ambiguous or short answers** — OK for the question model; no slides means no image lookup.
- **User uploads a "lecture" but it's actually a worksheet** — user can convert kind post-facto via a "Change type" action in `LectureViewModal`.

### Verification
1. Upload a worksheet PDF.
2. Confirm no slides render; confirm dashboard shows it only in Practice tab.
3. Run an exam; confirm it behaves like a normal exam.

---

## Feature 7 — OSCE preparation

### Why
Clinical skills courses (OSCEs) are poorly served by flashcards and MCQs. OSCE prep needs case-based simulation and checklist-driven practice.

### Approach comparison

| Approach | Fidelity | Cost | Build time | First-value |
|---|---|---|---|---|
| **A: AI patient roleplay** | Highest | ~$0.10–0.50 per session (Sonnet) | Large | Strong |
| **B: Structured checklists + media prompts** | Medium | Very low (rare Claude calls) | Small | Good |
| **C: Branching case studies** | Medium-high | Low per branch | Medium | Strong |
| **D: Voice-based simulation (mic → Whisper → Claude)** | Highest | Higher (audio + LLM) | Large | Strong but gated on audio infra |

### Recommendation

**Start with Option B** — lowest build cost, fastest delivery, and most generalizable. Layer **Option A** on top after B is in use for 2–3 weeks. Skip C unless students specifically ask for branching; D is a v4+ consideration.

### Schema impact (Option B)
```sql
CREATE TABLE public.osce_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  course text,
  description text,
  prompt_media_urls jsonb DEFAULT '[]',         -- images/video/audio of the scenario
  time_limit_seconds integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.osce_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.osce_cases(id) ON DELETE CASCADE,
  display_order integer NOT NULL,
  text text NOT NULL,                           -- e.g., "Introduces self and confirms patient identity"
  category text,                                -- 'history' | 'examination' | 'communication' | 'diagnosis'
  weight numeric DEFAULT 1
);

CREATE TABLE public.osce_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.osce_cases(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  self_score integer,                            -- 0-100 (user self-assessment)
  ai_score integer,                              -- 0-100 (AI-graded reflection)
  reflection text,                               -- free-text reflection
  ai_feedback text                               -- AI-graded feedback markdown
);

CREATE TABLE public.osce_attempt_scores (
  attempt_id uuid REFERENCES public.osce_attempts(id) ON DELETE CASCADE,
  checklist_item_id uuid REFERENCES public.osce_checklist_items(id) ON DELETE CASCADE,
  completed boolean NOT NULL,
  PRIMARY KEY (attempt_id, checklist_item_id)
);
```

RLS: users read/insert/update their own attempts + scores; cases + items are readable by all authenticated users.

### API impact (Option B)
- **New:** `GET /api/osce/cases`, `GET /api/osce/cases/[id]`.
- **New:** `POST /api/osce/attempts` — start an attempt.
- **New:** `PATCH /api/osce/attempts/[id]` — mark checklist items complete, save reflection.
- **New:** `POST /api/osce/attempts/[id]/grade` — send reflection to Claude for AI scoring.

### Component impact (Option B)
- **New:** `app/app/osce/page.tsx` — list cases.
- **New:** `app/app/osce/[id]/page.tsx` — attempt flow: show scenario, timer, live checklist, reflection box.
- **New:** `components/osce/ChecklistItem.tsx`, `components/osce/ScenarioMedia.tsx`.

### UX walkthrough (Option B)
1. User navigates to `/app/osce`, picks a case (e.g., "Chest pain history").
2. Scenario page loads: patient scenario text/image on top, timer, checklist on the side.
3. User reads the scenario, self-attests each checklist item as they practice (talking aloud or with a partner).
4. User writes a 3–5 sentence reflection.
5. Claude grades the reflection (coherence, completeness, flag-gap detection) and the checklist (% completed). Both scores go into `osce_attempts`.
6. User sees a feedback page and can re-attempt.

### Follow-up: Option A layered on
- Add a "Practice with AI patient" button. Claude roleplays a patient with a hidden case; student conducts the interview via text.
- Conversation logs go into an `osce_conversations` table.
- At session end, Claude grades the conversation against the checklist.

### Edge cases
- **Media files too large** — cap at 5MB/media.
- **Reflection empty** — allow but disable AI grading.
- **Scoring subjectivity** — surface both `self_score` and `ai_score` side-by-side; treat them as advisory.

### Verification
1. Create a case with 6 checklist items and an image scenario.
2. Complete an attempt; confirm scores are written.
3. Submit a reflection; confirm AI feedback comes back.
4. Retake; confirm it's a fresh attempt (prior scores preserved).

---

## Feature 8 — Editable lecture topics

### Why
AI-generated topics are often close but imperfect. Students should be able to rename, merge, or reorder topics without modifying the underlying `lectures.topics` array (which is shared across all users).

### Schema impact
```sql
ALTER TABLE public.user_lecture_settings
  ADD COLUMN topics_override jsonb;    -- null = use lectures.topics; string[] = override
```

### API impact
- **Modified:** `PUT /api/lectures/settings` — accept `topics_override: string[] | null`.

### Component impact
- **Modified:** `components/LectureViewModal.tsx` — add an edit mode for the topics list. User can rename, reorder (dnd-kit), add, or delete.
- **Modified:** `components/ManageLectureCard.tsx` — same edit UI.
- **Modified:** `hooks/useUserLectures.ts` — resolve `display_topics = settings.topics_override ?? lectures.topics`.
- **Modified:** anywhere topics are read for display — switch to `display_topics`.

### UX walkthrough
1. User opens a lecture, sees its topics.
2. Clicks **Edit topics**; rows become editable.
3. Renames "Cardiac AP" to "Cardiac Action Potential"; reorders; saves.
4. Topic mastery breakdown now uses the renamed topic.

### Edge cases
- **Topic rename orphans flashcards** — flashcards reference topics by string. If the user renames "Cardiac AP" → "Cardiac Action Potential", the flashcards still have `topic: "Cardiac AP"`. The renderer should map via a translation layer (compare `topics_override` index-for-index with `lectures.topics`).
- **Reordering topics** — easy; just change array order.
- **Deleting a topic** — move associated cards to "Uncategorized" for that user's view.

### Verification
1. Rename a topic; confirm it displays with the new name.
2. Reorder; confirm new order persists.
3. Delete; confirm associated cards fall under "Uncategorized" in the mastery breakdown.

---

## Feature 9 — Header navigation menu

### Why
The header has grown. Non-admin users should have direct nav links to Lectures, Study Plan, and Progress.

### Schema impact
None. Add a new `/app/progress` route that the existing admin Progress tab can be repurposed into (or build fresh).

### API impact
- **New:** `GET /api/progress/summary` — aggregate stats for the current user (mastery %, streak, cards reviewed, exams taken, time spent by week).

### Component impact
- **Modified:** `components/Header.tsx` — add three nav links: Lectures (`/app`), Study Plan (`/app/plans`), Progress (`/app/progress`). Mobile: hamburger.
- **New:** `app/app/progress/page.tsx` — progress dashboard.
- **Modified:** `components/Dashboard.tsx` — "My Lectures" button removed from here (now in header).

### UX walkthrough
User signs in → Header shows **Lectures | Study Plan | Progress** nav. Active route gets an underline/accent. On mobile, hamburger opens a drawer.

### Edge cases
- **Admin users** — show admin-only items (Admin tab) alongside.
- **Route mismatches** — `/app` is the active state for Lectures; `/app/plans/*` for Study Plan; `/app/progress` for Progress.

### Verification
Click each link; confirm correct page. Active-route styling applies. Mobile hamburger works.

---

## Feature 10 — Dashboard layout polish

### Why
Currently Upload and Custom Session buttons live in the header (cluttered); the Manage Lectures button is verbose. This reorganization is about fit and finish.

### Schema impact
None.

### API impact
None.

### Component impact
- **Modified:** `components/Dashboard.tsx`:
  - Move **Upload** and **Custom Session** buttons to a row directly above the lecture grid.
  - Remove My Lectures button from here (handled by Feature 9).
- **Modified:** `components/FilterBar.tsx`:
  - Add a pencil icon on the leftmost edge of the filter bar that opens Manage Mode (replacing the verbose "Manage Lectures" button).
- **Modified:** `components/Header.tsx`:
  - Remove Upload and Custom Session buttons.
  - Add nav links (per Feature 9).

### UX walkthrough
User signs in → Header is clean (logo, nav, settings, theme, sign-out). Above the grid: tabs (Feature 5), then an action row with Upload + Custom Session + the pencil-icon Manage button. Then filter pills. Then the grid.

### Edge cases
- **Mobile** — the action row must wrap gracefully.
- **Tab interaction** — tabs live above the action row; confirm z-index / focus order.

### Verification
Visual QA on desktop + mobile (≤768px breakpoint). Confirm no actions were lost in the reorganization.

---

## Bug fixes rolled into v3

Not in the feature list, but tracked here because they ship with v3:

- **LoginForm placeholder** — implement or delete.
- **`planNextReview` / `planTestDate` badges on LectureCard** — finally render them. Current props are passed through but unused.
- **Slide-count backfill** — one-time script to populate `lectures.slide_count` for all rows (fixes probing waste documented in `recommendations.md` §3.2).
- **Admin UUID in RLS policy** — replace as part of §0 prereqs.
- **Unused tables** — decide to implement (`sr_card_state`, `shared_decks`) or drop.

---

## v3 implementation order (suggested)

Work in vertical slices that each ship independently:

1. **Prereqs (§0)** — 1 branch, 1 PR. Unblocks everything.
2. **Feature 1 (greetings)** — smallest; good warm-up.
3. **Feature 9 (header nav) + Feature 10 (layout)** — ship together; one UX polish sprint.
4. **Feature 8 (editable topics)** — enables the Review tab's topic-based navigation.
5. **Feature 3 (folders)** — used by several downstream features.
6. **Feature 5 (three tabs) + Feature 6 (worksheets)** — ship together; the tabs are empty without worksheets showing up in Practice.
7. **Feature 4 (Review tab w/ annotations)** — the biggest AI-side feature; ships after tabs are in place.
8. **Feature 2 (subscriptions)** — ships when the user base justifies scoping access. Depends on §0 RLS fix.
9. **Feature 7 (OSCE)** — biggest new surface area; ship Option B first, then layer Option A.

---

## Cross-cutting concerns

- Every v3 merge must pass `npm run typecheck` (once the script exists) and `npm run lint`.
- Every new Anthropic call must go through `lib/api-limits.ts` and call `increment_api_usage`.
- Every new table must have RLS enabled and at least one policy.
- Every schema change goes through the `supabase/migrations/` workflow (once adopted).
- Every new page has a loading state and an error boundary.

---

End of v3 plan. Items here feed into [`todo.md`](./todo.md) for active tracking and [`plan.md`](./plan.md) for the cross-version roadmap.
