// components/FilterBar.tsx
'use client';

interface FilterBarProps {
  courses: string[];
  activeCourse: string | null;
  onSelect: (course: string | null) => void;
}

export default function FilterBar({ courses, activeCourse, onSelect }: FilterBarProps) {
  if (courses.length === 0) return null;

  return (
    <div className="smd-filter-bar">
      <button
        className={`smd-filter-btn${activeCourse === null ? ' active' : ''}`}
        onClick={() => onSelect(null)}
      >
        All Courses
      </button>

      {courses.map((course) => (
        <button
          key={course}
          className={`smd-filter-btn${activeCourse === course ? ' active' : ''}`}
          onClick={() => onSelect(course)}
        >
          {course}
        </button>
      ))}
    </div>
  );
}
