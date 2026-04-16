'use client';
/**
 * app/admin/AdminClient.tsx
 *
 * Full admin dashboard client component.
 * Sections: Overview · API Usage · Users · Lectures · Feedback · System Config
 * Sidebar navigation switches sections without page reload.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewData {
  totalUsers: number;
  totalLectures: number;
  callsToday: number;
  costToday: number;
  costMonth: number;
}

interface UsageRow {
  date: string;
  callsCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

interface UsageData {
  today: { callsCount: number; inputTokens: number; outputTokens: number; estimatedCost: number };
  monthToDate: { callsCount: number; estimatedCost: number };
  limits: { maxDailyCalls: number; maxDailyInputTokens: number; maxMonthlyCostUsd: number };
  history: UsageRow[];
}

interface UserRow {
  user_id: string;
  display_name: string | null;
  email: string;
  role: string;
  lectureCount: number;
  lastActive: string;
  is_primary?: boolean;
}

interface LectureRow {
  internal_id: string;
  title: string;
  course: string;
  created_at: string;
  slide_count: number;
  original_file: string | null;
  flashcard_count: number;
  question_count: number;
  icon: string;
  color: string;
}

interface FeedbackRow {
  id: string;
  user_id: string | null;
  user_name: string;
  type: string;
  message: string;
  page_url: string | null;
  status: 'new' | 'reviewed' | 'resolved';
  created_at: string;
}

interface ConfigRow {
  key: string;
  value: unknown;
  updated_at: string;
}

type Section = 'overview' | 'usage' | 'users' | 'lectures' | 'feedback' | 'config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) { return `$${n.toFixed(4)}`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(path, opts);
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? `HTTP ${r.status}`);
  }
  return r.json();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toast({ msg, type, onDone }: { msg: string; type: 'ok' | 'err'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={`adm-toast adm-toast-${type}`}>{msg}</div>
  );
}

function ConfirmDialog({ msg, onConfirm, onCancel }: { msg: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="adm-overlay">
      <div className="adm-dialog">
        <p className="adm-dialog-msg">{msg}</p>
        <div className="adm-dialog-btns">
          <button className="adm-btn adm-btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="adm-btn adm-btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Overview ────────────────────────────────────────────────────────

function OverviewSection() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/admin/overview')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const cards = data ? [
    { label: 'Total Users',       value: data.totalUsers,                   icon: '👤', accent: 'var(--accent)' },
    { label: 'Total Lectures',    value: data.totalLectures,                icon: '📚', accent: '#8b5cf6' },
    { label: 'API Calls Today',   value: data.callsToday,                   icon: '⚡', accent: '#f59e0b' },
    { label: 'Cost This Month',   value: fmt$(data.costMonth),              icon: '💰', accent: '#10b981' },
  ] : [];

  return (
    <div className="adm-section">
      <h2 className="adm-section-title">Overview</h2>
      {loading ? <div className="adm-loading">Loading…</div> : (
        <div className="adm-cards-row">
          {cards.map(c => (
            <div key={c.label} className="adm-card">
              <div className="adm-card-icon">{c.icon}</div>
              <div className="adm-card-value" style={{ color: c.accent }}>{c.value}</div>
              <div className="adm-card-label">{c.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section: API Usage ───────────────────────────────────────────────────────

function UsageSection() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/usage')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="adm-section"><div className="adm-loading">Loading usage data…</div></div>;
  if (!data) return <div className="adm-section"><p className="adm-empty">No usage data available.</p></div>;

  const chartData = data.history.map(r => ({
    date: fmtDateShort(r.date),
    cost: r.estimatedCost,
    calls: r.callsCount,
  }));

  const pctMonth = data.limits.maxMonthlyCostUsd > 0
    ? Math.min(100, (data.monthToDate.estimatedCost / data.limits.maxMonthlyCostUsd) * 100)
    : 0;

  return (
    <div className="adm-section">
      <h2 className="adm-section-title">API Usage</h2>

      {/* Summary pills */}
      <div className="adm-usage-pills">
        <div className="adm-usage-pill">
          <span className="adm-pill-label">Today calls</span>
          <span className="adm-pill-val">{data.today.callsCount}</span>
        </div>
        <div className="adm-usage-pill">
          <span className="adm-pill-label">Today cost</span>
          <span className="adm-pill-val">{fmt$(data.today.estimatedCost)}</span>
        </div>
        <div className="adm-usage-pill">
          <span className="adm-pill-label">Month cost</span>
          <span className="adm-pill-val accent">{fmt$(data.monthToDate.estimatedCost)}</span>
        </div>
        <div className="adm-usage-pill">
          <span className="adm-pill-label">Month limit</span>
          <span className="adm-pill-val">{fmt$(data.limits.maxMonthlyCostUsd)}</span>
        </div>
      </div>

      {/* Budget bar */}
      <div className="adm-budget-bar-wrap">
        <div className="adm-budget-bar-label">
          Monthly budget: {pctMonth.toFixed(1)}% used
        </div>
        <div className="adm-budget-bar-track">
          <div
            className="adm-budget-bar-fill"
            style={{
              width: `${pctMonth}%`,
              background: pctMonth > 80 ? '#ef4444' : pctMonth > 50 ? '#f59e0b' : 'var(--accent)',
            }}
          />
        </div>
      </div>

      {/* Line chart */}
      {chartData.length > 0 ? (
        <div className="adm-chart-wrap">
          <div className="adm-chart-title">Daily API Cost — last 30 days</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `$${v.toFixed(3)}`}
                width={64}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  color: 'var(--text)',
                  fontSize: 12,
                }}
                formatter={(val: number) => [`$${val.toFixed(4)}`, 'Cost']}
              />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--accent)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="adm-empty">No usage history yet.</p>
      )}

      {/* Detail table */}
      {data.history.length > 0 && (
        <div className="adm-table-wrap" style={{ marginTop: 24 }}>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Calls</th>
                <th>Input Tokens</th>
                <th>Output Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {[...data.history].reverse().map(r => (
                <tr key={r.date}>
                  <td className="adm-mono">{r.date}</td>
                  <td>{r.callsCount.toLocaleString()}</td>
                  <td>{r.inputTokens.toLocaleString()}</td>
                  <td>{r.outputTokens.toLocaleString()}</td>
                  <td className="adm-mono accent">{fmt$(r.estimatedCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Section: Users ───────────────────────────────────────────────────────────

function UsersSection({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<string | null>(null); // userId to delete

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/admin/users')
      .then(d => setUsers(d.users ?? []))
      .catch(e => onToast(e.message, 'err'))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  async function handleRoleChange(userId: string, role: string) {
    try {
      await apiFetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      onToast('Role updated.', 'ok');
      load();
    } catch (e: any) { onToast(e.message, 'err'); }
  }

  async function handleDelete(userId: string) {
    try {
      await apiFetch(`/api/admin/users?userId=${userId}`, { method: 'DELETE' });
      onToast('User deleted.', 'ok');
      setConfirm(null);
      load();
    } catch (e: any) { onToast(e.message, 'err'); setConfirm(null); }
  }

  return (
    <div className="adm-section">
      <h2 className="adm-section-title">Users <span className="adm-count-badge">{users.length}</span></h2>

      {loading ? <div className="adm-loading">Loading users…</div> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Name / Email</th>
                <th>Role</th>
                <th>Lectures</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id}>
                  <td>
                    <div className="adm-user-name">
                      {u.display_name ?? '—'}
                      {u.is_primary && <span className="adm-badge adm-badge-gold">Primary</span>}
                    </div>
                    <div className="adm-user-email">{u.email}</div>
                  </td>
                  <td>
                    <select
                      className="adm-select"
                      value={u.role}
                      onChange={e => handleRoleChange(u.user_id, e.target.value)}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                      <option value="demo">demo</option>
                    </select>
                  </td>
                  <td>{u.lectureCount}</td>
                  <td className="adm-muted">{fmtDate(u.lastActive)}</td>
                  <td>
                    <div className="adm-action-row">
                      <Link
                        href={`/admin/progress?userId=${u.user_id}`}
                        className="adm-action-btn"
                        title="View progress"
                      >
                        📊
                      </Link>
                      <button
                        className="adm-action-btn adm-action-btn-danger"
                        onClick={() => setConfirm(u.user_id)}
                        title="Delete user"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          msg="Permanently delete this user and all their data? This cannot be undone."
          onConfirm={() => handleDelete(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ─── Section: Lectures ────────────────────────────────────────────────────────

function LecturesSection({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [lectures, setLectures] = useState<LectureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [jsonPreview, setJsonPreview] = useState<{ title: string; json: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/admin/lectures')
      .then(d => setLectures(d.lectures ?? []))
      .catch(e => onToast(e.message, 'err'))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/api/admin/lectures?id=${id}`, { method: 'DELETE' });
      onToast('Lecture deleted.', 'ok');
      setConfirm(null);
      load();
    } catch (e: any) { onToast(e.message, 'err'); setConfirm(null); }
  }

  async function handleViewJson(lec: LectureRow) {
    try {
      const r = await apiFetch(`/api/lectures?id=${lec.internal_id}`);
      setJsonPreview({
        title: lec.title,
        json: JSON.stringify(r, null, 2),
      });
    } catch {
      // Fall back to fetching raw from admin lectures list
      setJsonPreview({ title: lec.title, json: '(Could not load full JSON)' });
    }
  }

  return (
    <div className="adm-section">
      <h2 className="adm-section-title">Lectures <span className="adm-count-badge">{lectures.length}</span></h2>

      {loading ? <div className="adm-loading">Loading lectures…</div> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Lecture</th>
                <th>Course</th>
                <th>Date Added</th>
                <th>Flashcards</th>
                <th>Questions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lectures.map(l => (
                <tr key={l.internal_id}>
                  <td>
                    <div className="adm-lec-title">
                      <span className="adm-lec-icon">{l.icon}</span>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{l.title}</div>
                        <div className="adm-mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{l.internal_id}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="adm-course-pill">{l.course}</span></td>
                  <td className="adm-muted">{fmtDate(l.created_at)}</td>
                  <td className="accent">{l.flashcard_count}</td>
                  <td style={{ color: '#8b5cf6' }}>{l.question_count}</td>
                  <td>
                    <div className="adm-action-row">
                      <button
                        className="adm-action-btn"
                        onClick={() => handleViewJson(l)}
                        title="View JSON"
                      >
                        { '{ }' }
                      </button>
                      <button
                        className="adm-action-btn adm-action-btn-danger"
                        onClick={() => setConfirm(l.internal_id)}
                        title="Delete lecture"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          msg="Permanently delete this lecture, its slides from storage, and all user settings for it?"
          onConfirm={() => handleDelete(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {jsonPreview && (
        <div className="adm-overlay" onClick={() => setJsonPreview(null)}>
          <div className="adm-json-modal" onClick={e => e.stopPropagation()}>
            <div className="adm-json-header">
              <span className="adm-json-title">{jsonPreview.title}</span>
              <button className="adm-close-btn" onClick={() => setJsonPreview(null)}>✕</button>
            </div>
            <pre className="adm-json-body">{jsonPreview.json}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Feedback ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  new:      '#ef4444',
  reviewed: '#f59e0b',
  resolved: '#10b981',
};

function FeedbackSection({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/admin/feedback')
      .then(d => setItems(d.feedback ?? []))
      .catch(e => onToast(e.message, 'err'))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  async function handleResolve(id: string) {
    try {
      await apiFetch('/api/admin/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'resolved' }),
      });
      onToast('Marked resolved.', 'ok');
      load();
    } catch (e: any) { onToast(e.message, 'err'); }
  }

  async function handleReview(id: string) {
    try {
      await apiFetch('/api/admin/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'reviewed' }),
      });
      onToast('Marked reviewed.', 'ok');
      load();
    } catch (e: any) { onToast(e.message, 'err'); }
  }

  const newCount = items.filter(i => i.status === 'new').length;

  return (
    <div className="adm-section">
      <h2 className="adm-section-title">
        Feedback Inbox
        {newCount > 0 && <span className="adm-badge adm-badge-red">{newCount} new</span>}
      </h2>

      {loading ? <div className="adm-loading">Loading feedback…</div> : items.length === 0 ? (
        <p className="adm-empty">No feedback submissions yet. 🎉</p>
      ) : (
        <div className="adm-feedback-list">
          {items.map(fb => (
            <div key={fb.id} className={`adm-feedback-item ${expanded === fb.id ? 'adm-fb-expanded' : ''}`}>
              <div
                className="adm-fb-header"
                onClick={() => setExpanded(expanded === fb.id ? null : fb.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(expanded === fb.id ? null : fb.id); }}
              >
                <div className="adm-fb-left">
                  <span
                    className="adm-fb-status-dot"
                    style={{ background: STATUS_COLORS[fb.status] ?? '#6b7280' }}
                    title={fb.status}
                  />
                  <span className="adm-fb-type">{fb.type ?? 'Feedback'}</span>
                  <span className="adm-fb-from">{fb.user_name}</span>
                </div>
                <div className="adm-fb-right">
                  <span className="adm-muted" style={{ fontSize: 11 }}>{fmtDate(fb.created_at)}</span>
                  <span className="adm-fb-chevron">{expanded === fb.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expanded === fb.id && (
                <div className="adm-fb-body">
                  {fb.page_url && (
                    <div className="adm-fb-page-url">
                      Page: <span className="adm-mono">{fb.page_url}</span>
                    </div>
                  )}
                  <p className="adm-fb-message">{fb.message}</p>
                  <div className="adm-fb-actions">
                    {fb.status !== 'reviewed' && fb.status !== 'resolved' && (
                      <button className="adm-btn adm-btn-ghost" onClick={() => handleReview(fb.id)}>
                        Mark Reviewed
                      </button>
                    )}
                    {fb.status !== 'resolved' && (
                      <button className="adm-btn adm-btn-primary" onClick={() => handleResolve(fb.id)}>
                        ✓ Mark Resolved
                      </button>
                    )}
                    {fb.status === 'resolved' && (
                      <span className="adm-resolved-label">✓ Resolved</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section: System Config ───────────────────────────────────────────────────

const DEFAULT_KEYS = [
  { key: 'max_daily_calls',         label: 'Max Daily API Calls',          type: 'number' },
  { key: 'max_daily_input_tokens',  label: 'Max Daily Input Tokens',       type: 'number' },
  { key: 'max_monthly_cost_usd',    label: 'Max Monthly Cost (USD)',        type: 'number' },
];

function ConfigSection({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [config, setConfig] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/admin/config')
      .then(d => {
        setConfig(d.config ?? []);
        const initial: Record<string, string> = {};
        (d.config ?? []).forEach((r: ConfigRow) => {
          initial[r.key] = String(r.value ?? '');
        });
        setEdits(initial);
      })
      .catch(e => onToast(e.message, 'err'))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(key: string) {
    setSaving(s => ({ ...s, [key]: true }));
    try {
      await apiFetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: Number(edits[key]) || edits[key] }),
      });
      onToast(`Saved ${key}.`, 'ok');
      load();
    } catch (e: any) { onToast(e.message, 'err'); }
    setSaving(s => ({ ...s, [key]: false }));
  }

  async function handleAction(action: string) {
    setActionLoading(action);
    try {
      const d = await apiFetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      onToast(d.message ?? 'Done.', 'ok');
    } catch (e: any) { onToast(e.message, 'err'); }
    setActionLoading('');
  }

  // Merge default keys with what's in the DB
  const displayKeys = DEFAULT_KEYS.map(dk => {
    const row = config.find(r => r.key === dk.key);
    return { ...dk, dbValue: row?.value, updatedAt: row?.updated_at };
  });

  return (
    <div className="adm-section">
      <h2 className="adm-section-title">System Config</h2>

      {/* API Limits */}
      <div className="adm-config-group">
        <div className="adm-config-group-title">API Limits</div>
        {loading ? <div className="adm-loading">Loading config…</div> : (
          <div className="adm-config-rows">
            {displayKeys.map(dk => (
              <div key={dk.key} className="adm-config-row">
                <label className="adm-config-label">{dk.label}</label>
                <div className="adm-config-input-wrap">
                  <input
                    className="adm-input"
                    type={dk.type}
                    value={edits[dk.key] ?? String(dk.dbValue ?? '')}
                    onChange={e => setEdits(prev => ({ ...prev, [dk.key]: e.target.value }))}
                    placeholder={dk.dbValue === undefined ? 'not set' : ''}
                  />
                  <button
                    className="adm-btn adm-btn-primary"
                    onClick={() => handleSave(dk.key)}
                    disabled={saving[dk.key]}
                  >
                    {saving[dk.key] ? '…' : 'Save'}
                  </button>
                </div>
                {dk.updatedAt && (
                  <div className="adm-config-updated">Last updated {fmtDate(dk.updatedAt)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="adm-config-group" style={{ marginTop: 28 }}>
        <div className="adm-config-group-title">Quick Actions</div>
        <div className="adm-quick-actions">
          <div className="adm-quick-action">
            <div>
              <div className="adm-qa-label">Clear Processing Jobs</div>
              <div className="adm-qa-desc">Removes all entries from the processing_jobs table. Use if jobs are stuck.</div>
            </div>
            <button
              className="adm-btn adm-btn-danger"
              onClick={() => handleAction('clear_jobs')}
              disabled={actionLoading === 'clear_jobs'}
            >
              {actionLoading === 'clear_jobs' ? 'Clearing…' : 'Clear Jobs'}
            </button>
          </div>
          <div className="adm-quick-action">
            <div>
              <div className="adm-qa-label">Rebuild Lecture Registry</div>
              <div className="adm-qa-desc">Ensures all users have user_lecture_settings rows for every lecture. Safe to run at any time.</div>
            </div>
            <button
              className="adm-btn adm-btn-ghost"
              onClick={() => handleAction('rebuild_registry')}
              disabled={actionLoading === 'rebuild_registry'}
            >
              {actionLoading === 'rebuild_registry' ? 'Rebuilding…' : 'Rebuild Registry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main AdminClient ─────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: 'overview',  label: 'Overview',     icon: '📊' },
  { id: 'usage',     label: 'API Usage',    icon: '⚡' },
  { id: 'users',     label: 'Users',        icon: '👥' },
  { id: 'lectures',  label: 'Lectures',     icon: '📚' },
  { id: 'feedback',  label: 'Feedback',     icon: '💬' },
  { id: 'config',    label: 'System',       icon: '⚙️' },
];

interface AdminClientProps {
  adminName: string;
}

export default function AdminClient({ adminName }: AdminClientProps) {
  const [section, setSection] = useState<Section>('overview');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const showToast = useCallback((msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
  }, []);

  return (
    <>
      <style>{adminCss}</style>
      <div className="adm-root">

        {/* ── Sidebar ── */}
        <aside className={`adm-sidebar ${navOpen ? 'adm-sidebar-open' : ''}`}>
          <div className="adm-sidebar-header">
            <Link href="/app" className="adm-back-link">← App</Link>
            <div className="adm-admin-brand">
              <div className="adm-admin-logo">
                <span>Study</span><span className="adm-logo-md">MD</span>
              </div>
              <div className="adm-admin-sub">Admin Panel</div>
            </div>
          </div>

          <nav className="adm-nav">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                className={`adm-nav-item ${section === item.id ? 'adm-nav-active' : ''}`}
                onClick={() => { setSection(item.id); setNavOpen(false); }}
              >
                <span className="adm-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="adm-sidebar-footer">
            <div className="adm-admin-name">Signed in as</div>
            <div className="adm-admin-name-val">{adminName}</div>
          </div>
        </aside>

        {/* ── Mobile top bar ── */}
        <div className="adm-mobile-bar">
          <button
            className="adm-hamburger"
            onClick={() => setNavOpen(v => !v)}
            aria-label="Toggle navigation"
          >
            ☰
          </button>
          <span className="adm-mobile-section-label">
            {NAV_ITEMS.find(n => n.id === section)?.icon}{' '}
            {NAV_ITEMS.find(n => n.id === section)?.label}
          </span>
          <Link href="/app" className="adm-back-link-mobile">← App</Link>
        </div>

        {/* Overlay for mobile nav */}
        {navOpen && (
          <div className="adm-nav-overlay" onClick={() => setNavOpen(false)} />
        )}

        {/* ── Main content ── */}
        <main className="adm-main">
          {section === 'overview'  && <OverviewSection />}
          {section === 'usage'     && <UsageSection />}
          {section === 'users'     && <UsersSection onToast={showToast} />}
          {section === 'lectures'  && <LecturesSection onToast={showToast} />}
          {section === 'feedback'  && <FeedbackSection onToast={showToast} />}
          {section === 'config'    && <ConfigSection onToast={showToast} />}
        </main>

        {/* ── Toast ── */}
        {toast && (
          <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />
        )}
      </div>
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const adminCss = `
/* ── Root layout ──────────────────────────────────────────────────────────── */
.adm-root {
  display: flex;
  min-height: 100vh;
  background: var(--bg, #0d0f14);
  color: var(--text, #e8eaf0);
  font-family: 'Outfit', sans-serif;
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
.adm-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--surface, #13161d);
  border-right: 1px solid var(--border, rgba(255,255,255,0.08));
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  z-index: 100;
}

.adm-sidebar-header {
  padding: 24px 20px 12px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}

.adm-back-link {
  display: inline-block;
  font-size: 12px;
  color: var(--text-muted, #6b7280);
  text-decoration: none;
  margin-bottom: 14px;
  transition: color 0.15s;
}
.adm-back-link:hover { color: var(--accent, #5b8dee); }

.adm-admin-brand {}
.adm-admin-logo {
  font-family: 'Fraunces', serif;
  font-size: 22px;
  font-weight: 700;
  color: var(--text, #e8eaf0);
}
.adm-logo-md { color: var(--accent, #5b8dee); }
.adm-admin-sub {
  font-size: 10px;
  font-family: 'DM Mono', monospace;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted, #6b7280);
  margin-top: 3px;
}

.adm-nav {
  flex: 1;
  padding: 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.adm-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  min-height: 44px;
  background: none;
  border: none;
  border-radius: 10px;
  color: var(--text-muted, #6b7280);
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.13s, color 0.13s;
}

.adm-nav-item:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text, #e8eaf0);
}

.adm-nav-active {
  background: rgba(91,141,238,0.12) !important;
  color: var(--accent, #5b8dee) !important;
  font-weight: 600;
}

.adm-nav-icon { font-size: 16px; width: 20px; text-align: center; flex-shrink: 0; }

.adm-sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.08));
}

.adm-admin-name { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.adm-admin-name-val { font-size: 13px; font-weight: 600; color: var(--text); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Mobile top bar ───────────────────────────────────────────────────────── */
.adm-mobile-bar {
  display: none;
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 56px;
  background: var(--surface, #13161d);
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 200;
}

.adm-hamburger {
  width: 44px; height: 44px;
  background: none; border: none;
  font-size: 20px; color: var(--text-muted);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}

.adm-mobile-section-label {
  font-size: 14px; font-weight: 600; color: var(--text);
}

.adm-back-link-mobile {
  font-size: 12px; color: var(--text-muted); text-decoration: none;
}

.adm-nav-overlay {
  display: none;
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 90;
}

/* ── Main content ─────────────────────────────────────────────────────────── */
.adm-main {
  flex: 1;
  min-width: 0;
  padding: 40px 48px;
  max-width: 1100px;
}

/* ── Section ──────────────────────────────────────────────────────────────── */
.adm-section {}
.adm-section-title {
  font-family: 'Fraunces', serif;
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.adm-loading {
  color: var(--text-muted);
  font-size: 14px;
  padding: 32px 0;
  text-align: center;
}

.adm-empty {
  color: var(--text-muted);
  font-size: 14px;
  padding: 32px 0;
  text-align: center;
}

/* ── Overview cards ───────────────────────────────────────────────────────── */
.adm-cards-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 0;
}

.adm-card {
  background: var(--surface, #13161d);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 16px;
  padding: 24px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.2s;
}
.adm-card:hover { border-color: rgba(255,255,255,0.14); }

.adm-card-icon { font-size: 22px; margin-bottom: 4px; }
.adm-card-value { font-family: 'DM Mono', monospace; font-size: 28px; font-weight: 500; line-height: 1; }
.adm-card-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; }

/* ── Usage ────────────────────────────────────────────────────────────────── */
.adm-usage-pills {
  display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px;
}
.adm-usage-pill {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 12px 16px;
  display: flex; flex-direction: column; gap: 3px;
}
.adm-pill-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.adm-pill-val { font-family: 'DM Mono', monospace; font-size: 18px; font-weight: 500; color: var(--text); }
.adm-pill-val.accent { color: var(--accent); }

.adm-budget-bar-wrap { margin-bottom: 28px; }
.adm-budget-bar-label { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.adm-budget-bar-track {
  height: 6px; background: rgba(255,255,255,0.07);
  border-radius: 100px; overflow: hidden;
}
.adm-budget-bar-fill {
  height: 100%; border-radius: 100px;
  transition: width 0.5s ease, background 0.3s;
}

.adm-chart-wrap {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 16px; padding: 24px;
}
.adm-chart-title { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }

/* ── Tables ───────────────────────────────────────────────────────────────── */
.adm-table-wrap {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 16px; overflow: hidden; overflow-x: auto;
}

.adm-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
}

.adm-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  background: rgba(255,255,255,0.02);
}

.adm-table td {
  padding: 13px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  vertical-align: middle;
  color: var(--text);
}

.adm-table tr:last-child td { border-bottom: none; }
.adm-table tbody tr:hover { background: rgba(255,255,255,0.02); }

.adm-mono { font-family: 'DM Mono', monospace; font-size: 12px; }
.adm-muted { color: var(--text-muted); font-size: 12px; }
.accent { color: var(--accent, #5b8dee); }

/* ── User rows ────────────────────────────────────────────────────────────── */
.adm-user-name { font-weight: 600; font-size: 13px; color: var(--text); display: flex; align-items: center; gap: 6px; }
.adm-user-email { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

.adm-badge {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 1px 8px; border-radius: 100px; font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.adm-badge-gold { background: rgba(245,158,11,0.15); color: #f59e0b; }
.adm-badge-red  { background: rgba(239,68,68,0.15);  color: #ef4444; }

.adm-count-badge {
  font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 400;
  color: var(--text-muted); background: rgba(255,255,255,0.07);
  border-radius: 100px; padding: 1px 10px;
}

.adm-select {
  background: var(--bg, #0d0f14);
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 8px; color: var(--text);
  font-family: 'Outfit', sans-serif; font-size: 12px;
  padding: 5px 8px; cursor: pointer; outline: none;
  min-height: 36px;
}
.adm-select:focus { border-color: var(--accent); }

.adm-action-row { display: flex; align-items: center; gap: 6px; }
.adm-action-btn {
  min-width: 36px; min-height: 36px; padding: 0 8px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; color: var(--text-muted); font-size: 13px;
  cursor: pointer; transition: background 0.13s, color 0.13s;
  display: flex; align-items: center; justify-content: center;
  font-family: 'DM Mono', monospace;
}
.adm-action-btn:hover { background: rgba(255,255,255,0.1); color: var(--text); }
.adm-action-btn-danger:hover { background: rgba(239,68,68,0.12); color: #ef4444; border-color: rgba(239,68,68,0.3); }

/* ── Lecture rows ─────────────────────────────────────────────────────────── */
.adm-lec-title { display: flex; align-items: center; gap: 10px; }
.adm-lec-icon { font-size: 18px; flex-shrink: 0; }
.adm-course-pill {
  display: inline-flex; padding: 3px 9px; border-radius: 100px;
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
  background: rgba(91,141,238,0.12); color: var(--accent);
  white-space: nowrap;
}

/* ── Feedback ─────────────────────────────────────────────────────────────── */
.adm-feedback-list { display: flex; flex-direction: column; gap: 8px; }

.adm-feedback-item {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; overflow: hidden;
  transition: border-color 0.15s;
}
.adm-feedback-item:hover { border-color: rgba(255,255,255,0.14); }
.adm-fb-expanded { border-color: rgba(91,141,238,0.3); }

.adm-fb-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; cursor: pointer; gap: 12px;
  min-height: 52px;
}

.adm-fb-left { display: flex; align-items: center; gap: 10px; }
.adm-fb-status-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.adm-fb-type { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.adm-fb-from { font-size: 13px; font-weight: 500; color: var(--text); }

.adm-fb-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.adm-fb-chevron { font-size: 10px; color: var(--text-muted); }

.adm-fb-body { padding: 0 18px 16px; border-top: 1px solid var(--border); padding-top: 14px; }
.adm-fb-page-url { font-size: 11px; color: var(--text-muted); margin-bottom: 10px; }
.adm-fb-message { font-size: 14px; line-height: 1.65; color: var(--text); margin-bottom: 14px; white-space: pre-wrap; }
.adm-fb-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.adm-resolved-label { font-size: 13px; color: #10b981; font-weight: 600; }

/* ── Config ───────────────────────────────────────────────────────────────── */
.adm-config-group {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 16px; padding: 24px;
}
.adm-config-group-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 20px;
  font-family: 'DM Mono', monospace;
}
.adm-config-rows { display: flex; flex-direction: column; gap: 18px; }
.adm-config-row { display: flex; flex-direction: column; gap: 6px; }
.adm-config-label { font-size: 13px; font-weight: 600; color: var(--text); }
.adm-config-input-wrap { display: flex; gap: 8px; align-items: center; }
.adm-input {
  flex: 1; max-width: 240px;
  background: var(--bg, #0d0f14);
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 10px;
  color: var(--text); font-family: 'DM Mono', monospace; font-size: 14px;
  padding: 9px 14px; outline: none; min-height: 44px;
}
.adm-input:focus { border-color: var(--accent); }
.adm-config-updated { font-size: 11px; color: var(--text-muted); }

.adm-quick-actions { display: flex; flex-direction: column; gap: 12px; }
.adm-quick-action {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
  padding: 16px;
  background: rgba(255,255,255,0.02);
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.05);
}
.adm-qa-label { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 3px; }
.adm-qa-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; max-width: 480px; }

/* ── Buttons ──────────────────────────────────────────────────────────────── */
.adm-btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 6px; padding: 9px 18px; min-height: 44px; min-width: 44px;
  border-radius: 10px; font-family: 'Outfit', sans-serif;
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  border: 1px solid transparent; white-space: nowrap;
}
.adm-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.adm-btn-primary {
  background: var(--accent, #5b8dee); color: #fff; border-color: var(--accent);
}
.adm-btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 82%, black); }

.adm-btn-ghost {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.1);
  color: var(--text-muted);
}
.adm-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: var(--text); }

.adm-btn-danger {
  background: rgba(239,68,68,0.12);
  border-color: rgba(239,68,68,0.25);
  color: #ef4444;
}
.adm-btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.2); }

/* ── Toast ────────────────────────────────────────────────────────────────── */
.adm-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  padding: 11px 22px; border-radius: 100px; font-size: 14px; font-weight: 600;
  z-index: 9999; animation: adm-toast-in 0.2s ease;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  white-space: nowrap;
}
.adm-toast-ok  { background: #10b981; color: #fff; }
.adm-toast-err { background: #ef4444; color: #fff; }
@keyframes adm-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

/* ── Confirm dialog ───────────────────────────────────────────────────────── */
.adm-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.adm-dialog {
  background: var(--surface); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 20px; padding: 32px; max-width: 420px; width: 100%;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  animation: adm-dialog-in 0.18s ease;
}
@keyframes adm-dialog-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
.adm-dialog-msg { font-size: 15px; line-height: 1.6; color: var(--text); margin-bottom: 24px; }
.adm-dialog-btns { display: flex; gap: 10px; justify-content: flex-end; }

/* ── JSON preview modal ───────────────────────────────────────────────────── */
.adm-json-modal {
  background: var(--surface); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 20px; width: 90vw; max-width: 760px; max-height: 80vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
}
.adm-json-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 24px; border-bottom: 1px solid var(--border);
}
.adm-json-title { font-size: 15px; font-weight: 600; color: var(--text); }
.adm-close-btn {
  width: 32px; height: 32px; background: none; border: none;
  color: var(--text-muted); font-size: 14px; cursor: pointer;
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
  min-width: 44px; min-height: 44px;
}
.adm-close-btn:hover { background: rgba(255,255,255,0.07); color: var(--text); }
.adm-json-body {
  flex: 1; overflow: auto; padding: 20px 24px;
  font-family: 'DM Mono', monospace; font-size: 11px; line-height: 1.7;
  color: var(--text-muted); white-space: pre-wrap; word-break: break-all;
}

/* ── Mobile responsive ────────────────────────────────────────────────────── */
@media (max-width: 767px) {
  .adm-mobile-bar { display: flex; }
  .adm-nav-overlay { display: block; }

  .adm-sidebar {
    position: fixed; left: -220px; top: 0;
    transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 150;
  }
  .adm-sidebar-open { left: 0; }

  .adm-main {
    padding: 72px 16px 32px;
    width: 100%;
  }

  .adm-cards-row { grid-template-columns: repeat(2, 1fr); }
  .adm-quick-action { flex-direction: column; align-items: flex-start; }

  .adm-table th, .adm-table td { padding: 10px 12px; }

  /* Hide less important columns on small screens */
  .adm-table th:nth-child(4),
  .adm-table td:nth-child(4) { display: none; }
}

@media (max-width: 480px) {
  .adm-cards-row { grid-template-columns: 1fr 1fr; gap: 10px; }
  .adm-card { padding: 16px 14px; }
  .adm-card-value { font-size: 22px; }
}
`;
