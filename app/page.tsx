/**
 * StudyMD Homepage (placeholder)
 * Workstream 6 will implement the full public-facing marketing page.
 */
export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "'Outfit', sans-serif",
        gap: "1.5rem",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
          fontWeight: 600,
          background: "linear-gradient(135deg, var(--accent), var(--accent2))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          margin: 0,
        }}
      >
        StudyMD
      </h1>
      <p
        style={{
          fontSize: "1.25rem",
          color: "var(--text-muted)",
          maxWidth: "480px",
          margin: 0,
          lineHeight: 1.6,
        }}
      >
        Your lectures, mastered.
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
        <a
          href="/login"
          style={{
            padding: "0.75rem 2rem",
            background: "var(--accent)",
            color: "#fff",
            borderRadius: "var(--radius-md)",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.95rem",
          }}
        >
          Student Login
        </a>
      </div>
      <p
        style={{
          color: "var(--text-subtle)",
          fontSize: "0.8rem",
          margin: "2rem 0 0",
        }}
      >
        StudyMD v2 — homepage coming soon (Workstream 6)
      </p>
    </main>
  );
}
