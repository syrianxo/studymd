// components/Dashboard.tsx
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from './Header';
import { FilterBar, type FilterState } from './FilterBar';
import LectureGrid from './LectureGrid';
import { ManageMode } from './ManageMode';
import CustomSessionModal, { type CustomSessionConfig } from './CustomSessionModal';
import { useUserLectures, resolveColor } from '@/hooks/useUserLectures';
import type { Lecture } from '@/hooks/useUserLectures';
import { useProgress } from '@/hooks/useProgress';
import { createClient } from '@/lib/supabase';
import PomodoroTimer from '@/components/PomodoroTimer';
import { StudyConfigManager, useStudyConfig } from '@/components/StudyConfigManager';
import TodaysPlanWidget from '@/components/TodaysPlanWidget';
import type { Course, Theme, StudyPlan } from '@/types';
import type { FlashcardConfig } from '@/components/study/FlashcardConfigModal';
import type { ExamConfig } from '@/components/study/ExamConfigModal';

interface DashboardProps {
  userName?: string;
  isPrimary?: boolean;
  initialTheme?: Theme;
}

export default function Dashboard({
  userName = 'there',
  isPrimary = false,
  initialTheme: initialThemeProp = 'midnight',
}: DashboardProps) {
  const {
    lectures,
    courses,
    loading: lecturesLoading,
    error: lecturesError,
    refetch,
  } = useUserLectures();

  const {
    progressByLecture,
    globalStats,
    loading: progressLoading,
  } = useProgress();

  const [filter, setFilter] = useState<FilterState>({
    courses: new Set<Course>(),
    tags: new Set<string>(),
    showArchived: false,
    showHidden: false,
  });
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(initialThemeProp);
  const studyConfig = useStudyConfig();

  // ── Active study plan (for dashboard widget + lecture badges) ────────────────
  const [activePlan, setActivePlan] = useState<StudyPlan | null>(null);
  useEffect(() => {
    fetch('/api/plans')
      .then(r => r.json())
      .then(({ plans }) => {
        const active = (plans ?? []).filter((p: StudyPlan) => p.is_active);
        active.sort((a: StudyPlan, b: StudyPlan) => a.test_date.localeCompare(b.test_date));
        setActivePlan(active[0] ?? null);
      })
      .catch(() => {});
  }, []);

  // Build lectureId → next scheduled date (on-or-after today) from active plan
  const planNextReview = useMemo((): Record<string, string> => {
    if (!activePlan) return {};
    const today = new Date().toISOString().slice(0, 10);
    const schedule = activePlan.schedule as Record<string, string[]>;
    const futureDays = Object.keys(schedule).filter(d => d >= today).sort();
    const result: Record<string, string> = {};
    for (const day of futureDays) {
      for (const id of schedule[day]) {
        if (!result[id]) result[id] = day;
      }
    }
    return result;
  }, [activePlan]);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('studymd_theme') as Theme | null;
      if (stored === 'midnight' || stored === 'pink' || stored === 'forest') {
        setTheme(stored);
        // Ensure the data-theme attribute is applied on the html element
        document.documentElement.dataset.theme = stored;
      }
    } catch {}
  }, []);

  const visibleLectures = useMemo(
    () =>
      lectures.filter((l) => {
        if (!l.visible || l.archived) return false;
        if (filter.courses.size > 0 && !filter.courses.has(l.course)) return false;
        return true;
      }),
    [lectures, filter.courses]
  );

  // ── Stats ─────────────────────────────────────────────────────────────────
  const avgScore = progressLoading || globalStats.avgExamScore === null
    ? null
    : globalStats.avgExamScore;

  const buildLectureWithSettings = useCallback((lecture: Lecture) => ({
    ...lecture,
    json_data: {
      ...lecture.json_data,
      flashcards: lecture.json_data?.flashcards ?? [],
      exam_questions: (lecture.json_data as any)?.questions ?? [],
    },
    settings: {
      user_id: userId ?? '',
      internal_id: lecture.internal_id,
      display_order: lecture.display_order,
      visible: lecture.visible,
      archived: lecture.archived,
      group_id: lecture.group_id ?? null,
      tags: lecture.tags ?? [],
      course_override: lecture.course_override ?? null,
      color_override: lecture.color_override ?? null,
      custom_title: lecture.custom_title ?? null,
    },
    display_title: lecture.custom_title ?? lecture.title,
    display_course: (lecture.course_override ?? lecture.course) as Course,
    display_color:  resolveColor(lecture, theme),
  }), [userId, theme]);

  function handleStartFlash(lectureId: string) {
    const lecture = lectures.find(l => l.internal_id === lectureId);
    if (lecture) {
      studyConfig.openFlashcards(buildLectureWithSettings(lecture));
    } else {
      window.location.href = `/app/study/flash?lecture=${lectureId}`;
    }
  }

  function handleStartExam(lectureId: string) {
    const lecture = lectures.find(l => l.internal_id === lectureId);
    if (lecture) {
      studyConfig.openExam(buildLectureWithSettings(lecture));
    } else {
      window.location.href = `/app/study/exam?lecture=${lectureId}`;
    }
  }

  function handleStartFlashWithConfig(config: FlashcardConfig, lectureId: string) {
    const topicsParam = config.topics.map(encodeURIComponent).join(',');
    window.location.href =
      `/app/study/flash?lecture=${lectureId}&count=${config.count}&topics=${topicsParam}&order=${config.order}`;
  }

  function handleStartExamWithConfig(config: ExamConfig, lectureId: string) {
    const topicsParam = config.topics.map(encodeURIComponent).join(',');
    const typesParam = config.types.join(',');
    window.location.href =
      `/app/study/exam?lecture=${lectureId}&count=${config.count}&topics=${topicsParam}&types=${typesParam}`;
  }

  function handleCustomSession(config: CustomSessionConfig) {
    const params = new URLSearchParams({
      mode: config.mode,
      lectures: config.lectureIds.join(','),
      topics: config.topics.join(','),
      count: String(config.count),
      types: config.questionTypes.join(','),
    });
    window.location.href = `/app/study/custom?${params.toString()}`;
  }

  function handleChangeCourse(internalId: string, course: Course) {
    fetch('/api/lectures/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalId, updates: { courseOverride: course } }),
    }).then(() => refetch()).catch(console.error); // fix #5: refetch after course change
  }

  function handleChangeColor(internalId: string, color: string) {
    // No-op here: LectureCard and LectureViewModal now call the API directly
    // with theme-keyed colorOverride, bypassing this to avoid refetch flicker.
    // ManageMode handles its own API calls too.
    // We only refetch if called from a path that doesn't do its own optimistic update.
  }

  async function handleHide(internalId: string) {
    await fetch('/api/lectures/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalId, updates: { visible: false } }),
    });
    refetch();
  }

  async function handleArchive(internalId: string) {
    await fetch('/api/lectures/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalId, updates: { archived: true } }),
    });
    refetch();
  }

  function handleRenameTitle(internalId: string, title: string) {
    fetch('/api/lectures/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalId, updates: { customTitle: title } }),
    }).then(() => refetch()).catch(console.error);
  }

  if (lecturesError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header
          lectureCount={0}
          loading
          userId={userId ?? ''}
          initialTheme={theme}
        />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 42 }}>⚠️</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            Couldn&apos;t load lectures
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 360 }}>{lecturesError}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  const greeting = isPrimary ? `Hey Haley 👋` : `Welcome back, ${userName}`;

  // Rotating affirmations for Haley — picked once per mount
  const HALEY_SUBTITLES = [
    'Your lecture mastery awaits ✨',
    'Ready to conquer your exams? Let\'s go. 💪',
    'Every card you flip is one step closer. Keep going. 🩵',
    'You\'ve got this, Haley. One lecture at a time.',
    'Built just for you, studied just by you. 🎓',
    'Your hard work is paying off. Keep studying. ⭐',
    'PA school\'s toughest student just logged in. 🩺',
    'New day, new mastery. What are we studying today?',
    'Knowledge is power. And you\'re powerfully smart. 💙',
    'The flashcards are ready. Are you? Let\'s master it.',
  ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const haleySubtitle = useMemo(
    () => HALEY_SUBTITLES[Math.floor(Math.random() * HALEY_SUBTITLES.length)],
    // Only pick once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <>
      <style>{dashboardCss}</style>

      <Header
        lectureCount={visibleLectures.length}
        loading={lecturesLoading}
        userId={userId ?? ''}
        initialTheme={theme}
      />

      <main className="smd-dashboard" id="mainDashboard">

        {/* ── HERO (centered, Option A glass card) ────────────────────────── */}
        <section className="smd-hero">
          <h1 className="smd-hero-title">
            {greeting} — master your <em>lectures</em> with ease.
          </h1>
          {/* Stats — visible on all screen sizes */}
          <div className="smd-hero-stats-row">
            <span>
              <strong className="smd-stat-accent">{avgScore !== null ? `${avgScore}%` : '—'}</strong>
              {' avg'}
            </span>
            <span aria-hidden>·</span>
            <span>
              <strong className="smd-stat-plain">{lecturesLoading ? '—' : visibleLectures.length}</strong>
              {' lectures'}
            </span>
            <span aria-hidden>·</span>
            <span>
              <strong className="smd-stat-warning">🔥 {globalStats.studyStreak ?? 0}</strong>
              {' day streak'}
            </span>
          </div>
        </section>

        {/* ── TWO-COLUMN: plan left, pomodoro right ──────────────────────── */}
        <div className="smd-dashboard-columns">
          <div className="smd-plan-col">
            <TodaysPlanWidget onStartLecture={handleStartFlash} />
          </div>
          <aside className="smd-side-col">
            <PomodoroTimer />
          </aside>
        </div>

        {/* Subtitle — below widgets, above lecture grid */}
        <p className="smd-section-subtitle">
          {isPrimary
            ? haleySubtitle
            : 'Select a lecture below to study with adaptive flashcards or challenge yourself with a practice exam.'}
        </p>

        {/* ── SECTION HEADER ──────────────────────────────────────────────── */}
        <div className="smd-section-header">
          <div className="smd-section-title">
            Your Lectures
            {!lecturesLoading && (
              <span className="smd-lecture-count-badge">{visibleLectures.length}</span>
            )}
          </div>
          <div className="smd-section-actions">
            <button
              className="btn btn-primary smd-custom-session-btn"
              onClick={() => setCustomModalOpen(true)}
            >
              ✦ Custom Session
            </button>
            <button
              className="smd-icon-btn"
              onClick={() => setManageOpen(v => !v)}
              aria-label={manageOpen ? 'Done managing' : 'Manage lectures'}
              title={manageOpen ? 'Done' : 'Manage lectures'}
            >
              {manageOpen ? '✓' : '✎'}
            </button>
          </div>
        </div>

        {!manageOpen && (
          <FilterBar
            allCourses={courses}
            allTags={[]}
            filter={filter}
            onChange={setFilter}
          />
        )}

        {manageOpen && userId && (
          <ManageMode
            userId={userId}
            activeTheme={theme}
            initialLectures={lectures.map((l) => ({
              ...l,
              settings: {
                user_id:         userId,
                internal_id:     l.internal_id,
                display_order:   l.display_order,
                visible:         l.visible,
                archived:        l.archived,
                group_id:        l.group_id,
                tags:            l.tags,
                course_override: l.course_override,
                color_override:  l.color_override,
                custom_title:    l.custom_title,
              },
              display_title:  l.custom_title   ?? l.title,
              display_course: l.course_override ?? l.course,
              display_color:  resolveColor(l, theme),
            }))}
            onOpenLecture={(id) => {
              setManageOpen(false);
              handleStartFlash(id);
            }}
          />
        )}

        {!manageOpen && (
          <LectureGrid
            lectures={visibleLectures}
            progressByLecture={progressByLecture}
            loading={lecturesLoading}
            activeTheme={theme}
            onStartFlash={handleStartFlash}
            onStartExam={handleStartExam}
            onChangeCourse={handleChangeCourse}
            onChangeColor={handleChangeColor}
            onHide={handleHide}
            onArchive={handleArchive}
            onRenameTitle={handleRenameTitle}
            planNextReview={planNextReview}
            planTestDate={activePlan?.test_date}
          />
        )}
      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="smd-footer">
        <div className="smd-footer-inner">
          <div className="smd-footer-top">
            <div className="smd-footer-brand">
              <div className="smd-logo">
                <span className="smd-logo-study">Study</span>
                <span className="smd-logo-md">MD</span>
              </div>
              <p className="smd-footer-dedication">
                A personalized lecture mastery platform designed for the one and only{' '}
                <em>Haley Lange</em>
              </p>
              <div className="smd-footer-status">
                <span className="smd-footer-dot" />
                Platform active
              </div>
            </div>

            <div className="smd-footer-links">
              <div className="smd-footer-col">
                <div className="smd-footer-col-label">Navigate</div>
                <a href="#mainDashboard" className="smd-footer-link">Back to top</a>
                <a href="/app" className="smd-footer-link">Dashboard</a>
                <a href="/app/lectures" className="smd-footer-link">My Lectures</a>
                <a href="/app/plans" className="smd-footer-link">Study Plans</a>
                <a href="/app/upload" className="smd-footer-link">Upload Lecture</a>
              </div>
              <div className="smd-footer-col">
                <div className="smd-footer-col-label">Your Data</div>
                <button
                  className="smd-footer-link smd-footer-btn"
                  onClick={() => {
                    if (confirm('Reset all progress? This cannot be undone.')) {
                      localStorage.clear();
                      window.location.reload();
                    }
                  }}
                >
                  Reset Progress
                </button>
                <button
                  className="smd-footer-link smd-footer-btn"
                  onClick={() => {
                    localStorage.clear();
                    alert('Cache cleared.');
                  }}
                >
                  Clear Cache
                </button>
              </div>
            </div>
          </div>

          <div className="smd-footer-bottom">
            <span>© 2026 StudyMD. All rights reserved.</span>
            <span className="smd-footer-credit">
              Built with{' '}
              <a href="https://anthropic.com" target="_blank" rel="noopener noreferrer" className="smd-footer-link-inline">
                Anthropic Claude
              </a>{' '}
              — a{' '}
              <a href="https://tutormd.com" target="_blank" rel="noopener noreferrer" className="smd-footer-link-inline">
                TutorMD
              </a>{' '}
              product
            </span>
          </div>
        </div>
      </footer>

      <StudyConfigManager
        {...studyConfig}
        onStartFlashcards={(lecture, config) =>
          handleStartFlashWithConfig(config, lecture.internal_id)
        }
        onStartExam={(lecture, config) =>
          handleStartExamWithConfig(config, lecture.internal_id)
        }
      />
      <CustomSessionModal
        isOpen={customModalOpen}
        lectures={lectures}
        onClose={() => setCustomModalOpen(false)}
        onStart={(config) => {
          setCustomModalOpen(false);
          handleCustomSession(config);
        }}
      />
      {/* UploadModal removed — upload lives at /app/upload */}
    </>
  );
}

