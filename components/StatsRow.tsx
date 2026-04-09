// components/StatsRow.tsx
'use client';

import type { GlobalStats } from '@/hooks/useProgress';

interface StatsRowProps {
  lectureCount: number;
  globalStats: GlobalStats;
  loading?: boolean;
}

export default function StatsRow({ lectureCount, globalStats, loading }: StatsRowProps) {
  const { totalSessions, bestExamScore, avgExamScore } = globalStats;

  return (
    <div className="smd-stats-row">
      <div className="smd-stat-card">
        <div className="smd-stat-label">Lectures Available</div>
        <div className="smd-stat-value accent">
          {loading ? '—' : lectureCount}
        </div>
      </div>

      <div className="smd-stat-card">
        <div className="smd-stat-label">Sessions Completed</div>
        <div className="smd-stat-value">
          {loading ? '—' : totalSessions}
        </div>
      </div>

      <div className="smd-stat-card">
        <div className="smd-stat-label">Best Exam Score</div>
        <div className="smd-stat-value gold">
          {loading ? '—' : bestExamScore !== null ? `${bestExamScore}%` : '—'}
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
