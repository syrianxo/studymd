"use client";

import { useState, useEffect, useRef } from "react";

// ─── Demo flashcard data (hardcoded, no auth required) ───────────────────────
const DEMO_CARDS = [
  {
    id: 1,
    front: "What is the difference between RAM and ROM?",
    back: "RAM (Random Access Memory) is volatile — data is lost when power is off. ROM (Read-Only Memory) is non-volatile — data persists. RAM is used for temporary working data; ROM stores permanent firmware.",
  },
  {
    id: 2,
    front: "Define 'bandwidth' in networking.",
    back: "Bandwidth is the maximum rate of data transfer across a network path, measured in bits per second (bps). Higher bandwidth means more data can flow simultaneously — like a wider pipe carrying more water.",
  },
  {
    id: 3,
    front: "What is the OSI Model?",
    back: "The Open Systems Interconnection model is a 7-layer framework describing how data travels across a network: Physical → Data Link → Network → Transport → Session → Presentation → Application.",
  },
  {
    id: 4,
    front: "What does CPU stand for, and what does it do?",
    back: "Central Processing Unit — the brain of a computer. It executes instructions from programs by performing arithmetic, logic, control, and I/O operations specified by those instructions.",
  },
  {
    id: 5,
    front: "Explain the concept of 'latency' vs 'bandwidth'.",
    back: "Latency is the delay before data transfer begins (like reaction time). Bandwidth is how much data transfers per second (like throughput capacity). A pipe can be wide (high bandwidth) but long (high latency).",
  },
];

// ─── FlashCard Component ──────────────────────────────────────────────────────
function DemoFlashcard() {
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);
  const [animating, setAnimating] = useState(false);

  const navigate = (dir: "next" | "prev") => {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setFlipped(false);
    setTimeout(() => {
      setCurrent((c) =>
        dir === "next"
          ? (c + 1) % DEMO_CARDS.length
          : (c - 1 + DEMO_CARDS.length) % DEMO_CARDS.length
      );
      setAnimating(false);
      setDirection(null);
    }, 300);
  };

  const card = DEMO_CARDS[current];

  return (
    <div className="demo-wrapper">
      <div className="demo-counter">
        {DEMO_CARDS.map((_, i) => (
          <span
            key={i}
            className={`demo-dot ${i === current ? "active" : ""}`}
          />
        ))}
      </div>

      <div
        className={`flashcard-scene ${animating ? `exit-${direction}` : ""}`}
        onClick={() => !animating && setFlipped((f) => !f)}
      >
        <div className={`flashcard-inner ${flipped ? "is-flipped" : ""}`}>
          <div className="flashcard-face flashcard-front">
            <span className="face-label">Question</span>
            <p className="face-text">{card.front}</p>
            <span className="flip-hint">tap to reveal →</span>
          </div>
          <div className="flashcard-face flashcard-back">
            <span className="face-label answer-label">Answer</span>
            <p className="face-text">{card.back}</p>
          </div>
        </div>
      </div>

      <div className="demo-nav">
        <button
          className="nav-btn"
          onClick={() => navigate("prev")}
          aria-label="Previous card"
        >
          ←
        </button>
        <span className="nav-count">
          {current + 1} / {DEMO_CARDS.length}
        </span>
        <button
          className="nav-btn"
          onClick={() => navigate("next")}
          aria-label="Next card"
        >
          →
        </button>
      </div>
    </div>
  );
}

// ─── Animated counter hook ────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return value;
}

// ─── Stats section ────────────────────────────────────────────────────────────
function StatsSection() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const lectures = useCountUp(15, 1000, visible);
  const cards = useCountUp(1800, 1400, visible);
  const questions = useCountUp(900, 1200, visible);

  return (
    <div ref={ref} className="stats-row">
      <div className="stat-item">
        <span className="stat-number">{lectures}+</span>
        <span className="stat-label">Lectures processed</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item">
        <span className="stat-number">{cards}+</span>
        <span className="stat-label">Flashcards generated</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item">
        <span className="stat-number">{questions}+</span>
        <span className="stat-label">Practice questions</span>
      </div>
    </div>
  );
}

