// app/app/uploads/page.tsx
// "My Uploads" — list of every processing_job for the signed-in user.
// Lets the user retry failed jobs (reusing the cached Anthropic file when
// possible), download the original file via short-lived signed URL, and
// delete uploads they no longer need.
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { applyTheme } from '@/components/ThemePicker';
import Header from '@/components/Header';
import type { Theme } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────
interface UploadRow {
  job_id: string;
  status: 'pending' | 'converting' | 'generating' | 'complete' | 'error';
  status_detail: string | null;
  status_message: string | null;
  original_filename: string | null;
  original_file: string | null;
  file_size_bytes: number | null;
  file_type: string | null;
  course: string;
  title: string | null;
  internal_id: string | null;
  error_message: string | null;
  anthropic_file_id: string | null;
  estimated_cost_usd: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  storage_path: string;
}

type StatusFilter = 'all' | 'processing' | 'complete' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60)             return 'just now';
  if (sec < 3600)           return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)          return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7)      return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function isProcessing(s: UploadRow['status']): boolean {
  return s === 'pending' || s === 'converting' || s === 'generating';
}

function statusLabel(u: UploadRow): string {
  switch (u.status) {
    case 'pending':    return 'Queued';
    case 'converting': return u.status_detail ? `Converting (${u.status_detail})` : 'Converting';
    case 'generating': return u.status_detail ? `Generating (${u.status_detail})` : 'Generating';
    case 'complete':   return 'Complete';
    case 'error':      return 'Failed';
  }
}

