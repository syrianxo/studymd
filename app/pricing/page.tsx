"use client";

export default function PricingPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=Outfit:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:         #0d0f14;
          --surface:    #13161d;
          --surface2:   #1a1e27;
          --border:     #ffffff0f;
          --border-strong: #ffffff1a;
          --accent:     #5b8dee;
          --gold:       #f0c040;
          --success:    #10b981;
          --text:       #e8eaf0;
          --text-muted: #6b7280;
          --text-dim:   #3d4355;
          --font-display: 'Fraunces', Georgia, serif;
          --font-body:  'Outfit', sans-serif;
          --radius:     12px;
          --radius-lg:  20px;
        }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          -webkit-font-smoothing: antialiased;
        }

        body::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 9999;
          opacity: 0.6;
        }

        /* Nav */
        .nav {
          position: sticky;
          top: 0;
          z-index: 100;
          padding: 16px 0;
          background: rgba(13, 15, 20, 0.88);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border-bottom: 1px solid var(--border);
        }
        .container { max-width: 1140px; margin: 0 auto; padding: 0 24px; }
        .nav-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .nav-logo {
          font-family: var(--font-display);
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--text);
          text-decoration: none;
          letter-spacing: -0.02em;
        }
        .nav-logo em { font-style: italic; color: var(--accent); }
        .nav-back {
          font-size: 0.875rem;
          color: var(--text-muted);
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 44px;
          transition: color 0.2s;
        }
        .nav-back:hover { color: var(--text); }

        /* Main */
        main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 80px 24px;
        }

        .pricing-card {
          max-width: 560px;
          width: 100%;
          text-align: center;
        }

        .pricing-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 14px;
          background: color-mix(in srgb, var(--success) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
          border-radius: 100px;
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--success);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 32px;
        }
        .pricing-badge-dot {
          width: 6px; height: 6px;
          background: var(--success);
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        .pricing-title {
          font-family: var(--font-display);
          font-size: clamp(2rem, 5vw, 3rem);
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.03em;
          margin-bottom: 8px;
          line-height: 1.1;
        }
        .pricing-title em { font-style: italic; color: var(--accent); }

        .pricing-price {
          font-family: var(--font-display);
          font-size: clamp(3rem, 8vw, 5rem);
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.04em;
          line-height: 1;
          margin: 24px 0 8px;
        }
        .pricing-price sup {
          font-size: 0.4em;
          vertical-align: super;
          color: var(--text-muted);
          font-weight: 600;
        }
        .pricing-period {
          font-size: 0.9rem;
          color: var(--text-muted);
          margin-bottom: 32px;
        }

        .pricing-box {
          background: var(--surface);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg);
          padding: 40px 36px;
          margin-bottom: 32px;
          position: relative;
          overflow: hidden;
        }
        .pricing-box::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--accent), var(--accent2));
        }

        .pricing-desc {
          font-size: 1rem;
          color: var(--text-muted);
          line-height: 1.7;
          margin-bottom: 8px;
        }

        .pricing-coming {
          font-size: 0.875rem;
          color: var(--text-dim);
          font-style: italic;
          margin-bottom: 0;
        }

        .pricing-divider {
          height: 1px;
          background: var(--border);
          margin: 24px 0;
        }

        .pricing-earlyaccess {
          font-size: 0.9rem;
          color: var(--gold);
          font-weight: 500;
          margin-bottom: 0;
        }

        .cta-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          max-width: 320px;
          padding: 16px 32px;
          background: var(--accent);
          color: #fff;
          border-radius: var(--radius);
          font-family: var(--font-body);
          font-size: 1rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
          box-shadow: 0 4px 24px #5b8dee33;
          min-height: 52px;
          position: relative;
          overflow: hidden;
        }
        .cta-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #ffffff18, transparent);
          pointer-events: none;
        }
        .cta-btn:hover {
          background: color-mix(in srgb, var(--accent) 80%, black);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px #5b8dee44;
        }

        .pricing-footnote {
          margin-top: 20px;
          font-size: 0.8rem;
          color: var(--text-dim);
        }

        @media (max-width: 480px) {
          .pricing-box { padding: 28px 20px; }
        }
      `}</style>

      {/* Nav */}
      <nav className="nav">
        <div className="container">
          <div className="nav-inner">
            <a href="/" className="nav-logo">Study<em>MD</em></a>
            <a href="/" className="nav-back">← Back to home</a>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main>
        <div className="pricing-card">
          <div className="pricing-badge">
            <span className="pricing-badge-dot" />
            Beta — Currently Free
          </div>

          <h1 className="pricing-title">Plans &amp; <em>Pricing</em></h1>

          <div className="pricing-box">
            <div className="pricing-price">
              <sup>$</sup>0
            </div>
            <p className="pricing-period">during our beta period</p>

            <p className="pricing-desc">
              StudyMD is currently free while we grow and refine the platform.
              All features — flashcards, practice exams, progress tracking — are fully available at no cost.
            </p>

            <div className="pricing-divider" />

            <p className="pricing-coming">
              Paid plans with expanded AI processing, team features, and advanced analytics are coming in a future update.
            </p>

            <div className="pricing-divider" />

            <p className="pricing-earlyaccess">
              ✦ Sign up now to lock in early access pricing when paid plans launch.
            </p>
          </div>

          <a href="/login" className="cta-btn">
            Sign Up Free →
          </a>

          <p className="pricing-footnote">No credit card required. Free forever during beta.</p>
        </div>
      </main>
    </>
  );
}
