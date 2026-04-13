// components/StatsRow.tsx
// NOTE: This component is kept for potential fallback/admin use.
// The main Dashboard now renders compact inline stats in the hero section.
// If you want to re-enable the card grid, import this and render it
// between the hero and the section header in Dashboard.tsx.
'use client';

import type { GlobalStats } from '@/hooks/useProgress';

interface StatsRowProps {
  lectureCount: number;
  globalStats: GlobalStats;
  loading?: boolean;
}

export default function StatsRow({ lectureCount, globalStats, loading }: StatsRowProps) {
  const { avgExamScore } = globalStats;
  const streak = globalStats.studyStreak ?? 0;

  return (
    <div className="smd-stats-row">
      <div className="smd-stat-card">
        <div className="smd-stat-label">Lectures Available</div>
        <div className="smd-stat-value accent">
          {loading ? '—' : lectureCount}
        </div>
      </div>

      <div className="smd-stat-card">
        <div className="smd-stat-label">Study Streak</div>
        <div className="smd-stat-value warning">
          {loading ? '—' : `🔥 ${streak}`}
        </div>
      </div>

      <div className="smd-stat-card">
        <div className="smd-stat-label">Avg Exam Score</div>
        <div className="smd-stat-value success">
          {loading ? '—' : avgExamScore !== null ? `${avgExamScore}%` : '—'}
        </div>
      </div>
    </div>
  );
}
