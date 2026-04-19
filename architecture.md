# StudyMD Architecture

High-level system design. For file-by-file code reference, see [`documentation.md`](./documentation.md).

---

## 1. System diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                BROWSER                                     │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────┐   │
│  │   /app/* (user)  │   │   /admin/* (admin)│   │   /, /login (public) │   │
│  └────────┬─────────┘   └─────────┬─────────┘   └───────────┬──────────┘   │
└───────────┼─────────────────────────┼─────────────────────────┼─────────────┘
            │                         │                         │
            │  HTTPS, Supabase auth cookie                       │
            ▼                         ▼                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       VERCEL — Next.js 16 App Router                       │
│                                                                            │
│   ┌──────────────────────────────────────────────────────────────────┐    │
│   │  proxy.ts  (Edge middleware)                                      │    │
│   │  - Refreshes session on every request                             │    │
│   │  - Guards /app/* and /admin/* (auth only — NO role checks)        │    │
│   └──────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│   ┌─────────────────────────┐    ┌─────────────────────────────────┐     │
│   │  Server Components       │    │  Route Handlers (/api/*)         │     │
│   │  - createServerClient    │    │  - createServerClient OR         │     │
│   │  - Role checks at page   │    │    service-role (admin)          │     │
│   │    level                 │    │  - Anthropic SDK calls           │     │
│   └────────────┬─────────────┘    └────────┬────────────────────────┘     │
│                │                            │                              │
│                └─────────┬──────────────────┘                              │
│                          │                                                 │
│                          ▼                                                 │
│   ┌──────────────────────────────────────────────────────────────────┐    │
│   │  Client Components ('use client')                                 │    │
│   │  - createClient (browser, anon key)                               │    │
│   │  - localStorage progress sync                                     │    │
│   │  - dnd-kit interactions, lightbox, pomodoro, etc.                 │    │
│   └──────────────────────────────────────────────────────────────────┘    │
└────────────┬─────────────────────────────────────────┬─────────────────────┘
             │                                         │
             │  PostgREST + Supabase JS                │  Anthropic SDK
             ▼                                         ▼
┌─────────────────────────────────┐      ┌────────────────────────────────┐
│    SUPABASE (us-east-2)         │      │   ANTHROPIC API                │
│  ┌─────────────────────────┐    │      │   - claude-haiku-4-5 (default) │
│  │ Postgres (15 tables)    │    │      │   - claude-sonnet-4-6 (fallback)│
│  │ + RLS policies          │    │      │   - cache_control on system    │
│  └─────────────────────────┘    │      └────────────────────────────────┘
│  ┌─────────────────────────┐    │
│  │ Storage                 │    │
│  │  - uploads/ (private)   │    │
│  │  - slides/ (public)     │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ Auth                    │    │
│  │  (email + password)     │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

---

## 2. Data-flow diagrams

### 2.1 Lecture upload + AI generation

```
[User: drops file in UploadModal]
        │
        ▼
[Browser → Supabase Storage] ────────► uploads/{user_id}/{ts}_filename.pdf  (50MB cap)
        │
        ▼
[Browser → POST /api/upload]
        │
        ├─► checkLimits(userId) ────► api_usage table (daily/monthly caps)
        │
        ├─► INSERT processing_jobs (status='pending')
        │
        ▼
[Browser → POST /api/generate { jobId, fileUrl, course, title, internalId }]
        │
        ├─► fetch file from Storage (signed URL, 2-hour TTL)
        │
        ├─► PPTX:  pptxExtractor.extractText() → text block
        │   PDF:   base64 → document content block
        │
        ├─► Anthropic.messages.create({
        │       model: claude-haiku-4-5,
        │       system: buildSystemWithCache()  // ephemeral cache
        │       messages: [...content, "Process as lecture lec_xxx ..."]
        │     })
        │
        ├─► validateLectureJson()
        │       ├─ ok → proceed
        │       └─ fail → retry once with Sonnet 4.6
        │
        ├─► INSERT lectures (immutable content)
        ├─► INSERT user_lecture_settings (default per-user prefs)
        ├─► UPDATE processing_jobs (status='complete', model_used, tokens, cost)
        └─► CALL increment_api_usage(date, calls, in_tokens, out_tokens, cost)
                │
                ▼
[Browser polls GET /api/upload/status until status='complete']
        │
        ▼
[Dashboard re-fetches lectures → new lecture appears in grid]
```

### 2.2 Study session (flashcards)

```
[User clicks "Flashcards" on lecture card]
        │
        ▼
[Navigate to /app/study/flash?lectureId=lec_xxx]
        │
        ├─► Server fetches lecture (json_data.flashcards) + initial progress
        │
        ▼
[FlashcardView renders]
        │
        ├─► User flips card, marks G/M
        │       │
        │       ├─► onProgressUpdate({ gotItIds, missedIds })
        │       │       │
        │       │       ├─► localStorage write (immediate)
        │       │       └─► debounced: POST /api/progress/save
        │       │               │
        │       │               └─► UPSERT user_progress (last-write-wins on updated_at)
        │
        ▼
[Session complete screen → totals + missed-card list]
        │
        └─► onSessionComplete updates dashboard "Continue Studying" pointer
```

### 2.3 Study plan render (today's view)

```
[Dashboard loads]
        │
        ├─► Server: fetch lectures + active study_plan
        │
        ▼
[TodaysPlanWidget receives plan + today's date]
        │
        ├─► plan.schedule[today] → array of internal_ids
        │
        ├─► Cross-reference with progress to compute % complete
        │
        ▼
[Renders today's lectures with checkmarks]
        │
        └─► User checks day → POST /api/plans/[id] (completed_days[])
```

---

## 3. Authentication & authorization

### Layers

| Layer | Where | What it enforces |
|---|---|---|
| **Cookie session** | Edge (`proxy.ts`) | "Are you logged in?" via Supabase `getUser()` |
| **Auth guards** | `proxy.ts` matcher | `/app/*` and `/admin/*` redirect to `/login` if no user |
| **Role check** | Page Server Components | Admin pages call `requireAdmin()` from `lib/admin-auth.ts` |
| **Row Level Security** | Postgres | Each user-scoped table restricts SELECT/UPDATE to `auth.uid() = user_id` |
| **Service-role bypass** | Admin routes only | `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` reads/writes any user's rows |

### Role model

- Roles live on `public.user_profiles.role`: `'admin' | 'student' | 'demo'`.
- The role check runs server-side on each protected page render. Caching role on the client is intentionally avoided.
- The `is_primary` flag on `user_profiles` distinguishes the primary user (Haley) from the rest of the cohort. It controls personalization (greeting selection); it does not grant any additional permissions.

---

## 4. Storage layout

```
Bucket: uploads (private, 50MB limit, PDF/PPTX MIME only)
├── {user_id_a}/
│   ├── 1712345678_lecture_one.pdf
│   └── 1712355678_lecture_two.pptx
└── {user_id_b}/
    └── 1712365678_lecture_three.pdf

Bucket: slides (public, no MIME restriction, no size limit)
├── lec_a1b2c3d4/
│   ├── slide_01.jpg
│   ├── slide_02.jpg
│   └── …
└── lec_e5f6a7b8/
    └── slide_01.jpg
```

**RLS on `storage.objects`:**
- `uploads` — read/insert/delete restricted to the path-prefix matching the user's UUID. A user cannot list or read another user's uploads.
- `slides` — public SELECT (anyone can read by URL). **However, the broad SELECT policy currently allows directory listing**, which leaks lecture IDs. Slated for tightening — see `recommendations.md`.

---

## 5. Caching strategy

| What | Where | TTL |
|---|---|---|
| Anthropic system prompt | Anthropic ephemeral cache | Anthropic-managed (5 min idle, refreshed on hit) |
| Static assets | Vercel edge | Long, content-hashed |
| Session cookie | Browser cookie | 7 days, refreshed on every request via `proxy.ts` |
| User progress | localStorage (`studymd_progress_*`) | Persistent until cleared |
| Last activity pointer | localStorage (`studymd_last_activity`) | Persistent |
| Pomodoro state | localStorage (`studymd_pomodoro_*`) | Persistent across reloads |

There is no Redis / Upstash / Vercel KV. All server-side caching is either Anthropic's prompt cache or Vercel's CDN.

---

## 6. Cost-control architecture

```
[/api/generate request]
        │
        ▼
checkLimits(userId)  ─────────────► api_usage (daily call/cost cap)
        │
        ▼
estimateTokensFromBytes() / estimateCost()  ◄─── lib/api-limits.ts (single source of truth)
        │
        ▼
Anthropic.messages.create(...)
        │
        ▼
increment_api_usage(date, calls, in_tokens, out_tokens, cost)  ─► api_usage RPC
                                                                      │
                                                                      ▼
                                                      [Admin Usage tab reads aggregates]
```

Limits today (defined in `lib/api-limits.ts`):

| Cap | Value |
|---|---|
| Max lecture processing calls / day | **5** |
| Max input tokens / day | **500,000** |
| Max output tokens / day | **150,000** |
| Max monthly spend | **$5.00 USD** |
| Max upload file size | **50 MB** |
| Token warning threshold | **200,000** |
| Token hard reject | **400,000** |

The Batch API (50% discount) is wired but disabled (`BATCH_API_ENABLED: false`).

---

## 7. Extension points

When adding a new feature, the typical hook points are:

| Concern | Place to extend |
|---|---|
| New API endpoint | `app/api/<domain>/route.ts` (must call `requireAdmin()` if admin-only) |
| New page | `app/app/<route>/page.tsx` (user) or `app/admin/<route>/page.tsx` (admin) |
| New table | Supabase MCP `apply_migration` + corresponding TypeScript type in `types/index.ts` + RLS policy + entry in `decisions.md` |
| New AI prompt | `lib/<feature>-prompt.ts`, mirroring `lecture-processor-prompt.ts`'s shape |
| New theme | Add a token to `styles/themes.css`, extend the `Theme` union in `types/index.ts`, extend `resolveColor` in `hooks/useUserLectures.ts` |
| New global setting | `system_config` table (key/value JSONB) — keep magic strings out of source |
| New shared component | `components/<Name>.tsx` (study modules go in `components/study/`) |
| New custom hook | `hooks/use<Name>.ts` |

---

## 8. Deployment topology

```
[GitHub: syrianxo/studymd, branch main]
        │ push
        ▼
[Vercel: build + deploy]
        │
        ├─► Build (next build)
        │
        └─► Edge: proxy.ts
            Region: us-east-1 (Vercel default for this account)
            Secrets injected from Vercel project env:
              - NEXT_PUBLIC_SUPABASE_URL
              - NEXT_PUBLIC_SUPABASE_ANON_KEY
              - SUPABASE_SERVICE_ROLE_KEY
              - ANTHROPIC_API_KEY

[Supabase: project vimuhpoeuvfzpzfeorsw, region us-east-2]
        │
        ├─► Postgres 17.6 (managed)
        ├─► Storage (S3-compatible, managed)
        └─► Auth (managed)
```

There is no GitHub Actions configuration in the repo. Vercel's GitHub integration handles CI/CD entirely. There is no staging environment; previews are per-PR via Vercel's automatic preview URLs.

---

## 9. Failure modes worth knowing

| Failure | Surfacing | Mitigation |
|---|---|---|
| Anthropic returns invalid JSON | Validation fails in `app/api/generate/route.ts` | Auto-retry once with Sonnet 4.6 |
| Anthropic truncates output | Same path | Same retry (Sonnet has 64K output cap vs Haiku's 8K) |
| PPTX has no extractable text | `pptx-extractor.ts` returns <200 chars | Route returns 422 with "export as PDF" message |
| Daily/monthly cost cap hit | `checkLimits()` returns `allowed:false` | Upload route returns 429 with friendly reason |
| Storage upload fails mid-flight | Browser surfaces error | User retries; orphan files cleaned by Storage TTL (manual today) |
| Vercel build cache stale | Symptoms: route 404 or stale code | Bust by adding a no-op comment + redeploy |
| `/admin` redirect loop | Symptoms: 30+ hops | Confirm role check is in page Server Component, not `proxy.ts` |
| RLS blocks legitimate query | Symptoms: empty result | Confirm `auth.uid()` matches `user_id`; check policy with Supabase MCP `pg_policies` query |

---

## 10. What's intentionally NOT in the system

- No SSR data layer (TanStack Query, SWR) — Server Components handle data fetch.
- No state library (Redux, Zustand) — local component state + URL params + localStorage.
- No GraphQL — Supabase PostgREST + small set of REST routes.
- No microservices — single Next.js app.
- No real-time websockets — Supabase Realtime is available but unused.
- No queue system — `processing_jobs` table polled by client; sufficient at current scale.
- No CDN-side image optimization beyond `next/image` defaults.
- No A/B testing or feature-flag service — single cohort, single experience.

These are deliberate scope choices for a small private app, documented here so future contributors don't reach for them by reflex.
