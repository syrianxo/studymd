/**
 * Protected App Layout
 *
 * Wraps all /app/* routes. Auth enforcement is handled by middleware.ts,
 * so by the time this layout renders, the user is guaranteed to be
 * authenticated. This layout is the place to add:
 *   - Supabase session provider (when implementing Workstream 2/3)
 *   - Global progress context
 *   - Theme synchronization from user_preferences
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "StudyMD — Dashboard",
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      {/*
       * TODO (Workstream 3): Add <SessionProvider> or Supabase context here
       * TODO (Workstream 5): Sync theme from user_preferences on mount
       */}
      {children}
    </div>
  );
}
