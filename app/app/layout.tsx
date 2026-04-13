import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'StudyMD — Lecture Mastery Platform',
  description: 'Adaptive flashcards and practice exams for PA school.',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
