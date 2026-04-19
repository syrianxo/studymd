"use client";

// components/PomodoroTimer.tsx
// v2 Pomodoro — restored to v1 behavior:
//   • Pill lives in the hero area (rendered by Dashboard.tsx)
//   • Click pill → panel expands INLINE below (pushes content down)
//   • Header mini-pill appears whenever timer is running (via context)
//   • State persists in localStorage across page navigation

import { useState, useRef, useEffect, useContext, createContext, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────
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

const DEFAULT_STATE: PomoState = {
  phase: 'study',
  secondsLeft: DEFAULT_SETTINGS.studyMin * 60,
  running: false,
  blocksDone: 0,
  settings: DEFAULT_SETTINGS,
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

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.7);
  } catch { /* ignore */ }
}

// ── Context ───────────────────────────────────────────────────────────────────
export interface PomoContextValue {
  state: PomoState;
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  toggle: () => void;
  reset: () => void;
  skip: () => void;
  applySetting: (key: keyof PomoSettings, val: number) => void;
  requestNotif: () => Promise<void>;
  notifGranted: boolean;
}

export const PomoContext = createContext<PomoContextValue | null>(null);
export function usePomo() { return useContext(PomoContext); }

// ── Provider ──────────────────────────────────────────────────────────────────
export function PomoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PomoState>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('studymd_pomo');
        if (raw) { const saved = JSON.parse(raw) as PomoState; return { ...saved, running: false }; }
      } catch { /* ignore */ }
    }
    return DEFAULT_STATE;
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try { localStorage.setItem('studymd_pomo', JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  useEffect(() => {
    if (!state.running) { if (intervalRef.current) clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setState(prev => {
        if (!prev.running) return prev;
        if (prev.secondsLeft > 1) return { ...prev, secondsLeft: prev.secondsLeft - 1 };
        if (intervalRef.current) clearInterval(intervalRef.current);
        playChime();
        const newBd = prev.phase === 'study' ? prev.blocksDone + 1 : prev.blocksDone;
        const isLong = prev.phase === 'study' && newBd % prev.settings.blocksPerLong === 0;
        const nextPhase: PomoPhase = prev.phase === 'study' ? (isLong ? 'long' : 'short') : 'study';
        if (notifGranted && typeof Notification !== 'undefined') {
          new Notification('StudyMD', {
            body: nextPhase === 'study' ? 'Break over — time to study! 📚'
              : isLong ? 'Nice work! Take a long break. ☕' : 'Study block done — short break! 🎉',
            icon: '/favicon.png',
          });
        }
        return { ...prev, running: false, phase: nextPhase,
          secondsLeft: phaseSeconds(nextPhase, prev.settings), blocksDone: newBd };
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.running, notifGranted]);

  const toggle = useCallback(() => setState(p => ({ ...p, running: !p.running })), []);
  const reset  = useCallback(() => setState(p => ({ ...p, running: false, secondsLeft: phaseSeconds(p.phase, p.settings) })), []);
  const skip   = useCallback(() => setState(p => {
    const newBd = p.phase === 'study' ? p.blocksDone + 1 : p.blocksDone;
    const isLong = p.phase === 'study' && newBd % p.settings.blocksPerLong === 0;
    const nextPhase: PomoPhase = p.phase === 'study' ? (isLong ? 'long' : 'short') : 'study';
    return { ...p, running: false, phase: nextPhase, secondsLeft: phaseSeconds(nextPhase, p.settings), blocksDone: newBd };
  }), []);
  const applySetting = useCallback((key: keyof PomoSettings, val: number) => setState(p => {
    const next = { ...p.settings, [key]: val };
    return { ...p, settings: next, secondsLeft: phaseSeconds(p.phase, next), running: false };
  }), []);
  const requestNotif = useCallback(async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setNotifGranted(result === 'granted');
  }, []);

  return (
    <PomoContext.Provider value={{ state, panelOpen, setPanelOpen, toggle, reset, skip, applySetting, requestNotif, notifGranted }}>
      {children}
    </PomoContext.Provider>
  );
}

// ── PomodoroMiniPill — shown in Header when timer is running ──────────────────
export function PomodoroMiniPill() {
  const pomo = usePomo();
  if (!pomo || !pomo.state.running) return null;
  const { state, toggle, setPanelOpen, panelOpen } = pomo;
  const clockDanger = state.secondsLeft <= 60;
  const dots = Array.from({ length: state.settings.blocksPerLong }, (_, i) => ({
    done: i < state.blocksDone % state.settings.blocksPerLong,
    active: i === state.blocksDone % state.settings.blocksPerLong && state.phase === 'study',
  }));
  return (
    <>
      <style>{miniPillCss}</style>
      <div className="pomo-mini-pill" onClick={() => setPanelOpen(!panelOpen)}
        role="button" aria-label="Pomodoro timer running">
        <div className="pomo-mini-dots">
          {dots.map((d, i) => <span key={i} className={`pomo-mini-dot${d.done ? ' done' : d.active ? ' active' : ''}`} />)}
        </div>
        <span className={`pomo-mini-clock${clockDanger ? ' danger' : ''}`}>{fmt(state.secondsLeft)}</span>
        <button className="pomo-mini-toggle" onClick={e => { e.stopPropagation(); toggle(); }} aria-label="Pause">⏸</button>
      </div>
    </>
  );
}

// ── PomodoroTimer — pill + inline panel for hero area ─────────────────────────
export default function PomodoroTimer() {
  const pomo = usePomo();
  if (!pomo) return null;
  const { state, panelOpen, setPanelOpen, toggle, reset, skip, applySetting, requestNotif, notifGranted } = pomo;
  const { phase, secondsLeft, running, blocksDone, settings } = state;
  const clockDanger = secondsLeft <= 60 && running;
  const dots = Array.from({ length: settings.blocksPerLong }, (_, i) => ({
    done: i < blocksDone % settings.blocksPerLong,
    active: i === blocksDone % settings.blocksPerLong && phase === 'study',
  }));

  return (
    <>
      <style>{pomoCss}</style>
      <div className="pomo-container">
        {/* Compact pill */}
        <div className={`pomo-pill${panelOpen ? ' open' : ''}`} onClick={() => setPanelOpen(!panelOpen)}
          role="button" aria-label="Pomodoro timer" aria-expanded={panelOpen}>
          <div className="pomo-pill-dots">
            {dots.map((d, i) => <span key={i} className={`pomo-pill-dot${d.done ? ' done' : d.active ? ' active' : ''}`} />)}
          </div>
          <div className="pomo-pill-text">
            <div className={`pomo-pill-clock${clockDanger ? ' danger' : ''}`}>{fmt(secondsLeft)}</div>
            <div className={`pomo-pill-phase ${phase === 'study' ? 'study-phase' : phase === 'short' ? 'break-phase' : 'long-phase'}`}>
              {phase === 'study' ? 'Study Block' : phase === 'short' ? 'Short Break' : 'Long Break'}
            </div>
          </div>
          <div className="pomo-pill-toggle" onClick={e => { e.stopPropagation(); toggle(); }} role="button" aria-label={running ? 'Pause' : 'Start'}>
            {running ? '⏸' : '▶'}
          </div>
        </div>

        {/* Inline expanded panel — pushes content down */}
        <div className={`pomo-panel${panelOpen ? ' open' : ''}`}>
          <div className="pomo-panel-inner">
            {/* Left: clock + controls */}
            <div className="pomo-panel-left">
              <div className={`pomo-panel-clock${clockDanger ? ' danger' : ''}`}>{fmt(secondsLeft)}</div>
              <div className="pomo-panel-phase-label">
                {phase === 'study' ? '📚 Study Block' : phase === 'short' ? '☕ Short Break' : '🛋 Long Break'}
              </div>
              <div className="pomo-panel-blocks">
                {dots.map((d, i) => <span key={i} className={`pomo-panel-block${d.done ? ' done' : d.active ? ' current' : ''}`} />)}
              </div>
              <div className="pomo-panel-controls">
                <button className="btn btn-primary pomo-ctrl-btn" onClick={toggle}>{running ? '⏸ Pause' : '▶ Start'}</button>
                <button className="btn btn-ghost pomo-ctrl-btn" onClick={reset} aria-label="Reset">↺</button>
                <button className="btn btn-ghost pomo-ctrl-btn" onClick={skip} aria-label="Skip">⏭</button>
              </div>
              <button className={`pomo-notif-btn${notifGranted ? ' granted' : ''}`} onClick={requestNotif}>
                {notifGranted ? '🔔 Notifications on' : '🔔 Enable notifications'}
              </button>
            </div>
            {/* Right: settings */}
            <div className="pomo-panel-right">
              <div className="pomo-settings-label">Settings</div>
              <div className="pomo-settings">
                {([
                  { label: 'Study (min)', key: 'studyMin' as const, min: 1, max: 90 },
                  { label: 'Short Break', key: 'shortMin' as const, min: 1, max: 30 },
                  { label: 'Long Break',  key: 'longMin'  as const, min: 5, max: 60 },
                  { label: 'Blocks/Long', key: 'blocksPerLong' as const, min: 2, max: 8 },
                ]).map(({ label, key, min, max }) => (
                  <div key={key} className="pomo-field">
                    <label>{label}</label>
                    <input type="number" value={settings[key]} min={min} max={max}
                      onChange={e => applySetting(key, Number(e.target.value))} onClick={e => e.stopPropagation()} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── CSS ──────────────────────────────────────────────────────────────────────────────────
const miniPillCss = `
.pomo-mini-pill {
  display:flex;align-items:center;gap:6px;
  background:var(--surface);border:1px solid var(--border-bright);
  border-radius:50px;padding:5px 10px 5px 8px;
  cursor:pointer;user-select:none;transition:border-color 0.18s;
  animation:pomo-mini-in 0.2s ease;
}
@keyframes pomo-mini-in{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
.pomo-mini-pill:hover{border-color:var(--accent);}
.pomo-mini-dots{display:flex;gap:3px;align-items:center;}
.pomo-mini-dot{width:5px;height:5px;border-radius:50%;background:var(--surface2);border:1px solid var(--border-bright);flex-shrink:0;}
.pomo-mini-dot.done{background:var(--accent);border-color:var(--accent);}
.pomo-mini-dot.active{background:var(--warning);border-color:var(--warning);}
.pomo-mini-clock{font-family:'DM Mono',monospace;font-size:13px;font-weight:500;color:var(--text);letter-spacing:1px;min-width:38px;}
.pomo-mini-clock.danger{color:var(--danger);animation:pomo-danger-pulse 1s ease infinite;}
@keyframes pomo-danger-pulse{0%,100%{opacity:1}50%{opacity:0.5}}
.pomo-mini-toggle{
  width:22px;height:22px;border-radius:50%;
  background:color-mix(in srgb, var(--accent) 18%, transparent);
  border:1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  color:var(--accent);font-size:10px;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;cursor:pointer;transition:background 0.15s;
}
.pomo-mini-toggle:hover{background:color-mix(in srgb, var(--accent) 32%, transparent);}
`;

const pomoCss = `
.pomo-container{width:100%;}

/* Pill stretches to fill .smd-hero-pomodoro column */
.pomo-pill{
  display:flex;align-items:center;gap:10px;
  width:100%;
  background:var(--surface);border:1px solid var(--border);
  border-radius:50px;padding:6px 14px 6px 10px;
  cursor:pointer;user-select:none;
  transition:border-color 0.18s,border-radius 0.25s;
  touch-action:manipulation;
  box-sizing:border-box;
}
.pomo-pill:hover{border-color:var(--border-bright);}
.pomo-pill.open{border-radius:14px 14px 0 0;border-color:var(--border-bright);border-bottom-color:transparent;}

.pomo-pill-dots{display:flex;gap:3px;align-items:center;}
.pomo-pill-dot{width:6px;height:6px;border-radius:50%;background:var(--surface2);border:1px solid var(--border-bright);transition:all .3s;flex-shrink:0;}
.pomo-pill-dot.done{background:var(--accent);border-color:var(--accent);}
.pomo-pill-dot.active{background:var(--warning);border-color:var(--warning);box-shadow:0 0 6px var(--warning);}

.pomo-pill-text{display:flex;flex-direction:column;gap:1px;}
.pomo-pill-clock{font-family:'DM Mono',monospace;font-size:15px;font-weight:500;color:var(--text);letter-spacing:1px;min-width:42px;}
.pomo-pill-clock.danger{color:var(--danger);animation:pomo-danger-pulse 1s ease infinite;}

.pomo-pill-phase{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}
.pomo-pill-phase.study-phase{color:var(--accent);}
.pomo-pill-phase.break-phase{color:var(--success);}
.pomo-pill-phase.long-phase{color:var(--warning);}

.pomo-pill-toggle{
  width:24px;height:24px;border-radius:50%;flex-shrink:0;
  background:color-mix(in srgb, var(--accent) 14%, transparent);
  border:1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  color:var(--accent);font-size:10px;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:background 0.15s;
  margin-left:auto;
}
.pomo-pill-toggle:hover{background:color-mix(in srgb, var(--accent) 28%, transparent);}

.pomo-panel{
  max-height:0;overflow:hidden;
  background:var(--surface);
  border:0px solid var(--border-bright);border-top:none;
  border-radius:0 0 14px 14px;
  transition:max-height 0.35s cubic-bezier(0.4,0,0.2,1),padding 0.25s,border-width 0.05s 0.3s;
  padding:0 18px;
}
.pomo-panel.open{
  max-height:400px;padding:16px 18px 18px;
  border-width:1px;
  transition:max-height 0.35s cubic-bezier(0.4,0,0.2,1),padding 0.25s,border-width 0s;
}

/* Two-column layout: left = clock/controls, right = settings */
.pomo-panel-inner{display:flex;gap:16px;align-items:flex-start;}
.pomo-panel-left{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;}
.pomo-panel-right{flex-shrink:0;width:150px;display:flex;flex-direction:column;}

.pomo-panel-clock{
  font-family:'DM Mono',monospace;font-size:38px;font-weight:500;
  text-align:center;letter-spacing:2px;margin-bottom:3px;line-height:1;color:var(--text);
}
.pomo-panel-clock.danger{color:var(--danger);}

.pomo-panel-phase-label{
  text-align:center;font-family:'Outfit',sans-serif;
  font-size:12px;color:var(--text-muted);margin-bottom:10px;
}

.pomo-panel-blocks{display:flex;justify-content:center;gap:6px;margin-bottom:12px;}
.pomo-panel-block{width:9px;height:9px;border-radius:50%;background:var(--surface2);border:1px solid var(--border-bright);transition:all .3s;}
.pomo-panel-block.done{background:var(--accent);border-color:var(--accent);}
.pomo-panel-block.current{background:var(--warning);border-color:var(--warning);box-shadow:0 0 6px var(--warning);}

.pomo-panel-controls{display:flex;gap:6px;justify-content:center;margin-bottom:10px;}
.pomo-ctrl-btn{min-width:72px !important;padding:8px 12px !important;font-size:12px !important;}

.pomo-notif-btn{
  padding:6px 10px;width:100%;
  background:var(--surface2);border:1px solid var(--border);border-radius:8px;
  color:var(--text-muted);font-family:'Outfit',sans-serif;
  font-size:11px;cursor:pointer;transition:all 0.15s;
}
.pomo-notif-btn:hover{border-color:var(--border-bright);color:var(--text);}
.pomo-notif-btn.granted{color:var(--success);border-color:rgba(16,185,129,0.35);background:rgba(16,185,129,0.07);}

.pomo-settings-label{
  font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
  color:var(--text-muted);margin-bottom:8px;
}
.pomo-settings{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.pomo-field{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 8px;}
.pomo-field label{font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);font-weight:700;display:block;margin-bottom:3px;}
.pomo-field input{width:100%;background:transparent;border:none;outline:none;font-family:'DM Mono',monospace;font-size:15px;font-weight:500;color:var(--accent);text-align:center;padding:0;}
`;
