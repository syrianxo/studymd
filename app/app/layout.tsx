// app/layout.tsx
// Root layout — imports Google Fonts and the global dashboard styles.
import type { Metadata } from 'next';
import '@/styles/dashboard.css';
import '@/styles/study.css';

export const metadata: Metadata = {
  title: 'StudyMD — Lecture Mastery Platform',
  description: 'Adaptive flashcards and practice exams for PA school.',
  icons: { icon: '/favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;1,9..144,400&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