// ── Scoped CSS ───────────────────────────────────────────────────────────────
const dashboardCss = `
/* ── Visibility utils ──────────────────────────────────────────────────── */
.smd-mobile-only  { display: none; }
.smd-desktop-only { display: flex; }

@media (max-width: 767px) {
  .smd-mobile-only  { display: flex !important; }
  .smd-desktop-only { display: none !important; }
}

/* ── Hero (centered, Option A — glass card) ────────────────────────────── */
.smd-hero {
  text-align: center;
  max-width: 720px;
  margin: 1.5rem auto 1.75rem;
  padding: 2.25rem 2.5rem 2rem;
  background: color-mix(in srgb, var(--surface) 55%, transparent);
  border: 1px solid var(--border);
  border-radius: 24px;
  backdrop-filter: blur(12px);
  position: relative;
  overflow: hidden;
}

/* Ambient accent glow behind the title */
.smd-hero::before {
  content: '';
  position: absolute;
  top: -50%;
  left: 50%;
  transform: translateX(-50%);
  width: 70%;
  height: 180px;
  background: radial-gradient(ellipse at center,
    color-mix(in srgb, var(--accent) 18%, transparent) 0%,
    transparent 70%);
  pointer-events: none;
}

.smd-hero-title {
  font-family: 'Fraunces', serif;
  font-size: clamp(1.5rem, 3.5vw, 2.5rem);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.5px;
  color: var(--text);
  margin-bottom: 1rem;
  position: relative;
}

.smd-hero-title em {
  font-style: italic;
  font-weight: 300;
  color: var(--accent);
}

/* Stats row — always visible on all screen sizes */
.smd-hero-stats-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--text-muted);
  font-size: 13px;
  font-family: 'DM Mono', monospace;
  flex-wrap: wrap;
  position: relative;
}

/* ── Subtitle below widgets ────────────────────────────────────────────── */
.smd-section-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.65;
  margin-bottom: 1.25rem;
}

/* ── Two-column layout ─────────────────────────────────────────────────── */
.smd-dashboard-columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

@media (min-width: 1024px) {
  .smd-dashboard-columns {
    grid-template-columns: minmax(0, 1fr) minmax(260px, auto);
    align-items: start;
  }
}

.smd-plan-col { min-width: 0; }

.smd-side-col {
  display: none;
}

@media (min-width: 1024px) {
  .smd-side-col { display: block; }
}

.smd-stat-accent  { font-weight: 500; color: var(--accent); }
.smd-stat-plain   { font-weight: 500; color: var(--text); }
.smd-stat-warning { font-weight: 500; color: var(--warning, #f59e0b); }

/* ── Section header ────────────────────────────────────────────────────── */
.smd-lecture-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
  background: rgba(255,255,255,0.07);
  border-radius: 100px;
  padding: 1px 8px;
  margin-left: 8px;
  vertical-align: middle;
}

.smd-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 10px;
  flex-wrap: wrap;
}

.smd-section-title {
  font-family: 'Fraunces', serif;
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}

.smd-section-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.smd-section-actions .btn {
  font-size: 12px;
  padding: 8px 15px;
  min-height: 36px;
}

/* ── Icon button (manage) ──────────────────────────────────────────────── */
.smd-icon-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 16px;
  transition: background 0.15s, color 0.15s;
}

.smd-icon-btn:hover { background: rgba(255,255,255,0.06); }

/* ── Footer ────────────────────────────────────────────────────────────── */
.smd-footer {
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 60%, var(--bg));
  margin-top: 80px;
}

.smd-footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 48px 40px 32px;
}

.smd-footer-top {
  display: flex;
  justify-content: space-between;
  gap: 48px;
  margin-bottom: 40px;
  flex-wrap: wrap;
}

.smd-footer-brand {
  flex: 1 1 260px;
  min-width: 0;
}

.smd-footer-dedication {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
  margin-top: 10px;
  max-width: 320px;
}

.smd-footer-dedication em {
  color: var(--accent);
  font-style: normal;
  font-weight: 600;
}

.smd-footer-status {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 14px;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.smd-footer-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success, #10b981);
  box-shadow: 0 0 8px var(--success, #10b981);
  animation: smd-pulse 2s infinite;
  flex-shrink: 0;
}

.smd-footer-links {
  display: flex;
  gap: 48px;
  flex-shrink: 0;
}

.smd-footer-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.smd-footer-col-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.smd-footer-link {
  font-size: 13px;
  color: var(--text-dim, #9ca3af);
  text-decoration: none;
  transition: color 0.15s;
  font-family: 'Outfit', sans-serif;
  line-height: 1.4;
}

.smd-footer-link:hover {
  color: var(--text);
}

.smd-footer-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-align: left;
  min-height: 44px;
  display: flex;
  align-items: center;
}

.smd-footer-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  border-top: 1px solid var(--border);
  padding-top: 20px;
  font-size: 12px;
  color: var(--text-muted);
}

.smd-footer-link-inline {
  color: var(--accent);
  text-decoration: none;
  transition: opacity 0.15s;
}

.smd-footer-link-inline:hover { opacity: 0.8; }

/* ── Mobile overrides ─────────────────────────────────────────────────── */
@media (max-width: 767px) {
  .smd-hero { margin: 1.5rem auto 1rem; }
  .smd-section-actions .btn { min-height: 44px; }
  .smd-footer-inner { padding: 36px 16px 24px; }
  .smd-footer-top   { flex-direction: column; gap: 32px; }
  .smd-footer-links { flex-wrap: wrap; gap: 28px; }
  .smd-footer-bottom {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
`;
