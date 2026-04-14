// components/Dashboard.tsx
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Header from './Header';
import { FilterBar, type FilterState } from './FilterBar';
import LectureGrid from './LectureGrid';
import { ManageMode } from './ManageMode';
import CustomSessionModal, { type CustomSessionConfig } from './CustomSessionModal';
import { useUserLectures } from '@/hooks/useUserLectures';
import type { Lecture } from '@/hooks/useUserLectures';
import { useProgress } from '@/hooks/useProgress';
import { createClient } from '@/lib/supabase';
import UploadModal from '@/components/UploadModal';
import PomodoroTimer from '@/components/PomodoroTimer';
import { StudyConfigManager, useStudyConfig } from '@/components/StudyConfigManager';
import type { Course, Theme } from '@/types';
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
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialThemeProp);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const studyConfig = useStudyConfig();

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

  // ── Last-activity "Continue Studying" ──────────────────────────────────────
  const [lastActivity, setLastActivity] = useState<{ type: string; id: string } | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('studymd_last_activity');
      if (raw) setLastActivity(JSON.parse(raw));
    } catch {}
  }, []);

  const continueHref = lastActivity
    ? `/app/study/${lastActivity.type}?lecture=${lastActivity.id}`
    : visibleLectures[0]
      ? `/app/study/flash?lecture=${visibleLectures[0].internal_id}`
      : null;

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
    display_color: lecture.color_override ?? lecture.color,
  }), [userId]);

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

  function handleLectureCreated(_internalId: string) {
    setShowUploadModal(false);
    refetch();
  }

  function handleChangeCourse(internalId: string, course: Course) {
    fetch('/api/lectures/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalId, updates: { courseOverride: course } }),
    }).catch(console.error);
  }

  function handleChangeColor(internalId: string, color: string) {
    fetch('/api/lectures/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalId, updates: { colorOverride: color } }),
    }).catch(console.error);
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

  if (lecturesError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header
          lectureCount={0}
          loading
          userId={userId ?? ''}
          initialTheme={theme}
          onUploadClick={() => setShowUploadModal(true)}
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

  const greeting = isPrimary ? `Hey Haley 👋` : `Hey ${userName} 👋`;

  return (
    <>
      <style>{dashboardCss}</style>

      <Header
        lectureCount={visibleLectures.length}
        loading={lecturesLoading}
        userId={userId ?? ''}
        initialTheme={theme}
        onUploadClick={() => setShowUploadModal(true)}
      />

      <main className="smd-dashboard" id="mainDashboard">

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section className="smd-hero">
          <div className="smd-hero-left">
            <h1 className="smd-hero-heading">
              {greeting}, master your<br />
              <em>lectures</em> with ease.
            </h1>

            {/* Mobile inline stats — sits right below the greeting on small screens */}
            <div className="smd-hero-inline-stats smd-mobile-only">
              <span className="smd-inline-stat">
                <span className="smd-inline-val accent">{avgScore !== null ? `${avgScore}%` : '—'}</span>
                <span className="smd-inline-label">avg</span>
              </span>
              <span className="smd-inline-sep">·</span>
              <span className="smd-inline-stat">
                <span className="smd-inline-val">{lecturesLoading ? '—' : visibleLectures.length}</span>
                <span className="smd-inline-label">lectures</span>
              </span>
              <span className="smd-inline-sep">·</span>
              <span className="smd-inline-stat">
                <span className="smd-inline-val warning">🔥 {globalStats.studyStreak ?? 0}</span>
                <span className="smd-inline-label">streak</span>
              </span>
            </div>

            <p className="smd-hero-sub">
              {isPrimary
                ? 'Your personalized lecture mastery platform, designed just for you. ✨'
                : 'Select a lecture below to study with adaptive flashcards or challenge yourself with a practice exam.'}
            </p>

            {continueHref && (
              <Link href={continueHref} className="smd-continue-btn">
                Continue Studying
                <span className="smd-continue-arrow">→</span>
              </Link>
            )}
          </div>

          {/* Desktop right column — Pomodoro + stat card (hidden on mobile) */}
          <div className="smd-hero-right smd-desktop-only">
            <div className="smd-hero-pomodoro">
              <PomodoroTimer />
            </div>
            <div className="smd-hero-stats">
              <div className="smd-hero-stat">
                <span className="smd-hero-stat-value accent">
                  {avgScore !== null ? `${avgScore}%` : '—'}
                </span>
                <span className="smd-hero-stat-label">avg score</span>
              </div>
              <div className="smd-hero-stat-divider" />
              <div className="smd-hero-stat">
                <span className="smd-hero-stat-value dim">
                  {lecturesLoading ? '—' : visibleLectures.length}
                </span>
                <span className="smd-hero-stat-label">lectures</span>
              </div>
              <div className="smd-hero-stat-divider" />
              <div className="smd-hero-stat">
                <span className="smd-hero-stat-value warning">
                  🔥 {globalStats.studyStreak ?? 0}
                </span>
                <span className="smd-hero-stat-label">day streak</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION HEADER ──────────────────────────────────────────────── */}
        <div className="smd-section-header">
          <div className="smd-section-title">
            Your Lectures
            {!lecturesLoading && (
              <span className="smd-lecture-count-badge">{visibleLectures.length}</span>
            )}
          </div>

          {/* Desktop actions — always visible */}
          <div className="smd-section-actions smd-desktop-actions">
            <button
              className="btn btn-ghost"
              onClick={() => setManageOpen((v) => !v)}
            >
              {manageOpen ? '✓ Done' : '✏️ Manage'}
            </button>
            <button
              className="btn btn-primary smd-custom-session-btn"
              onClick={() => setCustomModalOpen(true)}
            >
              ✦ Custom Study
            </button>
          </div>

          {/* Mobile actions — overflow "..." menu */}
          <div className="smd-section-actions smd-mobile-actions">
            <button
              className="btn btn-ghost smd-mobile-overflow-btn"
              onClick={() => setMobileActionsOpen(o => !o)}
              aria-label="More actions"
              aria-expanded={mobileActionsOpen}
            >
              ⋯
            </button>
            {mobileActionsOpen && (
              <div className="smd-mobile-actions-dropdown">
                <button
                  className="smd-mobile-action-item"
                  onClick={() => { setManageOpen((v) => !v); setMobileActionsOpen(false); }}
                >
                  {manageOpen ? '✓ Done Managing' : '✏️ Manage Lectures'}
                </button>
                <button
                  className="smd-mobile-action-item"
                  onClick={() => { setCustomModalOpen(true); setMobileActionsOpen(false); }}
                >
                  ✦ Custom Study Session
                </button>
              </div>
            )}
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
              display_color:  l.color_override  ?? l.color,
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
            onStartFlash={handleStartFlash}
            onStartExam={handleStartExam}
            onChangeCourse={handleChangeCourse}
            onChangeColor={handleChangeColor}
            onHide={handleHide}
            onArchive={handleArchive}
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
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onLectureCreated={handleLectureCreated}
      />
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

/* ── Hero ──────────────────────────────────────────────────────────────── */
.smd-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 40px;
  flex-wrap: wrap;
}

