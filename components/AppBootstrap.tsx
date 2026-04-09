// components/AppBootstrap.tsx
// Client component that runs one-time app startup effects.
// Rendered inside RootLayout so it fires on every page load.
'use client';

import { useEffect } from 'react';
import { setupOnlineListener } from '@/lib/progress-sync';

export default function AppBootstrap() {
  useEffect(() => {
    setupOnlineListener();
  }, []);

  return null; // renders nothing
}