function fileIcon(t: string | null): string {
  if (t === 'pdf')  return '📄';
  if (t === 'pptx' || t === 'ppt') return '📊';
  return '📁';
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function UploadsPage() {
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [activeTheme, setActiveTheme] = useState<Theme>('midnight');
  const [headerUserId, setHeaderUserId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<UploadRow | null>(null);

  // ── Initial setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) setHeaderUserId(data.user.id);
    });
    try {
      const stored = localStorage.getItem('studymd_theme') as Theme | null;
      const t = stored ?? 'midnight';
      setActiveTheme(t);
      applyTheme(t);
    } catch {}
  }, []);

  // ── Load uploads ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/uploads');
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? 'Failed to load uploads');
        return;
      }
      setUploads(data.uploads ?? []);
    } catch {
      setLoadError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Live-refresh while any job is processing — once a minute is plenty.
  const hasLive = uploads.some((u) => isProcessing(u.status));
  useEffect(() => {
    if (!hasLive) return;
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [hasLive, load]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filter === 'all') return uploads;
    if (filter === 'processing') return uploads.filter((u) => isProcessing(u.status));
    return uploads.filter((u) => u.status === filter);
  }, [uploads, filter]);

  const counts = useMemo(() => ({
    all: uploads.length,
    processing: uploads.filter((u) => isProcessing(u.status)).length,
    complete:   uploads.filter((u) => u.status === 'complete').length,
    error:      uploads.filter((u) => u.status === 'error').length,
  }), [uploads]);

  // ── Helpers for actions ───────────────────────────────────────────────────
  function flash(kind: 'ok' | 'err', msg: string) {
    setFeedback({ kind, msg });
    setTimeout(() => setFeedback(null), 4000);
  }

  async function handleRetry(u: UploadRow) {
    setActionPending(u.job_id);
    try {
      const res = await fetch(`/api/uploads/${u.job_id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        flash('err', data.error ?? 'Retry failed');
        return;
      }
      flash('ok', u.anthropic_file_id ? 'Retry started — reusing cached file.' : 'Retry started.');
      load();
    } catch {
      flash('err', 'Network error — please try again.');
    } finally {
      setActionPending(null);
    }
  }

  async function handleDownload(u: UploadRow) {
    setActionPending(u.job_id);
    try {
      const res = await fetch(`/api/uploads/${u.job_id}/download`);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 410) {
          flash('err', 'File is no longer available — it may have been removed by retention.');
        } else {
          flash('err', data.error ?? 'Could not get download link');
        }
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      flash('err', 'Network error — please try again.');
    } finally {
      setActionPending(null);
    }
  }

  async function handleDelete(u: UploadRow) {
    setActionPending(u.job_id);
    try {
      const res = await fetch(`/api/uploads/${u.job_id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash('err', data.error ?? 'Delete failed');
        return;
      }
      flash('ok', 'Upload deleted.');
      setConfirmDelete(null);
      load();
    } catch {
      flash('err', 'Network error — please try again.');
    } finally {
      setActionPending(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{uploadsCss}</style>
      <Header
        lectureCount={0}
        userId={headerUserId}
        initialTheme={activeTheme}
        hideUploadButton={false}
      />

      <main className="upl-main">
        <Link href="/app" className="upl-back-btn">
          <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden="true">
            <path fillRule="evenodd" clipRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" />
          </svg>
          Dashboard
        </Link>

        <header className="upl-header">
          <h1 className="upl-title">My Uploads</h1>
          <p className="upl-subtitle">
            Every file you&rsquo;ve uploaded for processing. Failed jobs can be retried without
            re-uploading the file. Original files are kept on the server for retry and download
            (~30 days), but the processed lectures are permanent.
          </p>
        </header>

        {feedback && (
          <div className={`upl-toast upl-toast--${feedback.kind}`} role="status">
            {feedback.msg}
          </div>
        )}

        <div className="upl-filter-row" role="tablist" aria-label="Filter uploads by status">
          <FilterPill active={filter === 'all'}        count={counts.all}        onClick={() => setFilter('all')}>All</FilterPill>
          <FilterPill active={filter === 'processing'} count={counts.processing} onClick={() => setFilter('processing')}>Processing</FilterPill>
          <FilterPill active={filter === 'complete'}   count={counts.complete}   onClick={() => setFilter('complete')}>Complete</FilterPill>
          <FilterPill active={filter === 'error'}      count={counts.error}      onClick={() => setFilter('error')}>Failed</FilterPill>
        </div>

        {loading ? (
          <div className="upl-loading"><div className="upl-spinner" /></div>
        ) : loadError ? (
          <div className="upl-empty">
            <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
            <div className="upl-empty-title">Could not load uploads</div>
            <p className="upl-empty-sub">{loadError}</p>
            <button className="upl-btn upl-btn--primary" onClick={load}>Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="upl-empty">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
            <div className="upl-empty-title">
              {filter === 'all' ? 'No uploads yet' : `No ${filter === 'error' ? 'failed' : filter} uploads`}
            </div>
            <p className="upl-empty-sub">
              {filter === 'all'
                ? 'When you upload a lecture, it will appear here.'
                : 'Switch filter to see other uploads.'}
            </p>
            {filter === 'all' && (
              <Link href="/app/upload" className="upl-btn upl-btn--primary">Upload a lecture</Link>
            )}
          </div>
        ) : (
          <ul className="upl-list">
            {filtered.map((u) => (
              <UploadRowItem
                key={u.job_id}
                row={u}
                pending={actionPending === u.job_id}
                onRetry={() => handleRetry(u)}
                onDownload={() => handleDownload(u)}
                onDelete={() => setConfirmDelete(u)}
              />
            ))}
          </ul>
        )}
      </main>

      {confirmDelete && (
        <div className="upl-modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="upl-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="upl-modal-title">Delete upload?</h2>
            <p className="upl-modal-body">
              This removes <strong>{confirmDelete.title ?? confirmDelete.original_filename ?? 'this upload'}</strong>{' '}
              and the stored file. The processed lecture (if any) stays in your library —
              delete it separately from My Lectures.
            </p>
            <div className="upl-modal-actions">
              <button
                className="upl-btn"
                onClick={() => setConfirmDelete(null)}
                disabled={actionPending === confirmDelete.job_id}
              >
                Cancel
              </button>
              <button
                className="upl-btn upl-btn--danger"
                onClick={() => handleDelete(confirmDelete)}
                disabled={actionPending === confirmDelete.job_id}
              >
                {actionPending === confirmDelete.job_id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function FilterPill({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`upl-pill${active ? ' upl-pill--active' : ''}`}
      onClick={onClick}
    >
      {children} <span className="upl-pill-count">{count}</span>
    </button>
  );
}

function UploadRowItem({
  row: u,
  pending,
  onRetry,
  onDownload,
  onDelete,
}: {
  row: UploadRow;
  pending: boolean;
  onRetry: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const filename = u.original_filename ?? u.original_file ?? 'untitled';
  const showRetry = u.status === 'error';
  const showView  = u.status === 'complete' && u.internal_id;
  const blockBusy = isProcessing(u.status);

  return (
    <li className={`upl-row upl-row--${u.status}`}>
      <div className="upl-row-icon" aria-hidden="true">{fileIcon(u.file_type)}</div>

      <div className="upl-row-main">
        <div className="upl-row-title">{u.title ?? filename}</div>
        <div className="upl-row-meta">
          <span>{u.course}</span>
          <span aria-hidden="true">·</span>
          <span>{filename}</span>
          <span aria-hidden="true">·</span>
          <span>{formatBytes(u.file_size_bytes)}</span>
          <span aria-hidden="true">·</span>
          <span title={new Date(u.created_at).toLocaleString()}>{formatRelative(u.created_at)}</span>
        </div>
        {u.status === 'error' && u.error_message && (
          <div className="upl-row-error" title={u.error_message}>
            <strong>Error:</strong> {u.error_message}
          </div>
        )}
        {blockBusy && u.status_message && (
          <div className="upl-row-progress">{u.status_message}</div>
        )}
      </div>

      <div className="upl-row-status">
        <span className={`upl-chip upl-chip--${u.status}`}>{statusLabel(u)}</span>
        {u.anthropic_file_id && u.status === 'error' && (
          <span className="upl-chip upl-chip--cached" title="Original file is cached on Anthropic — retry will skip re-upload.">
            cached
          </span>
        )}
      </div>

      <div className="upl-row-actions">
        {showView && (
          <Link href={`/app/lectures?lecture=${u.internal_id}`} className="upl-btn upl-btn--ghost">
            View
          </Link>
        )}
        {showRetry && (
          <button className="upl-btn upl-btn--primary" onClick={onRetry} disabled={pending}>
            {pending ? '…' : 'Retry'}
          </button>
        )}
        <button className="upl-btn upl-btn--ghost" onClick={onDownload} disabled={pending || blockBusy}>
          Download
        </button>
        <button className="upl-btn upl-btn--ghost upl-btn--danger-ghost" onClick={onDelete} disabled={pending || blockBusy} aria-label="Delete upload">
          ✕
        </button>
      </div>
    </li>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const uploadsCss = `
.upl-main {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 20px 80px;
}

.upl-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
  text-decoration: none;
  padding: 6px 0;
  margin-bottom: 12px;
}
.upl-back-btn:hover { color: var(--text); }

.upl-header { margin-bottom: 20px; }
.upl-title {
  font-family: 'Fraunces', serif;
  font-size: 32px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text);
}
.upl-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.55;
  max-width: 720px;
}

.upl-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}
.upl-pill {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  transition: all 0.12s ease;
}
.upl-pill:hover { color: var(--text); border-color: var(--text-muted); }
.upl-pill--active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-on);
}
.upl-pill--active .upl-pill-count {
  background: rgba(0,0,0,0.18);
  color: inherit;
}
.upl-pill-count {
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  min-width: 18px;
  text-align: center;
}

.upl-toast {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 12px;
}
.upl-toast--ok  { background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
.upl-toast--err { background: rgba(239,68,68,0.12);  color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }

.upl-loading { padding: 60px 0; display: flex; justify-content: center; }
.upl-spinner {
  width: 28px; height: 28px;
  border: 2px solid var(--surface-2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: upl-spin 0.7s linear infinite;
}
@keyframes upl-spin { to { transform: rotate(360deg); } }

.upl-empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.upl-empty-title {
  font-family: 'Fraunces', serif;
  font-size: 20px;
  color: var(--text);
  margin-bottom: 6px;
}
.upl-empty-sub { font-size: 13px; margin-bottom: 16px; }

.upl-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }

.upl-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: border-color 0.12s ease;
}
.upl-row:hover { border-color: var(--text-muted); }
.upl-row--error { border-color: rgba(239,68,68,0.4); }
.upl-row--complete { border-color: rgba(16,185,129,0.3); }

.upl-row-icon { font-size: 24px; }
.upl-row-main { min-width: 0; }
.upl-row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.upl-row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.upl-row-error {
  font-size: 12px;
  color: #ef4444;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.upl-row-progress { font-size: 12px; color: var(--accent); margin-top: 4px; }

.upl-row-status { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.upl-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  font-weight: 500;
}
.upl-chip--pending,
.upl-chip--converting,
.upl-chip--generating { background: rgba(91,141,238,0.15); color: var(--accent); }
.upl-chip--complete   { background: rgba(16,185,129,0.15); color: #10b981; }
.upl-chip--error      { background: rgba(239,68,68,0.15);  color: #ef4444; }
.upl-chip--cached     { background: rgba(168,85,247,0.15); color: #a855f7; }

.upl-row-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.upl-btn {
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.upl-btn:hover { background: var(--surface-2); }
.upl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.upl-btn--primary { background: var(--accent); border-color: var(--accent); color: var(--accent-on); }
.upl-btn--primary:hover { filter: brightness(1.1); background: var(--accent); }
.upl-btn--ghost { color: var(--text-muted); }
.upl-btn--ghost:hover { color: var(--text); }
.upl-btn--danger { background: #ef4444; border-color: #ef4444; color: white; }
.upl-btn--danger:hover { background: #dc2626; }
.upl-btn--danger-ghost:hover { color: #ef4444; border-color: #ef4444; background: transparent; }

/* ── Confirm modal ─────────────────────────────────────────────── */
.upl-modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
  padding: 20px;
}
.upl-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  max-width: 440px;
  width: 100%;
}
.upl-modal-title {
  font-family: 'Fraunces', serif;
  font-size: 20px;
  margin: 0 0 12px;
  color: var(--text);
}
.upl-modal-body { font-size: 13px; color: var(--text-muted); margin: 0 0 18px; line-height: 1.55; }
.upl-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

@media (max-width: 640px) {
  .upl-row { grid-template-columns: auto 1fr; grid-template-areas: 'icon main' 'status status' 'actions actions'; }
  .upl-row-icon    { grid-area: icon; }
  .upl-row-main    { grid-area: main; }
  .upl-row-status  { grid-area: status; align-items: flex-start; flex-direction: row; }
  .upl-row-actions { grid-area: actions; justify-content: flex-start; }
}
`;
