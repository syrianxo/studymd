// components/Header.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import type { GlobalStats } from '@/hooks/useProgress';

// ── Pomodoro state type ──────────────────────────────────────────────────────
type PomoPhase = 'study' | 'short' | 'long';

interface PomoSettings {
  studyMin: number;
  shortMin: number;
  longMin: number;
  blocksPerLong: number;
}

interface PomoState {
  phase: PomoPhase;
  secondsLeft: number;
  running: boolean;
  blocksDone: number;
  settings: PomoSettings;
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

// ── Component ────────────────────────────────────────────────────────────────
interface HeaderProps {
  globalStats: GlobalStats;
  lectureCount: number;
}

export default function Header({ globalStats, lectureCount }: HeaderProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [pomo, setPomo] = useState<PomoState>(() => ({
    phase: 'study',
    secondsLeft: DEFAULT_SETTINGS.studyMin * 60,
    running: false,
    blocksDone: 0,
    settings: DEFAULT_SETTINGS,
  }));

  // ── Timer tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pomo.running) return;

    const id = setInterval(() => {
      setPomo((p) => {
        if (p.secondsLeft > 0) {
          return { ...p, secondsLeft: p.secondsLeft - 1 };
        }

        // Phase transition
        const newBlocksDone =
          p.phase === 'study' ? p.blocksDone + 1 : p.blocksDone;
        const isLong =
          p.phase === 'study' && newBlocksDone % p.settings.blocksPerLong === 0;
        const nextPhase: PomoPhase =
          p.phase === 'study' ? (isLong ? 'long' : 'short') : 'study';

        if (notifGranted && typeof Notification !== 'undefined') {
          new Notification('StudyMD', {
            body:
              nextPhase === 'study'
                ? 'Break over — time to study! 📚'
                : isLong
                ? 'Nice work! Take a long break. ☕'
                : 'Study block done — short break! 🎉',
            icon: '/favicon.png',
          });
        }

        return {
          ...p,
          phase: nextPhase,
          secondsLeft: phaseSeconds(nextPhase, p.settings),
          blocksDone: newBlocksDone,
          running: false, // pause between phases
        };
      });
    }, 1000);

    return () => clearInterval(id);
  }, [pomo.running, notifGranted]);

  // ── Close panel on outside click ──────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────
  function toggle() {
    setPomo((p) => ({ ...p, running: !p.running }));
  }

  function reset() {
    setPomo((p) => ({
      ...p,
      running: false,
      secondsLeft: phaseSeconds(p.phase, p.settings),
    }));
  }

  function skip() {
    setPomo((p) => {
      const newBlocksDone = p.phase === 'study' ? p.blocksDone + 1 : p.blocksDone;
      const isLong =
        p.phase === 'study' && newBlocksDone % p.settings.blocksPerLong === 0;
      const nextPhase: PomoPhase =
        p.phase === 'study' ? (isLong ? 'long' : 'short') : 'study';
      return {
        ...p,
        phase: nextPhase,
        secondsLeft: phaseSeconds(nextPhase, p.settings),
        running: false,
        blocksDone: newBlocksDone,
      };
    });
  }

  function applySetting(key: keyof PomoSettings, val: number) {
    setPomo((p) => {
      const newSettings = { ...p.settings, [key]: val };
      return {
        ...p,
        settings: newSettings,
        secondsLeft: phaseSeconds(p.phase, newSettings),
        running: false,
      };
    });
  }

  async function requestNotif() {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setNotifGranted(result === 'granted');
  }

  // ── Dots ──────────────────────────────────────────────────────────────
  const totalDots = pomo.settings.blocksPerLong;
  const dots = Array.from({ length: totalDots }, (_, i) => {
    const done = i < pomo.blocksDone % pomo.settings.blocksPerLong;
    const active = !done && i === pomo.blocksDone % pomo.settings.blocksPerLong;
    return { done, active };
  });

  // ── Stats pill text ────────────────────────────────────────────────────
  const completedSessions = globalStats.totalSessions;
  const pillText =
    lectureCount > 0
      ? `${lectureCount} lecture${lectureCount !== 1 ? 's' : ''} · ${completedSessions} session${completedSessions !== 1 ? 's' : ''}`
      : 'Loading…';

  return (
    <header className="smd-header">
      {/* Left: logo */}
      <div>
        <div className="smd-logo">
          <span className="smd-logo-study">Study</span>
          <span className="smd-logo-md">MD</span>
        </div>
        <div className="smd-header-subtitle">Lecture Mastery Platform</div>
      </div>

      {/* Right: progress pill + pomodoro */}
      <div className="smd-header-right">
        <div className="smd-progress-pill">
          <span className="dot" />
          <span>{pillText}</span>
        </div>

        {/* Pomodoro */}
        <div style={{ position: 'relative', flexShrink: 0 }} ref={panelRef}>
          {/* Pill trigger */}
          <div
            className="pomo-pill"
            onClick={() => setPanelOpen((o) => !o)}
            role="button"
            aria-label="Pomodoro timer"
          >
            <div className="pomo-pill-dots">
              {dots.map((d, i) => (
                <span
                  key={i}
                  className={`pomo-dot${d.done ? ' done' : d.active ? ' active' : ''}`}
                />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div className="pomo-pill-clock">{fmt(pomo.secondsLeft)}</div>
              <div
                className={`pomo-pill-phase ${pomo.phase === 'study' ? 'study-phase' : 'break-phase'}`}
              >
                {pomo.phase === 'study'
                  ? 'Study Block'
                  : pomo.phase === 'short'
                  ? 'Short Break'
                  : 'Long Break'}
              </div>
            </div>
            <div
              className="pomo-pill-toggle"
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
              role="button"
              aria-label={pomo.running ? 'Pause' : 'Start'}
            >
              {pomo.running ? '⏸' : '▶'}
            </div>
          </div>

          {/* Dropdown panel */}
          <div className={`pomo-panel${panelOpen ? ' open' : ''}`}>
            <div className="pomo-panel-clock">{fmt(pomo.secondsLeft)}</div>

            <div className="pomo-panel-blocks">
              {dots.map((d, i) => (
                <span
                  key={i}
                  className={`pomo-dot${d.done ? ' done' : d.active ? ' active' : ''}`}
                  style={{ width: 10, height: 10 }}
                />
              ))}
            </div>

            <div className="pomo-panel-controls">
              <button
                className="btn btn-primary"
                onClick={toggle}
                style={{ minWidth: 90, padding: '9px 16px' }}
              >
                {pomo.running ? '⏸ Pause' : '▶ Start'}
              </button>
              <button className="btn btn-ghost" onClick={reset} style={{ padding: '9px 14px' }}>
                ↺
              </button>
              <button className="btn btn-ghost" onClick={skip} style={{ padding: '9px 14px' }}>
                ⏭
              </button>
            </div>

            <button
              className={`pomo-notif-btn${notifGranted ? ' granted' : ''}`}
              onClick={requestNotif}
            >
              {notifGranted ? '🔔 Notifications on' : '🔔 Enable notifications'}
            </button>

            <div className="pomo-settings">
              {(
                [
                  { label: 'Study (min)', key: 'studyMin' as const },
                  { label: 'Short Break', key: 'shortMin' as const },
                  { label: 'Long Break', key: 'longMin' as const },
                  { label: 'Blocks/Long', key: 'blocksPerLong' as const },
                ] as const
              ).map(({ label, key }) => (
                <div key={key} className="pomo-field">
                  <label>{label}</label>
                  <input
                    type="number"
                    value={pomo.settings[key]}
                    min={1}
                    max={key === 'studyMin' ? 90 : key === 'longMin' ? 60 : key === 'blocksPerLong' ? 8 : 30}
                    onChange={(e) => applySetting(key, Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
