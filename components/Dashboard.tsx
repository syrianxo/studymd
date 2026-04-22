// components/Dashboard.tsx
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import Header from './Header';
import { FilterBar, type FilterState } from './FilterBar';
import LectureGrid from './LectureGrid';
import FolderBar from './FolderBar';
import NewFolderModal from './NewFolderModal';
import { ManageMode } from './ManageMode';
import CustomSessionModal, { type CustomSessionConfig } from './CustomSessionModal';
import { useUserLectures, resolveColor } from '@/hooks/useUserLectures';
import type { Lecture } from '@/hooks/useUserLectures';
import { useProgress } from '@/hooks/useProgress';
import { useFolders } from '@/hooks/useFolders';
import { createClient } from '@/lib/supabase';
import PomodoroTimer from '@/components/PomodoroTimer';
import { StudyConfigManager, useStudyConfig } from '@/components/StudyConfigManager';
import TodaysPlanWidget from '@/components/TodaysPlanWidget';
import type { Course, Theme, StudyPlan } from '@/types';
import { migrateThemeId } from '@/lib/themes';
import type { FlashcardConfig } from '@/components/study/FlashcardConfigModal';
import type { ExamConfig } from '@/components/study/ExamConfigModal';
import { buildGreetingLine } from '@/lib/greetings';

interface DashboardProps {
  userName?: string;
  userId?: string;
  isPrimary?: boolean;
  initialTheme?: Theme;
  isAdmin?: boolean;
}

