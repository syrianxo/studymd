'use client';

/**
 * app/app/plans/page.tsx
 *
 * Study Plans — create a plan, view calendar schedule, mark days done.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Header from '@/components/Header';
import type { StudyPlan, StudySchedule, Theme } from '@/types';

// ─── Lecture shape needed in this page ───────────────────────────────────────
interface PlanLecture {
  internalId: string;
  title: string;
  course: string;
  color: string;
  icon: string;
  flashcardCount: number;
  questionCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toISODate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function todayISO(): string { return toISODate(new Date()); }

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatTestDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function daysUntil(iso: string): number {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(iso + 'T00:00:00').getTime() - t.getTime()) / 86_400_000);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlansPage() {
  const router = useRouter();

  const [userId, setUserId]   = useState('');
  const [theme, setTheme]     = useState<Theme>('midnight');

  // Auth + theme
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/login'); return; }
      setUserId(data.user.id);
    });
    try {
      const t = localStorage.getItem('studymd_theme') as Theme | null;
      if (t) setTheme(t);
    } catch {}
  }, [router]);

  // ── Data ────────────────────────────────────────────────────────────────────
  const [lectures, setLectures]       = useState<PlanLecture[]>([]);
  const [plans, setPlans]             = useState<StudyPlan[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoadingData(true);
    try {
      const [lecRes, planRes] = await Promise.all([
        fetch('/api/lectures'),
        fetch('/api/plans'),
      ]);
      const lecJson  = await lecRes.json();
      const planJson = await planRes.json();

      setLectures(
        (lecJson.lectures ?? []).map((l: {
          internalId: string; title: string; course: string;
          color: string; icon: string;
          flashcardCount?: number; questionCount?: number;
        }) => ({
          internalId:     l.internalId,
          title:          l.title,
          course:         l.course,
          color:          l.color,
          icon:           l.icon,
          flashcardCount: l.flashcardCount ?? 0,
          questionCount:  l.questionCount  ?? 0,
        }))
      );
      setPlans(planJson.plans ?? []);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── View state ──────────────────────────────────────────────────────────────
  const [view, setView]           = useState<'list' | 'create' | 'detail'>('list');
  const [activePlan, setActivePlan] = useState<StudyPlan | null>(null);

  // ── Create form ─────────────────────────────────────────────────────────────
  const [formName, setFormName]       = useState('');
  const [formDate, setFormDate]       = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState('');

  const minDate = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return toISODate(d);
  }, []);

  function toggleLecture(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    setCreateError('');
    if (!formName.trim())      { setCreateError('Enter a plan name.'); return; }
    if (!formDate)             { setCreateError('Pick a test date.'); return; }
    if (selectedIds.size === 0){ setCreateError('Select at least one lecture.'); return; }

    setCreating(true);
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), testDate: formDate, lectureIds: Array.from(selectedIds) }),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error ?? 'Failed to create plan.'); return; }
      setFormName(''); setFormDate(''); setSelectedIds(new Set());
      await fetchAll();
      setActivePlan(json.plan);
      setView('detail');
    } finally {
      setCreating(false);
    }
  }

  // ── Mark day done / undone ──────────────────────────────────────────────────
  async function markDay(planId: string, date: string, done: boolean) {
    const res = await fetch(`/api/plans/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: done ? 'markDayDone' : 'markDayUndone', date }),
    });
    const json = await res.json();
    if (res.ok) {
      setPlans(prev => prev.map(p => p.id === planId ? json.plan : p));
      if (activePlan?.id === planId) setActivePlan(json.plan);
    }
  }

  // ── Delete plan ─────────────────────────────────────────────────────────────
  async function deletePlan(planId: string) {
    if (!confirm('Delete this study plan? This cannot be undone.')) return;
    await fetch(`/api/plans/${planId}`, { method: 'DELETE' });
    setPlans(prev => prev.filter(p => p.id !== planId));
    if (activePlan?.id === planId) { setActivePlan(null); setView('list'); }
  }

  const lectureMap = useMemo(
    () => new Map(lectures.map(l => [l.internalId, l])),
    [lectures]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>

      {/* Shared app header — identical to every other app page */}
      <Header
        lectureCount={0}
        userId={userId}
        initialTheme={theme}
        hideUploadButton={false}
      />

      <main className="sp-main">

        {/* ── Back nav + page title ─────────────────────────────────────── */}
        <div className="sp-topbar">
          {view === 'list' ? (
            <Link href="/app" className="sp-back-btn">← Dashboard</Link>
          ) : (
            <button
              className="sp-back-btn"
              onClick={() => {
                if (view === 'detail') { setView('list'); setActivePlan(null); }
                else setView('list');
              }}
            >
              ← {view === 'detail' ? 'All Plans' : 'Back'}
            </button>
          )}
          <h1 className="sp-page-title">
            {view === 'list'   && 'Study Plans'}
            {view === 'create' && 'Create Study Plan'}
            {view === 'detail' && (activePlan?.name ?? 'Study Plan')}
          </h1>
          {view === 'list' && (
            <button className="btn btn-primary sp-create-btn" onClick={() => setView('create')}>
              + New Plan
            </button>
          )}
          {view === 'detail' && activePlan && (
            <button
              className="sp-delete-btn-sm"
              onClick={() => deletePlan(activePlan.id)}
            >
              🗑 Delete
            </button>
          )}
          {/* Placeholder to keep title centered when no right action */}
          {view === 'create' && <div style={{ width: 100 }} />}
        </div>

        {/* ── LIST VIEW ──────────────────────────────────────────────────── */}
        {view === 'list' && (
          loadingData ? (
            <div className="sp-empty">Loading…</div>
          ) : plans.length === 0 ? (
            <div className="sp-empty-state">
              <div className="sp-empty-icon">📅</div>
              <div className="sp-empty-title">No study plans yet</div>
              <p className="sp-empty-desc">
                Create a plan to get a personalized day-by-day schedule leading up to your test.
              </p>
              <button className="btn btn-primary" onClick={() => setView('create')}>
                Create Your First Plan
              </button>
            </div>
          ) : (
            <div className="sp-plan-list">
              {plans.map(plan => {
                const dLeft = daysUntil(plan.test_date);
                const today = todayISO();
                const todaysLectures = (plan.schedule as StudySchedule)[today] ?? [];
                const doneDays  = plan.completed_days.length;
                const totalDays = Object.keys(plan.schedule).length;
                const pct = totalDays > 0 ? Math.round((doneDays / totalDays) * 100) : 0;

                return (
                  <div
                    key={plan.id}
                    className="sp-plan-card"
                    onClick={() => { setActivePlan(plan); setView('detail'); }}
                    role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') { setActivePlan(plan); setView('detail'); } }}
                  >
                    <div className="sp-plan-card-top">
                      <div>
                        <div className="sp-plan-name">{plan.name}</div>
                        <div className="sp-plan-meta">
                          Test: {formatTestDate(plan.test_date)}
                          {dLeft > 0
                            ? <span className="sp-days-badge">{dLeft}d left</span>
                            : <span className="sp-days-badge sp-days-past">Past</span>}
                        </div>
                      </div>
                      <button
                        className="sp-delete-btn"
                        onClick={e => { e.stopPropagation(); deletePlan(plan.id); }}
                        aria-label="Delete plan"
                      >🗑</button>
                    </div>

                    <div className="sp-progress-bar-wrap">
                      <div className="sp-progress-bar">
                        <div className="sp-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="sp-progress-pct">{pct}%</span>
                    </div>

                    {todaysLectures.length > 0 && (
                      <div className="sp-today-hint">
                        📌 Today: {todaysLectures.length} lecture{todaysLectures.length > 1 ? 's' : ''} scheduled
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── CREATE VIEW ────────────────────────────────────────────────── */}
        {view === 'create' && (
          <div className="sp-form">
            <div className="sp-field">
              <label className="sp-label" htmlFor="planName">Plan Name</label>
              <input
                id="planName" className="sp-input" type="text"
                placeholder="e.g. Anatomy Midterm"
                value={formName} onChange={e => setFormName(e.target.value)}
                maxLength={80}
              />
            </div>

            <div className="sp-field">
              <label className="sp-label" htmlFor="testDate">Test Date</label>
              <input
                id="testDate" className="sp-input" type="date"
                min={minDate} value={formDate}
                onChange={e => setFormDate(e.target.value)}
              />
              {formDate && (
                <span className="sp-date-hint">
                  {daysUntil(formDate)} day{daysUntil(formDate) !== 1 ? 's' : ''} from today
                </span>
              )}
            </div>

            <div className="sp-field">
              <label className="sp-label">
                Select Lectures
                <span className="sp-label-sub"> ({selectedIds.size} selected)</span>
              </label>
              {loadingData ? (
                <div className="sp-lec-loading">Loading lectures…</div>
              ) : (
                <div className="sp-lec-list">
                  {lectures.map(lec => {
                    const checked   = selectedIds.has(lec.internalId);
                    const cardTotal = lec.flashcardCount + lec.questionCount;
                    return (
                      <label
                        key={lec.internalId}
                        className={`sp-lec-item${checked ? ' sp-lec-item--checked' : ''}`}
                      >
                        <input
                          type="checkbox" className="sp-checkbox"
                          checked={checked} onChange={() => toggleLecture(lec.internalId)}
                        />
                        <span
                          className="sp-lec-icon"
                          style={{ background: lec.color + '22', borderColor: lec.color + '55' }}
                        >
                          {lec.icon}
                        </span>
                        <span className="sp-lec-info">
                          <span className="sp-lec-title">{lec.title}</span>
                          <span className="sp-lec-course">{lec.course}</span>
                        </span>
                        <span className="sp-lec-cards">{cardTotal} cards</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {createError && <div className="sp-error">{createError}</div>}

            <button
              className="btn btn-primary sp-generate-btn"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? 'Generating…' : '⚡ Generate Schedule'}
            </button>
          </div>
        )}

        {/* ── DETAIL VIEW ────────────────────────────────────────────────── */}
        {view === 'detail' && activePlan && (
          <PlanDetail
            plan={activePlan}
            lectureMap={lectureMap}
            onMarkDay={markDay}
          />
        )}
      </main>
    </>
  );
}

// ─── Plan Detail subcomponent ──────────────────────────────────────────────────

interface PlanDetailProps {
  plan: StudyPlan;
  lectureMap: Map<string, PlanLecture>;
  onMarkDay: (planId: string, date: string, done: boolean) => void;
}

function PlanDetail({ plan, lectureMap, onMarkDay }: PlanDetailProps) {
  const today   = todayISO();
  const dLeft   = daysUntil(plan.test_date);
  const doneSet = new Set(plan.completed_days);

  const sortedDays = useMemo(
    () => Object.keys(plan.schedule as StudySchedule).sort(),
    [plan.schedule]
  );

  const doneDays  = doneSet.size;
  const totalDays = sortedDays.length;
  const pct = totalDays > 0 ? Math.round((doneDays / totalDays) * 100) : 0;

  const todaysLectures = (plan.schedule as StudySchedule)[today] ?? [];
  const firstTodayId   = todaysLectures[0];

  return (
    <div>
      {/* Plan hero */}
      <div className="sp-detail-hero">
        <div className="sp-detail-meta">
          <span>🎯 Test: <strong>{formatTestDate(plan.test_date)}</strong></span>
          {dLeft > 0
            ? <span className="sp-days-badge">{dLeft} day{dLeft !== 1 ? 's' : ''} left</span>
            : <span className="sp-days-badge sp-days-past">Test day passed</span>}
        </div>

        <div className="sp-detail-progress">
          <div className="sp-progress-bar sp-progress-bar--lg">
            <div className="sp-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="sp-progress-label">{doneDays} / {totalDays} days — {pct}%</span>
        </div>

        {todaysLectures.length > 0 && !doneSet.has(today) && (
          <Link
            href={`/app/study/flash?lecture=${firstTodayId}`}
            className="btn btn-primary sp-start-today-btn"
          >
            ▶ Start Today&apos;s Review
          </Link>
        )}
        {todaysLectures.length > 0 && doneSet.has(today) && (
          <div className="sp-today-done-msg">✅ Today&apos;s review complete — great work!</div>
        )}
        {todaysLectures.length === 0 && dLeft > 0 && (
          <div className="sp-today-done-msg">📭 Nothing scheduled for today.</div>
        )}
      </div>

      {/* Calendar */}
      <div className="sp-calendar">
        <div className="sp-calendar-label">Schedule</div>
        {sortedDays.map(date => {
          const isToday  = date === today;
          const isDone   = doneSet.has(date);
          const isPast   = date < today;
          const dayLecs  = (plan.schedule as StudySchedule)[date] ?? [];

          return (
            <div
              key={date}
              className={[
                'sp-cal-day',
                isToday ? 'sp-cal-day--today' : '',
                isDone  ? 'sp-cal-day--done'  : '',
                isPast && !isDone ? 'sp-cal-day--missed' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="sp-cal-left">
                <div className="sp-cal-date">
                  {isToday && <span className="sp-today-pip">TODAY</span>}
                  {formatDate(date)}
                </div>
                <div className="sp-cal-lecs">
                  {dayLecs.map(id => {
                    const lec = lectureMap.get(id);
                    if (!lec) return null;
                    return (
                      <span
                        key={id}
                        className="sp-cal-lec-chip"
                        style={{ borderColor: lec.color + '66', background: lec.color + '18' }}
                      >
                        {lec.icon} {lec.title}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="sp-cal-right">
                {isDone ? (
                  <button
                    className="sp-check-btn sp-check-btn--done"
                    onClick={() => onMarkDay(plan.id, date, false)}
                    title="Mark incomplete"
                  >✓</button>
                ) : (
                  <button
                    className="sp-check-btn"
                    onClick={() => onMarkDay(plan.id, date, true)}
                    title="Mark complete"
                  >○</button>
                )}
              </div>
            </div>
          );
        })}

        {/* Test day marker */}
        <div className="sp-cal-day sp-cal-day--test">
          <div className="sp-cal-left">
            <div className="sp-cal-date">
              <span className="sp-test-pip">TEST DAY</span>
              {formatDate(plan.test_date)}
            </div>
            <div className="sp-cal-lecs">
              <span className="sp-cal-lec-chip sp-test-chip">🎯 {plan.name}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Scoped CSS ────────────────────────────────────────────────────────────────
const css = `
.sp-main {
  max-width: 820px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}

/* ── Top bar: back button + title + action ──────────────────────────── */
.sp-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 32px;
  flex-wrap: wrap;
}

.sp-back-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 13px;
  font-family: 'Outfit', sans-serif;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  transition: color 0.15s;
  min-width: 80px;
}
.sp-back-btn:hover { color: var(--text); }

.sp-page-title {
  font-family: 'Fraunces', serif;
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.1;
  flex: 1;
  text-align: center;
}

.sp-create-btn { font-size: 13px; }

.sp-delete-btn-sm {
  background: none;
  border: 1px solid rgba(239,68,68,0.3);
  cursor: pointer;
  font-size: 12px;
  color: #ef4444;
  padding: 6px 12px;
  border-radius: 8px;
  font-family: 'Outfit', sans-serif;
  font-weight: 500;
  transition: background 0.15s;
  min-width: 80px;
  text-align: right;
}
.sp-delete-btn-sm:hover { background: rgba(239,68,68,0.1); }

/* ── Shared ────────────────────────────────────────────────────────── */
.sp-empty { color: var(--text-muted); font-size: 14px; }

.sp-empty-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; padding: 60px 24px; text-align: center;
}
.sp-empty-icon  { font-size: 48px; }
.sp-empty-title { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; color: var(--text); }
.sp-empty-desc  { font-size: 14px; color: var(--text-muted); max-width: 360px; line-height: 1.6; }

/* ── Plan list ─────────────────────────────────────────────────────── */
.sp-plan-list { display: flex; flex-direction: column; gap: 14px; }

.sp-plan-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px 24px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sp-plan-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.sp-plan-card-top {
  display: flex; align-items: flex-start;
  justify-content: space-between; gap: 12px; margin-bottom: 14px;
}

.sp-plan-name {
  font-family: 'Fraunces', serif;
  font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 4px;
}

.sp-plan-meta {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--text-muted);
}

.sp-days-badge {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: 100px;
  font-size: 11px; font-weight: 600;
  background: var(--accent); color: #fff;
  font-family: 'DM Mono', monospace;
}
.sp-days-past { background: var(--text-muted); }

.sp-delete-btn {
  background: none; border: none; cursor: pointer;
  font-size: 16px; color: var(--text-muted);
  padding: 4px; border-radius: 6px;
  transition: color 0.15s, background 0.15s; flex-shrink: 0;
}
.sp-delete-btn:hover { color: #ef4444; background: rgba(239,68,68,0.1); }

.sp-progress-bar-wrap { display: flex; align-items: center; gap: 10px; }
.sp-progress-bar {
  flex: 1; height: 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 100px; overflow: hidden;
}
.sp-progress-bar--lg { height: 8px; }
.sp-progress-fill {
  height: 100%; background: var(--accent);
  border-radius: 100px; transition: width 0.4s ease;
}
.sp-progress-pct {
  font-family: 'DM Mono', monospace; font-size: 11px;
  color: var(--text-muted); flex-shrink: 0; width: 32px; text-align: right;
}
.sp-today-hint { margin-top: 10px; font-size: 12px; color: var(--accent); font-weight: 500; }

/* ── Create form ───────────────────────────────────────────────────── */
.sp-form { display: flex; flex-direction: column; gap: 24px; max-width: 600px; }
.sp-field { display: flex; flex-direction: column; gap: 8px; }

.sp-label {
  font-size: 13px; font-weight: 600; color: var(--text);
  font-family: 'Outfit', sans-serif;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.sp-label-sub {
  font-weight: 400; color: var(--text-muted);
  text-transform: none; letter-spacing: 0;
}

.sp-input {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 12px 16px;
  color: var(--text); font-family: 'Outfit', sans-serif;
  font-size: 15px; outline: none;
  transition: border-color 0.15s; width: 100%; box-sizing: border-box;
}
.sp-input:focus { border-color: var(--accent); }
.sp-input[type="date"] { color-scheme: dark; }

.sp-date-hint { font-size: 12px; color: var(--accent); font-family: 'DM Mono', monospace; }

.sp-lec-loading { color: var(--text-muted); font-size: 14px; }

.sp-lec-list {
  display: flex; flex-direction: column; gap: 6px;
  max-height: 380px; overflow-y: auto;
  border: 1px solid var(--border); border-radius: 12px;
  padding: 8px; background: var(--surface);
}

.sp-lec-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 8px;
  cursor: pointer; transition: background 0.12s; user-select: none;
}
.sp-lec-item:hover { background: rgba(255,255,255,0.04); }
.sp-lec-item--checked { background: rgba(91,141,238,0.08); }

.sp-checkbox { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }

.sp-lec-icon {
  width: 32px; height: 32px; border-radius: 8px; border: 1px solid;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; flex-shrink: 0;
}

.sp-lec-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sp-lec-title {
  font-size: 14px; font-weight: 600; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sp-lec-course {
  font-size: 11px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sp-lec-cards { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text-muted); flex-shrink: 0; }

.sp-error {
  color: #ef4444; font-size: 13px;
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.3);
  border-radius: 8px; padding: 10px 14px;
}
.sp-generate-btn { align-self: flex-start; font-size: 15px; padding: 13px 28px; }

/* ── Detail hero ───────────────────────────────────────────────────── */
.sp-detail-hero {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 20px; padding: 24px 28px; margin-bottom: 24px;
}

.sp-detail-meta {
  display: flex; align-items: center; gap: 10px;
  font-size: 14px; color: var(--text-muted);
  margin-bottom: 16px; flex-wrap: wrap;
}
.sp-detail-meta strong { color: var(--text); }

.sp-detail-progress { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.sp-progress-label { font-size: 12px; color: var(--text-muted); font-family: 'DM Mono', monospace; white-space: nowrap; }

.sp-start-today-btn { font-size: 14px; padding: 12px 24px; }

.sp-today-done-msg {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 14px; color: var(--text-muted);
  background: rgba(255,255,255,0.04);
  border-radius: 10px; padding: 10px 16px;
}

/* ── Calendar ──────────────────────────────────────────────────────── */
.sp-calendar { display: flex; flex-direction: column; gap: 6px; }
.sp-calendar-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 6px;
}

.sp-cal-day {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 12px 16px; transition: border-color 0.15s;
}
.sp-cal-day--today { border-color: var(--accent); background: rgba(91,141,238,0.06); }
.sp-cal-day--done  { opacity: 0.5; border-color: rgba(16,185,129,0.4); background: rgba(16,185,129,0.04); }
.sp-cal-day--missed { opacity: 0.6; border-color: rgba(239,68,68,0.25); background: rgba(239,68,68,0.03); }
.sp-cal-day--test  { border-color: var(--accent); border-style: dashed; background: rgba(91,141,238,0.04); }

.sp-cal-left { flex: 1; min-width: 0; }
.sp-cal-date {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: var(--text);
  margin-bottom: 6px; font-family: 'DM Mono', monospace;
}
.sp-today-pip, .sp-test-pip {
  font-size: 9px; font-weight: 700;
  background: var(--accent); color: #fff;
  padding: 2px 6px; border-radius: 100px;
  letter-spacing: 0.08em; font-family: 'Outfit', sans-serif;
}
.sp-cal-lecs { display: flex; flex-wrap: wrap; gap: 6px; }
.sp-cal-lec-chip {
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid; border-radius: 100px; padding: 3px 10px;
  font-size: 12px; color: var(--text); font-family: 'Outfit', sans-serif;
  font-weight: 500; white-space: nowrap;
  max-width: 240px; overflow: hidden; text-overflow: ellipsis;
}
.sp-test-chip {
  border-color: var(--accent) !important;
  background: rgba(91,141,238,0.12) !important;
  color: var(--accent) !important; font-weight: 600 !important;
}
.sp-cal-right { flex-shrink: 0; }
.sp-check-btn {
  width: 32px; height: 32px; border-radius: 50%;
  border: 2px solid var(--border); background: none;
  cursor: pointer; font-size: 14px; color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.sp-check-btn:hover { border-color: var(--accent); color: var(--accent); }
.sp-check-btn--done { background: rgba(16,185,129,0.15); border-color: #10b981; color: #10b981; }
.sp-check-btn--done:hover { background: rgba(239,68,68,0.1); border-color: #ef4444; color: #ef4444; }

@media (max-width: 640px) {
  .sp-main { padding: 24px 16px 60px; }
  .sp-detail-hero { padding: 18px; }
  .sp-cal-lec-chip { max-width: 160px; }
  .sp-page-title { font-size: 20px; }
}
`;
