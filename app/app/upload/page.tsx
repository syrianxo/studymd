'use client';

/**
 * app/app/upload/page.tsx
 * Full-page lecture upload experience for StudyMD v2.
 *
 * Replaces UploadModal. Wires directly to:
 *   POST /api/upload          — file upload + job creation
 *   GET  /api/upload/status   — job status polling
 *
 * Modes: Single Lecture | Batch Upload
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase';
import type { Theme } from '@/types';

// ── Types ────────────────────────────────────────────────────────────────────

const VALID_COURSES = [
  'Physical Diagnosis I',
  'Anatomy & Physiology',
  'Laboratory Diagnosis',
] as const;
type Course = (typeof VALID_COURSES)[number];

type StepStatus = 'pending' | 'active' | 'done' | 'error';

interface TimelineStep {
  id: string;
  label: string;
  detail?: string;
  status: StepStatus;
}

type JobState =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | { phase: 'polling'; jobId: string }
  | { phase: 'complete'; lectureId?: string; title: string }
  | { phase: 'error'; message: string };

interface BatchItem {
  id: string;
  file: File | null;
  course: Course;
  title: string;
  state: JobState;
  steps: TimelineStep[];
  tokenWarning?: string;
  estimatedCost?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildInitialSteps(): TimelineStep[] {
  return [
    { id: 'upload',     label: 'File uploaded',              status: 'pending' },
    { id: 'converting', label: 'Converting slides',          status: 'pending' },
    { id: 'flashcards', label: 'Generating flashcards',      status: 'pending' },
    { id: 'questions',  label: 'Generating exam questions',  status: 'pending' },
    { id: 'validating', label: 'Validating content',         status: 'pending' },
    { id: 'ready',      label: 'Lecture ready!',             status: 'pending' },
  ];
}

function mapJobStatusToSteps(
  apiStatus: string,
  progress: number,
  steps: TimelineStep[]
): TimelineStep[] {
  const updated = steps.map((s) => ({ ...s }));

  const markDone = (id: string) => {
    const s = updated.find((x) => x.id === id);
    if (s) { s.status = 'done'; s.detail = undefined; }
  };
  const markActive = (id: string, detail?: string) => {
    const s = updated.find((x) => x.id === id);
    if (s) { s.status = 'active'; if (detail) s.detail = detail; }
  };

  if (apiStatus === 'pending') {
    markActive('upload', 'Queued…');
  } else if (apiStatus === 'converting') {
    markDone('upload');
    markActive('converting', progress > 0 ? `Slide ${Math.round(progress)}%` : 'In progress…');
  } else if (apiStatus === 'generating') {
    markDone('upload');
    markDone('converting');
    markActive('flashcards', 'Running Claude…');
  } else if (apiStatus === 'complete') {
    updated.forEach((s) => {
      if (s.id !== 'ready') s.status = 'done';
    });
    markDone('ready');
    updated[updated.length - 1].label = 'Lecture ready! ✅';
  } else if (apiStatus === 'error') {
    const activeIdx = updated.findIndex((s) => s.status === 'active' || s.status === 'pending');
    if (activeIdx >= 0) updated[activeIdx].status = 'error';
  }

  return updated;
}

function newBatchItem(): BatchItem {
  return {
    id: Math.random().toString(36).slice(2),
    file: null,
    course: 'Physical Diagnosis I',
    title: '',
    state: { phase: 'idle' },
    steps: buildInitialSteps(),
  };
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter();
  const supabase = createClient();

  const [theme, setTheme] = useState<Theme>('midnight');
  const [userId, setUserId] = useState('');
  const [mode, setMode] = useState<'single' | 'batch'>('single');

  // Single-mode state
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [singleCourse, setSingleCourse] = useState<Course>('Physical Diagnosis I');
  const [singleTitle, setSingleTitle] = useState('');
  const [singleState, setSingleState] = useState<JobState>({ phase: 'idle' });
  const [singleSteps, setSingleSteps] = useState<TimelineStep[]>(buildInitialSteps());
  const [singleWarning, setSingleWarning] = useState<string | undefined>();
  const [singleCost, setSingleCost] = useState<number | undefined>();

  // Batch-mode state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([newBatchItem()]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [dailyLimitHit, setDailyLimitHit] = useState(false);

  // Global processing indicator (for header)
  const [isProcessing, setIsProcessing] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: '', visible: false });

  const singleDropRef = useRef<HTMLDivElement>(null);
  const singleInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth + theme ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
      else router.push('/login');
    });
    try {
      const stored = localStorage.getItem('studymd_theme') as Theme | null;
      if (stored) { setTheme(stored); document.documentElement.dataset.theme = stored; }
    } catch {}
  }, []);

  // ── Toast helper ────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast({ msg, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 4000);
  }

  // ── Auth token helper ────────────────────────────────────────────────────────
  async function getAuthToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  // ── Upload a single file to the API ─────────────────────────────────────────
  async function uploadFile(
    file: File,
    course: string,
    title: string,
    token: string
  ): Promise<{ jobId: string; estimatedCost: number; tokenWarning?: string } | { error: string }> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('course', course);
    if (title.trim()) fd.append('title', title.trim());

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? 'Upload failed.' };
    return { jobId: data.jobId, estimatedCost: data.estimatedCost, tokenWarning: data.tokenWarning };
  }

  // ── Poll job status ─────────────────────────────────────────────────────────
  async function pollStatus(
    jobId: string,
    token: string,
    onUpdate: (status: string, progress: number) => void,
    onComplete: (lectureId?: string, title?: string) => void,
    onError: (msg: string) => void
  ) {
    const poll = async () => {
      try {
        const res = await fetch(`/api/upload/status?jobId=${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { onError(data.error ?? 'Polling error.'); return; }

        onUpdate(data.status, data.progress ?? 0);

        if (data.status === 'complete') {
          clearInterval(pollingRef.current!);
          onComplete(data.lectureId, data.title);
        } else if (data.status === 'error') {
          clearInterval(pollingRef.current!);
          onError(data.error ?? 'Processing failed.');
        }
      } catch (e) {
        // network blip — keep polling
      }
    };
    pollingRef.current = setInterval(poll, 2500);
    poll(); // immediate first tick
  }

  // ── Single mode: handle upload ───────────────────────────────────────────────
  async function handleSingleSubmit() {
    if (!singleFile) return;
    const token = await getAuthToken();
    if (!token) { setSingleState({ phase: 'error', message: 'Not authenticated.' }); return; }

    setIsProcessing(true);
    setSingleState({ phase: 'uploading' });
    setSingleSteps(buildInitialSteps());

    const result = await uploadFile(singleFile, singleCourse, singleTitle, token);
    if ('error' in result) {
      setSingleState({ phase: 'error', message: result.error });
      setIsProcessing(false);
      return;
    }

    setSingleCost(result.estimatedCost);
    setSingleWarning(result.tokenWarning);
    setSingleState({ phase: 'polling', jobId: result.jobId });

    // Mark upload step done immediately
    setSingleSteps((prev) => mapJobStatusToSteps('pending', 0, prev));

    await pollStatus(
      result.jobId,
      token,
      (status, progress) => {
        setSingleSteps((prev) => mapJobStatusToSteps(status, progress, prev));
      },
      (lectureId, title) => {
        const lecTitle = title ?? singleFile.name.replace(/\.[^.]+$/, '');
        setSingleState({ phase: 'complete', lectureId, title: lecTitle });
        setSingleSteps(mapJobStatusToSteps('complete', 100, singleSteps));
        setIsProcessing(false);
        showToast(`New lecture ready: ${lecTitle}`);
      },
      (msg) => {
        setSingleState({ phase: 'error', message: msg });
        setSingleSteps((prev) => mapJobStatusToSteps('error', 0, prev));
        setIsProcessing(false);
      }
    );
  }

  // ── Batch mode: process sequentially ────────────────────────────────────────
  async function handleBatchSubmit() {
    const token = await getAuthToken();
    if (!token) return;

    setBatchRunning(true);
    setIsProcessing(true);

    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      if (!item.file) continue;
      if (dailyLimitHit) {
        setBatchItems((prev) =>
          prev.map((b, idx) =>
            idx >= i ? { ...b, state: { phase: 'error', message: 'Daily limit reached. Will process tomorrow.' } } : b
          )
        );
        break;
      }

      // Update this item to uploading
      setBatchItems((prev) =>
        prev.map((b) => b.id === item.id ? { ...b, state: { phase: 'uploading' }, steps: buildInitialSteps() } : b)
      );

      const result = await uploadFile(item.file, item.course, item.title, token);
      if ('error' in result) {
        if (result.error.includes('limit')) setDailyLimitHit(true);
        setBatchItems((prev) =>
          prev.map((b) => b.id === item.id ? { ...b, state: { phase: 'error', message: result.error } } : b)
        );
        continue;
      }

      setBatchItems((prev) =>
        prev.map((b) => b.id === item.id
          ? { ...b, state: { phase: 'polling', jobId: result.jobId }, estimatedCost: result.estimatedCost, tokenWarning: result.tokenWarning }
          : b)
      );

      // Poll this item synchronously (await completion before next)
      await new Promise<void>((resolve) => {
        const intervalId = setInterval(async () => {
          try {
            const res = await fetch(`/api/upload/status?jobId=${result.jobId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setBatchItems((prev) =>
              prev.map((b) => b.id === item.id
                ? { ...b, steps: mapJobStatusToSteps(data.status, data.progress ?? 0, b.steps) }
                : b)
            );
            if (data.status === 'complete') {
              clearInterval(intervalId);
              const lecTitle = data.title ?? item.file!.name.replace(/\.[^.]+$/, '');
              setBatchItems((prev) =>
                prev.map((b) => b.id === item.id
                  ? { ...b, state: { phase: 'complete', lectureId: data.lectureId, title: lecTitle } }
                  : b)
              );
              showToast(`New lecture ready: ${lecTitle}`);
              resolve();
            } else if (data.status === 'error') {
              clearInterval(intervalId);
              setBatchItems((prev) =>
                prev.map((b) => b.id === item.id
                  ? { ...b, state: { phase: 'error', message: data.error ?? 'Processing failed.' } }
                  : b)
              );
              resolve();
            }
          } catch {
            // network blip
          }
        }, 2500);
      });
    }

    setBatchRunning(false);
    setIsProcessing(false);
  }

  // ── File drag-and-drop (single mode) ─────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);

  function handleSingleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) applySingleFile(f);
  }

  function applySingleFile(f: File) {
    setSingleFile(f);
    setSingleState({ phase: 'idle' });
    setSingleSteps(buildInitialSteps());
    setSingleWarning(undefined);
    setSingleCost(undefined);
    if (!singleTitle) {
      setSingleTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const singleIdle = singleState.phase === 'idle';
  const singleBusy = singleState.phase === 'uploading' || singleState.phase === 'polling';
  const singleDone = singleState.phase === 'complete';
  const singleError = singleState.phase === 'error';

  const batchHasFiles = batchItems.some((b) => b.file !== null);

  const totalEstimatedCost = mode === 'batch'
    ? batchItems.reduce((s, b) => s + (b.estimatedCost ?? 0), 0)
    : (singleCost ?? (singleFile ? estimateClientCost(singleFile.size) : 0));

  function estimateClientCost(bytes: number): number {
    // mirrors server: bytes/150 tokens * haiku price
    const tokens = Math.min(Math.max(Math.ceil(bytes / 150), 5000), 180000);
    return tokens * (1.0 / 1_000_000) + 15000 * (5.0 / 1_000_000);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{uploadPageCss}</style>

      <Header
        lectureCount={0}
        userId={userId}
        initialTheme={theme}
        isProcessing={isProcessing}
      />

      <main className="upl-page">

        {/* ── Page title ───────────────────────────────────────────────────── */}
        <div className="upl-topbar">
          <Link href="/app" className="upl-back-link">
            ← Back to Dashboard
          </Link>
          <div className="upl-topbar-right">
            {isProcessing && (
              <span className="upl-processing-badge">
                <span className="upl-spin" />
                Processing…
              </span>
            )}
          </div>
        </div>

        <div className="upl-header">
          <h1 className="upl-title">Upload Lecture</h1>
          <p className="upl-subtitle">
            Drop a PDF or PPTX and StudyMD will generate flashcards and exam questions automatically.
          </p>

          {/* Mode toggle */}
          <div className="upl-mode-toggle">
            <button
              className={`upl-mode-btn${mode === 'single' ? ' active' : ''}`}
              onClick={() => setMode('single')}
              disabled={singleBusy || batchRunning}
            >
              Single Lecture
            </button>
            <button
              className={`upl-mode-btn${mode === 'batch' ? ' active' : ''}`}
              onClick={() => setMode('batch')}
              disabled={singleBusy || batchRunning}
            >
              Batch Upload
            </button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            SINGLE MODE
        ════════════════════════════════════════════════════════════════════ */}
        {mode === 'single' && (
          <div className="upl-layout">

            {/* Left: Drop zone + config */}
            <div className="upl-left">

              {/* Drop zone */}
              <div
                ref={singleDropRef}
                className={`upl-dropzone${isDragging ? ' dragging' : ''}${singleFile ? ' has-file' : ''}`}
                onClick={() => !singleBusy && singleInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleSingleFileDrop}
                role="button"
                tabIndex={0}
                aria-label="Upload zone"
                onKeyDown={(e) => e.key === 'Enter' && singleInputRef.current?.click()}
              >
                <input
                  ref={singleInputRef}
                  type="file"
                  accept=".pdf,.pptx,.ppt"
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) applySingleFile(f); }}
                />

                {singleFile ? (
                  <div className="upl-file-info">
                    <div className="upl-file-icon">{singleFile.name.endsWith('.pdf') ? '📄' : '📊'}</div>
                    <div className="upl-file-meta">
                      <div className="upl-file-name">{singleFile.name}</div>
                      <div className="upl-file-size">
                        {(singleFile.size / 1024 / 1024).toFixed(2)} MB
                        &nbsp;·&nbsp;
                        {singleFile.name.split('.').pop()?.toUpperCase()}
                      </div>
                    </div>
                    {!singleBusy && (
                      <button
                        className="upl-file-change"
                        onClick={(e) => { e.stopPropagation(); setSingleFile(null); setSingleState({ phase: 'idle' }); setSingleSteps(buildInitialSteps()); }}
                      >
                        Change
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="upl-dropzone-inner">
                    <div className="upl-drop-icon" aria-hidden>⬆</div>
                    <p className="upl-drop-headline">Drop your lecture file here</p>
                    <p className="upl-drop-sub">or click to browse — PDF or PPTX, max 50 MB</p>
                  </div>
                )}
              </div>

              {/* PPTX notice */}
              {singleFile?.name.toLowerCase().endsWith('.pptx') && (
                <div className="upl-pptx-notice">
                  <strong>📊 PPTX detected.</strong> We&apos;ll handle conversion server-side.
                  For best results, export as PDF first if you notice quality issues.
                </div>
              )}

              {/* Config */}
              <div className="upl-config">
                <div className="upl-field">
                  <label className="upl-label">Course</label>
                  <select
                    className="upl-select"
                    value={singleCourse}
                    onChange={(e) => setSingleCourse(e.target.value as Course)}
                    disabled={singleBusy}
                  >
                    {VALID_COURSES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="upl-field">
                  <label className="upl-label">
                    Lecture title <span className="upl-label-optional">(optional)</span>
                  </label>
                  <input
                    className="upl-input"
                    type="text"
                    placeholder="e.g. Head &amp; Neck Exam"
                    value={singleTitle}
                    onChange={(e) => setSingleTitle(e.target.value)}
                    disabled={singleBusy}
                    maxLength={120}
                  />
                </div>
              </div>

              {/* Cost estimate */}
              {singleFile && (
                <div className="upl-cost">
                  <span className="upl-cost-label">Estimated cost</span>
                  <span className="upl-cost-value">~${totalEstimatedCost.toFixed(4)}</span>
                </div>
              )}

              {/* Token warning */}
              {singleWarning && (
                <div className="upl-warning">{singleWarning}</div>
              )}

              {/* Error */}
              {singleError && singleState.phase === 'error' && (
                <div className="upl-error">
                  <strong>Something went wrong</strong>
                  <p>{singleState.message}</p>
                </div>
              )}

              {/* Actions */}
              <div className="upl-actions">
                {!singleDone && (
                  <button
                    className="upl-submit-btn"
                    onClick={handleSingleSubmit}
                    disabled={!singleFile || singleBusy}
                  >
                    {singleBusy ? <><span className="upl-spin" /> Processing…</> : 'Start Processing'}
                  </button>
                )}
                {singleDone && (
                  <Link href="/app" className="upl-done-btn">
                    ← Back to Dashboard
                  </Link>
                )}
              </div>

            </div>

            {/* Right: Processing timeline */}
            <div className="upl-right">
              <div className="upl-timeline-card">
                <div className="upl-timeline-title">Processing Pipeline</div>
                <ProcessingTimeline steps={singleSteps} />
                {singleDone && singleState.phase === 'complete' && singleState.lectureId && (
                  <div className="upl-timeline-success">
                    ✅ Ready!{' '}
                    <Link href={`/app/study/flash?lecture=${singleState.lectureId}`} className="upl-study-link">
                      Start studying →
                    </Link>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            BATCH MODE
        ════════════════════════════════════════════════════════════════════ */}
        {mode === 'batch' && (
          <div className="upl-batch">

            {dailyLimitHit && (
              <div className="upl-daily-limit">
                ⏸ Daily processing limit reached. Remaining lectures will be paused until tomorrow.
              </div>
            )}

            {batchItems.map((item, idx) => (
              <BatchItemRow
                key={item.id}
                item={item}
                index={idx}
                disabled={batchRunning}
                onFileChange={(f) => {
                  setBatchItems((prev) =>
                    prev.map((b) => b.id === item.id
                      ? { ...b, file: f, title: f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') }
                      : b)
                  );
                }}
                onCourseChange={(c) => {
                  setBatchItems((prev) =>
                    prev.map((b) => b.id === item.id ? { ...b, course: c } : b)
                  );
                }}
                onTitleChange={(t) => {
                  setBatchItems((prev) =>
                    prev.map((b) => b.id === item.id ? { ...b, title: t } : b)
                  );
                }}
                onRemove={() => {
                  setBatchItems((prev) => prev.filter((b) => b.id !== item.id));
                }}
              />
            ))}

            <div className="upl-batch-footer">
              <button
                className="upl-add-btn"
                onClick={() => setBatchItems((prev) => [...prev, newBatchItem()])}
                disabled={batchRunning}
              >
                + Add Another File
              </button>

              <div className="upl-batch-right">
                {batchHasFiles && (
                  <span className="upl-cost">
                    <span className="upl-cost-label">Estimated total</span>
                    <span className="upl-cost-value">
                      ~${batchItems.reduce((s, b) => s + (b.file ? estimateClientCost(b.file.size) : 0), 0).toFixed(4)}
                    </span>
                  </span>
                )}
                <button
                  className="upl-submit-btn"
                  onClick={handleBatchSubmit}
                  disabled={!batchHasFiles || batchRunning}
                >
                  {batchRunning ? <><span className="upl-spin" /> Processing…</> : `Process ${batchItems.filter((b) => b.file).length} Files`}
                </button>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast.visible && (
        <div className="upl-toast">
          ✅ {toast.msg}
        </div>
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProcessingTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="upl-timeline">
      {steps.map((step, i) => (
        <li key={step.id} className={`upl-timeline-step ${step.status}`}>
          <div className="upl-step-connector" aria-hidden />
          <div className="upl-step-dot">
            {step.status === 'done'  && '✓'}
            {step.status === 'active' && <span className="upl-step-spinner" />}
            {step.status === 'error' && '✕'}
            {step.status === 'pending' && <span className="upl-step-num">{i + 1}</span>}
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
  onFileChange: (f: File) => void;
  onCourseChange: (c: Course) => void;
  onTitleChange: (t: string) => void;
  onRemove: () => void;
}

function BatchItemRow({ item, index, disabled, onFileChange, onCourseChange, onTitleChange, onRemove }: BatchItemRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isRunning = item.state.phase === 'uploading' || item.state.phase === 'polling';
  const isDone = item.state.phase === 'complete';
  const isError = item.state.phase === 'error';

  return (
    <div className={`upl-batch-item${isDone ? ' done' : ''}${isError ? ' has-error' : ''}`}>
      <div className="upl-batch-item-header">
        <span className="upl-batch-num">#{index + 1}</span>
        {!disabled && !isRunning && !isDone && (
          <button className="upl-batch-remove" onClick={onRemove} aria-label="Remove">✕</button>
        )}
      </div>

      <div className="upl-batch-row">
        {/* File selector */}
        <div
          className={`upl-batch-drop${item.file ? ' has-file' : ''}`}
          onClick={() => !disabled && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.pptx,.ppt"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileChange(f); }}
          />
          {item.file ? (
            <span className="upl-batch-filename">{item.file.name}</span>
          ) : (
            <span className="upl-batch-placeholder">Click to select file…</span>
          )}
        </div>

        {/* Course */}
        <select
          className="upl-select upl-batch-course"
          value={item.course}
          onChange={(e) => onCourseChange(e.target.value as Course)}
          disabled={disabled || isRunning}
        >
          {VALID_COURSES.map((c) => <option key={c}>{c}</option>)}
        </select>

        {/* Title */}
        <input
          className="upl-input upl-batch-title"
          type="text"
          placeholder="Title (optional)"
          value={item.title}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={disabled || isRunning}
        />
      </div>

      {/* Inline timeline */}
      {(isRunning || isDone || isError) && (
        <div className="upl-batch-timeline">
          <ProcessingTimeline steps={item.steps} />
          {isError && item.state.phase === 'error' && (
            <div className="upl-error" style={{ marginTop: 8 }}>
              {item.state.message}
            </div>
          )}
          {isDone && item.state.phase === 'complete' && item.state.lectureId && (
            <div className="upl-timeline-success" style={{ marginTop: 8 }}>
              ✅{' '}
              <Link href={`/app/study/flash?lecture=${item.state.lectureId}`} className="upl-study-link">
                Study now →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const uploadPageCss = `
/* ── Page shell ──────────────────────────────────────────────────────── */
.upl-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 40px 80px;
}

/* ── Top bar ─────────────────────────────────────────────────────────── */
.upl-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
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

.upl-topbar-right { display: flex; align-items: center; gap: 12px; }

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
.upl-header { margin-bottom: 36px; }

.upl-title {
  font-family: 'Fraunces', serif;
  font-size: clamp(28px, 4vw, 44px);
  font-weight: 700;
  color: var(--text);
  margin: 0 0 8px;
  line-height: 1.1;
}

.upl-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0 0 20px;
  max-width: 540px;
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
.upl-mode-btn.active {
  background: var(--accent);
  color: #fff;
}
.upl-mode-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Two-column layout ───────────────────────────────────────────────── */
.upl-layout {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 32px;
  align-items: start;
}

.upl-left  { display: flex; flex-direction: column; gap: 20px; }
.upl-right { position: sticky; top: 24px; }

/* ── Drop zone ───────────────────────────────────────────────────────── */
.upl-dropzone {
  border: 2px dashed rgba(255,255,255,0.15);
  border-radius: 20px;
  padding: 48px 32px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s;
  background: var(--surface);
  min-height: 200px;
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
  padding: 24px 28px;
  border-style: solid;
  border-color: rgba(255,255,255,0.12);
  cursor: default;
}

.upl-dropzone-inner { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.upl-drop-icon { font-size: 40px; opacity: 0.45; }
.upl-drop-headline {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}
.upl-drop-sub { font-size: 13px; color: var(--text-muted); margin: 0; }

/* ── File info ───────────────────────────────────────────────────────── */
.upl-file-info {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  text-align: left;
}
.upl-file-icon { font-size: 32px; flex-shrink: 0; }
.upl-file-meta { flex: 1; min-width: 0; }
.upl-file-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.upl-file-size { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.upl-file-change {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--accent);
  background: none;
  border: 1px solid rgba(91,141,238,0.3);
  border-radius: 8px;
  padding: 6px 12px;
  min-height: 44px;
  cursor: pointer;
  transition: background 0.15s;
}
.upl-file-change:hover { background: rgba(91,141,238,0.1); }

/* ── PPTX notice ─────────────────────────────────────────────────────── */
.upl-pptx-notice {
  font-size: 12px;
  color: rgba(240,192,64,0.9);
  background: rgba(240,192,64,0.07);
  border: 1px solid rgba(240,192,64,0.2);
  border-radius: 10px;
  padding: 10px 14px;
  line-height: 1.5;
}

/* ── Config fields ───────────────────────────────────────────────────── */
.upl-config { display: flex; flex-direction: column; gap: 16px; }

.upl-field { display: flex; flex-direction: column; gap: 6px; }

.upl-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-muted);
}
.upl-label-optional { font-weight: 400; text-transform: none; letter-spacing: 0; }

.upl-select,
.upl-input {
  background: var(--surface);
  color: var(--text);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 10px 14px;
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  min-height: 44px;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
}
.upl-select:focus,
.upl-input:focus { border-color: var(--accent); }
.upl-select:disabled,
.upl-input:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Cost estimate ───────────────────────────────────────────────────── */
.upl-cost {
  display: flex;
  align-items: center;
  gap: 8px;
}
.upl-cost-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}
.upl-cost-value {
  font-family: 'DM Mono', monospace;
  font-size: 14px;
  font-weight: 500;
  color: var(--accent);
}

/* ── Warning / error banners ─────────────────────────────────────────── */
.upl-warning {
  font-size: 12px;
  color: rgba(240,192,64,0.9);
  background: rgba(240,192,64,0.07);
  border: 1px solid rgba(240,192,64,0.2);
  border-radius: 10px;
  padding: 10px 14px;
  line-height: 1.5;
}

.upl-error {
  font-size: 13px;
  color: #f87171;
  background: rgba(239,68,68,0.07);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 10px;
  padding: 12px 14px;
  line-height: 1.5;
}
.upl-error strong { display: block; margin-bottom: 4px; font-weight: 600; }
.upl-error p { margin: 0; color: rgba(248,113,113,0.8); font-size: 12px; }

/* ── Actions ─────────────────────────────────────────────────────────── */
.upl-actions { display: flex; gap: 12px; flex-wrap: wrap; }

.upl-submit-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 12px;
  padding: 12px 28px;
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 600;
  min-height: 48px;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 18px rgba(91,141,238,0.28);
}
.upl-submit-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 82%, black);
  transform: translateY(-1px);
  box-shadow: 0 6px 24px rgba(91,141,238,0.38);
}
.upl-submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.upl-done-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(16,185,129,0.12);
  color: #10b981;
  border: 1px solid rgba(16,185,129,0.3);
  border-radius: 12px;
  padding: 12px 24px;
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 600;
  min-height: 48px;
  text-decoration: none;
  transition: background 0.15s;
}
.upl-done-btn:hover { background: rgba(16,185,129,0.2); }

/* ── Timeline card ───────────────────────────────────────────────────── */
.upl-timeline-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 24px 22px 20px;
}

.upl-timeline-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-muted);
  margin-bottom: 20px;
  font-family: 'DM Mono', monospace;
}

/* ── Vertical stepper ────────────────────────────────────────────────── */
.upl-timeline { list-style: none; margin: 0; padding: 0; position: relative; }

.upl-timeline-step {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  position: relative;
  padding-bottom: 20px;
}
.upl-timeline-step:last-child { padding-bottom: 0; }

/* Vertical connector line */
.upl-step-connector {
  position: absolute;
  left: 13px;
  top: 28px;
  bottom: 0;
  width: 2px;
  background: rgba(255,255,255,0.08);
}
.upl-timeline-step:last-child .upl-step-connector { display: none; }

.upl-step-dot {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 50%;
  background: rgba(255,255,255,0.06);
  border: 2px solid rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  transition: all 0.25s;
  z-index: 1;
}

.upl-timeline-step.done .upl-step-dot {
  background: rgba(16,185,129,0.15);
  border-color: #10b981;
  color: #10b981;
  font-size: 14px;
}
.upl-timeline-step.done .upl-step-connector { background: #10b981; opacity: 0.4; }

.upl-timeline-step.active .upl-step-dot {
  background: rgba(91,141,238,0.15);
  border-color: var(--accent);
  box-shadow: 0 0 0 4px rgba(91,141,238,0.12);
}

.upl-timeline-step.error .upl-step-dot {
  background: rgba(239,68,68,0.15);
  border-color: #ef4444;
  color: #ef4444;
  font-size: 14px;
}

.upl-step-num { font-size: 11px; color: var(--text-muted); }
.upl-step-spinner {
  display: inline-block;
  width: 12px; height: 12px;
  border: 2px solid rgba(91,141,238,0.3);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: upl-spin 0.7s linear infinite;
}

.upl-step-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 4px;
  min-width: 0;
}
.upl-step-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.3;
}
.upl-step-detail {
  font-size: 11px;
  color: var(--accent);
  font-family: 'DM Mono', monospace;
}
.upl-timeline-step.done .upl-step-label { color: var(--text-muted); }
.upl-timeline-step.error .upl-step-label { color: #f87171; }

.upl-timeline-success {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(16,185,129,0.2);
  font-size: 13px;
  color: #10b981;
  font-weight: 500;
}
.upl-study-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}
.upl-study-link:hover { text-decoration: underline; }

/* ── Batch mode ──────────────────────────────────────────────────────── */
.upl-batch { display: flex; flex-direction: column; gap: 16px; }

.upl-daily-limit {
  background: rgba(240,192,64,0.07);
  border: 1px solid rgba(240,192,64,0.2);
  border-radius: 12px;
  padding: 14px 18px;
  font-size: 13px;
  color: rgba(240,192,64,0.9);
  font-weight: 500;
}

.upl-batch-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px 22px;
  transition: border-color 0.15s;
}
.upl-batch-item.done { border-color: rgba(16,185,129,0.3); }
.upl-batch-item.has-error { border-color: rgba(239,68,68,0.25); }

.upl-batch-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.upl-batch-num {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.upl-batch-remove {
  width: 28px; height: 28px;
  min-width: 44px; min-height: 44px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
  transition: color 0.15s, background 0.15s;
}
.upl-batch-remove:hover { color: #f87171; background: rgba(239,68,68,0.08); }

.upl-batch-row {
  display: grid;
  grid-template-columns: 1fr 200px 200px;
  gap: 12px;
  align-items: stretch;
}

.upl-batch-drop {
  background: var(--surface2, rgba(255,255,255,0.04));
  border: 1px dashed rgba(255,255,255,0.15);
  border-radius: 10px;
  padding: 10px 14px;
  min-height: 44px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  overflow: hidden;
}
.upl-batch-drop:hover { border-color: var(--accent); background: rgba(91,141,238,0.04); }
.upl-batch-drop.has-file { border-style: solid; border-color: rgba(255,255,255,0.12); cursor: default; }
.upl-batch-filename {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.upl-batch-placeholder { font-size: 13px; color: var(--text-muted); }

.upl-batch-course,
.upl-batch-title {
  font-size: 13px !important;
  padding: 8px 12px !important;
}

.upl-batch-timeline { margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); }

.upl-batch-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  flex-wrap: wrap;
  gap: 12px;
}
.upl-batch-right { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }

.upl-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px dashed rgba(255,255,255,0.2);
  border-radius: 10px;
  color: var(--text-muted);
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  padding: 10px 18px;
  min-height: 44px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.upl-add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(91,141,238,0.05);
}
.upl-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Spinner ─────────────────────────────────────────────────────────── */
.upl-spin {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: upl-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes upl-spin { to { transform: rotate(360deg); } }

/* ── Toast ───────────────────────────────────────────────────────────── */
.upl-toast {
  position: fixed;
  bottom: 28px;
  right: 28px;
  background: var(--surface);
  border: 1px solid rgba(16,185,129,0.35);
  color: #10b981;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  border-radius: 12px;
  padding: 12px 20px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4);
  z-index: 9999;
  animation: upl-toast-in 0.2s ease;
  max-width: calc(100vw - 56px);
}
@keyframes upl-toast-in {
  from { opacity: 0; transform: translateY(10px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Mobile ──────────────────────────────────────────────────────────── */
@media (max-width: 767px) {
  .upl-page { padding: 16px 16px 80px; }
  .upl-topbar { margin-bottom: 20px; }

  .upl-layout {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .upl-right { position: static; }

  .upl-dropzone { padding: 32px 20px; }

  .upl-batch-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .upl-batch-footer { flex-direction: column; align-items: stretch; }
  .upl-batch-right { justify-content: space-between; }

  .upl-submit-btn { width: 100%; justify-content: center; }

  .upl-toast { bottom: 16px; right: 16px; left: 16px; max-width: none; }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .upl-layout { grid-template-columns: 1fr 300px; }
  .upl-batch-row { grid-template-columns: 1fr 160px; }
  .upl-batch-title { display: none; }
}
`;