export default function Dashboard({
  userName = 'there',
  userId: userIdProp,
  isPrimary = false,
  initialTheme: initialThemeProp = 'midnight',
  isAdmin = false,
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

  const {
    folders,
    ancestorsOf,
    byId: folderById,
    createFolder,
    updateFolder,
    deleteFolder,
  } = useFolders();

  // ── DnD state ─────────────────────────────────────────────────────────────
  const [draggingLectureId, setDraggingLectureId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // ── Folder modal ──────────────────────────────────────────────────────────
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);

  // null = All Lectures (unfiltered); a UUID = drill into that folder
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // Optimistic overrides for group_id — applied after CSS fade-out completes
  // so the card exits smoothly before the grid reflows.
  const [groupIdOverrides, setGroupIdOverrides] = useState<Record<string, string | null>>({});
  // IDs currently playing their fade-out CSS transition (~270ms)
  const [exitingLectureIds, setExitingLectureIds] = useState<Set<string>>(new Set());

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
      const raw = localStorage.getItem('studymd_theme');
      const migrated = raw ? migrateThemeId(raw) : null;
      if (migrated) {
        if (raw !== migrated) localStorage.setItem('studymd_theme', migrated);
        setTheme(migrated);
        document.documentElement.dataset.theme = migrated;
      }
    } catch {}
  }, []);

  const visibleLectures = useMemo(
    () =>
      lectures.filter((l) => {
        if (!l.visible || l.archived) return false;
        // Course filter only applies in the All Lectures view (easier to roll back if needed)
        if (activeFolderId === '__all__' && filter.courses.size > 0 && !filter.courses.has(l.course)) return false;
        // Exiting cards stay in the list so their CSS fade-out plays before the reflow.
        if (exitingLectureIds.has(l.internal_id)) return true;
        // All Lectures view: skip the group_id filter entirely
        if (activeFolderId === '__all__') return true;
        // Effective group_id: use local optimistic override if present
        const effectiveGroupId = l.internal_id in groupIdOverrides
          ? groupIdOverrides[l.internal_id]
          : (l.group_id ?? null);
        // Unfiled view (activeFolderId === null) only shows lectures not in any folder.
        // Folder view shows only lectures directly in that folder.
        if (effectiveGroupId !== activeFolderId) return false;
        return true;
      }),
    [lectures, filter.courses, activeFolderId, groupIdOverrides, exitingLectureIds]
  );

  // FolderBar always shows root-level folders regardless of which folder is active.
  // Nested navigation uses the breadcrumb. '__all__' is a sentinel for "show everything".
  const subfolders = useMemo(
    () => folders
      .filter(f => (f.parent_id ?? null) === null)
      .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),
    [folders]
  );

  // How many lectures live directly in each folder (for pill badges)
  const lectureCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of lectures) {
      if (!l.visible || l.archived) continue;
      const effectiveGroupId = l.internal_id in groupIdOverrides
        ? groupIdOverrides[l.internal_id]
        : (l.group_id ?? null);
      if (effectiveGroupId) counts[effectiveGroupId] = (counts[effectiveGroupId] ?? 0) + 1;
    }
    return counts;
  }, [lectures, groupIdOverrides]);

  // Lectures not yet assigned to any folder — shown in NewFolderModal for immediate assignment
  const unfiledLectures = useMemo(
    () => lectures.filter(l => l.visible && !l.archived && !l.group_id),
    [lectures]
  );

  // activeFolder is kept for potential future use (e.g. showing folder icon in header)
  // isRealFolder = navigated into a user folder (not null/unfiled, not __all__)
  const isRealFolder = activeFolderId !== null && activeFolderId !== '__all__';
  const activeFolder = isRealFolder ? folderById(activeFolderId!) : null;
  void activeFolder; // referenced below for future use; suppress unused-var lint

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
      topics_override: lecture.topics_override ?? null,
    },
    display_title: lecture.custom_title ?? lecture.title,
    display_course: (lecture.course_override ?? lecture.course) as Course,
    display_color:  resolveColor(lecture, theme),
    display_topics: lecture.display_topics ?? lecture.topics ?? [],
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
      `/app/study/flash?lecture=${lectureId}&count=${config.count}&topics=${topicsParam}&order=${config.order}&cardMode=${config.cardMode}`;
  }

  function handleStartExamWithConfig(config: ExamConfig, lectureId: string) {
    const topicsParam = config.topics.map(encodeURIComponent).join(',');
    const typesParam = config.types.join(',');
    window.location.href =
      `/app/study/exam?lecture=${lectureId}&count=${config.count}&topics=${topicsParam}&types=${typesParam}&questionMode=${config.questionMode}`;
  }

  function handleCustomSession(config: CustomSessionConfig) {
    const params = new URLSearchParams({
      mode: config.mode,
      lectures: config.lectureIds.join(','),
      topics: config.topics.join(','),
      count: String(config.count),
      types: config.questionTypes.join(','),
      cardMode: config.cardMode ?? 'all',
      questionMode: config.questionMode ?? 'all',
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

  function handleChangeColor(_internalId: string, _color: string) {
    refetch();
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

  function handleTopicsChanged(internalId: string, override: string[] | null) {
    // The API call was already made by TopicEditor; just patch local state so
    // other parts of the dashboard (e.g. flashcard topic filters) stay fresh.
    refetch();
  }

  // ── Folder handlers ───────────────────────────────────────────────────────
  function handleCreateFolder() {
    setNewFolderModalOpen(true);
  }

  async function handleCreateFolderWithLectures(name: string, icon: string, lectureIds: string[]) {
    const folder = await createFolder(name, activeFolderId, icon);
    // Assign selected lectures to the new folder immediately
    if (lectureIds.length > 0) {
      await Promise.all(lectureIds.map(id =>
        fetch('/api/lectures/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ internalId: id, updates: { groupId: folder.id } }),
        })
      ));
      refetch();
    }
  }

  async function handleRenameFolder(id: string, name: string) {
    await updateFolder(id, { name });
  }

  async function handleDeleteFolder(id: string) {
    if (!confirm('Delete this folder? Lectures inside will remain but lose their folder assignment.')) return;
    // If the active folder is the one being deleted, navigate up
    if (activeFolderId === id) setActiveFolderId(folders.find(f => f.id === id)?.parent_id ?? null);
    await deleteFolder(id);
  }

  async function handleChangeFolderColor(id: string, color: string | null) {
    await updateFolder(id, { color });
  }

  // Reorder: swap display_order with the adjacent folder one position earlier/later
  async function handleReorderFolder(id: string, direction: 'up' | 'down') {
    const sorted = [...subfolders]; // already sorted by display_order
    const idx = sorted.findIndex(f => f.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    // Swap display_orders (use intermediate value to avoid unique-constraint race)
    const orderA = a.display_order;
    const orderB = b.display_order;
    // If they somehow share the same order, use index as fallback
    const newOrderA = orderB !== orderA ? orderB : swapIdx;
    const newOrderB = orderB !== orderA ? orderA : idx;
    await Promise.all([
      updateFolder(a.id, { display_order: newOrderA }),
      updateFolder(b.id, { display_order: newOrderB }),
    ]);
  }

  // ── DnD handlers ──────────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    // Draggable IDs are prefixed "lecture-{lectureId}"
    if (id.startsWith('lecture-')) setDraggingLectureId(id.slice(8));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingLectureId(null);
    const lectureId = draggingLectureId;
    if (!lectureId || !event.over) return;
    const overId = String(event.over.id);
    // Drop-target IDs are prefixed "folder-{folderId}"
    if (overId.startsWith('folder-')) {
      const folderId = overId.slice(7);
      handleMoveToFolder(lectureId, folderId);
    }
  }

  function handleMoveToFolder(lectureId: string, folderId: string | null) {
    // Phase 1: trigger CSS fade-out (card stays in DOM taking space, opacity → 0).
    setExitingLectureIds(prev => new Set([...prev, lectureId]));

    // Phase 2: after the fade completes (~270ms), apply the optimistic group_id override.
    // This removes the card from visibleLectures so the grid can reflow — but by now
    // the card is already invisible, so the reflow is imperceptible.
    setTimeout(() => {
      setGroupIdOverrides(prev => ({ ...prev, [lectureId]: folderId }));
      setExitingLectureIds(prev => { const n = new Set(prev); n.delete(lectureId); return n; });
    }, 270);

    fetch('/api/lectures/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalId: lectureId, updates: { groupId: folderId } }),
    })
      .then(() => {
        refetch();
        // Clear the optimistic override after refetch has had time to settle
        setTimeout(() => setGroupIdOverrides(prev => {
          const n = { ...prev }; delete n[lectureId]; return n;
        }), 800);
      })
      .catch(() => {
        // On failure: revert both the exit animation and the optimistic override
        setExitingLectureIds(prev => { const n = new Set(prev); n.delete(lectureId); return n; });
        setGroupIdOverrides(prev => { const n = { ...prev }; delete n[lectureId]; return n; });
      });
  }

  if (lecturesError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header
          lectureCount={0}
          loading
          userId={userId ?? ''}
          initialTheme={theme}
          onThemeChange={setTheme}
          isAdmin={isAdmin}
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

  // Deterministic greeting: seeded by userId + UTC date, so it's stable all day
  // and rotates at midnight without a re-render flash.
  const greetingLine = buildGreetingLine(userName, userIdProp ?? userId ?? '', isPrimary);

  return (
    <>
      <style>{dashboardCss}</style>

      <Header
        lectureCount={visibleLectures.length}
        loading={lecturesLoading}
        userId={userId ?? ''}
        initialTheme={theme}
        onThemeChange={setTheme}
        isAdmin={isAdmin}
      />

      <main className="smd-dashboard" id="mainDashboard">

        {/* ── HERO (centered, Option A glass card) ────────────────────────── */}
        <section className="smd-hero">
          <h1 className="smd-hero-title">{greetingLine}</h1>
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
          Select a lecture below to study with adaptive flashcards or challenge yourself with a practice exam.
        </p>

        {/* ── SECTION HEADER ──────────────────────────────────────────────── */}
        {/* Breadcrumb removed — active pill in FolderBar shows current location */}
        <div className="smd-section-header">
          <div className="smd-section-title">
            Your Lectures
            {!lecturesLoading && (
              <span className="smd-lecture-count-badge">
                {visibleLectures.length}
              </span>
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
              onClick={() => setManageOpen(v => { if (v) refetch(); return !v; })}
              aria-label={manageOpen ? 'Done managing' : 'Manage lectures'}
              title={manageOpen ? 'Done' : 'Manage lectures'}
            >
              {manageOpen ? '✓' : '✎'}
            </button>
          </div>
        </div>

        {manageOpen && userId && (
          <ManageMode
            userId={userId}
            activeTheme={theme}
            folders={folders}
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
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <FolderBar
              folders={subfolders}
              activeFolderId={activeFolderId}
              lectureCounts={lectureCounts}
              isDragging={draggingLectureId !== null}
              onNavigate={setActiveFolderId}
              onCreateFolder={handleCreateFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onChangeFolderColor={handleChangeFolderColor}
              onMoveUp={(id) => handleReorderFolder(id, 'up')}
              onMoveDown={(id) => handleReorderFolder(id, 'down')}
            />

            {/* Filter bar sits directly below FolderBar and animates in/out
                without unmounting — max-height transition keeps the grid stable */}
            <div className={`smd-filter-drawer${activeFolderId === '__all__' ? ' smd-filter-drawer--open' : ''}`}>
              <FilterBar
                allCourses={courses}
                allTags={[]}
                filter={filter}
                onChange={setFilter}
              />
            </div>

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
              onTopicsChanged={handleTopicsChanged}
              planNextReview={planNextReview}
              planTestDate={activePlan?.test_date}
              onMoveToFolder={handleMoveToFolder}
              exitingLectureIds={exitingLectureIds}
              allFolders={folders}
            />
            {/* Drag ghost — a lightweight pill that follows the cursor */}
            <DragOverlay dropAnimation={null}>
              {draggingLectureId ? (() => {
                const lec = lectures.find(l => l.internal_id === draggingLectureId);
                return (
                  <div style={{
                    padding: '8px 16px',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--accent)',
                    borderRadius: 100,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text)',
                    boxShadow: '0 4px 16px rgba(0,0,0,.4)',
                    whiteSpace: 'nowrap',
                    fontFamily: "'Outfit', sans-serif",
                  }}>
                    {lec?.icon ?? '📄'} {lec?.custom_title ?? lec?.title ?? 'Lecture'}
                  </div>
                );
              })() : null}
            </DragOverlay>
          </DndContext>
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

      <NewFolderModal
        isOpen={newFolderModalOpen}
        unfiledLectures={unfiledLectures}
        onClose={() => setNewFolderModalOpen(false)}
        onCreate={handleCreateFolderWithLectures}
      />
      <StudyConfigManager
        {...studyConfig}
        progressByLecture={progressByLecture}
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
/* ── Filter drawer — animates below FolderBar without unmounting ────────── */
/* max-height transition keeps the grid from jumping when toggling All view */
.smd-filter-drawer {
  overflow: hidden;
  max-height: 0;
  /* margin handled by open state to avoid gap when closed */
  margin-bottom: 0;
  transition: max-height 0.22s ease, margin-bottom 0.22s ease;
}
.smd-filter-drawer--open {
  max-height: 120px;   /* generous ceiling; FilterBar is ~48px tall */
  margin-bottom: 12px;
}

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
  text-align: center;
  width: 100%;
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
  .smd-dashboard { padding: 24px 16px; }
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
