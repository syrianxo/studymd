// components/Header.tsx
'use client';

import type { GlobalStats } from '@/hooks/useProgress';
import PomodoroTimer from './PomodoroTimer';

interface HeaderProps {
  globalStats: GlobalStats;
  lectureCount: number;
}

export default function Header({ globalStats, lectureCount }: HeaderProps) {
  const completedSessions = globalStats.totalSessions;
  const pillText =
    lectureCount > 0
      ? `${lectureCount} lecture${lectureCount !== 1 ? 's' : ''} · ${completedSessions} session${completedSessions !== 1 ? 's' : ''}`
      : 'Loading…';

  return (
    <header className="smd-header">
      <div>
        <div className="smd-logo">
          <span className="smd-logo-study">Study</span>
          <span className="smd-logo-md">MD</span>
        </div>
        <div className="smd-header-subtitle">Lecture Mastery Platform</div>
      </div>

      <div className="smd-header-right">
        <div className="smd-progress-pill">
          <span className="dot" />
          <span>{pillText}</span>
        </div>
        <PomodoroTimer />
      </div>
    </header>
  );
}
