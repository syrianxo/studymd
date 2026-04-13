// components/Dashboard.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import Header from './Header';
import StatsRow from './StatsRow';
import { FilterBar, type FilterState } from './FilterBar';
import LectureGrid from './LectureGrid';
import { ManageMode } from './ManageMode';
import CustomSessionModal, { type CustomSessionConfig } from './CustomSessionModal';
import { useUserLectures } from '@/hooks/useUserLectures';
import { useProgress } from '@/hooks/useProgress';
import { createClient } from '@/lib/supabase';
import UploadModal from '@/components/UploadModal';
import type { Course, Theme } from '@/types';

interface DashboardProps {
  userName?: string;
  initialTheme?: Theme;
}

export default function Dashboard({ userName = 'there', initialTheme: initialThemeProp = 'midnight' }: DashboardProps) {
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

  function handleStartFlash(lectureId: string) {
    window.location.href = `/app/study/flash?lecture=${lectureId}`;
  }

  function handleStartExam(lectureId: string) {
    window.location.href = `/app/study/exam?lecture=${lectureId}`;
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

  // ── Settings callbacks ─────────────────────────────────────────────────────
  // Color and course fire-and-forget: card holds optimistic local state so
  // the grid never re-renders/flashes. refetch() is NOT called.
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

  // Hide and archive DO refetch — the card needs to disappear from the grid.
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
          globalStats={globalStats}
          lectureCount={0}
          loading
          userId={userId ?? ''}
          initialTheme={theme}
          onUploadClick={() => setShowUploadModal(true)}
        />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 42 }}>⚠️</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            Couldn't load lectures
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 360 }}>{lecturesError}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{dashboardMobileCss}</style>

      <Header
        globalStats={globalStats}
        lectureCount={visibleLectures.length}
        loading={lecturesLoading}
        userId={userId ?? ''}
        initialTheme={theme}
        onUploadClick={() => setShowUploadModal(true)}
      />

      <main className="smd-dashboard" id="mainDashboard">
        <div className="smd-hero">
          <div className="smd-hero-text">
            <h1>{userName}, master your<br /><em>lectures</em> with ease.</h1>
            <p>Select a lecture below to study with adaptive flashcards or challenge yourself with a custom practice exam.</p>
          </div>
        </div>

        <StatsRow
          lectureCount={lectures.length}
          globalStats={globalStats}
          loading={progressLoading || lecturesLoading}
        />

        <div className="smd-section-header">
          <div className="smd-section-title">
            Your Lectures
            {!lecturesLoading && (
              <span className="smd-lecture-count-badge">{visibleLectures.length}</span>
            )}
          </div>

          <div className="smd-section-actions">
            <button
              className="btn btn-ghost smd-upload-section-btn"
              style={{ fontSize: 12, padding: '9px 16px' }}
              onClick={() => setShowUploadModal(true)}
            >
              ⬆ Upload Lecture
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '9px 16px' }}
              onClick={() => setManageOpen((v) => !v)}
            >
              {manageOpen ? '✓ Done' : '✏️ Manage'}
            </button>
            <button
              className="btn btn-primary smd-custom-session-btn"
              style={{ fontSize: 12, padding: '9px 16px' }}
              onClick={() => setCustomModalOpen(true)}
            >
              ✦ Custom Study
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

const dashboardMobileCss = `
.smd-lecture-count-badge {
  display: inline-flex; align-items: center; justify-content: center;
  font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 400;
  color: var(--text-muted, #6b7280); background: rgba(255,255,255,0.07);
  border-radius: 100px; padding: 1px 8px; margin-left: 8px; vertical-align: middle;
}
.smd-section-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
@media (max-width: 767px) {
  .smd-upload-section-btn { display: none; }
  .smd-section-header { flex-wrap: wrap; gap: 8px; }
  @media (max-width: 479px) {
    .smd-section-actions { width: 100%; justify-content: flex-end; }
  }
}
`;
