'use client';

import { applyTheme } from '@/components/ThemePicker';
import Dashboard from '@/components/Dashboard';
import type { Theme } from '@/types';
import { useEffect } from 'react';

interface DashboardClientProps {
  initialTheme: Theme;
  userName: string;
  userId: string;
  isPrimary?: boolean;
}

export function DashboardClient({
  initialTheme,
  userName,
  userId,
  isPrimary = false,
}: DashboardClientProps) {
  useEffect(() => {
    applyTheme(initialTheme);
  }, [initialTheme]);

  return <Dashboard userName={userName} userId={userId} initialTheme={initialTheme} isPrimary={isPrimary} />;
}
