'use client';

import React, {
  useState,
  useCallback,
  useTransition,
  useOptimistic,
} from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
// Lecture mutation helpers — call API routes, never supabase-server directly
// (client components cannot import next/headers)
async function updateLectureSettings(_userId: string, internalId: string, settings: Record<string, unknown>): Promise<void> {
  // Map snake_case patch keys → camelCase updates for the API
  const camelMap: Record<string, string> = {
    visible: 'visible', archived: 'archived', tags: 'tags',
    course_override: 'courseOverride', color_override: 'colorOverride',
    custom_title: 'customTitle', display_order: 'displayOrder',
  };
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    updates[camelMap[k] ?? k] = v;
  }
  await fetch('/api/lectures/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ internalId, updates }),
  });
}

async function reorderLectures(_userId: string, orderedIds: string[]): Promise<void> {
  const order = orderedIds.map((internalId, i) => ({ internalId, displayOrder: i + 1 }));
  await fetch('/api/lectures/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
}

async function fetchAllTags(_userId: string): Promise<string[]> {
  const res = await fetch('/api/lectures/tags');
  if (!res.ok) return [];
  const data = await res.json();
  return data.tags ?? [];
}
import { ManageLectureCard } from './ManageLectureCard';
import { TagEditor } from './TagEditor';
import { FilterBar, applyFilters, type FilterState } from './FilterBar';
import type { LectureWithSettings, Course } from '@/types';

// ─── CSS ─────────────────────────────────────────────────────────────────────

const css = `
/* Header bar */
.mm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

/* Manage toggle button */
.mm-toggle-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: 10px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
  border: 1px solid rgba(255,255,255,0.12);
  background: transparent;
  color: var(--text-muted, #6b7280);
}
.mm-toggle-btn:hover {
  border-color: rgba(255,255,255,0.2);
  color: var(--text, #e8eaf0);
}
.mm-toggle-btn.active {
  background: rgba(91,141,238,0.15);
  border-color: rgba(91,141,238,0.4);
  color: var(--accent, #5b8dee);
}

/* Manage mode banner */
.mm-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(91,141,238,0.08);
  border: 1px solid rgba(91,141,238,0.2);
  border-radius: 10px;
  margin-bottom: 12px;
  animation: mm-banner-in 0.2s ease;
}
@keyframes mm-banner-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.mm-banner-text {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  color: var(--accent, #5b8dee);
  flex: 1;
}
.mm-banner-done {
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent, #5b8dee);
  background: rgba(91,141,238,0.15);
  border: 1px solid rgba(91,141,238,0.3);
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.mm-banner-done:hover { background: rgba(91,141,238,0.25); }

/* Lecture grid */
.mm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 8px;
}

/* Archived section */
.mm-archived-section {
  margin-top: 32px;
}
.mm-archived-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.mm-archived-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-muted, #6b7280);
}
.mm-archived-count {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  background: rgba(255,255,255,0.06);
  padding: 2px 8px;
  border-radius: 100px;
}
.mm-archived-divider {
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.06);
}

/* Empty state */
.mm-empty {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-muted, #6b7280);
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  grid-column: 1 / -1;
}
.mm-empty-icon { font-size: 32px; margin-bottom: 10px; }

/* Error toast */
.mm-error {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: #ef4444;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  padding: 10px 18px;
  border-radius: 10px;
  z-index: 9998;
  animation: mm-banner-in 0.2s ease;
}
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function moveLecture(
  lectures: LectureWithSettings[],
  activeId: string,
  overId: string
): LectureWithSettings[] {
  const from = lectures.findIndex((l) => l.internal_id === activeId);
  const to   = lectures.findIndex((l) => l.internal_id === overId);
  if (from === -1 || to === -1) return lectures;

  const next = [...lectures];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((l, i) => ({
    ...l,
    settings: { ...l.settings, display_order: i },
  }));
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ManageModeProps {
  userId: string;
  initialLectures: LectureWithSettings[];
  activeTheme?: string;
  flashcardProgress?: Record<string, number>;
  examProgress?: Record<string, number>;
  onOpenLecture?: (internalId: string) => void;
  renderHeaderRight?: React.ReactNode;
}

export function ManageMode({
  userId,
  initialLectures,
  activeTheme = 'midnight',
  flashcardProgress = {},
  examProgress = {},
  onOpenLecture,
  renderHeaderRight,
}: ManageModeProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [lectures, setLectures] = useState<LectureWithSettings[]>(initialLectures);
  const [isManageMode, setIsManageMode] = useState(true);
  const [allTags, setAllTags] = useState<string[]>(() => {
    const s = new Set<string>();
    initialLectures.forEach((l) => l.settings.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  });
  const [filter, setFilter] = useState<FilterState>({
    courses: new Set(),
    tags: new Set(),
    showArchived: false,
    showHidden: false,
  });

  const [tagEditorLecture, setTagEditorLecture] = useState<LectureWithSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // ── DnD Sensors ───────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ── Error helper ──────────────────────────────────────────────────────────
  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }, []);

  // ── Optimistic update helper ───────────────────────────────────────────────
  const patchLecture = useCallback(
    async (
      internalId: string,
      patch: Partial<LectureWithSettings['settings']>,
      rollback: () => void
    ) => {
      // Optimistic
      setLectures((prev) =>
        prev.map((l) =>
          l.internal_id === internalId
            ? { ...l, settings: { ...l.settings, ...patch } }
            : l
        )
      );

      try {
        await updateLectureSettings(userId, internalId, patch);
      } catch (err) {
        console.error(err);
        rollback();
        showError('Failed to save. Changes reverted.');
      }
    },
    [userId, showError]
  );

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const previous = lectures;
      const reordered = moveLecture(
        lectures,
        String(active.id),
        String(over.id)
      );

      setLectures(reordered);

      try {
        await reorderLectures(
          userId,
          reordered.map((l) => l.internal_id)
        );
      } catch (err) {
        console.error(err);
        setLectures(previous);
        showError('Failed to save order. Changes reverted.');
      }
    },
    [lectures, userId, showError]
  );

  // ── Per-card actions ──────────────────────────────────────────────────────
  const handleHide = useCallback(
    (id: string) => {
      const prev = lectures.find((l) => l.internal_id === id)?.settings;
      if (!prev) return;
      patchLecture(id, { visible: false }, () =>
        patchLecture(id, { visible: true }, () => {})
      );
    },
    [lectures, patchLecture]
  );

  const handleArchive = useCallback(
    (id: string) => {
      patchLecture(id, { archived: true }, () =>
        patchLecture(id, { archived: false }, () => {})
      );
    },
    [patchLecture]
  );

  const handleRestore = useCallback(
    (id: string) => {
      patchLecture(id, { archived: false, visible: true }, () =>
        patchLecture(id, { archived: true }, () => {})
      );
    },
    [patchLecture]
  );

  const handleUnhide = useCallback(
    (id: string) => {
      patchLecture(id, { visible: true }, () =>
        patchLecture(id, { visible: false }, () => {})
      );
    },
    [patchLecture]
  );

  const handleChangeCourse = useCallback(
    (id: string, course: Course) => {
      const prev = lectures.find((l) => l.internal_id === id);
      if (!prev) return;
      // Optimistic update of display_course too
      setLectures((ls) =>
        ls.map((l) =>
          l.internal_id === id
            ? { ...l, display_course: course, settings: { ...l.settings, course_override: course } }
            : l
        )
      );
      updateLectureSettings(userId, id, { course_override: course }).catch(() => {
        setLectures((ls) =>
          ls.map((l) =>
            l.internal_id === id ? prev : l
          )
        );
        showError('Failed to update course.');
      });
    },
    [lectures, userId, showError]
  );

  const handleChangeColor = useCallback(
    (id: string, color: string) => {
      const prev = lectures.find((l) => l.internal_id === id);
      if (!prev) return;
      setLectures((ls) =>
        ls.map((l) =>
          l.internal_id === id
            ? { ...l, display_color: color }
            : l
        )
      );
      // Send theme-keyed colorOverride so switching themes preserves other colors
      fetch('/api/lectures/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalId: id, updates: { colorOverride: { [activeTheme]: color } } }),
      }).catch(() => {
        setLectures((ls) => ls.map((l) => (l.internal_id === id ? prev : l)));
        showError('Failed to update color.');
      });
    },
    [lectures, activeTheme, showError]
  );
      updateLectureSettings(userId, id, { color_override: color }).catch(() => {
        setLectures((ls) => ls.map((l) => (l.internal_id === id ? prev : l)));
        showError('Failed to update color.');
      });
    },
    [lectures, userId, showError]
  );

  const handleTagSave = useCallback(
    (id: string, tags: string[]) => {
      setLectures((ls) =>
        ls.map((l) =>
          l.internal_id === id ? { ...l, settings: { ...l.settings, tags } } : l
        )
      );
      // Recompute all tags
      setAllTags((prev) => {
        const s = new Set([...prev, ...tags]);
        return Array.from(s).sort();
      });
    },
    []
  );

  // fix #8: title rename in manage mode
  const handleRenameTitle = useCallback(
    (id: string, title: string) => {
      setLectures((ls) =>
        ls.map((l) =>
          l.internal_id === id
            ? { ...l, display_title: title, settings: { ...l.settings, custom_title: title } }
            : l
        )
      );
      updateLectureSettings(userId, id, { custom_title: title }).catch(() =>
        showError('Failed to rename lecture.')
      );
    },
    [userId, showError]
  );

  // ── Derive all unique courses from current lecture list ────────────────────
  const allCourses = Array.from(
    new Set(lectures.map((l) => l.display_course))
  ) as Course[];

  // ── Apply filters ─────────────────────────────────────────────────────────
  const { visible: visibleLectures, archived: archivedLectures, hidden: hiddenLectures } = applyFilters(
    lectures,
    filter
  );

  const sortableIds = visibleLectures.map((l) => l.internal_id);

  return (
    <>
      <style>{css}</style>

      {/* Header */}
      <div className="mm-header">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Manage mode is always active when this component renders */}
        </div>
        {renderHeaderRight && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {renderHeaderRight}
          </div>
        )}
      </div>

      {/* Manage mode banner */}
      <div className="mm-banner">
        <span className="mm-banner-text">
          🖱 Drag cards to reorder · Use ⋮ menus to hide, archive, tag, or customize
        </span>
      </div>

      {/* Filter bar */}
      <FilterBar
        allCourses={allCourses}
        allTags={allTags}
        filter={filter}
        onChange={setFilter}
        showHiddenToggle
      />

      {/* DnD Context + lecture grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
          <div className="mm-grid">
            {visibleLectures.length === 0 && (
              <div className="mm-empty">
                <div className="mm-empty-icon">📭</div>
                No lectures match your filters
              </div>
            )}
            {visibleLectures.map((lecture) => (
              <ManageLectureCard
                key={lecture.internal_id}
                lecture={lecture}
                isManageMode={isManageMode}
                activeTheme={activeTheme}
                flashcardProgress={flashcardProgress[lecture.internal_id]}
                examProgress={examProgress[lecture.internal_id]}
                onOpen={() => onOpenLecture?.(lecture.internal_id)}
                onHide={() => handleHide(lecture.internal_id)}
                onArchive={() => handleArchive(lecture.internal_id)}
                onRestore={() => handleRestore(lecture.internal_id)}
                onEditTags={() => setTagEditorLecture(lecture)}
                onChangeCourse={(course) => handleChangeCourse(lecture.internal_id, course)}
                onChangeColor={(color) => handleChangeColor(lecture.internal_id, color)}
                onRenameTitle={(title) => handleRenameTitle(lecture.internal_id, title)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Archived section */}
      {filter.showArchived && archivedLectures.length > 0 && (
        <div className="mm-archived-section">
          <div className="mm-archived-header">
            <span className="mm-archived-title">Archived</span>
            <span className="mm-archived-count">{archivedLectures.length}</span>
            <div className="mm-archived-divider" />
          </div>
          <div className="mm-grid">
            {archivedLectures.map((lecture) => (
              <ManageLectureCard
                key={lecture.internal_id}
                lecture={lecture}
                isManageMode={isManageMode}
                activeTheme={activeTheme}
                flashcardProgress={flashcardProgress[lecture.internal_id]}
                examProgress={examProgress[lecture.internal_id]}
                onOpen={undefined}
                onHide={() => {}}
                onArchive={() => {}}
                onRestore={() => handleRestore(lecture.internal_id)}
                onEditTags={() => setTagEditorLecture(lecture)}
                onChangeCourse={(course) => handleChangeCourse(lecture.internal_id, course)}
                onChangeColor={(color) => handleChangeColor(lecture.internal_id, color)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Hidden section */}
      {filter.showHidden && hiddenLectures.length > 0 && (
        <div className="mm-archived-section">
          <div className="mm-archived-header">
            <span className="mm-archived-title">Hidden</span>
            <span className="mm-archived-count">{hiddenLectures.length}</span>
            <div className="mm-archived-divider" />
          </div>
          <div className="mm-grid">
            {hiddenLectures.map((lecture) => (
              <ManageLectureCard
                key={lecture.internal_id}
                lecture={lecture}
                isManageMode={isManageMode}
                activeTheme={activeTheme}
                flashcardProgress={flashcardProgress[lecture.internal_id]}
                examProgress={examProgress[lecture.internal_id]}
                onOpen={undefined}
                onHide={() => {}}
                onArchive={() => {}}
                onRestore={() => handleUnhide(lecture.internal_id)}
                onEditTags={() => setTagEditorLecture(lecture)}
                onChangeCourse={(course) => handleChangeCourse(lecture.internal_id, course)}
                onChangeColor={(color) => handleChangeColor(lecture.internal_id, color)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tag editor modal */}
      {tagEditorLecture && (
        <TagEditor
          userId={userId}
          internalId={tagEditorLecture.internal_id}
          lectureTitle={tagEditorLecture.display_title}
          currentTags={tagEditorLecture.settings.tags}
          allTags={allTags}
          onSave={(tags) => handleTagSave(tagEditorLecture.internal_id, tags)}
          onClose={() => setTagEditorLecture(null)}
        />
      )}

      {/* Error toast */}
      {error && <div className="mm-error">{error}</div>}
    </>
  );
}
