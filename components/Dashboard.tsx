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
import UploadModal from "@/components/UploadModal";
import type { Course } from '@/types';

interface DashboardProps {
  /**
   * The authenticated user's first name, shown in the hero greeting.
   * Falls back to "Haley" if not provided (keeping the original spirit 🩵).
   */
  userName?: string;
}

export default function Dashboard({ userName = 'there' }: DashboardProps) {
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


  // Fetch userId once on mount for ManageMode
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // ── Filtered lectures ──────────────────────────────────────────────────
  const visibleLectures = useMemo(
    () =>
      lectures.filter((l) => {
        if (!l.visible || l.archived) return false;
        if (filter.courses.size > 0 && !filter.courses.has(l.course)) return false;
        return true;
      }),
    [lectures, filter.courses]
  );

  // ── Study launch handlers ─────────────────────────────────────────────
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

  function handleLectureCreated(internalId: string) {
    // Refresh the lecture list — however your data layer works.
    // e.g. refetch from Supabase, invalidate a React Query cache, etc.
    setShowUploadModal(false);
    refreshLectures();
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (lecturesError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header globalStats={globalStats} lectureCount={0} loading />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 12,
            padding: 40,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 42 }}>⚠️</div>
          <div
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            Couldn't load lectures
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 360 }}>
            {lecturesError}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Header (sticky) ──────────────────────────────────────────── */}
      <Header
        globalStats={globalStats}
        lectureCount={visibleLectures.length}
        loading={lecturesLoading}
      />

      {/* ── Main dashboard ───────────────────────────────────────────── */}
      <main className="smd-dashboard" id="mainDashboard">
        {/* Hero */}
        <div className="smd-hero">
          <div className="smd-hero-text">
            <h1>
              {userName}, master your
              <br />
              <em>lectures</em> with ease.
            </h1>
            <p>
              Select a lecture below to study with adaptive flashcards or challenge
              yourself with a custom practice exam.
            </p>
          </div>
          {/* Pomodoro lives inside Header to keep timer state alive across re-renders */}
        </div>

        {/* Stats row */}
        <StatsRow
          lectureCount={lectures.length}
          globalStats={globalStats}
          loading={progressLoading || lecturesLoading}
        />

        {/* Section header */}
        <div className="smd-section-header">
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '9px 16px' }}
              onClick={() => setUploadModalOpen(true)}
            >
              ⬆ Upload Lecture
            </button>
          <div className="smd-section-title">Your Lectures</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '9px 16px' }}
              onClick={() => setManageOpen((v) => !v)}
            >
              {manageOpen ? '✓ Done Managing' : '✏️ Manage'}
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '9px 16px' }}
              onClick={() => setCustomModalOpen(true)}
            >
              ✦ Custom Study Session
            </button>
          </div>
        </div>

        {/* Course filter bar — hidden when manage mode is open */}
        {!manageOpen && (
          <FilterBar
            allCourses={courses}
            allTags={[]}
            filter={filter}
            onChange={setFilter}
          />
        )}

        {/* Manage mode — replaces the grid when open */}
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

        {/* Lecture grid — hidden when manage mode is open */}
        {!manageOpen && (
          <LectureGrid
            lectures={visibleLectures}
            progressByLecture={progressByLecture}
            loading={lecturesLoading}
            onStartFlash={handleStartFlash}
            onStartExam={handleStartExam}
          />
        )}
      </main>

      {/* ── Custom Session Modal ──────────────────────────────────────── */}
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
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onLectureCreated={(_id) => {
          setUploadModalOpen(false);
          refetch();
          // useUserLectures will need a refresh here — however your hook exposes it.
          // e.g. if it returns a `refetch` function: refetch()
          // For now, a full reload works: window.location.reload()
        }}
      />
    </>
  );
}