// ─── Abstract dashboard mockup ────────────────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="mockup-shell" aria-hidden="true">
      <div className="mockup-bar">
        <span className="mockup-dot red" />
        <span className="mockup-dot yellow" />
        <span className="mockup-dot green" />
        <span className="mockup-url">studymd.app</span>
      </div>
      <div className="mockup-body">
        {/* Header strip */}
        <div className="mk-header">
          <div className="mk-logo-strip">
            <span className="mk-logo-text">Study<em>MD</em></span>
          </div>
          <div className="mk-header-right">
            <div className="mk-pill" />
            <div className="mk-pill short" />
          </div>
        </div>

        {/* Course pills */}
        <div className="mk-filters">
          {["All", "Physical Dx", "A&P", "Lab Dx"].map((label, i) => (
            <div key={i} className={`mk-filter-pill ${i === 0 ? "active" : ""}`}>
              {label}
            </div>
          ))}
        </div>

        {/* Lecture cards grid */}
        <div className="mk-grid">
          {[
            { color: "#5b8dee", title: "Cardiac Exam", sub: "Physical Dx I", prog: 78 },
            { color: "#8b5cf6", title: "Thorax & Lungs", sub: "Physical Dx I", prog: 45 },
            { color: "#10b981", title: "Cell Biology", sub: "A&P", prog: 92 },
            { color: "#f0c040", title: "CBC Interpretation", sub: "Lab Dx", prog: 30 },
            { color: "#ef4444", title: "Head & Neck", sub: "Physical Dx I", prog: 15 },
            { color: "#06b6d4", title: "Renal Function", sub: "Lab Dx", prog: 60 },
          ].map((card, i) => (
            <div key={i} className="mk-card" style={{ "--card-accent": card.color } as React.CSSProperties}>
              <div className="mk-card-icon" style={{ background: card.color + "22", borderColor: card.color + "44" }}>
                <div className="mk-card-dot" style={{ background: card.color }} />
              </div>
              <div className="mk-card-info">
                <div className="mk-card-title">{card.title}</div>
                <div className="mk-card-sub">{card.sub}</div>
              </div>
              <div className="mk-progress-bar">
                <div
                  className="mk-progress-fill"
                  style={{ width: `${card.prog}%`, background: card.color }}
                />
              </div>
              <div className="mk-card-percent">{card.prog}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <style>{`
        /* ── Reset & base ───────────────────────────────────── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:         #0d0f14;
          --surface:    #13161d;
          --surface2:   #1a1e27;
          --surface3:   #212637;
          --border:     #ffffff0f;
          --border-strong: #ffffff1a;
          --accent:     #5b8dee;
          --accent2:    #8b5cf6;
          --success:    #10b981;
          --gold:       #f0c040;
          --text:       #e8eaf0;
          --text-muted: #6b7280;
          --text-dim:   #3d4355;
          --font-display: 'Fraunces', Georgia, serif;
          --font-body:    'Outfit', sans-serif;
          --font-mono:    'DM Mono', monospace;
          --radius:     12px;
          --radius-lg:  20px;
          --shadow-glow: 0 0 60px #5b8dee18;
        }

        html { scroll-behavior: smooth; }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
          font-size: 16px;
          line-height: 1.6;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        /* Noise texture overlay */
        body::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 9999;
          opacity: 0.6;
        }

        /* ── Typography ─────────────────────────────────────── */
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=Outfit:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

        h1, h2, h3 { font-family: var(--font-display); line-height: 1.1; }

        /* ── Utility ─────────────────────────────────────────── */
        .container {
          max-width: 1140px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }

        /* ── Navigation ─────────────────────────────────────── */
        .nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          padding: 16px 0;
          transition: background 0.3s, backdrop-filter 0.3s, border-color 0.3s;
        }
        .nav.scrolled {
          background: rgba(13, 15, 20, 0.85);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border-bottom: 1px solid var(--border);
        }
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
        .nav-logo em {
          font-style: italic;
          color: var(--accent);
        }
        .nav-cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 20px;
          background: var(--accent);
          color: #fff;
          border-radius: 8px;
          font-family: var(--font-body);
          font-size: 0.875rem;
          font-weight: 500;
          text-decoration: none;
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .nav-cta:hover {
          background: #4a7de3;
          transform: translateY(-1px);
          box-shadow: 0 4px 20px #5b8dee44;
        }

        /* ── Hero ───────────────────────────────────────────── */
        .hero {
          min-height: 100vh;
          display: grid;
          grid-template-rows: 1fr auto;
          padding-top: 80px;
          position: relative;
          overflow: hidden;
        }

        /* Radial glow background */
        .hero::after {
          content: '';
          position: absolute;
          top: -10%;
          left: 50%;
          transform: translateX(-50%);
          width: 900px;
          height: 600px;
          background: radial-gradient(ellipse at center, #5b8dee12 0%, #8b5cf608 40%, transparent 70%);
          pointer-events: none;
        }

        .hero-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          align-items: center;
          padding: 80px 0 60px;
        }

        @media (max-width: 900px) {
          .hero-content { grid-template-columns: 1fr; gap: 40px; }
          .hero-right { display: none; }
        }

        .hero-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 12px;
          background: var(--surface2);
          border: 1px solid var(--border-strong);
          border-radius: 100px;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--accent);
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 24px;
        }
        .hero-eyebrow-dot {
          width: 6px; height: 6px;
          background: var(--success);
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        .hero-headline {
          font-size: clamp(2.5rem, 5vw, 4rem);
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.03em;
          margin-bottom: 8px;
          line-height: 1.05;
        }
        .hero-headline .study { color: var(--text); }
        .hero-headline .md { font-style: italic; color: var(--accent); }

        .hero-tagline {
          font-family: var(--font-display);
          font-size: clamp(1.6rem, 3vw, 2.4rem);
          font-weight: 600;
          color: var(--text);
          letter-spacing: -0.02em;
          margin-bottom: 20px;
          line-height: 1.2;
        }
        .hero-tagline em {
          font-style: italic;
          color: var(--gold);
        }

        .hero-subtitle {
          font-size: 1.05rem;
          color: var(--text-muted);
          line-height: 1.7;
          max-width: 480px;
          margin-bottom: 36px;
        }

        .hero-actions {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 28px;
          background: var(--accent);
          color: #fff;
          border-radius: var(--radius);
          font-family: var(--font-body);
          font-size: 1rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
          box-shadow: 0 4px 24px #5b8dee33;
          position: relative;
          overflow: hidden;
        }
        .btn-primary::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #ffffff18, transparent);
          pointer-events: none;
        }
        .btn-primary:hover {
          background: #4a7de3;
          transform: translateY(-2px);
          box-shadow: 0 8px 32px #5b8dee44;
        }
        .btn-primary:active { transform: translateY(0); }

        .btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 24px;
          color: var(--text-muted);
          font-family: var(--font-body);
          font-size: 1rem;
          font-weight: 500;
          text-decoration: none;
          border-radius: var(--radius);
          transition: color 0.2s;
        }
        .btn-ghost:hover { color: var(--text); }
        .btn-ghost-arrow { transition: transform 0.2s; }
        .btn-ghost:hover .btn-ghost-arrow { transform: translateX(4px); }

        /* ── Stats ──────────────────────────────────────────── */
        .hero-stats {
          padding: 28px 0 60px;
          border-top: 1px solid var(--border);
        }

        .stats-row {
          display: flex;
          align-items: center;
          gap: 0;
          flex-wrap: wrap;
        }
        .stat-item {
          flex: 1;
          min-width: 120px;
          padding: 8px 24px 8px 0;
        }
        .stat-number {
          display: block;
          font-family: var(--font-display);
          font-size: 2rem;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.03em;
          line-height: 1;
          margin-bottom: 4px;
        }
        .stat-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 500;
        }
        .stat-divider {
          width: 1px;
          height: 40px;
          background: var(--border-strong);
          margin-right: 24px;
          flex-shrink: 0;
        }

        /* ── Dashboard Mockup ───────────────────────────────── */
        .hero-right {
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
        }
        .hero-right::before {
          content: '';
          position: absolute;
          inset: -40px;
          background: radial-gradient(ellipse at center, #5b8dee0a 0%, transparent 70%);
          pointer-events: none;
        }

        .mockup-shell {
          width: 100%;
          max-width: 520px;
          background: var(--surface);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: 0 32px 80px #00000066, 0 0 0 1px #ffffff08;
          transform: perspective(1200px) rotateY(-6deg) rotateX(3deg);
          transition: transform 0.4s ease;
        }
        .mockup-shell:hover {
          transform: perspective(1200px) rotateY(-2deg) rotateX(1deg);
        }

        .mockup-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 12px 16px;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
        }
        .mockup-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .mockup-dot.red    { background: #ff5f57; }
        .mockup-dot.yellow { background: #febc2e; }
        .mockup-dot.green  { background: #28c840; }
        .mockup-url {
          flex: 1;
          text-align: center;
          font-family: var(--font-mono);
          font-size: 0.7rem;
          color: var(--text-dim);
          margin-right: 26px;
        }

        .mockup-body { padding: 16px; }

        .mk-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .mk-logo-text {
          font-family: var(--font-display);
          font-size: 1rem;
          font-weight: 700;
          color: var(--text);
        }
        .mk-logo-text em { font-style: italic; color: var(--accent); }
        .mk-header-right { display: flex; gap: 6px; }
        .mk-pill {
          height: 24px; width: 60px;
          background: var(--surface3);
          border-radius: 6px;
        }
        .mk-pill.short { width: 32px; }

        .mk-filters {
          display: flex;
          gap: 6px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .mk-filter-pill {
          padding: 4px 10px;
          border-radius: 100px;
          font-size: 0.65rem;
          font-weight: 600;
          background: var(--surface2);
          color: var(--text-muted);
          border: 1px solid var(--border);
          letter-spacing: 0.02em;
        }
        .mk-filter-pill.active {
          background: #5b8dee18;
          color: var(--accent);
          border-color: #5b8dee44;
        }

        .mk-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .mk-card {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px;
          transition: border-color 0.2s;
        }
        .mk-card:hover { border-color: var(--border-strong); }
        .mk-card-icon {
          width: 28px; height: 28px;
          border-radius: 8px;
          border: 1px solid;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 8px;
        }
        .mk-card-dot { width: 8px; height: 8px; border-radius: 50%; }
        .mk-card-title {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mk-card-sub {
          font-size: 0.6rem;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .mk-progress-bar {
          height: 3px;
          background: var(--surface3);
          border-radius: 2px;
          overflow: hidden;
          margin-bottom: 4px;
        }
        .mk-progress-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 1s ease;
        }
        .mk-card-percent {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          color: var(--text-muted);
        }

        /* ── Section base ───────────────────────────────────── */
        section {
          padding: 100px 0;
          position: relative;
        }

        .section-eyebrow {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--accent);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        .section-heading {
          font-size: clamp(2rem, 3.5vw, 2.8rem);
          font-weight: 700;
          letter-spacing: -0.03em;
          margin-bottom: 16px;
          color: var(--text);
        }

        .section-sub {
          font-size: 1.05rem;
          color: var(--text-muted);
          max-width: 520px;
          line-height: 1.7;
          margin-bottom: 60px;
        }

        /* ── Features section ───────────────────────────────── */
        .features {
          background: var(--surface);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }
        .features::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--accent), var(--accent2), transparent);
          opacity: 0.5;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 2px;
        }

        .feature-card {
          background: var(--surface);
          padding: 36px 28px;
          border: 1px solid var(--border);
          position: relative;
          overflow: hidden;
          transition: border-color 0.3s, background 0.3s;
        }
        .feature-card:hover {
          background: var(--surface2);
          border-color: var(--border-strong);
        }
        .feature-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: var(--card-color, var(--accent));
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.3s ease;
        }
        .feature-card:hover::before { transform: scaleX(1); }

        .feature-icon {
          font-size: 2rem;
          margin-bottom: 16px;
          display: block;
        }

        .feature-title {
          font-family: var(--font-display);
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 10px;
          letter-spacing: -0.02em;
        }

        .feature-desc {
          font-size: 0.9rem;
          color: var(--text-muted);
          line-height: 1.65;
        }

        /* ── Demo section ───────────────────────────────────── */
        .demo-section {
          background: var(--bg);
        }

        .demo-inner {
          max-width: 640px;
          margin: 0 auto;
          text-align: center;
        }

        .demo-wrapper {
          background: var(--surface);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg);
          padding: 32px;
          box-shadow: var(--shadow-glow);
        }

        .demo-counter {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 24px;
        }
        .demo-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--surface3);
          transition: background 0.3s, transform 0.3s;
        }
        .demo-dot.active {
          background: var(--accent);
          transform: scale(1.3);
        }

        .flashcard-scene {
          perspective: 1200px;
          cursor: pointer;
          margin-bottom: 24px;
          transition: opacity 0.3s, transform 0.3s;
        }
        .flashcard-scene.exit-next {
          opacity: 0;
          transform: translateX(-30px);
        }
        .flashcard-scene.exit-prev {
          opacity: 0;
          transform: translateX(30px);
        }

        .flashcard-inner {
          position: relative;
          transform-style: preserve-3d;
          transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
          min-height: 180px;
        }
        .flashcard-inner.is-flipped { transform: rotateY(180deg); }

        .flashcard-face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          background: var(--surface2);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius);
          padding: 28px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          min-height: 180px;
        }
        .flashcard-back { transform: rotateY(180deg); }
        .flashcard-back { background: #5b8dee0d; border-color: #5b8dee33; }

        .face-label {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          font-weight: 500;
          color: var(--text-muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
        .answer-label { color: var(--accent); }

        .face-text {
          font-size: 1rem;
          color: var(--text);
          line-height: 1.6;
          text-align: left;
        }

        .flip-hint {
          margin-top: 16px;
          font-size: 0.75rem;
          color: var(--text-dim);
          font-family: var(--font-mono);
          align-self: flex-end;
        }

        .demo-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
        }
        .nav-btn {
          width: 40px; height: 40px;
          border-radius: 50%;
          border: 1px solid var(--border-strong);
          background: var(--surface2);
          color: var(--text);
          font-size: 1rem;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.2s, border-color 0.2s, transform 0.15s;
        }
        .nav-btn:hover { background: var(--surface3); border-color: var(--accent); transform: scale(1.08); }
        .nav-btn:active { transform: scale(0.95); }
        .nav-count {
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: var(--text-muted);
          min-width: 40px;
          text-align: center;
        }

        .demo-cta {
          margin-top: 32px;
          font-size: 0.95rem;
          color: var(--text-muted);
        }
        .demo-cta a {
          color: var(--accent);
          text-decoration: none;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: gap 0.2s;
        }
        .demo-cta a:hover { gap: 8px; }

        /* ── Footer ─────────────────────────────────────────── */
        footer {
          background: var(--surface);
          border-top: 1px solid var(--border);
          padding: 48px 0 36px;
        }

        .footer-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 24px;
        }

        .footer-logo {
          font-family: var(--font-display);
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--text);
          text-decoration: none;
        }
        .footer-logo em { font-style: italic; color: var(--accent); }

        .footer-meta {
          text-align: right;
          font-size: 0.8rem;
          color: var(--text-muted);
          line-height: 1.8;
        }
        .footer-meta a {
          color: var(--text-muted);
          text-decoration: none;
          border-bottom: 1px solid var(--border-strong);
          transition: color 0.2s;
        }
        .footer-meta a:hover { color: var(--text); }

        /* ── Animations ─────────────────────────────────────── */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.6s ease both; }
        .fade-up-1 { animation-delay: 0.1s; }
        .fade-up-2 { animation-delay: 0.2s; }
        .fade-up-3 { animation-delay: 0.3s; }
        .fade-up-4 { animation-delay: 0.4s; }
        .fade-up-5 { animation-delay: 0.5s; }

        /* ── Responsive ─────────────────────────────────────── */
        @media (max-width: 640px) {
          section { padding: 72px 0; }
          .footer-inner { flex-direction: column; text-align: center; }
          .footer-meta { text-align: center; }
          .stat-divider { display: none; }
          .stat-item { min-width: 80px; padding: 8px 12px 8px 0; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="container">
          <div className="nav-inner">
            <a href="/" className="nav-logo">
              Study<em>MD</em>
            </a>
            <a href="/login" className="nav-cta">
              Sign in →
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            {/* Left */}
            <div>
              <div className="hero-eyebrow fade-up fade-up-1">
                <span className="hero-eyebrow-dot" />
                AI-Powered Medical Education
              </div>

              <h1 className="hero-headline fade-up fade-up-2">
                <span className="study">Study</span>
                <em className="md">MD</em>
              </h1>

              <p className="hero-tagline fade-up fade-up-2">
                Your lectures, <em>mastered.</em>
              </p>

              <p className="hero-subtitle fade-up fade-up-3">
                Upload your slides. Get AI-generated flashcards and practice exams.
                Track your progress across every device you own.
              </p>

              <div className="hero-actions fade-up fade-up-4">
                <a href="/login" className="btn-primary">
                  Get Started
                  <span>→</span>
                </a>
                <a href="#demo" className="btn-ghost">
                  Try a demo
                  <span className="btn-ghost-arrow">↓</span>
                </a>
              </div>
            </div>

            {/* Right — dashboard mockup */}
            <div className="hero-right fade-up fade-up-5">
              <DashboardMockup />
            </div>
          </div>

          {/* Stats */}
          <div className="hero-stats">
            <StatsSection />
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="features">
        <div className="container">
          <p className="section-eyebrow">What you get</p>
          <h2 className="section-heading">Everything you need to study smarter</h2>
          <p className="section-sub">
            Built specifically for PA students. Every feature is designed to
            turn lecture slides into exam-ready knowledge.
          </p>

          <div className="features-grid">
            {[
              {
                icon: "🃏",
                title: "Smart Flashcards",
                desc: "3D-flip cards with direct slide references. Mark what you know, focus on what you don't. Prioritizes your weak spots automatically.",
                color: "#5b8dee",
              },
              {
                icon: "📝",
                title: "Practice Exams",
                desc: "MCQ, True/False, Matching, and Fill-in-blank questions. Detailed explanations for every answer, so you understand — not just memorize.",
                color: "#8b5cf6",
              },
              {
                icon: "📊",
                title: "Progress Tracking",
                desc: "Your progress syncs across all devices. Start on your phone, continue on your iPad, finish on your laptop. Pick up exactly where you left off.",
                color: "#10b981",
              },
              {
                icon: "🤖",
                title: "AI-Powered",
                desc: "Upload a lecture PDF or PPTX. Claude AI reads your slides and generates high-yield flashcards and exam questions in minutes.",
                color: "#f0c040",
              },
            ].map((f, i) => (
              <div
                key={i}
                className="feature-card"
                style={{ "--card-color": f.color } as React.CSSProperties}
              >
                <span className="feature-icon">{f.icon}</span>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DEMO ── */}
      <section className="demo-section" id="demo">
        <div className="container">
          <div className="demo-inner">
            <p className="section-eyebrow" style={{ textAlign: "center" }}>
              Interactive demo
            </p>
            <h2
              className="section-heading"
              style={{ textAlign: "center", marginBottom: "8px" }}
            >
              Try it out
            </h2>
            <p
              className="section-sub"
              style={{ textAlign: "center", margin: "0 auto 40px" }}
            >
              Five sample flashcards — no account needed. Tap a card to flip it.
            </p>

            <DemoFlashcard />

            <p className="demo-cta">
              Want the full experience?{" "}
              <a href="/login">
                Sign in <span>→</span>
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="container">
          <div className="footer-inner">
            <a href="/" className="footer-logo">
              Study<em>MD</em>
            </a>
            <div className="footer-meta">
              <div>
                Built with{" "}
                <a
                  href="https://anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Anthropic Claude
                </a>
              </div>
              <div>
                A{" "}
                <a
                  href="https://tutormd.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  TutorMD
                </a>{" "}
                product
              </div>
              <div style={{ marginTop: "4px", color: "var(--text-dim)" }}>
                © 2026 StudyMD. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