.smd-hero-left {
  flex: 1 1 340px;
  min-width: 0;
}

.smd-hero-heading {
  font-family: 'Fraunces', serif;
  font-size: clamp(28px, 4.5vw, 52px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -1px;
  color: var(--text);
  margin-bottom: 10px;
}

.smd-hero-heading em {
  font-style: italic;
  font-weight: 300;
  color: var(--accent);
}

.smd-hero-sub {
  font-size: 14px;
  color: var(--text-muted);
  max-width: 460px;
  line-height: 1.65;
  margin-bottom: 20px;
}

/* ── Mobile inline stats (compact text row) ────────────────────────────── */
.smd-hero-inline-stats {
  align-items: center;
  gap: 6px;
  font-family: 'DM Mono', monospace;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.smd-inline-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
}

.smd-inline-val {
  font-weight: 500;
  font-size: 13px;
  color: var(--text);
}

.smd-inline-val.accent  { color: var(--accent); }
.smd-inline-val.warning { color: var(--warning, #f59e0b); }

.smd-inline-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.smd-inline-sep {
  color: var(--text-faint);
  font-size: 14px;
  margin: 0 2px;
}

/* ── Continue Studying button ──────────────────────────────────────────── */
.smd-continue-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--accent);
  color: #fff;
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 600;
  padding: 11px 22px;
  border-radius: 50px;
  text-decoration: none;
  transition: background 0.18s, transform 0.18s, box-shadow 0.18s;
  box-shadow: 0 4px 18px rgba(91,141,238,0.3);
  min-height: 44px;
}

.smd-continue-btn:hover {
  background: color-mix(in srgb, var(--accent) 82%, black);
  transform: translateY(-1px);
  box-shadow: 0 6px 24px rgba(91,141,238,0.4);
}

.smd-continue-arrow {
  display: inline-block;
  transition: transform 0.18s;
}

.smd-continue-btn:hover .smd-continue-arrow {
  transform: translateX(3px);
}

/* ── Hero right: pomodoro + compact stats stacked ──────────────────────── */
.smd-hero-right {
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  padding-top: 8px;
  flex-shrink: 0;
}

.smd-hero-pomodoro {
  align-self: stretch;
  display: flex;
  justify-content: flex-end;
}

.smd-hero-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 20px;
}

