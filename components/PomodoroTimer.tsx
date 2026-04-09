"use client";

import { useState, useRef, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────────────────
type PomoPhase = 'study' | 'short' | 'long';

interface PomoSettings {
  studyMin: number;
  shortMin: number;
  longMin: number;
  blocksPerLong: number;
}

const DEFAULT_SETTINGS: PomoSettings = {
  studyMin: 25,
  shortMin: 5,
  longMin: 15,
  blocksPerLong: 4,
};

function phaseSeconds(phase: PomoPhase, s: PomoSettings): number {
  if (phase === 'study') return s.studyMin * 60;
  if (phase === 'short') return s.shortMin * 60;
  return s.longMin * 60;
}

function fmt(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── PomodoroTimer ──────────────────────────────────────────────────────────────────
// Self-contained pill + dropdown. Used by Header.tsx.
export default function PomodoroTimer() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<PomoPhase>('study');
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_SETTINGS.studyMin * 60);
  const [running, setRunning] = useState(false);
  const [blocksDone, setBlocksDone] = useState(0);
  const [settings, setSettings] = useState<PomoSettings>(DEFAULT_SETTINGS);

  // ── Timer tick ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 0) return prev - 1;

        // Phase transition
        setBlocksDone((bd) => {
          const newBd = phase === 'study' ? bd + 1 : bd;
          const isLong = phase === 'study' && newBd % settings.blocksPerLong === 0;
          const nextPhase: PomoPhase = phase === 'study' ? (isLong ? 'long' : 'short') : 'study';

          if (notifGranted && typeof Notification !== 'undefined') {
            new Notification('StudyMD', {
              body: nextPhase === 'study'
                ? 'Break over — time to study! 📚'
                : isLong ? 'Nice work! Take a long break. ☕' : 'Study block done — short break! 🎉',
              icon: '/favicon.png',
            });
          }

          setPhase(nextPhase);
          setSecondsLeft(phaseSeconds(nextPhase, settings));
          setRunning(false);
          return newBd;
        });
        return 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, phase, settings, notifGranted]);

  // ── Close panel on outside click ────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  function toggle() { setRunning((r) => !r); }

  function reset() {
    setRunning(false);
    setSecondsLeft(phaseSeconds(phase, settings));
  }

  function skip() {
    const newBd = phase === 'study' ? blocksDone + 1 : blocksDone;
    const isLong = phase === 'study' && newBd % settings.blocksPerLong === 0;
    const nextPhase: PomoPhase = phase === 'study' ? (isLong ? 'long' : 'short') : 'study';
    setPhase(nextPhase);
    setSecondsLeft(phaseSeconds(nextPhase, settings));
    setRunning(false);
    setBlocksDone(newBd);
  }

  function applySetting(key: keyof PomoSettings, val: number) {
    const next = { ...settings, [key]: val };
    setSettings(next);
    setSecondsLeft(phaseSeconds(phase, next));
    setRunning(false);
  }

  async function requestNotif() {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setNotifGranted(result === 'granted');
  }

  // ── Dots ───────────────────────────────────────────────────────────────────
  const totalDots = settings.blocksPerLong;
  const dots = Array.from({ length: totalDots }, (_, i) => ({
    done: i < blocksDone % settings.blocksPerLong,
    active: i === blocksDone % settings.blocksPerLong && phase === 'study',
  }));

  const clockDanger = secondsLeft <= 60 && running;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }} ref={panelRef}>
      {/* Pill */}
      <div
        className="pomo-pill"
        onClick={() => setPanelOpen((o) => !o)}
        role="button"
        aria-label="Pomodoro timer"
      >
        <div className="pomo-pill-dots">
          {dots.map((d, i) => (
            <span key={i} className={`pomo-dot${d.done ? ' done' : d.active ? ' active' : ''}`} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div className={`pomo-pill-clock${clockDanger ? ' danger' : ''}`}>{fmt(secondsLeft)}</div>
          <div className={`pomo-pill-phase ${phase === 'study' ? 'study-phase' : phase === 'short' ? 'break-phase' : 'long-phase'}`}>
            {phase === 'study' ? 'Study Block' : phase === 'short' ? 'Short Break' : 'Long Break'}
          </div>
        </div>
        <div
          className="pomo-pill-toggle"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          role="button"
          aria-label={running ? 'Pause' : 'Start'}
        >
          {running ? '⏸' : '▶'}
        </div>
      </div>

      {/* Dropdown panel */}
      <div className={`pomo-panel${panelOpen ? ' open' : ''}`}>
        <div className={`pomo-panel-clock${clockDanger ? ' danger' : ''}`}>{fmt(secondsLeft)}</div>

        <div className="pomo-panel-blocks">
          {dots.map((d, i) => (
            <span
              key={i}
              className={`pomo-panel-block${d.done ? ' done' : d.active ? ' current' : ''}`}
            />
          ))}
        </div>

        <div className="pomo-panel-controls">
          <button className="btn btn-primary" onClick={toggle} style={{ minWidth: 90, padding: '9px 16px' }}>
            {running ? '⏸ Pause' : '▶ Start'}
          </button>
          <button className="btn btn-ghost" onClick={reset} style={{ padding: '9px 14px' }}>↺</button>
          <button className="btn btn-ghost" onClick={skip}  style={{ padding: '9px 14px' }}>⏭</button>
        </div>

        <button
          className={`pomo-notif-btn${notifGranted ? ' granted' : ''}`}
          onClick={requestNotif}
        >
          {notifGranted ? '🔔 Notifications on' : '🔔 Enable notifications'}
        </button>

        <div className="pomo-settings">
          {([
            { label: 'Study (min)', key: 'studyMin' as const, min: 1, max: 90 },
            { label: 'Short Break', key: 'shortMin' as const, min: 1, max: 30 },
            { label: 'Long Break',  key: 'longMin'  as const, min: 5, max: 60 },
            { label: 'Blocks/Long', key: 'blocksPerLong' as const, min: 2, max: 8 },
          ]).map(({ label, key, min, max }) => (
            <div key={key} className="pomo-field">
              <label>{label}</label>
              <input
                type="number"
                value={settings[key]}
                min={min}
                max={max}
                onChange={(e) => applySetting(key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
