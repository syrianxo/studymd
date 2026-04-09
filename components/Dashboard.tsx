// components/Dashboard.tsx
'use client';

import { useState, useMemo } from 'react';
import Header from './Header';
import StatsRow from './StatsRow';
import FilterBar from './FilterBar';
import LectureGrid from './LectureGrid';
import CustomSessionModal, { type CustomSessionConfig } from './CustomSessionModal';
import { useUserLectures } from '@/hooks/useUserLectures';
import { useProgress } from '@/hooks/useProgress';

interface DashboardProps {
  /**
   * The authenticated user's first name, shown in the hero greeting.
   * Falls back to "Haley" if not provided (keeping the original spirit 🩵).
   */
  userName?: string;
}

export default function Dashboard({ userName = 'Haley' }: DashboardProps) {
  const {
    lectures,
    courses,
    loading: lecturesLoading,
    error: lecturesError,
  } = useUserLectures();

  const {
    progressByLecture,
    globalStats,
    loading: progressLoading,
  } = useProgress();

  const [activeCourse, setActiveCourse] = useState<string | null>(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);

  // ── Filtered lectures ──────────────────────────────────────────────────
  const visibleLectures = useMemo(
    () =>
      lectures.filter((l) => {
        if (l.is_hidden) return false;
        if (activeCourse && l.course !== activeCourse) return false;
        return true;
      }),
    [lectures, activeCourse]
  );

  // ── Study launch handlers ─────────────────────────────────────────────
  function handleStartFlash(lectureId: string) {
    // Navigate to the flashcard study view.
    // The actual flashcard view lives in its own route; we pass the lectureId
    // as a query param so it can fetch its data independently.
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

  // ── Error state ────────────────────────────────────────────────────────
  if (lecturesError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header globalStats={globalStats} lectureCount={0} />
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
          <div className="smd-section-title">Your Lectures</div>
          <button
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '9px 16px' }}
            onClick={() => setCustomModalOpen(true)}
          >
            ✦ Custom Study Session
          </button>
        </div>

        {/* Course filter bar */}
        <FilterBar
          courses={courses}
          activeCourse={activeCourse}
          onSelect={setActiveCourse}
        />

        {/* Lecture grid */}
        <LectureGrid
          lectures={visibleLectures}
          progressByLecture={progressByLecture}
          loading={lecturesLoading}
          onStartFlash={handleStartFlash}
          onStartExam={handleStartExam}
        />
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
    </>
  );
}