.smd-hero-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.smd-hero-stat-value {
  font-family: 'DM Mono', monospace;
  font-size: 20px;
  font-weight: 500;
  line-height: 1;
}

.smd-hero-stat-value.accent { color: var(--accent); }
.smd-hero-stat-value.dim    { color: var(--text); }
.smd-hero-stat-value.warning { color: var(--warning, #f59e0b); }

.smd-hero-stat-label {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  white-space: nowrap;
}

.smd-hero-stat-divider {
  width: 1px;
  height: 28px;
  background: var(--border);
  flex-shrink: 0;
}

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

/* Desktop actions visible, mobile hidden by default */
.smd-desktop-actions { display: flex; }
.smd-mobile-actions  { display: none; position: relative; }

/* ── Mobile overflow menu ──────────────────────────────────────────────── */
.smd-mobile-overflow-btn {
  font-size: 20px !important;
  min-width: 44px;
  min-height: 44px;
  padding: 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.smd-mobile-actions-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: var(--surface, #13161d);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  z-index: 200;
  min-width: 220px;
  overflow: hidden;
  animation: smd-dropdown-in 0.12s ease;
}

@keyframes smd-dropdown-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.smd-mobile-action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 18px;
  min-height: 44px;
  background: none;
  border: none;
  color: var(--text, #e8eaf0);
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.smd-mobile-action-item:hover {
  background: rgba(255,255,255,0.06);
}

.smd-mobile-action-item + .smd-mobile-action-item {
  border-top: 1px solid rgba(255,255,255,0.06);
}

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

/* ── Mobile overrides ────────────────────────────────────────────────────── */
@media (max-width: 767px) {
  /* Hero stacks vertically */
  .smd-hero {
    flex-direction: column;
    gap: 16px;
    margin-bottom: 28px;
  }

  /* Section actions: hide desktop, show mobile overflow */
  .smd-desktop-actions { display: none !important; }
  .smd-mobile-actions  { display: flex !important; }

  /* Footer */
  .smd-footer-inner { padding: 36px 16px 24px; }
  .smd-footer-top   { flex-direction: column; gap: 32px; }
  .smd-footer-links { flex-wrap: wrap; gap: 28px; }
  .smd-footer-bottom {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .smd-hero-stats { gap: 12px; }
}
`;
