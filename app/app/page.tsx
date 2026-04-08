/**
 * StudyMD Dashboard (placeholder)
 *
 * This is the main protected route (/app). It will house:
 *   - Lecture grid (LectureCard components)
 *   - Course filter bar
 *   - Progress stats
 *   - Pomodoro timer
 *   - Upload button (when authenticated)
 *
 * Workstream 0 (Phase 2) will port the existing v1 dashboard here.
 * Workstream 2 will add cross-device progress sync.
 * Workstream 5 will add drag-to-reorder, groups, tags, and theme picker.
 */
export default function DashboardPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "'Outfit', sans-serif",
        padding: "2rem",
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: "1.75rem",
              fontWeight: 600,
              background:
                "linear-gradient(135deg, var(--accent), var(--accent2))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              margin: "0 0 0.25rem",
            }}
          >
            StudyMD
          </h1>
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "0.9rem" }}>
            Welcome back 👋
          </p>
        </div>
      </header>

      {/* Placeholder content */}
      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          background: "var(--surface)",
          border: "1px dashed var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "4rem 2rem",
          textAlign: "center",
          gap: "1rem",
        }}
      >
        <p style={{ color: "var(--text-muted)", fontSize: "1rem", margin: 0 }}>
          Dashboard — Workstream 0 (Phase 2)
        </p>
        <p
          style={{
            color: "var(--text-subtle)",
            fontSize: "0.85rem",
            maxWidth: "480px",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          The v1 lecture grid, flashcard view, exam view, Pomodoro timer, and
          lightbox will be ported to React components here.
        </p>
      </div>
    </main>
  );
}
