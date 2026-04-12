'use client';

import React from 'react';
import type { Course } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FilterState {
  courses: Set<Course>;
  tags: Set<string>;
  showArchived: boolean;
  showHidden: boolean;
}

interface FilterBarProps {
  allCourses: Course[];
  allTags: string[];
  filter: FilterState;
  onChange: (next: FilterState) => void;
  showHiddenToggle?: boolean;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const css = `
.fb-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0;
}

.fb-divider {
  width: 1px;
  height: 24px;
  background: rgba(255,255,255,0.08);
  flex-shrink: 0;
  align-self: center;
}

/* Pill button */
.fb-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 100px;
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.1);
  background: transparent;
  color: var(--text-muted, #6b7280);
  transition: all 0.15s ease;
  white-space: nowrap;
}
.fb-pill:hover {
  border-color: rgba(255,255,255,0.2);
  color: var(--text, #e8eaf0);
}
.fb-pill.active {
  border-color: transparent;
  color: #fff;
}
.fb-pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Tag pill (slightly different style) */
.fb-pill.tag-pill {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
}
.fb-pill.tag-pill.active {
  background: rgba(255,255,255,0.12);
  border-color: rgba(255,255,255,0.15);
  color: var(--text, #e8eaf0);
}

/* Archived toggle */
.fb-archived-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 100px;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.08);
  background: transparent;
  color: var(--text-muted, #6b7280);
  transition: all 0.15s ease;
  margin-left: auto;
}
.fb-archived-toggle:hover {
  border-color: rgba(255,255,255,0.15);
  color: var(--text, #e8eaf0);
}
.fb-archived-toggle.active {
  background: rgba(255,255,255,0.07);
  border-color: rgba(255,255,255,0.15);
  color: var(--text, #e8eaf0);
}

/* Section label */
.fb-label {
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted, #6b7280);
  flex-shrink: 0;
  opacity: 0.6;
}

/* Clear all */
.fb-clear {
  background: none;
  border: none;
  font-family: 'Outfit', sans-serif;
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  padding: 4px 8px;
  transition: color 0.15s;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.fb-clear:hover { color: var(--text, #e8eaf0); }
`;

// ─── Course color mapping ─────────────────────────────────────────────────────

const COURSE_COLORS: Record<Course, string> = {
  'Physical Diagnosis I': '#5b8dee',
  'Anatomy & Physiology': '#10b981',
  'Laboratory Diagnosis': '#f59e0b',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function FilterBar({ allCourses, allTags, filter, onChange, showHiddenToggle = false }: FilterBarProps) {
  const hasActiveFilters =
    filter.courses.size > 0 || filter.tags.size > 0 || filter.showArchived || filter.showHidden;

  const toggleCourse = (course: Course) => {
    const next = new Set(filter.courses);
    next.has(course) ? next.delete(course) : next.add(course);
    onChange({ ...filter, courses: next });
  };

  const toggleTag = (tag: string) => {
    const next = new Set(filter.tags);
    next.has(tag) ? next.delete(tag) : next.add(tag);
    onChange({ ...filter, tags: next });
  };

  const toggleArchived = () => {
    onChange({ ...filter, showArchived: !filter.showArchived });
  };

  const toggleHidden = () => {
    onChange({ ...filter, showHidden: !filter.showHidden });
  };

  const clearAll = () => {
    onChange({ courses: new Set(), tags: new Set(), showArchived: false, showHidden: false });
  };

  return (
    <>
      <style>{css}</style>
      <div className="fb-bar" role="toolbar" aria-label="Lecture filters">

        {/* Course filters */}
        {allCourses.length > 0 && (
          <>
            <span className="fb-label">Course</span>
            {allCourses.map((course) => {
              const active = filter.courses.has(course);
              const color = COURSE_COLORS[course] ?? '#5b8dee';
              return (
                <button
                  key={course}
                  className={`fb-pill${active ? ' active' : ''}`}
                  style={active ? { background: `${color}22`, borderColor: `${color}55`, color } : {}}
                  onClick={() => toggleCourse(course)}
                  aria-pressed={active}
                  title={course}
                >
                  <span
                    className="fb-pill-dot"
                    style={{ background: color, opacity: active ? 1 : 0.4 }}
                  />
                  {course}
                </button>
              );
            })}
          </>
        )}

        {/* Tag filters */}
        {allTags.length > 0 && (
          <>
            {allCourses.length > 0 && <div className="fb-divider" />}
            <span className="fb-label">Tags</span>
            {allTags.map((tag) => {
              const active = filter.tags.has(tag);
              return (
                <button
                  key={tag}
                  className={`fb-pill tag-pill${active ? ' active' : ''}`}
                  onClick={() => toggleTag(tag)}
                  aria-pressed={active}
                >
                  {active && '# '}{tag}
                </button>
              );
            })}
          </>
        )}

        {/* Clear all */}
        {hasActiveFilters && (
          <button className="fb-clear" onClick={clearAll}>
            clear
          </button>
        )}

        {/* Archived toggle — pushed right */}
        <button
          className={`fb-archived-toggle${filter.showArchived ? ' active' : ''}`}
          onClick={toggleArchived}
          aria-pressed={filter.showArchived}
        >
          📦 Archived
        </button>

        {/* Hidden toggle — only in manage mode */}
        {showHiddenToggle && (
          <button
            className={`fb-archived-toggle${filter.showHidden ? ' active' : ''}`}
            onClick={toggleHidden}
            aria-pressed={filter.showHidden}
          >
            👁 Hidden
          </button>
        )}
      </div>
    </>
  );
}

// ─── Filter logic ─────────────────────────────────────────────────────────────

import type { LectureWithSettings } from '@/types';

export function applyFilters(
  lectures: LectureWithSettings[],
  filter: FilterState
): {
  visible: LectureWithSettings[];
  archived: LectureWithSettings[];
  hidden: LectureWithSettings[];
} {
  const matchesCourse = (l: LectureWithSettings) =>
    filter.courses.size === 0 || filter.courses.has(l.display_course);

  const matchesTags = (l: LectureWithSettings) =>
    filter.tags.size === 0 ||
    [...filter.tags].every((t) => l.settings.tags.includes(t));

  const active: LectureWithSettings[] = [];
  const archived: LectureWithSettings[] = [];
  const hidden: LectureWithSettings[] = [];

  for (const l of lectures) {
    if (!l.settings.visible && !l.settings.archived) {
      // Hidden (not archived)
      if (filter.showHidden && matchesCourse(l) && matchesTags(l)) {
        hidden.push(l);
      }
      continue;
    }

    if (l.settings.archived) {
      if (filter.showArchived && matchesCourse(l) && matchesTags(l)) {
        archived.push(l);
      }
    } else {
      if (matchesCourse(l) && matchesTags(l)) {
        active.push(l);
      }
    }
  }

  return { visible: active, archived, hidden };
}
