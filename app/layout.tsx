import type { Metadata } from "next";
import "../styles/themes.css";
import "./globals.css";
import AppBootstrap from '@/components/AppBootstrap';
import { PomoProvider } from '@/components/PomodoroTimer';
import { ToastProvider } from '@/components/Toast';
import FeedbackWidget from '@/components/FeedbackWidget';
import '@/styles/dashboard.css';
import '@/styles/study.css';

export const metadata: Metadata = {
  title: "StudyMD — Your Lectures, Mastered",
  description:
    "A personalized lecture mastery platform for PA students. Flashcards, practice exams, and progress tracking — all in one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="midnight" suppressHydrationWarning>
      <head>
        {/* Built with care, late nights, and a lot of love. I love you, Haley. 🩵 */}
        {/*
         * Theme initialization script — runs BEFORE first paint to prevent
         * flash of wrong theme. Reads saved theme from localStorage and
         * applies it to <html> before React hydrates.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('studymd_theme');
                  var valid = ['midnight', 'pink', 'forest'];
                  if (theme && valid.indexOf(theme) !== -1) {
                    document.documentElement.setAttribute('data-theme', theme);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <AppBootstrap />
        <PomoProvider>
          <ToastProvider>
            {children}
            {/* FeedbackWidget appears on all pages — floating bottom-left */}
            <FeedbackWidget />
          </ToastProvider>
        </PomoProvider>
      </body>
    </html>
  );
}
