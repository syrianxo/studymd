'use client';

/**
 * app/app/upload/page.tsx
 * Full-page lecture upload — StudyMD v2.
 *
 * POST /api/upload        → creates processing_jobs row, returns jobId
 * GET  /api/upload/status → polls job status
 *
 * Persistence: active jobId is stored in localStorage so polling survives
 * navigation away and resumes on next mount.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase';
import type { Theme } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_COURSES = [
  'Physical Diagnosis I',
  'Anatomy & Physiology',
  'Laboratory Diagnosis',
] as const;
type Course = (typeof VALID_COURSES)[number];

const LS_JOB_KEY   = 'studymd_active_job';   // persisted jobId + title + course
const POLL_INTERVAL = 2500;                   // ms between status polls

// ── Types ─────────────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'active' | 'done' | 'error';

interface TimelineStep {
  id: string;
  label: string;
  detail?: string;
  status: StepStatus;
}

type JobPhase = 'idle' | 'uploading' | 'polling' | 'complete' | 'error';

interface SingleJobState {
  phase: JobPhase;
  jobId?: string;
  lectureId?: string;
  title?: string;
  errorMessage?: string;
}

// Batch review step
type BatchStep = 'configure' | 'review' | 'processing';

interface BatchItem {
  id: string;
  file: File | null;
  course: Course;
  title: string;
  phase: JobPhase;
  jobId?: string;
  lectureId?: string;
  errorMessage?: string;
  steps: TimelineStep[];
  estimatedCost?: number;
  tokenWarning?: string;
}

// ── Step helpers ──────────────────────────────────────────────────────────────

function buildInitialSteps(): TimelineStep[] {
  return [
    { id: 'upload',     label: 'Uploading to storage',      status: 'pending' },
    { id: 'converting', label: 'Converting slides',           status: 'pending' },
    { id: 'flashcards', label: 'Generating flashcards',       status: 'pending' },
    { id: 'questions',  label: 'Generating exam questions',   status: 'pending' },
    { id: 'validating', label: 'Validating content',          status: 'pending' },
    { id: 'ready',      label: 'Lecture ready!',              status: 'pending' },
  ];
}

function applyStatusToSteps(
  steps: TimelineStep[],
  apiStatus: string,
  progress: number
): TimelineStep[] {
  const s = steps.map((x) => ({ ...x }));
  const mark = (id: string, status: StepStatus, detail?: string) => {
    const t = s.find((x) => x.id === id);
    if (!t) return;
    t.status = status;
    if (detail !== undefined) t.detail = detail;
    else delete t.detail;
  };

  switch (apiStatus) {
    case 'uploading-to-storage':
      mark('upload', 'active', 'Uploading…');
      break;
    case 'pending':
      mark('upload', 'active', 'Queued…');
      break;
    case 'converting':
      mark('upload', 'done');
      mark('converting', 'active', progress > 0 ? `Slide ${Math.round(progress)}%` : 'In progress…');
      break;
    case 'generating':
      mark('upload', 'done');
      mark('converting', 'done');
      mark('flashcards', 'active', 'Running Claude…');
      break;
    case 'complete':
      s.forEach((t) => { t.status = 'done'; delete t.detail; });
      s[s.length - 1].label = 'Lecture ready! ✅';
      break;
    case 'error': {
      // Mark the currently active step (or first pending) as error
      const firstActive = s.find((t) => t.status === 'active');
      const firstPending = s.find((t) => t.status === 'pending');
      const target = firstActive ?? firstPending;
      if (target) target.status = 'error';
      break;
    }
  }
  return s;
}

function estimateClientCost(bytes: number): number {
  const tokens = Math.min(Math.max(Math.ceil(bytes / 150), 5000), 180_000);
  return tokens * (1.0 / 1_000_000) + 15_000 * (5.0 / 1_000_000);
}

function newBatchItem(): BatchItem {
  return {
    id: Math.random().toString(36).slice(2, 10),
    file: null,
    course: 'Physical Diagnosis I',
    title: '',
    phase: 'idle',
    steps: buildInitialSteps(),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [theme,  setTheme]  = useState<Theme>('midnight');
  const [userId, setUserId] = useState('');
  const [mode,   setMode]   = useState<'single' | 'batch'>('single');

  // ── Single mode ──────────────────────────────────────────────────────────────
  const [singleFile,    setSingleFile]    = useState<File | null>(null);
  const [singleCourse,  setSingleCourse]  = useState<Course>('Physical Diagnosis I');
  const [singleTitle,   setSingleTitle]   = useState('');
  const [singleJob,     setSingleJob]     = useState<SingleJobState>({ phase: 'idle' });
  const [singleSteps,   setSingleSteps]   = useState<TimelineStep[]>(buildInitialSteps());
  const [singleWarning, setSingleWarning] = useState<string | undefined>();
  const [singleCost,    setSingleCost]    = useState<number | undefined>();
  const [isDragging,    setIsDragging]    = useState(false);

  // ── Batch mode ───────────────────────────────────────────────────────────────
  const [batchItems,   setBatchItems]   = useState<BatchItem[]>([newBatchItem()]);
  const [batchStep,    setBatchStep]    = useState<BatchStep>('configure');
  const [batchRunning, setBatchRunning] = useState(false);
  const [dailyLimit,   setDailyLimit]   = useState(false);

  // ── Global ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: '', visible: false });

  const singleInputRef  = useRef<HTMLInputElement>(null);
  const singlePollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth + theme + resume ─────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
      else router.push('/login');
    });
    try {
      const stored = localStorage.getItem('studymd_theme') as Theme | null;
      if (stored) { setTheme(stored); document.documentElement.dataset.theme = stored; }
    } catch {}

    // Resume any in-flight job from a previous visit
    resumePersistedJob();

    return () => {
      if (singlePollRef.current) clearInterval(singlePollRef.current);
    };
  }, []);

  function showToast(msg: string) {
    setToast({ msg, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 5000);
  }

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  // ── Persist / resume job ──────────────────────────────────────────────────────
  function persistJob(jobId: string, title: string) {
    try { localStorage.setItem(LS_JOB_KEY, JSON.stringify({ jobId, title, ts: Date.now() })); } catch {}
  }
  function clearPersistedJob() {
    try { localStorage.removeItem(LS_JOB_KEY); } catch {}
  }

  async function resumePersistedJob() {
    try {
      const raw = localStorage.getItem(LS_JOB_KEY);
      if (!raw) return;
      const { jobId, title, ts } = JSON.parse(raw);
      // Ignore if older than 24h
      if (Date.now() - ts > 86_400_000) { clearPersistedJob(); return; }

      const token = await getToken();
      if (!token) return;

      // Immediately show polling state
      setSingleJob({ phase: 'polling', jobId, title });
      setSingleTitle(title ?? '');
      setSingleSteps(applyStatusToSteps(buildInitialSteps(), 'pending', 0));

      startPolling(jobId, token, title);
    } catch {}
  }

  // ── Core: upload file directly to Supabase Storage, then register job ──────────
  //
  // Step 1: browser uploads the file straight to Supabase Storage via the anon
  //         client. This bypasses Vercel entirely — no 4.5 MB body limit.
  // Step 2: call POST /api/upload with tiny JSON metadata to create the
  //         processing_jobs row and get back a jobId.
  //
  async function apiUpload(
    file: File,
    course: string,
    title: string,
    token: string
  ): Promise<{ jobId: string; estimatedCost: number; tokenWarning?: string } | { error: string }> {
    // ── Step 1: upload file directly to Supabase Storage ──────────────────────
    const timestamp    = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated — please sign in again.' };

    const storagePath = `${user.id}/${timestamp}_${safeFilename}`;

    const { error: storageError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (storageError) {
      return { error: `Storage upload failed: ${storageError.message}` };
    }

    // ── Step 2: register the job via API (JSON only, no file body) ────────────
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storagePath,
          originalName:  file.name,
          fileSizeBytes: file.size,
          course,
          title: title.trim() || undefined,
        }),
      });

      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        // Clean up the orphaned storage file
        await supabase.storage.from('uploads').remove([storagePath]);
        const msg = (data.error as string) ?? `Server error (${res.status} ${res.statusText})`;
        return { error: msg };
      }

      return {
        jobId:         data.jobId         as string,
        estimatedCost: data.estimatedCost as number,
        tokenWarning:  data.tokenWarning  as string | undefined,
      };
    } catch (e: unknown) {
      await supabase.storage.from('uploads').remove([storagePath]);
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Job registration failed: ${msg}` };
    }
  }

  // ── Core: start polling a jobId ───────────────────────────────────────────────
  function startPolling(jobId: string, token: string, fallbackTitle: string) {
    if (singlePollRef.current) clearInterval(singlePollRef.current);

    const tick = async () => {
      try {
        const res  = await fetch(`/api/upload/status?jobId=${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          clearInterval(singlePollRef.current!);
          setSingleJob({ phase: 'error', errorMessage: data.error ?? 'Polling failed.' });
          clearPersistedJob();
          return;
        }

        setSingleSteps((prev) => applyStatusToSteps(prev, data.status, data.progress ?? 0));

        if (data.status === 'complete') {
          clearInterval(singlePollRef.current!);
          const title = data.title ?? fallbackTitle;
          setSingleJob({ phase: 'complete', jobId, lectureId: data.lectureId, title });
          clearPersistedJob();
          showToast(`New lecture ready: ${title}`);
        } else if (data.status === 'error') {
          clearInterval(singlePollRef.current!);
          setSingleJob({ phase: 'error', errorMessage: data.error ?? 'Processing failed.' });
          clearPersistedJob();
        }
      } catch {
        // network blip — keep polling
      }
    };

    singlePollRef.current = setInterval(tick, POLL_INTERVAL);
    tick(); // immediate first tick
  }

  // ── Single submit ─────────────────────────────────────────────────────────────
  async function handleSingleSubmit() {
    if (!singleFile) return;
    const token = await getToken();
    if (!token) {
      setSingleJob({ phase: 'error', errorMessage: 'Not authenticated — please sign in again.' });
      return;
    }

    if (singlePollRef.current) clearInterval(singlePollRef.current);

    setSingleJob({ phase: 'uploading' });
    setSingleSteps(applyStatusToSteps(buildInitialSteps(), 'uploading-to-storage', 0));
    setSingleCost(undefined);
    setSingleWarning(undefined);

    const lecTitle = singleTitle.trim() || singleFile.name.replace(/\.[^.]+$/, '');
    const result   = await apiUpload(singleFile, singleCourse, lecTitle, token);

    if ('error' in result) {
      setSingleJob({ phase: 'error', errorMessage: result.error });
      setSingleSteps((prev) => applyStatusToSteps(prev, 'error', 0));
      return;
    }

    setSingleCost(result.estimatedCost);
    if (result.tokenWarning) setSingleWarning(result.tokenWarning);

    setSingleJob({ phase: 'polling', jobId: result.jobId, title: lecTitle });
    setSingleSteps(applyStatusToSteps(buildInitialSteps(), 'pending', 0));
    // Upload step is done — mark it so before first poll returns
    setSingleSteps((prev) => applyStatusToSteps(
      prev.map((s) => s.id === 'upload' ? { ...s, status: 'done', detail: undefined } : s),
      'pending', 0
    ));
    persistJob(result.jobId, lecTitle);

    startPolling(result.jobId, token, lecTitle);
  }

  // ── Batch helpers ─────────────────────────────────────────────────────────────
  const batchFilledItems = batchItems.filter((b) => b.file !== null);

  function ensureMinOneBatchItem(items: BatchItem[]): BatchItem[] {
    return items.length === 0 ? [newBatchItem()] : items;
  }

  async function handleBatchProcess() {
    const token = await getToken();
    if (!token) return;

    setBatchRunning(true);
    setBatchStep('processing');

    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      if (!item.file) continue;

      if (dailyLimit) {
        setBatchItems((prev) => prev.map((b, idx) =>
          idx >= i
            ? { ...b, phase: 'error', errorMessage: 'Daily limit reached. Will process tomorrow.' }
            : b
        ));
        break;
      }

      // Mark uploading
      setBatchItems((prev) => prev.map((b) =>
        b.id === item.id ? { ...b, phase: 'uploading', steps: buildInitialSteps() } : b
      ));

      const lecTitle = item.title.trim() || item.file.name.replace(/\.[^.]+$/, '');
      const result   = await apiUpload(item.file, item.course, lecTitle, token);

      if ('error' in result) {
        if (result.error.toLowerCase().includes('limit')) setDailyLimit(true);
        setBatchItems((prev) => prev.map((b) =>
          b.id === item.id ? { ...b, phase: 'error', errorMessage: result.error } : b
        ));
        continue;
      }

      setBatchItems((prev) => prev.map((b) =>
        b.id === item.id
          ? { ...b, phase: 'polling', jobId: result.jobId, estimatedCost: result.estimatedCost, tokenWarning: result.tokenWarning }
          : b
      ));

      // Poll synchronously — wait for this item before starting the next
      await new Promise<void>((resolve) => {
        const id = setInterval(async () => {
          try {
            const res  = await fetch(`/api/upload/status?jobId=${result.jobId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();

            setBatchItems((prev) => prev.map((b) =>
              b.id === item.id
                ? { ...b, steps: applyStatusToSteps(b.steps, data.status, data.progress ?? 0) }
                : b
            ));

            if (data.status === 'complete') {
              clearInterval(id);
              const title = data.title ?? lecTitle;
              setBatchItems((prev) => prev.map((b) =>
                b.id === item.id ? { ...b, phase: 'complete', lectureId: data.lectureId } : b
              ));
              showToast(`New lecture ready: ${title}`);
              resolve();
            } else if (data.status === 'error') {
              clearInterval(id);
              setBatchItems((prev) => prev.map((b) =>
                b.id === item.id
                  ? { ...b, phase: 'error', errorMessage: data.error ?? 'Processing failed.' }
                  : b
              ));
              resolve();
            }
          } catch { /* network blip */ }
        }, POLL_INTERVAL);
      });
    }

    setBatchRunning(false);
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const singleBusy    = singleJob.phase === 'uploading' || singleJob.phase === 'polling';
  const singleDone    = singleJob.phase === 'complete';
  const singleError   = singleJob.phase === 'error';
  const isProcessing  = singleBusy || batchRunning;

  const singleDisplayCost = singleCost ?? (singleFile ? estimateClientCost(singleFile.size) : undefined);
  const batchTotalCost    = batchItems.reduce((s, b) => s + (b.file ? estimateClientCost(b.file.size) : 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>

      <Header
        lectureCount={0}
        userId={userId}
        initialTheme={theme}
        isProcessing={isProcessing}
        hideUploadButton
      />

      <main className="upl-page">

        {/* Top bar */}
        <div className="upl-topbar">
          <Link href="/app" className="upl-back-link">← Back to Dashboard</Link>
          {isProcessing && (
            <span className="upl-processing-badge">
              <span className="upl-spin-sm" />
              Processing…
            </span>
          )}
        </div>

        {/* Page header */}
        <div className="upl-header">
          <h1 className="upl-title">Upload Lecture</h1>
          <p className="upl-subtitle">
            Drop a PDF or PPTX and StudyMD will generate flashcards &amp; exam questions automatically.
          </p>
          <div className="upl-mode-toggle">
            <button
              className={`upl-mode-btn${mode === 'single' ? ' active' : ''}`}
              onClick={() => { setMode('single'); }}
              disabled={singleBusy || batchRunning}
            >Single Lecture</button>
            <button
              className={`upl-mode-btn${mode === 'batch' ? ' active' : ''}`}
              onClick={() => { setMode('batch'); }}
              disabled={singleBusy || batchRunning}
            >Batch Upload</button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════ SINGLE ══ */}
        {mode === 'single' && (
          <div className="upl-layout">

            {/* Left col */}
            <div className="upl-left">

              {/* Drop zone */}
              <div
                className={`upl-dropzone${isDragging ? ' dragging' : ''}${singleFile ? ' has-file' : ''}`}
                onClick={() => !singleBusy && singleInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) applySingleFile(f);
                }}
                role="button"
                tabIndex={0}
                aria-label="File upload zone"
                onKeyDown={(e) => e.key === 'Enter' && !singleBusy && singleInputRef.current?.click()}
              >
                <input
                  ref={singleInputRef}
                  type="file"
                  accept=".pdf,.pptx,.ppt"
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) applySingleFile(f); e.target.value = ''; }}
                />
                {singleFile ? (
                  <div className="upl-file-info">
                    <span className="upl-file-icon">{singleFile.name.toLowerCase().endsWith('.pdf') ? '📄' : '📊'}</span>
                    <div className="upl-file-meta">
                      <div className="upl-file-name">{singleFile.name}</div>
                      <div className="upl-file-size">
                        {(singleFile.size / 1024 / 1024).toFixed(2)} MB · {singleFile.name.split('.').pop()?.toUpperCase()}
                      </div>
                    </div>
                    {!singleBusy && (
                      <button
                        className="upl-file-change"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSingleFile(null);
                          setSingleJob({ phase: 'idle' });
                          setSingleSteps(buildInitialSteps());
                          setSingleCost(undefined);
                          setSingleWarning(undefined);
                        }}
                      >Change</button>
                    )}
                  </div>
                ) : (
                  <div className="upl-drop-inner">
                    <div className="upl-drop-icon">⬆</div>
                    <p className="upl-drop-headline">Drop your lecture file here</p>
                    <p className="upl-drop-sub">or click to browse — PDF or PPTX, max 50 MB</p>
                  </div>
                )}
              </div>

              {/* PPTX notice */}
              {singleFile?.name.toLowerCase().endsWith('.pptx') && (
                <div className="upl-notice upl-notice--warn">
                  <strong>📊 PPTX detected.</strong> We&apos;ll handle conversion server-side.
                  For best results, export as PDF first if you notice quality issues.
                </div>
              )}

              {/* Config */}
              <div className="upl-config">
                <div className="upl-field">
                  <label className="upl-label">Course</label>
                  <select className="upl-select" value={singleCourse}
                    onChange={(e) => setSingleCourse(e.target.value as Course)} disabled={singleBusy}>
                    {VALID_COURSES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="upl-field">
                  <label className="upl-label">Lecture title <span className="upl-optional">(optional)</span></label>
                  <input className="upl-input" type="text" placeholder="e.g. Head & Neck Exam"
                    value={singleTitle} onChange={(e) => setSingleTitle(e.target.value)}
                    disabled={singleBusy} maxLength={120} />
                </div>
              </div>

              {/* Cost */}
              {singleFile && singleDisplayCost !== undefined && (
                <div className="upl-cost-row">
                  <span className="upl-cost-label">Estimated cost</span>
                  <span className="upl-cost-val">~${singleDisplayCost.toFixed(4)}</span>
                </div>
              )}

              {/* Token warning */}
              {singleWarning && <div className="upl-notice upl-notice--warn">{singleWarning}</div>}

              {/* Error */}
              {singleError && (
                <div className="upl-notice upl-notice--error">
                  <strong>Something went wrong</strong>
                  <p>{singleJob.errorMessage}</p>
                </div>
              )}

              {/* Actions */}
              <div className="upl-actions">
                {!singleDone ? (
                  <button className="upl-submit-btn" onClick={handleSingleSubmit}
                    disabled={!singleFile || singleBusy}>
                    {singleJob.phase === 'uploading'
                      ? <><span className="upl-spin-sm" /> Uploading file…</>
                      : singleJob.phase === 'polling'
                      ? <><span className="upl-spin-sm" /> Processing…</>
                      : 'Start Processing'}
                  </button>
                ) : (
                  <Link href="/app" className="upl-done-btn">← Back to Dashboard</Link>
                )}
              </div>

            </div>

            {/* Right col: sticky timeline */}
            <div className="upl-right">
              <div className="upl-timeline-card">
                <div className="upl-timeline-heading">Processing Pipeline</div>
                <ProcessingTimeline steps={singleSteps} />
                {singleDone && singleJob.lectureId && (
                  <div className="upl-timeline-success">
                    ✅ Ready!{' '}
                    <Link href={`/app/study/flash?lecture=${singleJob.lectureId}`} className="upl-study-link">
                      Start studying →
                    </Link>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ BATCH ══ */}
        {mode === 'batch' && (
          <div className="upl-batch-wrap">

            {/* ── Configure step ── */}
            {batchStep === 'configure' && (
              <>
                {dailyLimit && (
                  <div className="upl-notice upl-notice--warn">
                    ⏸ Daily processing limit reached. Remaining lectures will be paused until tomorrow.
                  </div>
                )}

                {batchItems.map((item, idx) => (
                  <BatchItemRow
                    key={item.id}
                    item={item}
                    index={idx}
                    disabled={false}
                    canRemove={batchItems.length > 1}
                    onFileChange={(f) => setBatchItems((prev) => prev.map((b) =>
                      b.id === item.id
                        ? { ...b, file: f, title: b.title || f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') }
                        : b
                    ))}
                    onCourseChange={(c) => setBatchItems((prev) => prev.map((b) =>
                      b.id === item.id ? { ...b, course: c } : b
                    ))}
                    onTitleChange={(t) => setBatchItems((prev) => prev.map((b) =>
                      b.id === item.id ? { ...b, title: t } : b
                    ))}
                    onRemove={() => setBatchItems((prev) =>
                      ensureMinOneBatchItem(prev.filter((b) => b.id !== item.id))
                    )}
                  />
                ))}

                <div className="upl-batch-actions">
                  <button className="upl-add-btn"
                    onClick={() => setBatchItems((prev) => [...prev, newBatchItem()])}>
                    + Add Another File
                  </button>
                  <div className="upl-batch-actions-right">
                    {batchFilledItems.length > 0 && (
                      <span className="upl-cost-row">
                        <span className="upl-cost-label">Total est.</span>
                        <span className="upl-cost-val">~${batchTotalCost.toFixed(4)}</span>
                      </span>
                    )}
                    <button
                      className="upl-submit-btn"
                      disabled={batchFilledItems.length === 0}
                      onClick={() => setBatchStep('review')}
                    >
                      Review {batchFilledItems.length} {batchFilledItems.length === 1 ? 'File' : 'Files'} →
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Review step ── */}
            {batchStep === 'review' && (
              <div className="upl-review">
                <div className="upl-review-header">
                  <h2 className="upl-review-title">Review Uploads</h2>
                  <p className="upl-review-sub">
                    Confirm the details below before processing. Each file will be processed sequentially.
                  </p>
                </div>

                <div className="upl-review-table">
                  <div className="upl-review-thead">
                    <span>#</span>
                    <span>File</span>
                    <span>Course</span>
                    <span>Title</span>
                    <span>Est. Cost</span>
                  </div>
                  {batchFilledItems.map((item, idx) => (
                    <div key={item.id} className="upl-review-row">
                      <span className="upl-review-num">{idx + 1}</span>
                      <span className="upl-review-file">
                        <span className="upl-review-file-icon">
                          {item.file!.name.toLowerCase().endsWith('.pdf') ? '📄' : '📊'}
                        </span>
                        <span className="upl-review-file-name">{item.file!.name}</span>
                        <span className="upl-review-file-size">
                          {(item.file!.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                      </span>
                      <span className="upl-review-course">{item.course}</span>
                      <span className="upl-review-title-val">
                        {item.title || item.file!.name.replace(/\.[^.]+$/, '')}
                      </span>
                      <span className="upl-review-cost">
                        ~${estimateClientCost(item.file!.size).toFixed(4)}
                      </span>
                    </div>
                  ))}
                  <div className="upl-review-total">
                    <span style={{ gridColumn: '1 / 5', textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                      Total estimated cost
                    </span>
                    <span className="upl-cost-val">~${batchTotalCost.toFixed(4)}</span>
                  </div>
                </div>

                <div className="upl-review-footer">
                  <button className="upl-ghost-btn" onClick={() => setBatchStep('configure')}>
                    ← Back to Edit
                  </button>
                  <button className="upl-submit-btn" onClick={handleBatchProcess}>
                    Process {batchFilledItems.length} {batchFilledItems.length === 1 ? 'Lecture' : 'Lectures'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Processing step ── */}
            {batchStep === 'processing' && (
              <div className="upl-batch-processing">
                {batchItems.filter((b) => b.file).map((item, idx) => (
                  <div
                    key={item.id}
                    className={`upl-batch-item${item.phase === 'complete' ? ' done' : ''}${item.phase === 'error' ? ' has-error' : ''}`}
                  >
                    <div className="upl-batch-item-hdr">
                      <div className="upl-batch-item-info">
                        <span className="upl-batch-num">#{idx + 1}</span>
                        <span className="upl-batch-item-name">
                          {item.title || item.file!.name.replace(/\.[^.]+$/, '')}
                        </span>
                        <span className="upl-batch-item-course">{item.course}</span>
                      </div>
                      <span className={`upl-batch-item-status ${item.phase}`}>
                        {item.phase === 'idle'      && 'Queued'}
                        {item.phase === 'uploading' && <><span className="upl-spin-sm" /> Uploading…</>}
                        {item.phase === 'polling'   && <><span className="upl-spin-sm" /> Processing…</>}
                        {item.phase === 'complete'  && '✅ Done'}
                        {item.phase === 'error'     && '❌ Error'}
                      </span>
                    </div>
                    {(item.phase === 'uploading' || item.phase === 'polling' || item.phase === 'complete' || item.phase === 'error') && (
                      <div className="upl-batch-timeline">
                        <ProcessingTimeline steps={item.steps} compact />
                        {item.phase === 'error' && (
                          <div className="upl-notice upl-notice--error" style={{ marginTop: 8 }}>
                            {item.errorMessage}
                          </div>
                        )}
                        {item.phase === 'complete' && item.lectureId && (
                          <div className="upl-timeline-success" style={{ marginTop: 8 }}>
                            <Link href={`/app/study/flash?lecture=${item.lectureId}`} className="upl-study-link">
                              Study now →
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {!batchRunning && (
                  <div className="upl-batch-done-bar">
                    <Link href="/app" className="upl-done-btn">← Back to Dashboard</Link>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="upl-footer">
        <div className="upl-footer-inner">
          <div className="upl-footer-top">
            <div className="upl-footer-brand">
              <div className="smd-logo">
                <span className="smd-logo-study">Study</span>
                <span className="smd-logo-md">MD</span>
              </div>
              <p className="upl-footer-note">
                Lecture Mastery Platform — designed for{' '}
                <em style={{ color: 'var(--accent)', fontStyle: 'normal', fontWeight: 600 }}>Haley Lange</em>
              </p>
            </div>
            <div className="upl-footer-links">
              <Link href="/app"        className="upl-footer-link">Dashboard</Link>
              <Link href="/app/upload" className="upl-footer-link">Upload Lecture</Link>
            </div>
          </div>
          <div className="upl-footer-bottom">
            <span>© 2026 StudyMD. All rights reserved.</span>
            <span>
              Built with{' '}
              <a href="https://anthropic.com" target="_blank" rel="noopener noreferrer" className="upl-footer-link-inline">
                Anthropic Claude
              </a>{' '}
              — a{' '}
              <a href="https://tutormd.com" target="_blank" rel="noopener noreferrer" className="upl-footer-link-inline">
                TutorMD
              </a>{' '}
              product
            </span>
          </div>
        </div>
      </footer>

      {/* Toast */}
      {toast.visible && <div className="upl-toast">✅ {toast.msg}</div>}
    </>
  );

  function applySingleFile(f: File) {
    setSingleFile(f);
    setSingleJob({ phase: 'idle' });
    setSingleSteps(buildInitialSteps());
    setSingleCost(undefined);
    setSingleWarning(undefined);
    setSingleTitle((prev) => prev || f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProcessingTimeline({ steps, compact = false }: { steps: TimelineStep[]; compact?: boolean }) {
  return (
    <ol className={`upl-timeline${compact ? ' compact' : ''}`}>
      {steps.map((step, i) => (
        <li key={step.id} className={`upl-step ${step.status}`}>
          <div className="upl-step-line" aria-hidden />
          <div className="upl-step-dot">
            {step.status === 'done'    && '✓'}
            {step.status === 'active'  && <span className="upl-step-spin" />}
            {step.status === 'error'   && '✕'}
            {step.status === 'pending' && <span className="upl-step-n">{i + 1}</span>}
          </div>
          <div className="upl-step-body">
            <span className="upl-step-label">{step.label}</span>
            {step.detail && <span className="upl-step-detail">{step.detail}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

interface BatchItemRowProps {
  item: BatchItem;
  index: number;
  disabled: boolean;
  canRemove: boolean;
  onFileChange: (f: File) => void;
  onCourseChange: (c: Course) => void;
  onTitleChange: (t: string) => void;
  onRemove: () => void;
}

function BatchItemRow({ item, index, disabled, canRemove, onFileChange, onCourseChange, onTitleChange, onRemove }: BatchItemRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="upl-batch-item idle">
      <div className="upl-batch-item-hdr">
        <span className="upl-batch-num">#{index + 1}</span>
        {canRemove && !disabled && (
          <button className="upl-batch-remove" onClick={onRemove} aria-label="Remove file">✕</button>
        )}
      </div>
      <div className="upl-batch-row">
        <div
          className={`upl-batch-drop${item.file ? ' has-file' : ''}`}
          onClick={() => !disabled && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.pptx,.ppt"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileChange(f); e.target.value = ''; }}
          />
          {item.file
            ? <span className="upl-batch-filename">{item.file.name}</span>
            : <span className="upl-batch-placeholder">Click to select file…</span>}
        </div>
        <select className="upl-select" value={item.course}
          onChange={(e) => onCourseChange(e.target.value as Course)} disabled={disabled}>
          {VALID_COURSES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="upl-input" type="text" placeholder="Title (optional)"
          value={item.title} onChange={(e) => onTitleChange(e.target.value)} disabled={disabled} />
      </div>
    </div>
  );
}

// ── CSS ────────────────────────────────────────────────────────────────────────
const css = `
/* ── Shell ───────────────────────────────────────────────────────────── */
.upl-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 40px 60px;
  min-height: calc(100vh - 200px);
}

/* ── Top bar ─────────────────────────────────────────────────────────── */
.upl-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}
.upl-back-link {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  transition: color 0.15s;
}
.upl-back-link:hover { color: var(--text); }
.upl-processing-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent);
  background: rgba(91,141,238,0.1);
  border: 1px solid rgba(91,141,238,0.25);
  border-radius: 20px;
  padding: 4px 12px;
}

/* ── Page header ─────────────────────────────────────────────────────── */
.upl-header { margin-bottom: 32px; }
.upl-title {
  font-family: 'Fraunces', serif;
  font-size: clamp(26px, 4vw, 44px);
  font-weight: 700;
  color: var(--text);
  margin: 0 0 8px;
  line-height: 1.1;
}
.upl-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0 0 18px;
  max-width: 520px;
  line-height: 1.65;
}

/* ── Mode toggle ─────────────────────────────────────────────────────── */
.upl-mode-toggle {
  display: inline-flex;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 4px;
  gap: 4px;
}
.upl-mode-btn {
  padding: 8px 20px;
  min-height: 36px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  background: none;
  border: none;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.upl-mode-btn.active { background: var(--accent); color: #fff; }
.upl-mode-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Two-column layout ───────────────────────────────────────────────── */
.upl-layout {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 32px;
  align-items: start;
}
.upl-left  { display: flex; flex-direction: column; gap: 18px; }
.upl-right {
  position: sticky;
  /* header ~72px + 16px gap; bottom offset keeps card from running into footer */
  top: 88px;
  max-height: calc(100vh - 88px - 80px);
  overflow-y: auto;
  /* thin scrollbar so it doesn't look broken */
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.upl-right::-webkit-scrollbar { width: 4px; }
.upl-right::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* ── Drop zone ───────────────────────────────────────────────────────── */
.upl-dropzone {
  border: 2px dashed rgba(255,255,255,0.15);
  border-radius: 20px;
  padding: 48px 32px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s;
  background: var(--surface);
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.upl-dropzone:hover,
.upl-dropzone.dragging {
  border-color: var(--accent);
  background: rgba(91,141,238,0.05);
}
.upl-dropzone.has-file {
  padding: 22px 28px;
  border-style: solid;
  border-color: rgba(255,255,255,0.12);
  cursor: default;
}
.upl-drop-inner { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.upl-drop-icon  { font-size: 38px; opacity: 0.4; }
.upl-drop-headline { font-size: 16px; font-weight: 600; color: var(--text); margin: 0; }
.upl-drop-sub      { font-size: 13px; color: var(--text-muted); margin: 0; }

/* ── File info ───────────────────────────────────────────────────────── */
.upl-file-info { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; }
.upl-file-icon { font-size: 30px; flex-shrink: 0; }
.upl-file-meta { flex: 1; min-width: 0; }
.upl-file-name {
  font-size: 14px; font-weight: 600; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.upl-file-size { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.upl-file-change {
  flex-shrink: 0;
  font-size: 12px; color: var(--accent);
  background: none; border: 1px solid rgba(91,141,238,0.3);
  border-radius: 8px; padding: 6px 12px;
  min-height: 44px; min-width: 44px;
  cursor: pointer; transition: background 0.15s;
}
.upl-file-change:hover { background: rgba(91,141,238,0.1); }

/* ── Notice banners ──────────────────────────────────────────────────── */
.upl-notice {
  font-size: 13px; border-radius: 10px;
  padding: 11px 14px; line-height: 1.5;
}
.upl-notice--warn {
  color: rgba(240,192,64,0.95);
  background: rgba(240,192,64,0.07);
  border: 1px solid rgba(240,192,64,0.22);
}
.upl-notice--error {
  color: #f87171;
  background: rgba(239,68,68,0.07);
  border: 1px solid rgba(239,68,68,0.2);
}
.upl-notice--error strong { display: block; margin-bottom: 3px; font-weight: 600; }
.upl-notice--error p { margin: 0; color: rgba(248,113,113,0.8); font-size: 12px; }

/* ── Config ──────────────────────────────────────────────────────────── */
.upl-config { display: flex; flex-direction: column; gap: 14px; }
.upl-field  { display: flex; flex-direction: column; gap: 6px; }
.upl-label {
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-muted);
}
.upl-optional { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 11px; }
.upl-select, .upl-input {
  background: var(--surface); color: var(--text);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 10px 14px;
  font-family: 'Outfit', sans-serif; font-size: 14px;
  min-height: 44px; outline: none; width: 100%;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.upl-select:focus, .upl-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(91,141,238,0.18);
}
.upl-select:disabled, .upl-input:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Cost row ────────────────────────────────────────────────────────── */
.upl-cost-row  { display: flex; align-items: center; gap: 8px; }
.upl-cost-label { font-size: 12px; color: var(--text-muted); font-weight: 500; }
.upl-cost-val  {
  font-family: 'DM Mono', monospace;
  font-size: 14px; font-weight: 500; color: var(--accent);
}

/* ── Actions ─────────────────────────────────────────────────────────── */
.upl-actions { display: flex; gap: 12px; flex-wrap: wrap; }

.upl-submit-btn {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--accent); color: #fff;
  border: none; border-radius: 12px;
  padding: 12px 28px;
  font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
  min-height: 48px; cursor: pointer;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 18px rgba(91,141,238,0.28);
}
.upl-submit-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 82%, black);
  transform: translateY(-1px);
  box-shadow: 0 6px 24px rgba(91,141,238,0.38);
}
.upl-submit-btn:disabled {
  opacity: 0.4; cursor: not-allowed;
  box-shadow: none; transform: none;
}

.upl-ghost-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; color: var(--text-muted);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px; padding: 12px 22px;
  font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
  min-height: 48px; cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.upl-ghost-btn:hover { color: var(--text); background: rgba(255,255,255,0.05); }

.upl-done-btn {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(16,185,129,0.12); color: #10b981;
  border: 1px solid rgba(16,185,129,0.3);
  border-radius: 12px; padding: 12px 24px;
  font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
  min-height: 48px; text-decoration: none;
  transition: background 0.15s;
}
.upl-done-btn:hover { background: rgba(16,185,129,0.2); }

/* ── Timeline card ───────────────────────────────────────────────────── */
.upl-timeline-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 22px 20px 20px;
}
.upl-timeline-heading {
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.13em;
  color: var(--text-muted); margin-bottom: 18px;
  font-family: 'DM Mono', monospace;
}

/* ── Vertical stepper ────────────────────────────────────────────────── */
.upl-timeline { list-style: none; margin: 0; padding: 0; }
.upl-timeline.compact .upl-step { padding-bottom: 14px; }
.upl-timeline.compact .upl-step-dot { width: 22px; height: 22px; min-width: 22px; font-size: 10px; }
.upl-timeline.compact .upl-step-label { font-size: 12px; }

.upl-step {
  display: flex; align-items: flex-start; gap: 12px;
  position: relative; padding-bottom: 18px;
}
.upl-step:last-child { padding-bottom: 0; }

.upl-step-line {
  position: absolute;
  left: 12px; top: 26px; bottom: 0;
  width: 2px;
  background: rgba(255,255,255,0.08);
}
.upl-step:last-child .upl-step-line { display: none; }
.upl-step.done  .upl-step-line { background: rgba(16,185,129,0.35); }

.upl-step-dot {
  flex-shrink: 0; z-index: 1;
  width: 26px; height: 26px; min-width: 26px;
  border-radius: 50%;
  background: rgba(255,255,255,0.05);
  border: 2px solid rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: var(--text-muted);
  transition: all 0.25s;
}
.upl-step.done  .upl-step-dot { background: rgba(16,185,129,0.15); border-color: #10b981; color: #10b981; }
.upl-step.active .upl-step-dot { background: rgba(91,141,238,0.15); border-color: var(--accent); box-shadow: 0 0 0 4px rgba(91,141,238,0.12); }
.upl-step.error  .upl-step-dot { background: rgba(239,68,68,0.15); border-color: #ef4444; color: #ef4444; }

.upl-step-n    { font-size: 10px; color: var(--text-muted); }
.upl-step-spin {
  display: inline-block; width: 11px; height: 11px;
  border: 2px solid rgba(91,141,238,0.3);
  border-top-color: var(--accent);
  border-radius: 50%; animation: upl-spin 0.7s linear infinite;
}

.upl-step-body { display: flex; flex-direction: column; gap: 2px; padding-top: 3px; min-width: 0; }
.upl-step-label { font-size: 13px; font-weight: 500; color: var(--text); line-height: 1.3; }
.upl-step-detail { font-size: 11px; color: var(--accent); font-family: 'DM Mono', monospace; }
.upl-step.done  .upl-step-label { color: var(--text-muted); }
.upl-step.error .upl-step-label { color: #f87171; }

.upl-timeline-success {
  margin-top: 14px; padding-top: 14px;
  border-top: 1px solid rgba(16,185,129,0.2);
  font-size: 13px; color: #10b981; font-weight: 500;
}
.upl-study-link { color: var(--accent); text-decoration: none; font-weight: 600; }
.upl-study-link:hover { text-decoration: underline; }

/* ── Batch configure ─────────────────────────────────────────────────── */
.upl-batch-wrap { display: flex; flex-direction: column; gap: 14px; }

.upl-batch-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 18px 20px;
  transition: border-color 0.15s;
}
.upl-batch-item.done      { border-color: rgba(16,185,129,0.3); }
.upl-batch-item.has-error { border-color: rgba(239,68,68,0.25); }

.upl-batch-item-hdr {
  display: flex; align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.upl-batch-item-info { display: flex; align-items: center; gap: 10px; }
.upl-batch-num {
  font-family: 'DM Mono', monospace; font-size: 11px;
  font-weight: 500; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.1em;
}
.upl-batch-item-name { font-size: 13px; font-weight: 600; color: var(--text); }
.upl-batch-item-course { font-size: 11px; color: var(--text-muted); }
.upl-batch-item-status {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 500; color: var(--text-muted);
}
.upl-batch-item-status.complete { color: #10b981; }
.upl-batch-item-status.error    { color: #f87171; }
.upl-batch-item-status.uploading,
.upl-batch-item-status.polling  { color: var(--accent); }

.upl-batch-remove {
  min-width: 44px; min-height: 44px;
  background: none; border: none;
  color: var(--text-muted); cursor: pointer;
  font-size: 14px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  transition: color 0.15s, background 0.15s;
}
.upl-batch-remove:hover { color: #f87171; background: rgba(239,68,68,0.08); }

.upl-batch-row {
  display: grid;
  grid-template-columns: 1fr 200px 200px;
  gap: 10px;
  align-items: stretch;
}
.upl-batch-drop {
  background: rgba(255,255,255,0.03);
  border: 1px dashed rgba(255,255,255,0.14);
  border-radius: 10px; padding: 10px 14px;
  min-height: 44px; display: flex; align-items: center;
  cursor: pointer; overflow: hidden;
  transition: border-color 0.15s, background 0.15s;
}
.upl-batch-drop:hover       { border-color: var(--accent); background: rgba(91,141,238,0.04); }
.upl-batch-drop.has-file    { border-style: solid; border-color: rgba(255,255,255,0.12); cursor: default; }
.upl-batch-filename         { font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.upl-batch-placeholder      { font-size: 13px; color: var(--text-muted); }
.upl-batch-timeline         { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06); }

.upl-batch-actions {
  display: flex; align-items: center;
  justify-content: space-between;
  padding-top: 4px; flex-wrap: wrap; gap: 12px;
}
.upl-batch-actions-right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }

.upl-add-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: 1px dashed rgba(255,255,255,0.18);
  border-radius: 10px; color: var(--text-muted);
  font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
  padding: 10px 18px; min-height: 44px;
  cursor: pointer; transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.upl-add-btn:hover { border-color: var(--accent); color: var(--accent); background: rgba(91,141,238,0.05); }
.upl-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Batch review table ──────────────────────────────────────────────── */
.upl-review { display: flex; flex-direction: column; gap: 24px; }
.upl-review-header {}
.upl-review-title {
  font-family: 'Fraunces', serif;
  font-size: 22px; font-weight: 700;
  color: var(--text); margin: 0 0 6px;
}
.upl-review-sub { font-size: 13px; color: var(--text-muted); margin: 0; line-height: 1.55; }

.upl-review-table {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.upl-review-thead,
.upl-review-row,
.upl-review-total {
  display: grid;
  grid-template-columns: 36px 1fr 180px 180px 100px;
  gap: 12px;
  padding: 12px 18px;
  align-items: center;
}
.upl-review-thead {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.09em; color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  font-family: 'DM Mono', monospace;
}
.upl-review-row { border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; color: var(--text); }
.upl-review-row:last-of-type { border-bottom: none; }
.upl-review-num  { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text-muted); }
.upl-review-file { display: flex; align-items: center; gap: 6px; min-width: 0; }
.upl-review-file-icon { flex-shrink: 0; font-size: 16px; }
.upl-review-file-name {
  font-size: 12px; font-weight: 500; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.upl-review-file-size { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.upl-review-course { font-size: 12px; color: var(--text-muted); }
.upl-review-title-val { font-size: 12px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.upl-review-cost { font-family: 'DM Mono', monospace; font-size: 12px; color: var(--accent); }
.upl-review-total {
  border-top: 1px solid var(--border);
  padding: 10px 18px;
  font-size: 12px;
}

.upl-review-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

/* ── Batch processing ────────────────────────────────────────────────── */
.upl-batch-processing { display: flex; flex-direction: column; gap: 14px; }
.upl-batch-done-bar { padding-top: 8px; }

/* ── Spinners ────────────────────────────────────────────────────────── */
.upl-spin-sm {
  display: inline-block; width: 13px; height: 13px; flex-shrink: 0;
  border: 2px solid rgba(255,255,255,0.22);
  border-top-color: currentColor;
  border-radius: 50%; animation: upl-spin 0.7s linear infinite;
}
@keyframes upl-spin { to { transform: rotate(360deg); } }

/* ── Toast ───────────────────────────────────────────────────────────── */
.upl-toast {
  position: fixed; bottom: 28px; right: 28px;
  background: var(--surface);
  border: 1px solid rgba(16,185,129,0.35);
  color: #10b981;
  font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
  border-radius: 12px; padding: 12px 20px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4);
  z-index: 9999;
  animation: upl-toast-in 0.2s ease;
  max-width: calc(100vw - 56px);
}
@keyframes upl-toast-in {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to   { opacity: 1; transform: none; }
}

/* ── Footer ──────────────────────────────────────────────────────────── */
.upl-footer {
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 60%, var(--bg));
  margin-top: 80px;
}
.upl-footer-inner {
  max-width: 1100px; margin: 0 auto;
  padding: 36px 40px 28px;
}
.upl-footer-top {
  display: flex; justify-content: space-between;
  align-items: center; gap: 24px;
  margin-bottom: 24px; flex-wrap: wrap;
}
.upl-footer-brand { display: flex; flex-direction: column; gap: 6px; }
.upl-footer-note  { font-size: 13px; color: var(--text-muted); margin: 0; }
.upl-footer-links { display: flex; gap: 24px; }
.upl-footer-link  {
  font-size: 13px; color: var(--text-muted);
  text-decoration: none; transition: color 0.15s;
}
.upl-footer-link:hover { color: var(--text); }
.upl-footer-bottom {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
  border-top: 1px solid var(--border); padding-top: 18px;
  font-size: 12px; color: var(--text-muted);
}
.upl-footer-link-inline {
  color: var(--accent); text-decoration: none; transition: opacity 0.15s;
}
.upl-footer-link-inline:hover { opacity: 0.8; }

/* ── Mobile ──────────────────────────────────────────────────────────── */
@media (max-width: 767px) {
  .upl-page { padding: 16px 16px 60px; }
  .upl-layout { grid-template-columns: 1fr; gap: 20px; }
  .upl-right  { position: static; }
  .upl-dropzone { padding: 32px 18px; }
  .upl-batch-row { grid-template-columns: 1fr; gap: 10px; }
  .upl-batch-actions { flex-direction: column; align-items: stretch; }
  .upl-batch-actions-right { justify-content: space-between; }
  .upl-submit-btn { width: 100%; justify-content: center; }
  .upl-review-thead,
  .upl-review-row,
  .upl-review-total { grid-template-columns: 28px 1fr 80px; }
  .upl-review-course,
  .upl-review-title-val { display: none; }
  .upl-review-footer { flex-direction: column-reverse; }
  .upl-ghost-btn, .upl-done-btn { width: 100%; justify-content: center; }
  .upl-footer-inner { padding: 28px 16px 20px; }
  .upl-footer-top { flex-direction: column; align-items: flex-start; }
  .upl-footer-bottom { flex-direction: column; align-items: flex-start; gap: 6px; }
  .upl-toast { bottom: 16px; right: 16px; left: 16px; max-width: none; }
}
@media (min-width: 768px) and (max-width: 1023px) {
  .upl-layout { grid-template-columns: 1fr 300px; }
  .upl-batch-row { grid-template-columns: 1fr 160px; }
  .upl-batch-row .upl-input { display: none; }
  .upl-review-thead,
  .upl-review-row,
  .upl-review-total { grid-template-columns: 36px 1fr 150px 90px; }
  .upl-review-title-val { display: none; }
}
`;
