'use client';

import React from 'react';
import { ManageMode } from '@/components/ManageMode';
import { ThemePicker, applyTheme } from '@/components/ThemePicker';
import type { LectureWithSettings, Theme } from '@/types';

interface DashboardClientProps {
  userId: string;
  initialLectures: LectureWithSettings[];
  initialTheme: Theme;
}

export function DashboardClient({
  userId,
  initialLectures,
  initialTheme,
}: DashboardClientProps) {
  // Apply initial theme immediately (redundant with init script, harmless)
  React.useEffect(() => {
    applyTheme(initialTheme);
  }, [initialTheme]);

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '24px 20px',
        minHeight: '100vh',
      }}
    >
      {/* Site header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 32,
          paddingBottom: 20,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--text)',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            StudyMD
          </h1>
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: 'var(--text-muted)',
              margin: '4px 0 0',
              letterSpacing: '0.06em',
            }}
          >
            designed for Haley Lange
          </p>
        </div>
        <ThemePicker userId={userId} initialTheme={initialTheme} />
      </header>

      {/*
       * ManageMode receives renderHeaderRight so we can inject the
       * "Manage Lectures" button inline with any other header items.
       */}
      <ManageMode
        userId={userId}
        initialLectures={initialLectures}
        onOpenLecture={(id) => {
          // Replace with your router navigation:
          // router.push(`/app/study/${id}`)
          console.log('Open lecture:', id);
        }}
      />
    </div>
  );
}
