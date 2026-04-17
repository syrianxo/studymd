'use client';

import { applyTheme } from '@/components/ThemePicker';
import Dashboard from '@/components/Dashboard';
import type { Theme } from '@/types';
import { useEffect } from 'react';

interface DashboardClientProps {
  initialTheme: Theme;
  userName: string;
  isPrimary?: boolean;
}

export function DashboardClient({
  initialTheme,
  userName,
  isPrimary = false,
}: DashboardClientProps) {
  useEffect(() => {
    applyTheme(initialTheme);
  }, [initialTheme]);

  // Pass initialTheme so Dashboard can give it directly to Header/ThemePicker
  // without waiting for a localStorage read on the next tick.
  return <Dashboard userName={userName} initialTheme={initialTheme} isPrimary={isPrimary} />;
}
