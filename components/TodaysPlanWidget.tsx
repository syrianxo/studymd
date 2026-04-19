'use client';

/**
 * components/TodaysPlanWidget.tsx
 *
 * Shows the active study plan's today schedule on the dashboard.
 * Renders nothing if no active plan, nothing today, or today already done.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { StudyPlan } from '@/types';

interface LectureMeta { title: string; icon: string; color: string; }

interface TodaysPlanWidgetProps {
  onStartLecture?: (internalId: string) => void;
}

function todayISO(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function daysUntil(iso: string): number {
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.ceil((new Date(iso + 'T00:00:00').getTime() - t.getTime()) / 86_400_000);
}

export default function TodaysPlanWidget({ onStartLecture }: TodaysPlanWidgetProps) {
  const [plan, setPlan]             = useState<StudyPlan | null>(null);
  const [lectureMap, setLectureMap] = useState<Map<string, LectureMeta>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState(false);

  const load = useCallback(async () => {
    try {
      const [planRes, lecRes] = await Promise.all([
        fetch('/api/plans'),
        fetch('/api/lectures'),
      ]);
      const { plans }    = await planRes.json();
      const { lectures } = await lecRes.json();

      const active: StudyPlan[] = (plans ?? []).filter((p: StudyPlan) => p.is_active);
      active.sort((a, b) => a.test_date.localeCompare(b.test_date));
      setPlan(active[0] ?? null);

      const map = new Map<string, LectureMeta>();
      for (const l of (lectures ?? [])) {
        map.set(l.internalId, { title: l.title, icon: l.icon, color: l.color });
      }
      setLectureMap(map);
    } catch { /* silently fail — widget is non-critical */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !plan) return null;

  const today          = todayISO();
  const schedule       = plan.schedule as Record<string, string[]>;
  const todaysLectures = schedule[today] ?? [];
  const isCompleted    = plan.completed_days.includes(today);

  if (todaysLectures.length === 0) return null;

  const dLeft      = daysUntil(plan.test_date);
  const firstLecId = todaysLectures[0];
  const doneDays   = plan.completed_days.length;
  const totalDays  = Object.keys(schedule).length;
  const pct        = totalDays > 0 ? Math.round((doneDays / totalDays) * 100) : 0;
  const firstMeta  = lectureMap.get(firstLecId);

  return (
    <>
      <style>{widgetCss}</style>

      {/* ── Compact pill (collapsed) ── */}
      {!expanded && (
        <div
          className={`tpw-pill${isCompleted ? ' tpw-pill--done' : ''}`}
          onClick={() => setExpanded(true)}
          role="button"
          aria-expanded={false}
          aria-label="Expand today's plan"
        >
          <span className="tpw-pill-icon">📅</span>
          <div className="tpw-pill-body">
            <span className="tpw-pill-label">TODAY&apos;S PLAN</span>
            <span className="tpw-pill-name">{plan.name}</span>
          </div>
          {firstMeta && (
            <span className="tpw-pill-lec">
              <span
                className="tpw-pill-lec-icon"
                style={{ background: firstMeta.color + '22', borderColor: firstMeta.color + '55' }}
              >
                {firstMeta.icon}
              </span>
              <span className="tpw-pill-lec-title">{firstMeta.title}</span>
            </span>
          )}
          {dLeft > 0 && (
            <span className="tpw-pill-days">
              <strong>{dLeft}</strong>
              <span>days</span>
            </span>
          )}
          {isCompleted && <span className="tpw-pill-done-badge">✅</span>}
          <span className="tpw-pill-chevron">▾</span>
        </div>
      )}

      {/* ── Expanded card ── */}
      {expanded && (
        <div className={`tpw-card${isCompleted ? ' tpw-card--done' : ''}`}>
          <div className="tpw-header" onClick={() => setExpanded(false)} role="button" aria-label="Collapse plan">
            <div className="tpw-icon-wrap">📅</div>
            <div className="tpw-label-wrap">
              <div className="tpw-label">Today&apos;s Plan</div>
              <div className="tpw-plan-name">{plan.name}</div>
            </div>
            {dLeft > 0 && (
              <div className="tpw-countdown">
                <span className="tpw-countdown-num">{dLeft}</span>
                <span className="tpw-countdown-unit">days to test</span>
              </div>
            )}
            <button
              className="tpw-collapse-btn"
              onClick={() => setExpanded(false)}
              aria-label="Collapse plan"
            >▴</button>
          </div>

          <div className="tpw-lecs">
            {todaysLectures.map((id, i) => {
              const meta = lectureMap.get(id);
              return (
                <div key={id} className="tpw-lec-row">
                  <span className="tpw-lec-num">{i + 1}</span>
                  {meta && (
                    <span
                      className="tpw-lec-icon-pill"
                      style={{ background: meta.color + '22', borderColor: meta.color + '55' }}
                    >
                      {meta.icon}
                    </span>
                  )}
                  <span className="tpw-lec-title">{meta?.title ?? id}</span>
                </div>
              );
            })}
          </div>

          <div className="tpw-progress">
            <div className="tpw-progress-bar">
              <div className="tpw-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="tpw-progress-pct">{pct}%</span>
          </div>

          <div className="tpw-actions" onClick={e => e.stopPropagation()}>
            {isCompleted ? (
              <span className="tpw-done-badge">✅ Today complete — great work!</span>
            ) : (
              <button
                className="btn btn-primary tpw-start-btn"
                onClick={() => onStartLecture?.(firstLecId)}
              >
                ▶ Start Today&apos;s Review
              </button>
            )}
            <Link href="/app/plans" className="tpw-view-link">View full plan →</Link>
          </div>
        </div>
      )}
    </>
  );
}

