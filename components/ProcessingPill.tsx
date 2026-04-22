'use client';

/**
 * ProcessingPill — header indicator for a background lecture processing job.
 *
 * Architecture:
 *   - UploadModal writes job metadata to localStorage['smd_active_job'] when
 *     background processing begins, and clears it on completion/error.
 *   - This component reads that key, then polls processing_jobs every 3s to
 *     get the current stage and detect completion.
 *   - A 1-second interval drives the countdown display.
 *   - Uses the 'storage' event to catch updates from other tabs, plus a 2s
 *     local poll to catch same-tab navigation (storage events don't fire on
 *     the originating tab).
 */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

export interface ActiveJobMeta {
  jobId: string;
  title: string;
  startedAt: number;       // Date.now() when background processing began
  estimatedSeconds: number;
}

const STAGE_LABELS: Record<string, string> = {
  fetching_file:         'Fetching file',
  extracting_text:       'Reading slides',
  generating_flashcards: 'Generating with Claude',
  generating_questions:  'Generating questions',
  validating:            'Validating',
  saving:                'Saving',
  complete:              'Done',
};

function fmtRemaining(seconds: number): string {
  if (seconds <= 0) return 'almost done…';
  if (seconds < 60) return `~${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
}

export function ProcessingPill() {
  const [activeJob, setActiveJob] = useState<ActiveJobMeta | null>(null);
  const [stageId, setStageId] = useState<string>('fetching_file');
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();

  function readJob(): ActiveJobMeta | null {
    try {
      const raw = localStorage.getItem('smd_active_job');
      if (!raw) return null;
      return JSON.parse(raw) as ActiveJobMeta;
    } catch { return null; }
  }

  function applyJob(job: ActiveJobMeta | null) {
    setActiveJob(job);
    if (job) {
      const elapsed = Math.floor((Date.now() - job.startedAt) / 1000);
      setSecondsLeft(Math.max(0, job.estimatedSeconds - elapsed));
    }
  }

  // Bootstrap: read localStorage on mount; re-read on storage events (cross-tab)
  // and on a local 2s poll (same-tab navigation doesn't fire the storage event).
  useEffect(() => {
    applyJob(readJob());

    function onStorage() { applyJob(readJob()); }
    window.addEventListener('storage', onStorage);

    localPollRef.current = setInterval(() => applyJob(readJob()), 2000);

    return () => {
      window.removeEventListener('storage', onStorage);
      if (localPollRef.current) clearInterval(localPollRef.current);
    };
  }, []);

  // DB polling — fires whenever activeJob.jobId changes
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!activeJob) return;

    const jobId = activeJob.jobId;

    async function poll() {
      const { data } = await supabase
        .from('processing_jobs')
        .select('status, status_detail')
        .eq('job_id', jobId)
        .single();

      if (!data) return;

      if (data.status === 'complete' || data.status === 'error') {
        localStorage.removeItem('smd_active_job');
        setActiveJob(null);
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      if (data.status_detail) setStageId(data.status_detail as string);
    }

    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.jobId]);

  // Countdown — ticks every second while there's an active job
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!activeJob) return;

    countdownRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - activeJob.startedAt) / 1000);
      setSecondsLeft(Math.max(0, activeJob.estimatedSeconds - elapsed));
    }, 1000);

    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [activeJob?.startedAt, activeJob?.estimatedSeconds]);

  if (!activeJob) return null;

  const stageLabel = STAGE_LABELS[stageId] ?? 'Processing';

  return (
    <>
      <style>{pillCss}</style>
      <Link
        href="/app/upload"
        className="smd-proc-pill"
        aria-label={`Processing lecture: ${activeJob.title} — ${stageLabel}`}
        title={`${activeJob.title} — ${stageLabel}`}
      >
        <span className="smd-proc-spinner" aria-hidden="true" />
        <span className="smd-proc-text">
          <span className="smd-proc-title">{activeJob.title}</span>
          <span className="smd-proc-stage">{stageLabel} · {fmtRemaining(secondsLeft)}</span>
        </span>
      </Link>
    </>
  );
}

const pillCss = `
.smd-proc-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px 5px 8px;
  border-radius: 999px;
  background: rgba(91,141,238,0.1);
  border: 1px solid rgba(91,141,238,0.22);
  text-decoration: none;
  transition: background 0.18s;
  max-width: 200px;
  overflow: hidden;
  vertical-align: middle;
}
.smd-proc-pill:hover {
  background: rgba(91,141,238,0.18);
}
.smd-proc-spinner {
  flex-shrink: 0;
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(91,141,238,0.25);
  border-top-color: var(--accent, #5b8dee);
  animation: smd-proc-spin 0.75s linear infinite;
}
@keyframes smd-proc-spin {
  to { transform: rotate(360deg); }
}
.smd-proc-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.smd-proc-title {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.smd-proc-stage {
  font-size: 0.62rem;
  color: var(--accent, #5b8dee);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'DM Mono', monospace;
}

/* On mobile: only show spinner, hide text to save space */
@media (max-width: 767px) {
  .smd-proc-text { display: none; }
  .smd-proc-pill { padding: 7px 9px; max-width: none; }
}
`;
