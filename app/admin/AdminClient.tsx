'use client';
/**
 * app/admin/AdminClient.tsx — StudyMD Admin Dashboard v2
 * Full rebuild: all 18 improvement requests implemented.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewData {
  totalUsers: number; totalLectures: number;
  callsToday: number; costToday: number; costMonth: number;
  recentApiCalls: { date: string; calls_count: number; estimated_cost: number }[];
  recentUploads: { internal_id: string; title: string; created_at: string; status: string; original_file: string | null }[];
  recentActivity: { user_name: string; action: string; lecture_title: string; ts: string }[];
}
interface UsageRow { date: string; callsCount: number; inputTokens: number; outputTokens: number; estimatedCost: number; }
interface UsageData {
  today: { callsCount: number; inputTokens: number; outputTokens: number; estimatedCost: number };
  monthToDate: { callsCount: number; estimatedCost: number };
  limits: { maxDailyCalls: number; maxDailyInputTokens: number; maxMonthlyCostUsd: number };
  history: UsageRow[];
}
interface UserRow { user_id: string; display_name: string | null; username: string | null; role: string; lectureCount: number; lastActive: string; is_primary?: boolean; theme?: string; }
interface UserLecture { internal_id: string; title: string; icon: string; visible: boolean; archived: boolean; display_order: number; }
interface UserProgress { internal_id: string; lecture_title: string; flashcard_pct: number; exam_pct: number; last_studied: string | null; }
interface Flashcard { id: string; question: string; answer: string; topic: string; slide_number?: number | null; }
interface ExamQuestion { id: string; type: string; question: string; options?: string[]; correct_answer: string; topic: string; explanation?: string; }
interface LectureRow {
  internal_id: string; title: string; subtitle: string | null; course: string;
  created_at: string; slide_count: number; original_file: string | null;
  flashcard_count: number; question_count: number; icon: string; color: string;
  flashcards?: Flashcard[]; questions?: ExamQuestion[];
}
interface FeedbackRow { id: string; user_id: string | null; user_name: string; type: string; message: string; page_url: string | null; status: 'new' | 'reviewed' | 'resolved'; created_at: string; }
interface ConfigRow { key: string; value: unknown; updated_at: string; }
type Section = 'overview' | 'usage' | 'users' | 'lectures' | 'feedback' | 'config' | 'progress';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) { return `$${n.toFixed(4)}`; }
function fmtDate(iso: string) { if (!iso) return '—'; return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtDateShort(iso: string) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtTime(iso: string) { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(path, opts);
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? `HTTP ${r.status}`); }
  return r.json();
}
function genId() {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined') crypto.getRandomValues(bytes);
  return 'lec_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function Toast({ msg, type, onDone }: { msg: string; type: 'ok' | 'err'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone]);
  return <div className={`adm-toast adm-toast-${type}`}>{msg}</div>;
}

function Confirm({ msg, onConfirm, onCancel, danger = true }: { msg: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="adm-overlay">
      <div className="adm-dialog">
        <p className="adm-dialog-msg">{msg}</p>
        <div className="adm-dialog-btns">
          <button className="adm-btn adm-btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={`adm-btn ${danger ? 'adm-btn-danger' : 'adm-btn-primary'}`} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

function Btn({ onClick, tip, variant = 'default', children, disabled }: {
  onClick: () => void; tip: string; variant?: 'default' | 'danger' | 'primary'; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button className={`adm-action-btn adm-action-btn-${variant}`} onClick={onClick} aria-label={tip} data-tip={tip} disabled={disabled}>
      {children}
    </button>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewSection({ onNav }: { onNav: (s: Section) => void }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { apiFetch('/api/admin/overview').then(setData).catch(console.error).finally(() => setLoading(false)); }, []);

  const cards = data ? [
    { label: 'Total Users',     value: String(data.totalUsers),   icon: '👤', accent: 'var(--accent)', nav: 'users' as Section },
    { label: 'Total Lectures',  value: String(data.totalLectures), icon: '📚', accent: '#8b5cf6',      nav: 'lectures' as Section },
    { label: 'API Calls Today', value: String(data.callsToday),   icon: '⚡', accent: '#f59e0b',      nav: 'usage' as Section },
    { label: 'Cost This Month', value: fmt$(data.costMonth),      icon: '💰', accent: '#10b981',      nav: 'usage' as Section },
  ] : [];

  return (
    <div className="adm-section">
      <h2 className="adm-section-title">Overview</h2>
      {loading ? <div className="adm-loading">Loading…</div> : (
        <>
          <div className="adm-cards-row">
            {cards.map(c => (
              <button key={c.label} className="adm-card adm-card-btn" onClick={() => onNav(c.nav)}>
                <div className="adm-card-icon">{c.icon}</div>
                <div className="adm-card-value" style={{ color: c.accent }}>{c.value}</div>
                <div className="adm-card-label">{c.label} →</div>
              </button>
            ))}
          </div>
          <div className="adm-overview-cols">
            <div className="adm-ov-col">
              <div className="adm-ov-col-title">⚡ Recent API Calls</div>
              {(data?.recentApiCalls ?? []).length === 0 ? <div className="adm-empty" style={{ padding: '12px 0' }}>No calls yet</div>
                : data?.recentApiCalls.map((r, i) => (
                  <div key={i} className="adm-ov-row">
                    <span className="adm-mono" style={{ fontSize: 11 }}>{r.date}</span>
                    <span>{r.calls_count} calls</span>
                    <span className="accent">{fmt$(r.estimated_cost)}</span>
                  </div>
                ))}
            </div>
            <div className="adm-ov-col">
              <div className="adm-ov-col-title">📤 Recent Uploads</div>
              {(data?.recentUploads ?? []).length === 0 ? <div className="adm-empty" style={{ padding: '12px 0' }}>No uploads yet</div>
                : data?.recentUploads.map((u, i) => (
                  <div key={i} className="adm-ov-row">
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{u.title}</span>
                    <span className={`adm-status-badge adm-status-${u.status}`}>{u.status}</span>
                    <span className="adm-muted">{fmtDateShort(u.created_at)}</span>
                  </div>
                ))}
            </div>
            <div className="adm-ov-col">
              <div className="adm-ov-col-title">🏃 User Activity</div>
              {(data?.recentActivity ?? []).length === 0 ? <div className="adm-empty" style={{ padding: '12px 0' }}>No activity yet</div>
                : data?.recentActivity.map((a, i) => (
                  <div key={i} className="adm-ov-row adm-ov-row-col">
                    <span style={{ fontSize: 12 }}><strong>{a.user_name}</strong> {a.action} <span className="accent">{a.lecture_title}</span></span>
                    <span className="adm-muted">{a.ts ? fmtTime(a.ts) : '—'}</span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── API Usage ────────────────────────────────────────────────────────────────

function UsageSection() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { apiFetch('/api/usage').then(setData).catch(console.error).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="adm-section"><div className="adm-loading">Loading…</div></div>;
  if (!data) return <div className="adm-section"><p className="adm-empty">No usage data.</p></div>;

  const chartData = data.history.map(r => ({ date: fmtDateShort(r.date), cost: r.estimatedCost }));
  const pct = data.limits.maxMonthlyCostUsd > 0 ? Math.min(100, (data.monthToDate.estimatedCost / data.limits.maxMonthlyCostUsd) * 100) : 0;

  return (
    <div className="adm-section">
      <h2 className="adm-section-title">API Usage</h2>
      <div className="adm-usage-pills">
        {[
          { label: 'Today calls', val: String(data.today.callsCount) },
          { label: 'Today cost',  val: fmt$(data.today.estimatedCost) },
          { label: 'Month cost',  val: fmt$(data.monthToDate.estimatedCost), accent: true },
          { label: 'Limit',       val: fmt$(data.limits.maxMonthlyCostUsd) },
        ].map(p => (
          <div key={p.label} className="adm-usage-pill">
            <span className="adm-pill-label">{p.label}</span>
            <span className={`adm-pill-val${p.accent ? ' accent' : ''}`}>{p.val}</span>
          </div>
        ))}
      </div>
      <div className="adm-budget-bar-wrap">
        <div className="adm-budget-bar-label">Monthly budget: {pct.toFixed(1)}% used</div>
        <div className="adm-budget-bar-track">
          <div className="adm-budget-bar-fill" style={{ width: `${pct}%`, background: pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : 'var(--accent)' }} />
        </div>
      </div>
      {chartData.length > 0 && (
        <div className="adm-chart-wrap">
          <div className="adm-chart-title">Daily API Cost — last 30 days</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(3)}`} width={64} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--text)', fontSize: 12 }} formatter={(val: number) => [`$${val.toFixed(4)}`, 'Cost']} />
              <Line type="monotone" dataKey="cost" stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.history.length > 0 && (
        <div className="adm-table-wrap" style={{ marginTop: 24 }}>
          <table className="adm-table">
            <thead><tr><th>Date</th><th>Calls</th><th>Input Tokens</th><th>Output Tokens</th><th>Cost</th></tr></thead>
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

// ─── Users ────────────────────────────────────────────────────────────────────

function UsersSection({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [userLectures, setUserLectures] = useState<Record<string, UserLecture[]>>({});
  const [userProgress, setUserProgress] = useState<Record<string, UserProgress[]>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', display_name: '', role: 'user' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/admin/users').then(d => setUsers(d.users ?? [])).catch(e => onToast(e.message, 'err')).finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  async function toggleExpand(userId: string) {
    if (expanded === userId) { setExpanded(null); return; }
    setExpanded(userId);
    if (!userLectures[userId]) {
      const [lec, prog] = await Promise.all([
        apiFetch(`/api/admin/users/lectures?userId=${userId}`).catch(() => ({ lectures: [] })),
        apiFetch(`/api/admin/users/progress?userId=${userId}`).catch(() => ({ progress: [] })),
      ]);
      setUserLectures(p => ({ ...p, [userId]: lec.lectures ?? [] }));
      setUserProgress(p => ({ ...p, [userId]: prog.progress ?? [] }));
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    try { await apiFetch('/api/admin/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role }) }); onToast('Role updated.', 'ok'); load(); }
    catch (e: any) { onToast(e.message, 'err'); }
  }

  async function handleThemeChange(userId: string, theme: string) {
    try { await apiFetch('/api/admin/users/theme', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, theme }) }); onToast('Theme updated.', 'ok'); load(); }
    catch (e: any) { onToast(e.message, 'err'); }
  }

  async function handleDelete(userId: string) {
    try { await apiFetch(`/api/admin/users?userId=${userId}`, { method: 'DELETE' }); onToast('User deleted.', 'ok'); setConfirm(null); load(); }
    catch (e: any) { onToast(e.message, 'err'); setConfirm(null); }
  }

  async function handleCreate() {
    setCreating(true);
    try { await apiFetch('/api/admin/users/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) }); onToast('User created.', 'ok'); setCreateOpen(false); setNewUser({ email: '', password: '', display_name: '', role: 'user' }); load(); }
    catch (e: any) { onToast(e.message, 'err'); }
    setCreating(false);
  }

  async function handleLecVisibility(userId: string, internalId: string, visible: boolean) {
    try {
      await apiFetch('/api/lectures/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, internalId, updates: { visible } }) });
      onToast(visible ? 'Lecture shown.' : 'Lecture hidden.', 'ok');
      setUserLectures(p => ({ ...p, [userId]: (p[userId] ?? []).map(l => l.internal_id === internalId ? { ...l, visible } : l) }));
    } catch (e: any) { onToast(e.message, 'err'); }
  }

  return (
    <div className="adm-section">
      <div className="adm-section-header-row">
        <h2 className="adm-section-title">Users <span className="adm-count-badge">{users.length}</span></h2>
        <button className="adm-btn adm-btn-primary" onClick={() => setCreateOpen(true)}>+ New User</button>
      </div>
      {loading ? <div className="adm-loading">Loading…</div> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Name</th><th>Role</th><th>Theme</th><th>Lectures</th><th>Last Active</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map(u => (
                <React.Fragment key={u.user_id}>
                  <tr className={expanded === u.user_id ? 'adm-row-expanded' : ''}>
                    <td>
                      <div className="adm-user-name">{u.display_name || u.username || '—'}{u.is_primary && <span className="adm-badge adm-badge-gold">Primary</span>}</div>
                      <div className="adm-user-email">{u.username}</div>
                    </td>
                    <td>
                      <select className="adm-select" value={u.role} onChange={e => handleRoleChange(u.user_id, e.target.value)}>
                        <option value="user">user</option><option value="admin">admin</option>
                        <option value="student">student</option><option value="demo">demo</option>
                      </select>
                    </td>
                    <td>
                      <select className="adm-select" value={u.theme ?? 'midnight'} onChange={e => handleThemeChange(u.user_id, e.target.value)}>
                        <option value="midnight">🌑 Midnight</option><option value="pink">🌸 Pink</option><option value="forest">🌲 Forest</option>
                      </select>
                    </td>
                    <td>{u.lectureCount}</td>
                    <td className="adm-muted">{fmtDate(u.lastActive)}</td>
                    <td>
                      <div className="adm-action-row">
                        <Btn onClick={() => toggleExpand(u.user_id)} tip={expanded === u.user_id ? 'Collapse' : 'View lectures & progress'}>{expanded === u.user_id ? '▲' : '▼'}</Btn>
                        <Btn onClick={() => setConfirm(u.user_id)} tip="Delete user" variant="danger">🗑</Btn>
                      </div>
                    </td>
                  </tr>
                  {expanded === u.user_id && (
                    <tr><td colSpan={6} className="adm-user-detail-cell">
                      <div className="adm-user-detail">
                        <div className="adm-user-detail-col">
                          <div className="adm-detail-label">📚 Lectures</div>
                          {(userLectures[u.user_id] ?? []).length === 0 ? <div className="adm-muted">No lectures</div>
                            : userLectures[u.user_id].map(l => (
                              <div key={l.internal_id} className="adm-user-lec-row">
                                <span>{l.icon} {l.title}</span>
                                <div className="adm-action-row">
                                  {l.archived && <span className="adm-badge adm-badge-gold">archived</span>}
                                  <Btn onClick={() => handleLecVisibility(u.user_id, l.internal_id, !l.visible)} tip={l.visible ? 'Hide from user' : 'Show to user'}>{l.visible ? '👁' : '🙈'}</Btn>
                                </div>
                              </div>
                            ))}
                        </div>
                        <div className="adm-user-detail-col">
                          <div className="adm-detail-label">📈 Progress</div>
                          {(userProgress[u.user_id] ?? []).length === 0 ? <div className="adm-muted">No progress yet</div>
                            : userProgress[u.user_id].map(p => (
                              <div key={p.internal_id} className="adm-user-prog-row">
                                <span style={{ fontSize: 12, flex: 1 }}>{p.lecture_title}</span>
                                <span className="accent">{p.flashcard_pct}%</span>
                                <span style={{ color: '#8b5cf6' }}>{p.exam_pct}%</span>
                                {p.last_studied && <span className="adm-muted">{fmtDate(p.last_studied)}</span>}
                              </div>
                            ))}
                        </div>
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirm && <Confirm msg="Permanently delete this user and all their data?" onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}
      {createOpen && (
        <div className="adm-overlay"><div className="adm-dialog" style={{ maxWidth: 460 }}>
          <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, marginBottom: 20 }}>Create New User</h3>
          {[{ f: 'email', l: 'Email', t: 'text' }, { f: 'password', l: 'Password', t: 'password' }, { f: 'display_name', l: 'Display Name', t: 'text' }].map(({ f, l, t }) => (
            <div key={f} className="adm-form-field">
              <label className="adm-form-label">{l}</label>
              <input className="adm-input" style={{ maxWidth: '100%' }} type={t} value={(newUser as any)[f]} onChange={e => setNewUser(p => ({ ...p, [f]: e.target.value }))} />
            </div>
          ))}
          <div className="adm-form-field">
            <label className="adm-form-label">Role</label>
            <select className="adm-select" value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
              <option value="user">user</option><option value="student">student</option><option value="admin">admin</option>
            </select>
          </div>
          <div className="adm-dialog-btns" style={{ marginTop: 20 }}>
            <button className="adm-btn adm-btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="adm-btn adm-btn-primary" onClick={handleCreate} disabled={creating || !newUser.email || !newUser.password}>{creating ? 'Creating…' : 'Create User'}</button>
          </div>
        </div></div>
      )}
    </div>
  );
}

// ─── Lectures ─────────────────────────────────────────────────────────────────

const COURSES = ['Physical Diagnosis I', 'Anatomy & Physiology', 'Laboratory Diagnosis'];

function LecturesSection({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [lectures, setLectures] = useState<LectureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Record<string, 'meta' | 'flashcards' | 'questions' | 'json'>>({});
  const [ef, setEf] = useState<Record<string, any>>({});
  const [jsonEdit, setJsonEdit] = useState<Record<string, string>>({});
  const [jsonErr, setJsonErr] = useState<Record<string, string>>({});
  const [idOverride, setIdOverride] = useState<{ id: string; newId: string; password: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addJson, setAddJson] = useState('');
  const [addErr, setAddErr] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/admin/lectures').then(d => setLectures(d.lectures ?? [])).catch(e => onToast(e.message, 'err')).finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  async function toggleExpand(l: LectureRow) {
    if (expanded === l.internal_id) { setExpanded(null); return; }
    setExpanded(l.internal_id);
    if (!l.flashcards) {
      const data = await apiFetch(`/api/admin/lectures/detail?id=${l.internal_id}`).catch(() => null);
      if (data) setLectures(prev => prev.map(x => x.internal_id === l.internal_id ? { ...x, ...data } : x));
    }
    if (!tab[l.internal_id]) setTab(p => ({ ...p, [l.internal_id]: 'meta' }));
    if (!ef[l.internal_id]) setEf(p => ({ ...p, [l.internal_id]: { title: l.title, subtitle: l.subtitle ?? '', course: l.course, color: l.color, icon: l.icon } }));
  }

  async function saveMeta(id: string) {
    try { await apiFetch(`/api/admin/lectures/detail?id=${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: ef[id] }) }); onToast('Saved.', 'ok'); load(); }
    catch (e: any) { onToast(e.message, 'err'); }
  }

  async function saveJson(id: string) {
    try {
      const parsed = JSON.parse(jsonEdit[id]);
      await apiFetch(`/api/admin/lectures/detail?id=${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonData: parsed }) });
      onToast('JSON saved.', 'ok'); setJsonErr(p => ({ ...p, [id]: '' })); load();
    } catch (e: any) { setJsonErr(p => ({ ...p, [id]: e.message })); onToast('Save failed', 'err'); }
  }

  async function regenId(id: string) {
    const newId = genId();
    try { await apiFetch('/api/admin/lectures/regen-id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldId: id, newId }) }); onToast(`New ID: ${newId}`, 'ok'); setExpanded(null); load(); }
    catch (e: any) { onToast(e.message, 'err'); }
  }

  async function manualId(id: string, newId: string, password: string) {
    try { await apiFetch('/api/admin/lectures/regen-id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldId: id, newId, password }) }); onToast(`ID → ${newId}`, 'ok'); setIdOverride(null); setExpanded(null); load(); }
    catch (e: any) { onToast(e.message, 'err'); }
  }

  async function saveCard(id: string, type: 'flashcard' | 'question', item: any) {
    try {
      await apiFetch(`/api/admin/lectures/card?id=${id}&type=${type}&cardId=${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item }) });
      onToast('Saved.', 'ok');
      setLectures(prev => prev.map(l => {
        if (l.internal_id !== id) return l;
        if (type === 'flashcard') return { ...l, flashcards: (l.flashcards ?? []).map(f => f.id === item.id ? item : f) };
        return { ...l, questions: (l.questions ?? []).map(q => q.id === item.id ? item : q) };
      }));
    } catch (e: any) { onToast(e.message, 'err'); }
  }

  async function deleteLecture(id: string) {
    try { await apiFetch(`/api/admin/lectures?id=${id}`, { method: 'DELETE' }); onToast('Deleted.', 'ok'); setConfirm(null); load(); }
    catch (e: any) { onToast(e.message, 'err'); setConfirm(null); }
  }

  async function addLecture() {
    try {
      const parsed = JSON.parse(addJson);
      await apiFetch('/api/admin/lectures/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lecture: parsed }) });
      onToast('Lecture added.', 'ok'); setAddOpen(false); setAddJson(''); load();
    } catch (e: any) { setAddErr(e.message); }
  }

  const currentTab = (id: string) => tab[id] ?? 'meta';
  const currentEf = (id: string) => ef[id] ?? {};

  return (
    <div className="adm-section">
      <div className="adm-section-header-row">
        <h2 className="adm-section-title">Lectures <span className="adm-count-badge">{lectures.length}</span></h2>
        <button className="adm-btn adm-btn-primary" onClick={() => setAddOpen(true)}>+ Add via JSON</button>
      </div>

      {loading ? <div className="adm-loading">Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lectures.map(l => {
            const isOpen = expanded === l.internal_id;
            const t = currentTab(l.internal_id);
            const fields = currentEf(l.internal_id);
            return (
              <div key={l.internal_id} className={`adm-lec-card ${isOpen ? 'adm-lec-card-open' : ''}`}>
                <div className="adm-lec-row" onClick={() => toggleExpand(l)}>
                  <span className="adm-lec-row-icon">{l.icon}</span>
                  <div className="adm-lec-row-info">
                    <div className="adm-lec-row-title">{l.title}</div>
                    <div className="adm-lec-row-meta">
                      <span className="adm-course-pill">{l.course}</span>
                      <span className="adm-id-pill"><span className="adm-id-pill-label">id</span>{l.internal_id}</span>
                      {l.original_file && <span className="adm-id-pill"><span className="adm-id-pill-label">file</span>{l.original_file}</span>}
                    </div>
                  </div>
                  <div className="adm-lec-row-counts">
                    <span className="accent">{l.flashcard_count}c</span>
                    <span style={{ color: '#8b5cf6' }}>{l.question_count}q</span>
                    <span className="adm-muted">{l.slide_count}s</span>
                  </div>
                  <div className="adm-action-row" onClick={e => e.stopPropagation()}>
                    <Btn onClick={() => setConfirm(l.internal_id)} tip="Delete lecture" variant="danger">🗑</Btn>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="adm-lec-detail">
                    <div className="adm-lec-tabs">
                      {(['meta', 'flashcards', 'questions', 'json'] as const).map(tabId => (
                        <button key={tabId} className={`adm-lec-tab ${t === tabId ? 'active' : ''}`}
                          onClick={() => setTab(p => ({ ...p, [l.internal_id]: tabId }))}>
                          {{ meta: '⚙️ Info', flashcards: `📇 Cards (${l.flashcard_count})`, questions: `📝 Questions (${l.question_count})`, json: '{ } JSON' }[tabId]}
                        </button>
                      ))}
                    </div>

                    {t === 'meta' && (
                      <div className="adm-meta-grid">
                        <div className="adm-meta-field adm-meta-field-full">
                          <label className="adm-form-label">internal_id <span className="adm-id-badge">system identifier — auto-generated on upload</span></label>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <code className="adm-id-code">{l.internal_id}</code>
                            <Btn onClick={() => regenId(l.internal_id)} tip="Generate a new random internal_id (safe — updates all references)">🔄 Regen</Btn>
                            <Btn onClick={() => setIdOverride({ id: l.internal_id, newId: '', password: '' })} tip="Manually override internal_id (requires password)" variant="danger">✏️ Override</Btn>
                          </div>
                          {l.original_file && (
                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="adm-form-label" style={{ margin: 0 }}>original file</span>
                              <code className="adm-id-code">{l.original_file}</code>
                            </div>
                          )}
                        </div>
                        {(['title', 'subtitle', 'icon'] as const).map(f => (
                          <div key={f} className="adm-meta-field">
                            <label className="adm-form-label">{f}</label>
                            <input className="adm-input" style={{ maxWidth: '100%' }} value={String(fields[f] ?? '')}
                              onChange={e => setEf(p => ({ ...p, [l.internal_id]: { ...p[l.internal_id], [f]: e.target.value } }))} />
                          </div>
                        ))}
                        <div className="adm-meta-field">
                          <label className="adm-form-label">course</label>
                          <select className="adm-select" style={{ minWidth: 220 }} value={String(fields.course ?? l.course)}
                            onChange={e => setEf(p => ({ ...p, [l.internal_id]: { ...p[l.internal_id], course: e.target.value } }))}>
                            {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="adm-meta-field">
                          <label className="adm-form-label">default color</label>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="color" value={String(fields.color ?? l.color)}
                              onChange={e => setEf(p => ({ ...p, [l.internal_id]: { ...p[l.internal_id], color: e.target.value } }))}
                              style={{ width: 44, height: 44, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8 }} />
                            <code className="adm-id-code">{String(fields.color ?? l.color)}</code>
                          </div>
                        </div>
                        <div className="adm-meta-field adm-meta-field-full">
                          <button className="adm-btn adm-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => saveMeta(l.internal_id)}>Save Changes</button>
                        </div>
                      </div>
                    )}

                    {t === 'flashcards' && (
                      <CardGrid items={l.flashcards ?? []} type="flashcard" slideCount={l.slide_count} onSave={item => saveCard(l.internal_id, 'flashcard', item)} />
                    )}

                    {t === 'questions' && (
                      <CardGrid items={l.questions ?? []} type="question" slideCount={l.slide_count} onSave={item => saveCard(l.internal_id, 'question', item)} />
                    )}

                    {t === 'json' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Direct edit of the <code>json_data</code> JSONB column. Must be valid JSON with <code>flashcards[]</code> and <code>questions[]</code> arrays.
                        </p>
                        <textarea className="adm-json-textarea" rows={24} spellCheck={false}
                          value={jsonEdit[l.internal_id] ?? JSON.stringify({ flashcards: l.flashcards ?? [], questions: l.questions ?? [] }, null, 2)}
                          onChange={e => setJsonEdit(p => ({ ...p, [l.internal_id]: e.target.value }))} />
                        {jsonErr[l.internal_id] && <div style={{ color: '#ef4444', fontSize: 12 }}>{jsonErr[l.internal_id]}</div>}
                        <button className="adm-btn adm-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => saveJson(l.internal_id)}>Save JSON</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirm && <Confirm msg="Delete this lecture, its slides from storage, and all user settings for it?" onConfirm={() => deleteLecture(confirm)} onCancel={() => setConfirm(null)} />}

      {idOverride && (
        <div className="adm-overlay"><div className="adm-dialog" style={{ maxWidth: 440 }}>
          <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, marginBottom: 12 }}>Override internal_id</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            ⚠️ Changing the internal_id will affect slide image paths and all user settings. Use Regen instead if possible.
          </p>
          <div className="adm-form-field"><label className="adm-form-label">New ID (format: lec_xxxxxxxx)</label>
            <input className="adm-input" style={{ maxWidth: '100%' }} placeholder="lec_xxxxxxxx" value={idOverride.newId}
              onChange={e => setIdOverride(p => p ? { ...p, newId: e.target.value } : null)} />
          </div>
          <div className="adm-form-field"><label className="adm-form-label">Admin password (required)</label>
            <input className="adm-input" style={{ maxWidth: '100%' }} type="password" value={idOverride.password}
              onChange={e => setIdOverride(p => p ? { ...p, password: e.target.value } : null)} />
          </div>
          <div className="adm-dialog-btns" style={{ marginTop: 20 }}>
            <button className="adm-btn adm-btn-ghost" onClick={() => setIdOverride(null)}>Cancel</button>
            <button className="adm-btn adm-btn-danger" onClick={() => manualId(idOverride.id, idOverride.newId, idOverride.password)}
              disabled={!idOverride.newId || !idOverride.password}>Override</button>
          </div>
        </div></div>
      )}

      {addOpen && (
        <div className="adm-overlay"><div className="adm-dialog" style={{ maxWidth: 620, width: '90vw' }}>
          <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, marginBottom: 8 }}>Add Lecture via JSON</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Paste a full lecture JSON. Required: <code>title</code>, <code>course</code>, <code>icon</code>, <code>color</code>. <code>internal_id</code> is auto-generated if omitted.
          </p>
          <textarea className="adm-json-textarea" rows={14} value={addJson} spellCheck={false}
            onChange={e => { setAddJson(e.target.value); setAddErr(''); }}
            placeholder={'{\n  "title": "Lecture Name",\n  "course": "Physical Diagnosis I",\n  "icon": "🫁",\n  "color": "#5b8dee",\n  "json_data": { "flashcards": [], "questions": [] }\n}'} />
          {addErr && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{addErr}</div>}
          <div className="adm-dialog-btns" style={{ marginTop: 14 }}>
            <button className="adm-btn adm-btn-ghost" onClick={() => { setAddOpen(false); setAddErr(''); }}>Cancel</button>
            <button className="adm-btn adm-btn-primary" onClick={addLecture} disabled={!addJson.trim()}>Add Lecture</button>
          </div>
        </div></div>
      )}
    </div>
  );
}

// ─── Card Grid ────────────────────────────────────────────────────────────────

function CardGrid({ items, type, slideCount, onSave }: {
  items: any[]; type: 'flashcard' | 'question'; slideCount: number; onSave: (item: any) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, any>>({});

  function startEdit(item: any) { setEdits(p => ({ ...p, [item.id]: { ...item } })); setEditing(item.id); }
  function field(id: string, f: string, v: any) { setEdits(p => ({ ...p, [id]: { ...p[id], [f]: v } })); }

  if (items.length === 0) return <div className="adm-empty">No {type === 'flashcard' ? 'flashcards' : 'questions'} yet.</div>;

  return (
    <div className="adm-card-grid">
      {items.map(item => {
        const isEd = editing === item.id;
        const ed = edits[item.id] ?? item;
        return (
          <div key={item.id} className={`adm-content-card ${isEd ? 'adm-content-card-editing' : ''}`}>
            <div className="adm-content-card-header">
              <span className="adm-mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.topic}</span>
              {item.slide_number != null && <span className="adm-slide-link">slide {item.slide_number}</span>}
            </div>
            {type === 'flashcard' ? (
              isEd ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="adm-form-label">Question</label>
                  <textarea className="adm-input adm-textarea-sm" value={ed.question ?? ''} onChange={e => field(item.id, 'question', e.target.value)} />
                  <label className="adm-form-label">Answer</label>
                  <textarea className="adm-input adm-textarea-sm" value={ed.answer ?? ''} onChange={e => field(item.id, 'answer', e.target.value)} />
                  <label className="adm-form-label">Link to slide #</label>
                  <input className="adm-input" style={{ maxWidth: 80 }} type="number" min={1} max={slideCount}
                    value={ed.slide_number ?? ''} onChange={e => field(item.id, 'slide_number', e.target.value ? Number(e.target.value) : null)} />
                </div>
              ) : (
                <><div className="adm-card-q">{item.question}</div><div className="adm-card-a">{item.answer}</div></>
              )
            ) : (
              isEd ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="adm-form-label">Question</label>
                  <textarea className="adm-input adm-textarea-sm" value={ed.question ?? ''} onChange={e => field(item.id, 'question', e.target.value)} />
                  <label className="adm-form-label">Correct Answer</label>
                  <input className="adm-input" style={{ maxWidth: '100%' }} value={ed.correct_answer ?? ''} onChange={e => field(item.id, 'correct_answer', e.target.value)} />
                  <label className="adm-form-label">Type</label>
                  <select className="adm-select" value={ed.type ?? 'mcq'} onChange={e => field(item.id, 'type', e.target.value)}>
                    <option value="mcq">MCQ</option><option value="tf">True/False</option>
                    <option value="matching">Matching</option><option value="fillin">Fill-in</option>
                  </select>
                  <label className="adm-form-label">Explanation</label>
                  <textarea className="adm-input adm-textarea-sm" value={ed.explanation ?? ''} onChange={e => field(item.id, 'explanation', e.target.value)} />
                </div>
              ) : (
                <><div className="adm-card-q">{item.question}</div><div className="adm-card-a">✓ {item.correct_answer}</div>{item.type && <span className="adm-q-type-badge">{item.type}</span>}</>
              )
            )}
            <div className="adm-content-card-footer">
              {isEd ? (
                <>
                  <button className="adm-btn adm-btn-ghost" style={{ fontSize: 12, padding: '6px 12px', minHeight: 32 }} onClick={() => setEditing(null)}>Cancel</button>
                  <button className="adm-btn adm-btn-primary" style={{ fontSize: 12, padding: '6px 12px', minHeight: 32 }} onClick={() => { onSave(ed); setEditing(null); }}>Save</button>
                </>
              ) : (
                <Btn onClick={() => startEdit(item)} tip="Edit this card">✏️</Btn>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Progress ─────────────────────────────────────────────────────────────────

function ProgressSection({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selected, setSelected] = useState('');
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { apiFetch('/api/admin/users').then(d => { setUsers(d.users ?? []); if (d.users?.[0]) setSelected(d.users[0].user_id); }).catch(console.error); }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    apiFetch(`/api/admin/users/progress?userId=${selected}`).then(d => setProgress(d.progress ?? [])).catch(e => onToast(e.message, 'err')).finally(() => setLoading(false));
  }, [selected, onToast]);

  const user = users.find(u => u.user_id === selected);

  return (
    <div className="adm-section">
      <h2 className="adm-section-title">Progress Dashboard</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <span className="adm-form-label" style={{ margin: 0 }}>Viewing:</span>
        <select className="adm-select" value={selected} onChange={e => setSelected(e.target.value)}>
          {users.map(u => <option key={u.user_id} value={u.user_id}>{u.display_name || u.username}</option>)}
        </select>
      </div>
      {loading ? <div className="adm-loading">Loading…</div> : progress.length === 0 ? (
        <p className="adm-empty">No progress data for {user?.display_name ?? 'this user'} yet.</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Lecture</th><th>Flashcard Progress</th><th>Exam Progress</th><th>Last Studied</th></tr></thead>
            <tbody>
              {progress.map(p => (
                <tr key={p.internal_id}>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{p.lecture_title}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 100, overflow: 'hidden', minWidth: 80 }}>
                        <div style={{ height: '100%', width: `${p.flashcard_pct}%`, background: 'var(--accent)', borderRadius: 100 }} />
                      </div>
                      <span className="adm-mono accent" style={{ fontSize: 12 }}>{p.flashcard_pct}%</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 100, overflow: 'hidden', minWidth: 80 }}>
                        <div style={{ height: '100%', width: `${p.exam_pct}%`, background: '#8b5cf6', borderRadius: 100 }} />
                      </div>
                      <span className="adm-mono" style={{ fontSize: 12, color: '#8b5cf6' }}>{p.exam_pct}%</span>
                    </div>
                  </td>
                  <td className="adm-muted">{p.last_studied ? fmtDate(p.last_studied) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = { new: '#ef4444', reviewed: '#f59e0b', resolved: '#10b981' };

function FeedbackSection({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/admin/feedback').then(d => setItems(d.feedback ?? [])).catch(e => onToast(e.message, 'err')).finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: string) {
    try { await apiFetch('/api/admin/feedback', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); onToast(`Marked ${status}.`, 'ok'); load(); }
    catch (e: any) { onToast(e.message, 'err'); }
  }

  const newCount = items.filter(i => i.status === 'new').length;

  return (
    <div className="adm-section">
      <h2 className="adm-section-title">Feedback Inbox {newCount > 0 && <span className="adm-badge adm-badge-red">{newCount} new</span>}</h2>

      {/* Feedback form spec */}
      <div className="adm-config-group" style={{ marginBottom: 24 }}>
        <div className="adm-config-group-title">📋 Feedback Widget Spec (FeedbackWidget.tsx — not yet built)</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 12 }}>
          When built, <code>components/FeedbackWidget.tsx</code> should submit to Supabase directly. Submissions appear in this inbox automatically.
        </p>
        <pre className="adm-spec-block">{`// Submit payload from FeedbackWidget.tsx:
await supabase.from('feedback').insert({
  user_id: session.user.id,   // or null if anonymous
  type: 'Bug Report' | 'Suggestion' | 'Content Error' | 'Other',
  message: string,            // max 2000 chars
  page_url: window.location.pathname,
  // status defaults to 'new' in DB
})

// Widget UI — floating button bottom-left:
// 1. Type selector (radio or select)
// 2. Message textarea (required)
// 3. Page URL (auto-filled, editable)
// 4. Submit → success toast "Thanks for your feedback!"
// 5. Error state → show error message inline`}</pre>
      </div>

      {loading ? <div className="adm-loading">Loading…</div> : items.length === 0 ? (
        <p className="adm-empty">No feedback yet. 🎉</p>
      ) : (
        <div className="adm-feedback-list">
          {items.map(fb => (
            <div key={fb.id} className={`adm-feedback-item ${expanded === fb.id ? 'adm-fb-expanded' : ''}`}>
              <div className="adm-fb-header" role="button" tabIndex={0} onClick={() => setExpanded(expanded === fb.id ? null : fb.id)}
                onKeyDown={e => { if (e.key === 'Enter') setExpanded(expanded === fb.id ? null : fb.id); }}>
                <div className="adm-fb-left">
                  <span className="adm-fb-status-dot" style={{ background: STATUS_COLORS[fb.status] ?? '#6b7280' }} />
                  <span className="adm-fb-type">{fb.type}</span>
                  <span className="adm-fb-from">{fb.user_name}</span>
                </div>
                <div className="adm-fb-right">
                  <span className="adm-muted" style={{ fontSize: 11 }}>{fmtDate(fb.created_at)}</span>
                  <span className="adm-fb-chevron">{expanded === fb.id ? '▲' : '▼'}</span>
                </div>
              </div>
              {expanded === fb.id && (
                <div className="adm-fb-body">
                  {fb.page_url && <div className="adm-fb-page-url">Page: <span className="adm-mono">{fb.page_url}</span></div>}
                  <p className="adm-fb-message">{fb.message}</p>
                  <div className="adm-fb-actions">
                    {fb.status === 'new' && <button className="adm-btn adm-btn-ghost" onClick={() => setStatus(fb.id, 'reviewed')}>Mark Reviewed</button>}
                    {fb.status !== 'resolved' && <button className="adm-btn adm-btn-primary" onClick={() => setStatus(fb.id, 'resolved')}>✓ Resolve</button>}
                    {fb.status === 'resolved' && <span className="adm-resolved-label">✓ Resolved</span>}
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

// ─── Config ───────────────────────────────────────────────────────────────────

function ConfigSection({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [config, setConfig] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState('');
  const [storageInfo, setStorageInfo] = useState<{ slidesCount: number; uploadsCount: number } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/admin/config').then(d => {
      setConfig(d.config ?? []);
      const init: Record<string, string> = {};
      (d.config ?? []).forEach((r: ConfigRow) => { init[r.key] = String(r.value ?? ''); });
      setEdits(init);
      setStorageInfo(d.storageInfo ?? null);
    }).catch(e => onToast(e.message, 'err')).finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  function getVal(key: string, def = '') { return edits[key] ?? String(config.find(r => r.key === key)?.value ?? def); }

  async function save(key: string) {
    setSaving(s => ({ ...s, [key]: true }));
    try { await apiFetch('/api/admin/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value: Number(edits[key]) || edits[key] }) }); onToast('Saved.', 'ok'); load(); }
    catch (e: any) { onToast(e.message, 'err'); }
    setSaving(s => ({ ...s, [key]: false }));
  }

  async function action(a: string) {
    setActionLoading(a);
    try { const d = await apiFetch('/api/admin/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: a }) }); onToast(d.message ?? 'Done.', 'ok'); }
    catch (e: any) { onToast(e.message, 'err'); }
    setActionLoading('');
  }

  const groups = [
    { title: 'API Limits', keys: [
      { key: 'max_daily_calls', label: 'Max Daily API Calls', type: 'number' },
      { key: 'max_daily_input_tokens', label: 'Max Daily Input Tokens', type: 'number' },
      { key: 'max_monthly_cost_usd', label: 'Max Monthly Cost (USD)', type: 'number' },
    ]},
    { title: 'Theme Display Names', keys: [
      { key: 'theme_midnight_name', label: 'Midnight theme name', type: 'text' },
      { key: 'theme_pink_name',     label: 'Pink theme name',     type: 'text' },
      { key: 'theme_forest_name',   label: 'Forest theme name',   type: 'text' },
    ]},
    { title: 'Site Content', keys: [
      { key: 'site_favicon_url',           label: 'Favicon URL',                       type: 'text' },
      { key: 'homepage_demo_lecture_id',   label: 'Demo Lecture ID (homepage)',         type: 'text' },
      { key: 'homepage_features_json',     label: 'Homepage Features JSON (array)',     type: 'text' },
      { key: 'pricing_tier_json',          label: 'Pricing Tiers JSON',                 type: 'text' },
    ]},
  ];

  return (
    <div className="adm-section">
      <h2 className="adm-section-title">System Config</h2>

      {groups.map(g => (
        <div key={g.title} className="adm-config-group" style={{ marginBottom: 16 }}>
          <div className="adm-config-group-title">{g.title}</div>
          {loading ? <div className="adm-loading">Loading…</div> : (
            <div className="adm-config-rows">
              {g.keys.map(k => (
                <div key={k.key} className="adm-config-row">
                  <label className="adm-config-label">{k.label}</label>
                  <div className="adm-config-input-wrap">
                    <input className="adm-input" type={k.type} value={getVal(k.key)}
                      onChange={e => setEdits(p => ({ ...p, [k.key]: e.target.value }))}
                      style={{ maxWidth: k.type === 'number' ? 160 : '100%', flex: k.type === 'text' ? '1 1 280px' : undefined }} />
                    <button className="adm-btn adm-btn-primary" onClick={() => save(k.key)} disabled={saving[k.key]}>
                      {saving[k.key] ? '…' : 'Save'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Storage */}
      <div className="adm-config-group" style={{ marginBottom: 16 }}>
        <div className="adm-config-group-title">Storage Buckets</div>
        {storageInfo ? (
          <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="adm-usage-pill"><span className="adm-pill-label">slides/ files</span><span className="adm-pill-val">{storageInfo.slidesCount}</span></div>
            <div className="adm-usage-pill"><span className="adm-pill-label">uploads/ files</span><span className="adm-pill-val">{storageInfo.uploadsCount}</span></div>
          </div>
        ) : <div className="adm-muted" style={{ marginBottom: 14 }}>Storage file counts unavailable</div>}
        <div className="adm-quick-actions">
          {[
            { a: 'purge_orphan_slides', l: 'Purge Orphaned Slides', d: 'Deletes slide files with no matching lecture.', danger: true },
            { a: 'clear_upload_tmp', l: 'Clear Temp Uploads', d: 'Removes uploads/ files older than 24 hours.', danger: false },
          ].map(x => (
            <div key={x.a} className="adm-quick-action">
              <div><div className="adm-qa-label">{x.l}</div><div className="adm-qa-desc">{x.d}</div></div>
              <button className={`adm-btn ${x.danger ? 'adm-btn-danger' : 'adm-btn-ghost'}`} onClick={() => action(x.a)} disabled={actionLoading === x.a}>
                {actionLoading === x.a ? 'Running…' : x.l}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="adm-config-group">
        <div className="adm-config-group-title">Quick Actions</div>
        <div className="adm-quick-actions">
          {[
            { a: 'clear_jobs', l: 'Clear Processing Jobs', d: 'Removes all processing_jobs entries.', danger: true },
            { a: 'rebuild_registry', l: 'Rebuild Lecture Registry', d: 'Ensures all users have settings rows for every lecture.', danger: false },
          ].map(x => (
            <div key={x.a} className="adm-quick-action">
              <div><div className="adm-qa-label">{x.l}</div><div className="adm-qa-desc">{x.d}</div></div>
              <button className={`adm-btn ${x.danger ? 'adm-btn-danger' : 'adm-btn-ghost'}`} onClick={() => action(x.a)} disabled={actionLoading === x.a}>
                {actionLoading === x.a ? 'Running…' : x.l}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Profile Modal ────────────────────────────────────────────────────────────

function ProfileModal({ adminName, onClose, onToast }: { adminName: string; onClose: () => void; onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [fields, setFields] = useState({ display_name: adminName, username: '', current_password: '', new_password: '' });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try { await apiFetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }); onToast('Profile updated.', 'ok'); onClose(); }
    catch (e: any) { onToast(e.message, 'err'); }
    setSaving(false);
  }

  return (
    <div className="adm-overlay"><div className="adm-dialog" style={{ maxWidth: 460 }}>
      <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, marginBottom: 20 }}>Profile & Settings</h3>
      {[
        { f: 'display_name', l: 'Display Name', t: 'text' },
        { f: 'username', l: 'Username', t: 'text' },
        { f: 'current_password', l: 'Current Password', t: 'password' },
        { f: 'new_password', l: 'New Password (blank = keep)', t: 'password' },
      ].map(({ f, l, t }) => (
        <div key={f} className="adm-form-field">
          <label className="adm-form-label">{l}</label>
          <input className="adm-input" style={{ maxWidth: '100%' }} type={t} value={(fields as any)[f]}
            onChange={e => setFields(p => ({ ...p, [f]: e.target.value }))} />
        </div>
      ))}
      <div className="adm-dialog-btns" style={{ marginTop: 20 }}>
        <button className="adm-btn adm-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="adm-btn adm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div></div>
  );
}

// ─── Nav + Root ───────────────────────────────────────────────────────────────

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'overview',  label: 'Overview',  icon: '📊' },
  { id: 'usage',     label: 'API Usage', icon: '⚡' },
  { id: 'users',     label: 'Users',     icon: '👥' },
  { id: 'lectures',  label: 'Lectures',  icon: '📚' },
  { id: 'progress',  label: 'Progress',  icon: '📈' },
  { id: 'feedback',  label: 'Feedback',  icon: '💬' },
  { id: 'config',    label: 'System',    icon: '⚙️' },
];

export default function AdminClient({ adminName }: { adminName: string }) {
  const [section, setSection] = useState<Section>('overview');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const showToast = useCallback((msg: string, type: 'ok' | 'err') => setToast({ msg, type }), []);

  return (
    <>
      <style>{css}</style>
      <div className="adm-root">

        <aside className={`adm-sidebar ${navOpen ? 'adm-sidebar-open' : ''}`}>
          <div className="adm-sidebar-header">
            <Link href="/app" className="adm-back-link">← App</Link>
            <div className="adm-admin-logo">Study<span className="adm-logo-md">MD</span></div>
            <div className="adm-admin-sub">Admin Panel</div>
          </div>
          <nav className="adm-nav">
            {NAV.map(item => (
              <button key={item.id} className={`adm-nav-item ${section === item.id ? 'adm-nav-active' : ''}`}
                onClick={() => { setSection(item.id); setNavOpen(false); }}>
                <span className="adm-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <button className="adm-sidebar-footer adm-profile-btn" onClick={() => setProfileOpen(true)} aria-label="Edit profile">
            <div className="adm-admin-name">Signed in as · click to edit ✏️</div>
            <div className="adm-admin-name-val">{adminName}</div>
          </button>
        </aside>

        <div className="adm-mobile-bar">
          <button className="adm-hamburger" onClick={() => setNavOpen(v => !v)}>☰</button>
          <span className="adm-mobile-section-label">{NAV.find(n => n.id === section)?.icon} {NAV.find(n => n.id === section)?.label}</span>
          <Link href="/app" className="adm-back-link-mobile">← App</Link>
        </div>
        {navOpen && <div className="adm-nav-overlay" onClick={() => setNavOpen(false)} />}

        <main className="adm-main">
          {/* Mantra — item 18 */}
          <div className="adm-mantra">
            <span className="adm-mantra-heart">🩵</span>
            <em>I love Haley Lange — she deserves every ounce of my attention and effort. Everything I do right is from her, and everything I do wrong is from me.</em>
          </div>

          {section === 'overview'  && <OverviewSection onNav={setSection} />}
          {section === 'usage'     && <UsageSection />}
          {section === 'users'     && <UsersSection onToast={showToast} />}
          {section === 'lectures'  && <LecturesSection onToast={showToast} />}
          {section === 'progress'  && <ProgressSection onToast={showToast} />}
          {section === 'feedback'  && <FeedbackSection onToast={showToast} />}
          {section === 'config'    && <ConfigSection onToast={showToast} />}
        </main>

        {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
        {profileOpen && <ProfileModal adminName={adminName} onClose={() => setProfileOpen(false)} onToast={showToast} />}
      </div>
    </>
  );
}

const css = `
.adm-root{display:flex;min-height:100vh;background:var(--bg,#0d0f14);color:var(--text,#e8eaf0);font-family:'Outfit',sans-serif}
.adm-sidebar{width:220px;flex-shrink:0;background:var(--surface,#13161d);border-right:1px solid var(--border,rgba(255,255,255,0.08));display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto;z-index:100}
.adm-sidebar-header{padding:24px 20px 12px;border-bottom:1px solid var(--border,rgba(255,255,255,0.08))}
.adm-admin-logo{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:var(--text);margin-top:6px}
.adm-logo-md{color:var(--accent,#5b8dee)}
.adm-admin-sub{font-size:10px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted,#6b7280);margin-top:3px}
.adm-back-link{display:inline-block;font-size:12px;color:var(--text-muted,#6b7280);text-decoration:none;margin-bottom:4px;transition:color .15s}
.adm-back-link:hover{color:var(--accent,#5b8dee)}
.adm-nav{flex:1;padding:16px 10px;display:flex;flex-direction:column;gap:2px}
.adm-nav-item{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;min-height:44px;background:none;border:none;border-radius:10px;color:var(--text-muted,#6b7280);font-family:'Outfit',sans-serif;font-size:14px;font-weight:500;cursor:pointer;text-align:left;transition:background .13s,color .13s}
.adm-nav-item:hover{background:rgba(255,255,255,.06);color:var(--text,#e8eaf0)}
.adm-nav-active{background:rgba(91,141,238,.12)!important;color:var(--accent,#5b8dee)!important;font-weight:600}
.adm-nav-icon{font-size:16px;width:20px;text-align:center;flex-shrink:0}
.adm-sidebar-footer{padding:14px 20px;border-top:1px solid var(--border,rgba(255,255,255,0.08))}
.adm-profile-btn{background:none;border:none;cursor:pointer;width:100%;text-align:left;border-radius:10px;transition:background .13s}
.adm-profile-btn:hover{background:rgba(255,255,255,.05)}
.adm-admin-name{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em}
.adm-admin-name-val{font-size:13px;font-weight:600;color:var(--text);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.adm-mobile-bar{display:none;position:fixed;top:0;left:0;right:0;height:56px;background:var(--surface,#13161d);border-bottom:1px solid var(--border);align-items:center;justify-content:space-between;padding:0 16px;z-index:200}
.adm-hamburger{width:44px;height:44px;background:none;border:none;font-size:20px;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center}
.adm-mobile-section-label{font-size:14px;font-weight:600;color:var(--text)}
.adm-back-link-mobile{font-size:12px;color:var(--text-muted);text-decoration:none}
.adm-nav-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:90}
.adm-main{flex:1;min-width:0;padding:32px 48px 64px}
.adm-section{}
.adm-section-header-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;gap:12px;flex-wrap:wrap}
.adm-section-title{font-family:'Fraunces',serif;font-size:24px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:10px;margin:0 0 24px}
.adm-mantra{display:flex;align-items:flex-start;gap:12px;background:linear-gradient(135deg,rgba(91,141,238,.07),rgba(236,72,153,.05));border:1px solid rgba(236,72,153,.15);border-radius:14px;padding:16px 20px;margin-bottom:32px;font-family:'Fraunces',serif;font-size:14px;color:rgba(236,72,153,.8);line-height:1.75;font-style:italic}
.adm-mantra-heart{font-size:20px;flex-shrink:0;margin-top:1px}
.adm-loading{color:var(--text-muted);font-size:14px;padding:32px 0;text-align:center}
.adm-empty{color:var(--text-muted);font-size:14px;padding:24px 0;text-align:center}
.adm-cards-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-bottom:28px}
.adm-card{background:var(--surface,#13161d);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:16px;padding:22px 18px 18px;display:flex;flex-direction:column;gap:6px}
.adm-card-btn{cursor:pointer;text-align:left;transition:border-color .18s,transform .18s}
.adm-card-btn:hover{border-color:var(--accent,#5b8dee);transform:translateY(-2px)}
.adm-card-icon{font-size:20px;margin-bottom:4px}
.adm-card-value{font-family:'DM Mono',monospace;font-size:26px;font-weight:500;line-height:1}
.adm-card-label{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em}
.adm-overview-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:8px}
.adm-ov-col{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px;overflow:hidden}
.adm-ov-col-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px;font-family:'DM Mono',monospace}
.adm-ov-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px;flex-wrap:wrap}
.adm-ov-row:last-child{border-bottom:none}
.adm-ov-row-col{flex-direction:column;align-items:flex-start;gap:2px}
.adm-status-badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 7px;border-radius:100px}
.adm-status-badge.adm-status-success{background:rgba(16,185,129,.15);color:#10b981}
.adm-status-badge.adm-status-failed{background:rgba(239,68,68,.15);color:#ef4444}
.adm-status-badge.adm-status-processing{background:rgba(245,158,11,.15);color:#f59e0b}
.adm-status-badge.adm-status-pending{background:rgba(107,114,128,.15);color:#6b7280}
/* Instant tooltip — no delay */
[data-tip]{position:relative}
[data-tip]::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:var(--surface2,#1a1e27);color:var(--text,#e8eaf0);font-family:'Outfit',sans-serif;font-size:11px;font-weight:500;padding:4px 9px;border-radius:6px;white-space:nowrap;border:1px solid rgba(255,255,255,.12);box-shadow:0 4px 16px rgba(0,0,0,.4);pointer-events:none;opacity:0;transition:opacity .08s;z-index:9999}
[data-tip]:hover::after{opacity:1}
.adm-table-wrap{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;overflow-x:auto}
.adm-table{width:100%;border-collapse:collapse;font-size:13px}
.adm-table th{padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap;background:rgba(255,255,255,.02)}
.adm-table td{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle;color:var(--text)}
.adm-table tr:last-child td{border-bottom:none}
.adm-table tbody tr:hover{background:rgba(255,255,255,.02)}
.adm-row-expanded>td{background:rgba(91,141,238,.04)}
.adm-action-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.adm-action-btn{min-width:36px;min-height:36px;padding:0 8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:var(--text-muted);font-size:13px;cursor:pointer;transition:background .1s,color .1s,border-color .1s;display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace}
.adm-action-btn-default:hover{background:rgba(255,255,255,.1);color:var(--text)}
.adm-action-btn-primary:hover{background:rgba(91,141,238,.12);color:var(--accent);border-color:var(--accent)}
.adm-action-btn-danger:hover{background:rgba(239,68,68,.12);color:#ef4444;border-color:rgba(239,68,68,.3)}
.adm-badge{display:inline-flex;align-items:center;justify-content:center;padding:1px 8px;border-radius:100px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.adm-badge-gold{background:rgba(245,158,11,.15);color:#f59e0b}
.adm-badge-red{background:rgba(239,68,68,.15);color:#ef4444}
.adm-count-badge{font-family:'DM Mono',monospace;font-size:13px;font-weight:400;color:var(--text-muted);background:rgba(255,255,255,.07);border-radius:100px;padding:1px 10px}
.adm-q-type-badge{display:inline-flex;padding:1px 7px;border-radius:100px;font-size:9px;font-weight:700;text-transform:uppercase;background:rgba(139,92,246,.12);color:#8b5cf6;margin-top:4px}
.adm-slide-link{font-size:10px;background:rgba(91,141,238,.1);color:var(--accent);padding:1px 7px;border-radius:100px;font-family:'DM Mono',monospace}
.adm-mono{font-family:'DM Mono',monospace;font-size:12px}
.adm-muted{color:var(--text-muted);font-size:12px}
.accent{color:var(--accent,#5b8dee)}
.adm-user-name{font-weight:600;font-size:13px;color:var(--text);display:flex;align-items:center;gap:6px}
.adm-user-email{font-size:11px;color:var(--text-muted);margin-top:2px}
.adm-course-pill{display:inline-flex;padding:3px 9px;border-radius:100px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;background:rgba(91,141,238,.12);color:var(--accent);white-space:nowrap}
.adm-id-code{font-family:'DM Mono',monospace;font-size:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:3px 9px;color:var(--text-muted)}
.adm-id-badge{font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.08em;background:rgba(245,158,11,.12);color:#f59e0b;border-radius:100px;padding:1px 7px;margin-left:8px}
.adm-id-pill{display:inline-flex;align-items:center;gap:4px;font-family:'DM Mono',monospace;font-size:10px;color:var(--text-muted);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:6px;padding:2px 7px}
.adm-id-pill-label{font-size:8px;text-transform:uppercase;letter-spacing:.08em;opacity:.6}
.adm-usage-pills{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.adm-usage-pill{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 16px;display:flex;flex-direction:column;gap:3px}
.adm-pill-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)}
.adm-pill-val{font-family:'DM Mono',monospace;font-size:18px;font-weight:500;color:var(--text)}
.adm-pill-val.accent{color:var(--accent)}
.adm-budget-bar-wrap{margin-bottom:28px}
.adm-budget-bar-label{font-size:12px;color:var(--text-muted);margin-bottom:8px}
.adm-budget-bar-track{height:6px;background:rgba(255,255,255,.07);border-radius:100px;overflow:hidden}
.adm-budget-bar-fill{height:100%;border-radius:100px;transition:width .5s,background .3s}
.adm-chart-wrap{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px}
.adm-chart-title{font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px}
.adm-user-detail-cell{background:rgba(91,141,238,.03);padding:0!important}
.adm-user-detail{display:grid;grid-template-columns:1fr 1fr;gap:0}
.adm-user-detail-col{padding:16px 20px;border-right:1px solid rgba(255,255,255,.05)}
.adm-user-detail-col:last-child{border-right:none}
.adm-detail-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;font-family:'DM Mono',monospace}
.adm-user-lec-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px}
.adm-user-lec-row:last-child{border-bottom:none}
.adm-user-prog-row{display:flex;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px;flex-wrap:wrap}
.adm-user-prog-row:last-child{border-bottom:none}
.adm-lec-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;transition:border-color .15s}
.adm-lec-card-open{border-color:rgba(91,141,238,.3)}
.adm-lec-row{display:flex;align-items:center;gap:12px;padding:14px 18px;cursor:pointer;transition:background .12s;flex-wrap:wrap}
.adm-lec-row:hover{background:rgba(255,255,255,.02)}
.adm-lec-row-icon{font-size:22px;flex-shrink:0}
.adm-lec-row-info{flex:1;min-width:0}
.adm-lec-row-title{font-weight:600;font-size:14px;color:var(--text)}
.adm-lec-row-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px}
.adm-lec-row-counts{display:flex;gap:12px;font-size:12px;flex-shrink:0}
.adm-lec-detail{border-top:1px solid var(--border);padding:20px}
.adm-lec-tabs{display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.adm-lec-tab{background:none;border:none;padding:8px 16px;font-family:'Outfit',sans-serif;font-size:13px;font-weight:500;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .13s,border-color .13s;min-height:44px;border-radius:8px 8px 0 0}
.adm-lec-tab:hover{color:var(--text)}
.adm-lec-tab.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
.adm-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.adm-meta-field{display:flex;flex-direction:column;gap:6px}
.adm-meta-field-full{grid-column:1/-1}
.adm-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.adm-content-card{background:var(--bg,#0d0f14);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;transition:border-color .13s}
.adm-content-card-editing{border-color:var(--accent)}
.adm-content-card-header{display:flex;justify-content:space-between;align-items:center}
.adm-card-q{font-size:13px;color:var(--text);line-height:1.5;font-weight:500}
.adm-card-a{font-size:12px;color:var(--accent);line-height:1.5}
.adm-content-card-footer{display:flex;justify-content:flex-end;gap:6px;margin-top:auto;padding-top:6px}
.adm-textarea-sm{min-height:72px;resize:vertical;max-width:100%;font-size:12px;width:100%}
.adm-json-textarea{width:100%;background:var(--bg,#0d0f14);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:'DM Mono',monospace;font-size:11px;line-height:1.7;padding:14px;outline:none;resize:vertical}
.adm-json-textarea:focus{border-color:var(--accent)}
.adm-spec-block{background:var(--bg,#0d0f14);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:16px;font-family:'DM Mono',monospace;font-size:11px;line-height:1.7;color:#10b981;overflow-x:auto;white-space:pre-wrap}
.adm-feedback-list{display:flex;flex-direction:column;gap:8px}
.adm-feedback-item{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;transition:border-color .15s}
.adm-feedback-item:hover{border-color:rgba(255,255,255,.14)}
.adm-fb-expanded{border-color:rgba(91,141,238,.3)}
.adm-fb-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;cursor:pointer;gap:12px;min-height:52px}
.adm-fb-left{display:flex;align-items:center;gap:10px}
.adm-fb-status-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.adm-fb-type{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)}
.adm-fb-from{font-size:13px;font-weight:500;color:var(--text)}
.adm-fb-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
.adm-fb-chevron{font-size:10px;color:var(--text-muted)}
.adm-fb-body{padding:14px 18px 16px;border-top:1px solid var(--border)}
.adm-fb-page-url{font-size:11px;color:var(--text-muted);margin-bottom:10px}
.adm-fb-message{font-size:14px;line-height:1.65;color:var(--text);margin-bottom:14px;white-space:pre-wrap}
.adm-fb-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.adm-resolved-label{font-size:13px;color:#10b981;font-weight:600}
.adm-config-group{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px}
.adm-config-group-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);margin-bottom:20px;font-family:'DM Mono',monospace}
.adm-config-rows{display:flex;flex-direction:column;gap:18px}
.adm-config-row{display:flex;flex-direction:column;gap:6px}
.adm-config-label{font-size:13px;font-weight:600;color:var(--text)}
.adm-config-input-wrap{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.adm-quick-actions{display:flex;flex-direction:column;gap:12px}
.adm-quick-action{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:16px;background:rgba(255,255,255,.02);border-radius:12px;border:1px solid rgba(255,255,255,.05)}
.adm-qa-label{font-size:14px;font-weight:600;color:var(--text);margin-bottom:3px}
.adm-qa-desc{font-size:12px;color:var(--text-muted);line-height:1.5;max-width:480px}
.adm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 18px;min-height:44px;min-width:44px;border-radius:10px;font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:background .13s,color .13s,border-color .13s;border:1px solid transparent;white-space:nowrap}
.adm-btn:disabled{opacity:.55;cursor:not-allowed}
.adm-btn-primary{background:var(--accent,#5b8dee);color:#fff;border-color:var(--accent)}
.adm-btn-primary:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 82%,black)}
.adm-btn-ghost{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);color:var(--text-muted)}
.adm-btn-ghost:hover:not(:disabled){background:rgba(255,255,255,.1);color:var(--text)}
.adm-btn-danger{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.25);color:#ef4444}
.adm-btn-danger:hover:not(:disabled){background:rgba(239,68,68,.2)}
.adm-select{background:var(--bg,#0d0f14);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:8px;color:var(--text);font-family:'Outfit',sans-serif;font-size:12px;padding:5px 8px;cursor:pointer;outline:none;min-height:36px}
.adm-select:focus{border-color:var(--accent)}
.adm-input{background:var(--bg,#0d0f14);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:10px;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;padding:9px 14px;outline:none;min-height:44px;max-width:240px}
.adm-input:focus{border-color:var(--accent)}
.adm-form-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.adm-form-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);font-family:'DM Mono',monospace}
.adm-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:11px 22px;border-radius:100px;font-size:14px;font-weight:600;z-index:9999;animation:adm-toast-in .2s ease;box-shadow:0 8px 32px rgba(0,0,0,.4);white-space:nowrap}
.adm-toast-ok{background:#10b981;color:#fff}
.adm-toast-err{background:#ef4444;color:#fff}
@keyframes adm-toast-in{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.adm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px}
.adm-dialog{background:var(--surface);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:32px;max-width:420px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.6);animation:adm-dialog-in .18s ease;max-height:90vh;overflow-y:auto}
@keyframes adm-dialog-in{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
.adm-dialog-msg{font-size:15px;line-height:1.6;color:var(--text);margin-bottom:24px}
.adm-dialog-btns{display:flex;gap:10px;justify-content:flex-end}
@media(max-width:767px){
  .adm-mobile-bar{display:flex}
  .adm-nav-overlay{display:block}
  .adm-sidebar{position:fixed;left:-220px;top:0;transition:left .25s cubic-bezier(.4,0,.2,1);z-index:150}
  .adm-sidebar-open{left:0}
  .adm-main{padding:72px 16px 32px}
  .adm-cards-row{grid-template-columns:repeat(2,1fr)}
  .adm-overview-cols{grid-template-columns:1fr}
  .adm-meta-grid{grid-template-columns:1fr}
  .adm-user-detail{grid-template-columns:1fr}
  .adm-card-grid{grid-template-columns:1fr}
  .adm-lec-row-counts{display:none}
}
`;
