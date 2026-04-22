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
  isAdmin?: boolean;
}

export function DashboardClient({
  initialTheme,
  userName,
  userId,
  isPrimary = false,
  isAdmin = false,
}: DashboardClientProps) {
  useEffect(() => {
    applyTheme(initialTheme);
  }, [initialTheme]);

  return <Dashboard userName={userName} userId={userId} initialTheme={initialTheme} isPrimary={isPrimary} isAdmin={isAdmin} />;
}
