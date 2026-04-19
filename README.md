# StudyMD

> **A lecture-mastery platform built for medical students.** Upload a lecture, and within minutes StudyMD turns it into a structured study package — flashcards, board-style practice questions, and a study schedule that gets you ready for test day.

StudyMD is a private, single-cohort web app: you upload your own course slides, and the app converts them into the kind of study materials you'd otherwise spend hours making by hand. Everything is yours, scoped to your account, and synced across devices.

---

## What StudyMD does

When you upload a lecture (PDF or PowerPoint), StudyMD:

1. **Extracts the slides** and stores them as images you can flip through.
2. **Reads the content** with Claude (Anthropic's AI) and produces:
   - **Topics** — an ordered map of what the lecture covers.
   - **Flashcards** — front/back cards tagged by topic and difficulty.
   - **Practice questions** — board-style multiple-choice, true/false, short-answer, and clinical vignettes, each with a worked explanation.
3. **Adds it to your dashboard** so you can study it on any device, in any of three themes, in whatever order makes sense for you.

You then study using one of three modes:

- **Flashcards** — flip-card review with keyboard shortcuts, slide thumbnails, and got-it/missed tracking.
- **Practice exam** — graded session with explanations after each answer.
- **Custom session** — pick lectures and topics, set the question count and difficulty, and go.

When the test date is in sight, you can also build a **Study Plan**: pick the lectures, set the test date, and StudyMD spreads them across the days leading up to it.

---

## Feature highlights

| | |
|---|---|
| **AI-generated study packages** | Each lecture becomes 20–50+ flashcards and 10–25+ board-style questions, automatically. |
| **Three study modes** | Flashcards, full practice exams, custom multi-lecture sessions. |
| **Study plans** | Test-date-driven schedules that show you exactly what to review today. |
| **Pomodoro timer** | Built-in 25/5 focus timer with a mini-pill in the header. |
| **Three themes** | Midnight (default), pink, forest. Theme syncs across devices. |
| **Customizable lecture grid** | Drag-to-reorder, hide, archive, retitle, recolor, retag — it stays your shelf. |
| **Slide viewer with lightbox** | Click any slide thumbnail to view full-screen. |
| **Cross-device progress sync** | Mark a card "got it" on your phone, see it on your laptop. |
| **Feedback widget** | Floating button in every page sends bugs and suggestions straight to the admin inbox. |
| **Admin dashboard** | Cohort-wide overview: usage, costs, users, lectures, feedback, configuration. |

---

## Supported lecture formats

- **PDF** — preferred. Scanned and digital PDFs both work.
- **PPTX** — works for text-based PowerPoints. If your PPTX is mostly images of text, you'll get a friendlier result by exporting it to PDF first (PowerPoint → File → Export → PDF).
- **Maximum file size:** 50 MB.

Worksheets and assignment uploads (Practice-only mode) are coming in v3.

---

## Course scope

StudyMD currently understands lectures in three Physician Assistant courses:

- Physical Diagnosis I
- Anatomy & Physiology
- Laboratory Diagnosis

You can override the course assignment per lecture from the lecture's view modal.

---

## Quick start (for new users)

1. **Sign up** at the login page (your cohort coordinator will provide the link).
2. **Upload your first lecture** — click **Upload** in the header, drop in the PDF or PPTX, pick the course, and click submit.
3. **Wait ~60 seconds** while Claude processes the slides. You'll see a progress bar.
4. **Study** — when the lecture appears on your dashboard, click **Flashcards** or **Practice Exam**.
5. **Build a Study Plan** when a test is on the horizon — go to **Study Plans** and tell it the test date.

You can change your theme any time from the settings dropdown in the header. You can also reorder, hide, and customize lectures from the **Manage Lectures** page.

---

## Keyboard shortcuts (during study)

**Flashcards:**
- `Space` — flip the card
- `G` — mark as got it
- `M` — mark as missed
- `← / →` — previous / next card
- `L` — lightbox (full-screen slide viewer)
- `S` — toggle slide sidebar

---

## Tech stack at a glance

- **Web framework:** Next.js 16 (App Router) + React 19
- **Database & auth:** Supabase (Postgres, Auth, Storage)
- **AI:** Anthropic Claude (Haiku 4.5 default, Sonnet 4.6 fallback for dense lectures)
- **Hosting:** Vercel
- **Styling:** Tailwind CSS v4 with hand-rolled CSS modules per theme

---

## Privacy & data ownership

- **Authentication** is handled by Supabase Auth (email + password, with leaked-password protection coming).
- **Your uploaded files** live in a private Supabase Storage bucket scoped to your user ID — no other user can access them.
- **Generated slide images** live in a separate, world-readable bucket (only the slide URLs themselves; the URLs are not enumerable from outside the app).
- **Your study progress** is stored per-user in a Supabase table with row-level security; another user cannot read it.
- **Admin access** is reserved for the cohort coordinator and is required only for cohort-level analytics and configuration.

If you're concerned about a specific file, click the three-dot menu on its lecture card and choose **Delete** — both the file and the generated study package will be removed.

---

## Get help / give feedback

Click the floating **Feedback** button on the right edge of any page. Bug reports, content errors, and suggestions all route to the admin inbox and are usually triaged within a day.

---

## For engineers and contributors

If you're here to work on the codebase, start with:

- [`documentation.md`](./documentation.md) — comprehensive engineer-facing reference (file audit, API reference, function registry, database reference, feature walkthroughs).
- [`CLAUDE.md`](./CLAUDE.md) — conventions and gotchas for future Claude Code sessions and human contributors alike.
- [`architecture.md`](./architecture.md) — high-level system design with diagrams.
- [`recommendations.md`](./recommendations.md) — prioritized backlog of improvements (security, performance, code quality, new features).
- [`development_plan_v3.md`](./development_plan_v3.md) — the v3 feature roadmap.
- [`plan.md`](./plan.md) — the master plan tracking v2, v2.5, v3, and v4 progress.
- [`decisions.md`](./decisions.md) — Architecture Decision Records.
- [`todo.md`](./todo.md) — the living working checklist.

Made with care.
