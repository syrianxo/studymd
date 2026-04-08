/**
 * StudyMD Login Page (placeholder)
 * Workstream 3 will implement the full Supabase Auth login form.
 */
export default function LoginPage() {
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
        padding: "2rem",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "2.5rem",
          width: "100%",
          maxWidth: "400px",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: "2rem",
              fontWeight: 600,
              background:
                "linear-gradient(135deg, var(--accent), var(--accent2))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              margin: "0 0 0.5rem",
            }}
          >
            StudyMD
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.9rem",
              margin: 0,
            }}
          >
            Sign in to your dashboard
          </p>
        </div>

        {/* Placeholder form — will be replaced in Workstream 3 */}
        <div
          style={{
            padding: "1.5rem",
            background: "var(--surface2)",
            borderRadius: "var(--radius-md)",
            border: "1px dashed var(--border)",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "0.85rem",
            lineHeight: 1.6,
          }}
        >
          Login form coming in Workstream 3
          <br />
          (Supabase Auth — email + password)
        </div>

        <a
          href="/"
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "0.85rem",
            textDecoration: "none",
          }}
        >
          ← Back to homepage
        </a>
      </div>
    </main>
  );
}
