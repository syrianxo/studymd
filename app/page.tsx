"use client";

import { useState, useEffect, useRef } from "react";

// ─── Demo flashcard data (medical/anatomy) ────────────────────────────────────
const DEMO_CARDS = [
  {
    id: 1,
    front: "What is the largest organ in the human body?",
    back: "The skin (integumentary system). It covers the entire external surface of the body, averaging 1.5–2 m² in adults.",
  },
  {
    id: 2,
    front: "What does BMI stand for?",
    back: "Body Mass Index — calculated as weight (kg) ÷ height (m)². A value of 18.5–24.9 is considered normal range.",
  },
  {
    id: 3,
    front: "Normal resting heart rate for adults?",
    back: "60–100 beats per minute. Athletes may have resting rates as low as 40 bpm. Above 100 bpm at rest is tachycardia.",
  },
  {
    id: 4,
    front: "What is the function of red blood cells?",
    back: "Transport oxygen from the lungs to tissues via hemoglobin, and carry CO₂ back to the lungs for exhalation.",
  },
  {
    id: 5,
    front: "Name the four chambers of the heart.",
    back: "Right atrium, right ventricle, left atrium, left ventricle. The right side pumps to the lungs; the left side pumps to the body.",
  },
];

// ─── FlashCard Component ──────────────────────────────────────────────────────
function DemoFlashcard() {
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);
  const [animating, setAnimating] = useState(false);
  const [statuses, setStatuses] = useState<Record<number, "got" | "learning" | null>>(
    () => Object.fromEntries(DEMO_CARDS.map((c) => [c.id, null]))
  );

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

  const markCard = (status: "got" | "learning") => {
    setStatuses((prev) => ({ ...prev, [DEMO_CARDS[current].id]: status }));
    setTimeout(() => navigate("next"), 350);
  };

  const card = DEMO_CARDS[current];
  const gotCount = Object.values(statuses).filter((v) => v === "got").length;

  return (
    <div className="demo-wrapper">
      {/* Progress dots */}
      <div className="demo-counter">
        {DEMO_CARDS.map((c, i) => (
          <span
            key={i}
            className={`demo-dot ${i === current ? "active" : ""} ${
              statuses[c.id] === "got" ? "dot-got" : statuses[c.id] === "learning" ? "dot-learning" : ""
            }`}
          />
        ))}
      </div>

      {/* Card */}
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

      {/* Answer buttons (visible after flip) */}
      {flipped && (
        <div className="demo-verdict">
          <button
            className="verdict-btn verdict-got"
            onClick={() => markCard("got")}
            aria-label="Got it"
          >
            Got it ✓
          </button>
          <button
            className="verdict-btn verdict-learning"
            onClick={() => markCard("learning")}
            aria-label="Still learning"
          >
            Still learning ✗
          </button>
        </div>
      )}

      {/* Nav */}
      <div className="demo-nav">
        <button className="nav-btn" onClick={() => navigate("prev")} aria-label="Previous card">←</button>
        <span className="nav-count">{current + 1} / {DEMO_CARDS.length}</span>
        <button className="nav-btn" onClick={() => navigate("next")} aria-label="Next card">→</button>
      </div>

      {/* Mini score */}
      {gotCount > 0 && (
        <p className="demo-score">{gotCount} of {DEMO_CARDS.length} marked as known</p>
      )}
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
        <div className="mk-header">
          <div className="mk-logo-strip">
            <span className="mk-logo-text">Study<em>MD</em></span>
          </div>
          <div className="mk-header-right">
            <div className="mk-pill" />
            <div className="mk-pill short" />
          </div>
        </div>
        <div className="mk-filters">
          {["All", "Biology", "Anatomy", "Chemistry"].map((label, i) => (
            <div key={i} className={`mk-filter-pill ${i === 0 ? "active" : ""}`}>{label}</div>
          ))}
        </div>
        <div className="mk-grid">
          {[
            { color: "#5b8dee", title: "Cardiac Anatomy", sub: "Anatomy", prog: 78 },
            { color: "#8b5cf6", title: "Cell Biology", sub: "Biology", prog: 45 },
            { color: "#10b981", title: "Organic Chemistry", sub: "Chemistry", prog: 92 },
            { color: "#f0c040", title: "Lab Diagnostics", sub: "Biology", prog: 30 },
            { color: "#ef4444", title: "Neuroanatomy", sub: "Anatomy", prog: 15 },
            { color: "#06b6d4", title: "Renal System", sub: "Anatomy", prog: 60 },
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
                <div className="mk-progress-fill" style={{ width: `${card.prog}%`, background: card.color }} />
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on resize
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
          z-index: 200;
          padding: 16px 0;
          transition: background 0.3s, backdrop-filter 0.3s, border-color 0.3s;
        }
        .nav.scrolled {
          background: rgba(13, 15, 20, 0.88);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border-bottom: 1px solid var(--border);
        }
        .nav-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
        .nav-logo {
          font-family: var(--font-display);
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--text);
          text-decoration: none;
          letter-spacing: -0.02em;
          flex-shrink: 0;
        }
        .nav-logo em { font-style: italic; color: var(--accent); }

        /* Desktop links */
        .nav-links {
          display: flex;
          align-items: center;
          gap: 8px;
          list-style: none;
        }
        .nav-links a {
          color: var(--text-muted);
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 500;
          padding: 8px 12px;
          border-radius: 8px;
          transition: color 0.2s, background 0.2s;
          min-height: 44px;
          display: flex;
          align-items: center;
        }
        .nav-links a:hover { color: var(--text); background: var(--surface2); }

        .nav-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .nav-signin {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 18px;
          border: 1px solid var(--border-strong);
          color: var(--text-muted);
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s;
          min-height: 44px;
        }
        .nav-signin:hover { color: var(--text); border-color: var(--accent); }

        .nav-cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 20px;
          background: var(--accent);
          color: #fff;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
          min-height: 44px;
          box-shadow: 0 2px 12px #5b8dee33;
        }
        .nav-cta:hover {
          background: color-mix(in srgb, var(--accent) 80%, black);
          transform: translateY(-1px);
          box-shadow: 0 4px 20px #5b8dee44;
        }

        /* Hamburger button */
        .nav-hamburger {
          display: none;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 5px;
          width: 44px;
          height: 44px;
          background: transparent;
          border: 1px solid var(--border-strong);
          border-radius: 8px;
          cursor: pointer;
          padding: 0;
          flex-shrink: 0;
        }
        .nav-hamburger span {
          display: block;
          width: 18px;
          height: 2px;
          background: var(--text-muted);
          border-radius: 2px;
          transition: all 0.25s;
        }
        .nav-hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
        .nav-hamburger.open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
        .nav-hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

        /* Mobile menu dropdown */
        .nav-mobile-menu {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: rgba(13, 15, 20, 0.97);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border);
          padding: 16px 24px 24px;
          flex-direction: column;
          gap: 4px;
        }
        .nav-mobile-menu.open { display: flex; }
        .nav-mobile-menu a {
          color: var(--text-muted);
          text-decoration: none;
          font-size: 1rem;
          font-weight: 500;
          padding: 12px 8px;
          border-bottom: 1px solid var(--border);
          transition: color 0.2s;
          min-height: 44px;
          display: flex;
          align-items: center;
        }
        .nav-mobile-menu a:hover { color: var(--text); }
        .nav-mobile-menu a:last-child { border-bottom: none; }
        .nav-mobile-cta {
          margin-top: 12px;
          padding: 14px !important;
          background: var(--accent) !important;
          color: #fff !important;
          border-radius: var(--radius) !important;
          justify-content: center;
          font-weight: 600 !important;
          border-bottom: none !important;
        }

        @media (max-width: 767px) {
          .nav-links { display: none; }
          .nav-signin { display: none; }
          .nav-cta { display: none; }
          .nav-hamburger { display: flex; }
          .nav { position: fixed; }
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
        .hero-tagline em { font-style: italic; color: var(--gold); }

        .hero-subtitle {
          font-size: 1.05rem;
          color: var(--text-muted);
          line-height: 1.7;
          max-width: 480px;
          margin-bottom: 16px;
        }

        .hero-origin {
          font-size: 0.875rem;
          color: var(--text-dim);
          font-style: italic;
          margin-bottom: 32px;
          max-width: 440px;
          line-height: 1.6;
          border-left: 2px solid var(--border-strong);
          padding-left: 12px;
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
          min-height: 44px;
        }
        .btn-primary::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #ffffff18, transparent);
          pointer-events: none;
        }
        .btn-primary:hover {
          background: color-mix(in srgb, var(--accent) 80%, black);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px color-mix(in srgb, var(--accent) 27%, transparent);
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
          min-height: 44px;
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
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border);
        }
        .mk-logo-text {
          font-family: var(--font-display);
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text);
        }
        .mk-logo-text em { font-style: italic; color: var(--accent); }

        .mk-header-right { display: flex; gap: 6px; }
        .mk-pill {
          height: 20px; width: 52px;
          background: var(--surface3);
          border-radius: 100px;
        }
        .mk-pill.short { width: 28px; }

        .mk-filters {
          display: flex;
          gap: 6px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .mk-filter-pill {
          padding: 3px 10px;
          border-radius: 100px;
          font-size: 0.65rem;
          font-weight: 500;
          background: var(--surface3);
          color: var(--text-dim);
          border: 1px solid var(--border);
        }
        .mk-filter-pill.active {
          background: color-mix(in srgb, var(--accent) 15%, transparent);
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 30%, transparent);
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
          border-radius: 7px;
          border: 1px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
        }
        .mk-card-dot { width: 8px; height: 8px; border-radius: 50%; }
        .mk-card-title { font-size: 0.7rem; font-weight: 600; color: var(--text); margin-bottom: 1px; }
        .mk-card-sub { font-size: 0.6rem; color: var(--text-muted); margin-bottom: 8px; }
        .mk-progress-bar {
          height: 3px;
          background: var(--surface3);
          border-radius: 100px;
          overflow: hidden;
          margin-bottom: 3px;
        }
        .mk-progress-fill { height: 100%; border-radius: 100px; }
        .mk-card-percent { font-size: 0.6rem; color: var(--text-dim); text-align: right; }
        .mk-card-info { margin-bottom: 0; }

        /* ── Section shared ─────────────────────────────────── */
        section { padding: 100px 0; }

        .section-eyebrow {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 16px;
        }
        .section-heading {
          font-size: clamp(1.8rem, 3vw, 2.8rem);
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.02em;
          margin-bottom: 16px;
        }
        .section-sub {
          font-size: 1.05rem;
          color: var(--text-muted);
          max-width: 560px;
          line-height: 1.7;
          margin-bottom: 56px;
        }

        /* ── Features ───────────────────────────────────────── */
        .features { background: var(--surface); }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 24px;
        }

        .feature-card {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 28px;
          transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
          position: relative;
          overflow: hidden;
        }
        .feature-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: var(--card-color, var(--accent));
          opacity: 0;
          transition: opacity 0.2s;
        }
        .feature-card:hover {
          border-color: color-mix(in srgb, var(--card-color, var(--accent)) 40%, transparent);
          transform: translateY(-4px);
          box-shadow: 0 12px 40px #00000044;
        }
        .feature-card:hover::before { opacity: 1; }

        .feature-icon {
          display: block;
          font-size: 2rem;
          margin-bottom: 16px;
        }
        .feature-title {
          font-family: var(--font-display);
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 10px;
        }
        .feature-desc {
          font-size: 0.9rem;
          color: var(--text-muted);
          line-height: 1.65;
        }

        /* Coming soon badge */
        .feature-badge {
          display: inline-block;
          font-size: 0.65rem;
          font-family: var(--font-mono);
          font-weight: 500;
          color: var(--gold);
          background: color-mix(in srgb, var(--gold) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--gold) 30%, transparent);
          border-radius: 100px;
          padding: 2px 8px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 14px;
        }

        /* ── Demo section ───────────────────────────────────── */
        .demo-section {
          background: var(--bg);
          position: relative;
          overflow: hidden;
        }
        .demo-section::before {
          content: '';
          position: absolute;
          bottom: -100px;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 400px;
          background: radial-gradient(ellipse at center, #5b8dee08 0%, transparent 70%);
          pointer-events: none;
        }

        .demo-inner { max-width: 640px; margin: 0 auto; }

        /* Flashcard */
        .demo-wrapper { width: 100%; }

        .demo-counter {
          display: flex;
          gap: 6px;
          justify-content: center;
          margin-bottom: 20px;
        }
        .demo-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--surface3);
          transition: background 0.2s, transform 0.2s;
        }
        .demo-dot.active { background: var(--accent); transform: scale(1.3); }
        .demo-dot.dot-got { background: var(--success); }
        .demo-dot.dot-learning { background: #ef4444; }

        .flashcard-scene {
          width: 100%;
          min-height: 220px;
          perspective: 1000px;
          cursor: pointer;
          margin-bottom: 20px;
          transition: opacity 0.3s, transform 0.3s;
        }
        .flashcard-scene.exit-next { opacity: 0; transform: translateX(-24px); }
        .flashcard-scene.exit-prev { opacity: 0; transform: translateX(24px); }

        .flashcard-inner {
          position: relative;
          width: 100%;
          min-height: 220px;
          transform-style: preserve-3d;
          transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .flashcard-inner.is-flipped { transform: rotateY(180deg); }

        .flashcard-face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          background: var(--surface);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg);
          padding: 28px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 8px 32px #00000044;
        }
        .flashcard-back { transform: rotateY(180deg); }

        .face-label {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--accent);
          font-weight: 500;
        }
        .answer-label { color: var(--success); }
        .face-text {
          font-size: 1rem;
          color: var(--text);
          line-height: 1.65;
          flex: 1;
        }
        .flip-hint {
          font-size: 0.75rem;
          color: var(--text-dim);
          margin-top: auto;
          align-self: flex-end;
        }

        /* Verdict buttons */
        .demo-verdict {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          justify-content: center;
          animation: fadeUp 0.25s ease both;
        }
        .verdict-btn {
          flex: 1;
          max-width: 200px;
          padding: 12px 20px;
          border-radius: var(--radius);
          border: none;
          font-family: var(--font-body);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          min-height: 44px;
        }
        .verdict-got {
          background: color-mix(in srgb, var(--success) 15%, transparent);
          color: var(--success);
          border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
        }
        .verdict-got:hover {
          background: color-mix(in srgb, var(--success) 25%, transparent);
          transform: translateY(-1px);
        }
        .verdict-learning {
          background: color-mix(in srgb, #ef4444 15%, transparent);
          color: #f87171;
          border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
        }
        .verdict-learning:hover {
          background: color-mix(in srgb, #ef4444 25%, transparent);
          transform: translateY(-1px);
        }

        .demo-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
        }
        .nav-btn {
          width: 44px; height: 44px;
          background: var(--surface2);
          border: 1px solid var(--border-strong);
          color: var(--text-muted);
          border-radius: 10px;
          cursor: pointer;
          font-size: 1rem;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .nav-btn:hover { color: var(--text); border-color: var(--accent); background: var(--surface3); }
        .nav-count {
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: var(--text-muted);
          min-width: 48px;
          text-align: center;
        }

        .demo-score {
          text-align: center;
          font-size: 0.8rem;
          color: var(--success);
          margin-top: 12px;
          font-family: var(--font-mono);
        }

        .demo-cta {
          text-align: center;
          margin-top: 40px;
          font-size: 0.95rem;
          color: var(--text-muted);
        }
        .demo-cta a {
          color: var(--accent);
          text-decoration: none;
          font-weight: 600;
          border-bottom: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
          transition: border-color 0.2s;
        }
        .demo-cta a:hover { border-color: var(--accent); }

        /* ── Footer ─────────────────────────────────────────── */
        footer {
          background: var(--surface);
          border-top: 1px solid var(--border);
          padding: 48px 0;
        }
        .footer-inner {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: start;
          gap: 48px;
        }
        .footer-left { display: flex; flex-direction: column; gap: 12px; }
        .footer-logo {
          font-family: var(--font-display);
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--text);
          text-decoration: none;
          letter-spacing: -0.02em;
        }
        .footer-logo em { font-style: italic; color: var(--accent); }
        .footer-haley {
          font-size: 0.8rem;
          color: var(--text-dim);
          font-style: italic;
        }
        .footer-links {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          list-style: none;
          margin-top: 4px;
        }
        .footer-links a {
          font-size: 0.82rem;
          color: var(--text-muted);
          text-decoration: none;
          transition: color 0.2s;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
        }
        .footer-links a:hover { color: var(--text); }

        .footer-right {
          text-align: right;
          font-size: 0.8rem;
          color: var(--text-muted);
          line-height: 2;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .footer-right a {
          color: var(--text-muted);
          text-decoration: none;
          border-bottom: 1px solid var(--border-strong);
          transition: color 0.2s;
        }
        .footer-right a:hover { color: var(--text); }
        .footer-copy {
          margin-top: 6px;
          color: var(--text-dim);
          font-size: 0.75rem;
        }

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
          .footer-inner { grid-template-columns: 1fr; gap: 32px; }
          .footer-right { text-align: left; }
          .stat-divider { display: none; }
          .stat-item { min-width: 80px; padding: 8px 12px 8px 0; }
          .hero-subtitle { font-size: 0.95rem; }
          .flashcard-face { padding: 20px; }
          .face-text { font-size: 0.9rem; }
        }

        @media (max-width: 375px) {
          .container { padding: 0 16px; }
          .hero-headline { font-size: 2.2rem; }
          .verdict-btn { font-size: 0.82rem; padding: 10px 12px; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="container">
          <div className="nav-inner">
            <a href="/" className="nav-logo">Study<em>MD</em></a>

            {/* Desktop links */}
            <ul className="nav-links">
              <li><a href="#features">Features</a></li>
              <li><a href="/pricing">Pricing</a></li>
            </ul>

            {/* Desktop right CTAs */}
            <div className="nav-right">
              <a href="/login" className="nav-signin">Sign In</a>
              <a href="/login" className="nav-cta">Sign Up →</a>
            </div>

            {/* Hamburger (mobile only) */}
            <button
              className={`nav-hamburger ${menuOpen ? "open" : ""}`}
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          {/* Mobile dropdown */}
          <div className={`nav-mobile-menu ${menuOpen ? "open" : ""}`}>
            <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="/pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
            <a href="/login" onClick={() => setMenuOpen(false)}>Sign In</a>
            <a href="/login" className="nav-mobile-cta" onClick={() => setMenuOpen(false)}>Sign Up →</a>
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
                AI-Powered Study Platform
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

              <p className="hero-origin fade-up fade-up-3">
                Originally built to help a PA student master her exams, now available for any curriculum.
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
      <section className="features" id="features">
        <div className="container">
          <p className="section-eyebrow">What you get</p>
          <h2 className="section-heading">Everything you need to study smarter</h2>
          <p className="section-sub">
            Built for students who want to go from slides to mastery — fast.
            Every feature is designed to turn lecture content into exam-ready knowledge.
          </p>

          <div className="features-grid">
            {[
              {
                icon: "🃏",
                title: "Smart Flashcards",
                desc: "3D-flip cards with direct slide references. Mark what you know, focus on what you don't. Prioritizes your weak spots automatically.",
                color: "#5b8dee",
                badge: null,
              },
              {
                icon: "📝",
                title: "Practice Exams",
                desc: "MCQ, True/False, Matching, and Fill-in-blank questions. Detailed explanations for every answer, so you understand — not just memorize.",
                color: "#8b5cf6",
                badge: null,
              },
              {
                icon: "📊",
                title: "Progress Tracking",
                desc: "Your progress syncs across all devices. Start on your phone, continue on your iPad, finish on your laptop. Pick up exactly where you left off.",
                color: "#10b981",
                badge: null,
              },
              {
                icon: "🤖",
                title: "AI-Powered",
                desc: "Upload a lecture PDF or PPTX. Claude AI reads your slides and generates high-yield flashcards and exam questions in minutes.",
                color: "#f0c040",
                badge: null,
              },
              {
                icon: "🔁",
                title: "Spaced Repetition",
                desc: "Anki-style spaced repetition to optimize your long-term retention. Cards resurface at the right interval so you remember what you've learned.",
                color: "#06b6d4",
                badge: "Coming Soon",
              },
            ].map((f, i) => (
              <div
                key={i}
                className="feature-card"
                style={{ "--card-color": f.color } as React.CSSProperties}
              >
                {f.badge && <span className="feature-badge">{f.badge}</span>}
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
              Interactive Preview
            </p>
            <h2 className="section-heading" style={{ textAlign: "center", marginBottom: "8px" }}>
              Try it out
            </h2>

            <DemoFlashcard />

            <p className="demo-cta">
              Ready to study smarter?{" "}
              <a href="/pricing">See Plans &amp; Pricing →</a>
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="container">
          <div className="footer-inner">
            <div className="footer-left">
              <a href="/" className="footer-logo">Study<em>MD</em></a>
              <p className="footer-haley">Designed for Haley Lange</p>
              <ul className="footer-links">
                <li><a href="#features">Features</a></li>
                <li><a href="/pricing">Pricing</a></li>
                <li><a href="/login">Sign In</a></li>
                <li><a href="/privacy">Privacy Policy</a></li>
              </ul>
            </div>

            <div className="footer-right">
              <span>
                Built with{" "}
                <a href="https://anthropic.com" target="_blank" rel="noopener noreferrer">
                  Anthropic Claude
                </a>
              </span>
              <span>
                A{" "}
                <a href="https://tutormd.com" target="_blank" rel="noopener noreferrer">
                  TutorMD
                </a>{" "}
                product
              </span>
              <span className="footer-copy">© 2026 StudyMD. All rights reserved.</span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
