'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase';
import type { Theme } from '@/types';
import { migrateThemeId } from '@/lib/themes';

export default function ProgressPage() {
  const [userId, setUserId] = useState('');
  const [theme, setTheme] = useState<Theme>('midnight');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      supabase
        .from('user_preferences')
        .select('theme')
        .eq('user_id', data.user.id)
        .single()
        .then(({ data: prefs }) => {
          if (prefs?.theme) setTheme(migrateThemeId(prefs.theme) as Theme);
        });
    });
  }, []);

  return (
    <>
      <style>{css}</style>
      <Header
        lectureCount={0}
        userId={userId}
        initialTheme={theme}
        onThemeChange={setTheme}
        hideUploadButton={false}
      />
      <main className="sp-main">
        <div className="sp-coming-soon">
          <div className="sp-coming-icon">📊</div>
          <h1 className="sp-coming-title">Progress</h1>
          <p className="sp-coming-body">
            Mastery tracking by lecture, flashcard retention curves, and study streak data — coming in v3.
          </p>
        </div>
      </main>
    </>
  );
}

const css = `
.sp-main {
  max-width: 900px;
  margin: 0 auto;
  padding: 48px 20px;
}
.sp-coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  padding: 80px 20px;
}
.sp-coming-icon {
  font-size: 52px;
}
.sp-coming-title {
  font-family: 'Fraunces', serif;
  font-size: 28px;
  font-weight: 700;
  color: var(--text, #e8eaf0);
  margin: 0;
}
.sp-coming-body {
  font-family: 'Outfit', sans-serif;
  font-size: 15px;
  color: var(--text-muted, #6b7280);
  max-width: 400px;
  line-height: 1.6;
  margin: 0;
}
`;
