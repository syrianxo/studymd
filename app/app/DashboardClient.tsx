'use client';

import { applyTheme } from '@/components/ThemePicker';
import Dashboard from '@/components/Dashboard';
import type { Theme } from '@/types';
import { useEffect } from 'react';

interface DashboardClientProps {
  initialTheme: Theme;
  userName: string;
}

export function DashboardClient({
  initialTheme,
  userName,
}: DashboardClientProps) {
  useEffect(() => {
    applyTheme(initialTheme);
  }, [initialTheme]);

  return <Dashboard userName={userName} />;
}