const widgetCss = `
.tpw-card {
  container-type: inline-size;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 16px;
  padding: 20px 22px;
  margin-bottom: 24px;
}
.tpw-card--done { opacity: 0.7; border-left-color: #10b981; }

.tpw-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem 12px;
  margin-bottom: 14px;
  cursor: pointer;
}
.tpw-icon-wrap { font-size: 22px; flex-shrink: 0; }
.tpw-label-wrap { flex: 1; min-width: 0; }
.tpw-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
  margin-bottom: 2px;
}
.tpw-plan-name {
  font-family: 'Fraunces', serif;
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tpw-countdown {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}
.tpw-countdown-num {
  font-family: 'DM Mono', monospace;
  font-size: clamp(1.5rem, 4cqw, 2.75rem);
  font-weight: 500;
  color: var(--accent);
  line-height: 1;
  white-space: nowrap;
}
.tpw-countdown-unit {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
/* Narrow card: push countdown badge to its own row, right-aligned */
@container (max-width: 380px) {
  .tpw-countdown { width: 100%; align-items: flex-end; }
  .tpw-countdown-num { font-size: 1.5rem; }
}

.tpw-lecs { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.tpw-lec-row { display: flex; align-items: center; gap: 8px; }
.tpw-lec-num {
  width: 20px; height: 20px;
  border-radius: 50%;
  background: rgba(255,255,255,0.07);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px;
  font-family: 'DM Mono', monospace;
  color: var(--text-muted);
  flex-shrink: 0;
}
.tpw-lec-icon-pill {
  width: 24px; height: 24px;
  border-radius: 6px;
  border: 1px solid;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
}
.tpw-lec-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tpw-progress { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.tpw-progress-bar {
  flex: 1; height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 100px; overflow: hidden;
}
.tpw-progress-fill {
  height: 100%; background: var(--accent);
  border-radius: 100px; transition: width 0.4s ease;
}
.tpw-progress-pct {
  font-family: 'DM Mono', monospace;
  font-size: 10px; color: var(--text-muted);
  flex-shrink: 0; width: 28px; text-align: right;
}

.tpw-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.tpw-start-btn { font-size: 13px; padding: 9px 18px; }
.tpw-done-badge { font-size: 13px; color: #10b981; font-weight: 600; }
.tpw-view-link {
  font-size: 13px; color: var(--text-muted);
  text-decoration: none; font-family: 'Outfit', sans-serif;
  transition: color 0.15s;
}
.tpw-view-link:hover { color: var(--text); }

/* ── Compact pill (collapsed) ── */
.tpw-pill {
  display: inline-flex; align-items: center; gap: 10px;
  background: var(--surface); border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 50px; padding: 8px 14px 8px 12px;
  cursor: pointer; user-select: none;
  transition: border-color 0.18s, opacity 0.18s;
  min-height: 48px; max-width: 100%;
  overflow: hidden;
}
.tpw-pill:hover { border-color: color-mix(in srgb, var(--accent) 60%, transparent); }
.tpw-pill--done { border-left-color: #10b981; opacity: 0.75; }

.tpw-pill-icon { font-size: 16px; flex-shrink: 0; }

.tpw-pill-body {
  display: flex; flex-direction: column;
  min-width: 0; flex-shrink: 0;
}
.tpw-pill-label {
  font-size: 8px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--accent); line-height: 1;
}
.tpw-pill-name {
  font-size: 12px; font-weight: 600;
  color: var(--text); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  max-width: 140px;
}

.tpw-pill-lec {
  display: flex; align-items: center; gap: 5px;
  min-width: 0; flex: 1; overflow: hidden;
}
.tpw-pill-lec-icon {
  width: 20px; height: 20px; border-radius: 5px;
  border: 1px solid; display: flex; align-items: center;
  justify-content: center; font-size: 11px; flex-shrink: 0;
}
.tpw-pill-lec-title {
  font-size: 11px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis;
}

.tpw-pill-days {
  display: flex; flex-direction: column;
  align-items: center; flex-shrink: 0;
}
.tpw-pill-days strong {
  font-family: 'DM Mono', monospace;
  font-size: 14px; color: var(--accent); line-height: 1;
}
.tpw-pill-days span {
  font-size: 8px; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--text-muted);
}

.tpw-pill-done-badge { font-size: 14px; flex-shrink: 0; }
.tpw-pill-chevron {
  font-size: 12px; color: var(--text-muted);
  flex-shrink: 0; margin-left: 2px;
}

.tpw-collapse-btn {
  background: none; border: none; padding: 4px 6px;
  cursor: pointer; color: var(--text-muted);
  font-size: 12px; line-height: 1;
  border-radius: 4px; transition: color 0.15s;
  flex-shrink: 0;
}
.tpw-collapse-btn:hover { color: var(--text); }
`;
