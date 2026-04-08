/**
 * StudyMD Upload Page (placeholder)
 *
 * Protected route: /app/upload
 * Workstream 1 will implement the full upload flow:
 *   - File picker (PDF / PPTX, max 50MB)
 *   - Course dropdown
 *   - Optional title field
 *   - Token pre-flight estimate
 *   - Progress indicator (polling /api/upload/status)
 *   - Success → redirect to dashboard with new lecture highlighted
 */
export default function UploadPage() {
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
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px dashed var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "3rem 2.5rem",
          maxWidth: "540px",
          width: "100%",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <span style={{ fontSize: "2.5rem" }}>📤</span>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "1.5rem",
            margin: 0,
          }}
        >
          Upload Lecture
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: 0 }}>
          Full upload flow coming in Workstream 1.
          <br />
          Supports PDF and PPTX up to 50 MB.
        </p>
        <a
          href="/app"
          style={{
            marginTop: "0.5rem",
            color: "var(--accent)",
            fontSize: "0.85rem",
            textDecoration: "none",
          }}
        >
          ← Back to dashboard
        </a>
      </div>
    </main>
  );
}
