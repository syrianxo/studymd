// components/LectureGrid.tsx
'use client';

// LectureGrid renders the normal (non-manage) dashboard card grid.
// It uses LectureCard with isManageMode=false, which shows the expand
// panel (study mode buttons + slide strip) on click.

import type { Lecture } from '@/hooks/useUserLectures';
import type { LectureProgress } from '@/hooks/useProgress';
import type { Course, LectureWithSettings } from '@/types';
import { LectureCard } from './LectureCard';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LectureGridProps {
  lectures: Lecture[];
  progressByLecture: Record<string, LectureProgress>;
  loading: boolean;
  onStartFlash: (lectureId: string) => void;
  onStartExam: (lectureId: string) => void;
  onChangeCourse?: (lectureId: string, course: Course) => void;
  onChangeColor?: (lectureId: string, color: string) => void;
  onHide?: (lectureId: string) => void;
  onArchive?: (lectureId: string) => void;
}

// ─── Shape adapter ────────────────────────────────────────────────────────────
// Converts the flat Lecture from useUserLectures into the LectureWithSettings
// shape that LectureCard expects. This is the same transformation Dashboard.tsx
// uses in buildLectureWithSettings(), kept local here so LectureGrid is
// self-contained.

function toLectureWithSettings(lecture: Lecture): LectureWithSettings {
  return {
    // Base Lecture fields (LectureWithSettings extends Lecture from types/index.ts)
    internal_id:   lecture.internal_id,
    title:         lecture.title,
    subtitle:      lecture.subtitle,
    course:        lecture.course,
    color:         lecture.color,
    icon:          lecture.icon,
    topics:        lecture.topics,
    slide_count:   lecture.slide_count,
    created_at:    lecture.created_at,
    json_data:     lecture.json_data,

    // Nested settings object
    settings: {
      user_id:         '',   // not needed for display-only card
      internal_id:     lecture.internal_id,
      display_order:   lecture.display_order,
      visible:         lecture.visible,
      archived:        lecture.archived,
      group_id:        lecture.group_id ?? null,
      tags:            lecture.tags ?? [],
      course_override: lecture.course_override ?? null,
      color_override:  lecture.color_override ?? null,
      custom_title:    lecture.custom_title ?? null,
    },

    // Computed display values — overrides win over base
    display_title:  lecture.custom_title   ?? lecture.title,
    display_course: (lecture.course_override ?? lecture.course) as Course,
    display_color:  lecture.color_override  ?? lecture.color ?? '#5b8dee',
  };
}

// ─── Grid ────────────────────────────────────────────────────────────────────

export default function LectureGrid({
  lectures, progressByLecture, loading,
  onStartFlash, onStartExam,
  onChangeCourse, onChangeColor,
  onHide, onArchive,
}: LectureGridProps) {
  if (loading) {
    return (
      <div className="smd-lecture-grid">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (lectures.length === 0) {
    return (
      <div className="smd-lecture-grid">
        <div className="smd-empty-state">
          <div className="smd-empty-icon">📚</div>
          <div className="smd-empty-title">No lectures found</div>
          <div className="smd-empty-desc">
            No lectures match your current filter. Try selecting a different course or
            contact your administrator to add content.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="smd-lecture-grid">
      {lectures.map(lecture => {
        const progress = progressByLecture[lecture.internal_id] ?? null;

        return (
          <LectureCard
            key={lecture.internal_id}
            lecture={toLectureWithSettings(lecture)}
            isManageMode={false}
            flashcardProgress={progress?.mastery_pct ?? 0}
            examProgress={progress?.best_exam_score ?? 0}
            onFlashcards={() => onStartFlash(lecture.internal_id)}
            onExam={() => onStartExam(lecture.internal_id)}
            onChangeCourse={c => onChangeCourse?.(lecture.internal_id, c)}
            onChangeColor={c => onChangeColor?.(lecture.internal_id, c)}
            onHide={() => onHide?.(lecture.internal_id)}
            onArchive={() => onArchive?.(lecture.internal_id)}
            onRestore={() => {}}   // not applicable on normal dashboard
            onEditTags={() => {}}  // not applicable outside manage mode
          />
        );
      })}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="smd-lecture-card" style={{ cursor: 'default', animation: 'smd-skeleton-pulse 1.6s ease infinite', borderRadius: 16, padding: 20, background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ marginTop: 8, marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface2)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: '70%', height: 16, borderRadius: 6, background: 'var(--surface2)', marginBottom: 8 }} />
          <div style={{ width: 80, height: 18, borderRadius: 50, background: 'var(--surface2)' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, height: 28, borderRadius: 6, background: 'var(--surface2)' }} />
        <div style={{ flex: 1, height: 28, borderRadius: 6, background: 'var(--surface2)' }} />
      </div>
      <div style={{ width: 60, height: 10, borderRadius: 4, background: 'var(--surface2)' }} />
      <style>{`@keyframes smd-skeleton-pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );
}
