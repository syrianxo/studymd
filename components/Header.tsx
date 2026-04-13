// components/Header.tsx
'use client';

import type { GlobalStats } from '@/hooks/useProgress';
import PomodoroTimer from './PomodoroTimer';
import { ThemePicker } from './ThemePicker';
import type { Theme } from '@/types';

interface HeaderProps {
  globalStats: GlobalStats;
  lectureCount: number;
  loading?: boolean;
  userId: string;
  initialTheme: Theme;
}

export default function Header({
  globalStats,
  lectureCount,
  loading = false,
  userId,
  initialTheme,
}: HeaderProps) {
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
        <ThemePicker userId={userId} initialTheme={initialTheme} />
        <PomodoroTimer />
      </div>
    </header>
  );
}
