'use client';

/**
 * ProcessingPill — header indicator for an in-flight lecture processing job.
 *
 * Polls processing_jobs every 5 s for any job belonging to this user that is
 * not yet complete. When found, shows a spinner pill with the lecture title,
 * current server stage, and a rough countdown based on slide_count.
 *
 * Uses DB polling instead of localStorage so it works reliably across page
 * navigations, SSR, and the cron-recovery path (where localStorage would have
 * the wrong internalId).
 */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

// Re-exported so UploadModal can import the type (still useful for other
// consumers that want to store job metadata).
export interface ActiveJobMeta {
  jobId: string;
  title: string;
  startedAt: number;
  estimatedSeconds: number;
}

interface PillJob {
  jobId: string;
  title: string;
  stageId: string;
  startedAt: number;       // ms epoch (created_at of the job)
  estimatedSeconds: number;
}

const STAGE_LABELS: Record<string, string> = {
  fetching_file:         'Fetching file',
  extracting_text:       'Reading slides',
  generating_flashcards: 'Generating with Claude',
  generating_questions:  'Generating questions',
  validating:            'Validating',
  saving:                'Saving',
};

const ACTIVE_STATUSES = ['pending', 'converting', 'generating'];

/** Mirrors estimateProcessingSeconds in UploadModal. */
function estimateSecs(slideCount: number | null): number {
  return Math.min(180, Math.max(60, Math.round(25 + (slideCount ?? 20) * 2.2)));
}

function fmtRemaining(seconds: number): string {
  if (seconds <= 0) return 'almost done…';
  if (seconds < 60) return `~${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
}

interface ProcessingPillProps {
  userId: string;
  /** Called whenever job-active state changes — lets the parent hide the Upload button. */
  onJobActive?: (active: boolean) => void;
}

export function ProcessingPill({ userId, onJobActive }: ProcessingPillProps) {
  const [job, setJob] = useState<PillJob | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();

  // Poll DB for active jobs belonging to this user
  useEffect(() => {
    if (!userId) return;

    async function poll() {
      // Order by updated_at so a retried old job (its created_at is days
      // ago, but updated_at was just bumped to now) sorts above any other
      // active jobs the user may have. Matches the upload page's resume.
      const { data } = await supabase
        .from('processing_jobs')
        .select('job_id, title, status, status_detail, created_at, updated_at, slide_count')
        .eq('user_id', userId)
        .in('status', ACTIVE_STATUSES)
        .is('completed_at', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) {
        setJob(null);
        return;
      }

      const estSecs = estimateSecs(data.slide_count ?? null);
      // For ETA we want elapsed-since-this-run, not elapsed-since-original-upload.
      // updated_at is bumped on retry/claim, so it tracks the current run.
      const startedAt = new Date(data.updated_at ?? data.created_at).getTime();

      setJob((prev) => {
        // Only update if something changed (avoid unnecessary re-renders)
        if (
          prev?.jobId === data.job_id &&
          prev?.stageId === (data.status_detail ?? data.status)
        ) {
          return prev;
        }
        return {
          jobId: data.job_id,
          title: data.title ?? 'Lecture',
          stageId: data.status_detail ?? data.status,
          startedAt,
          estimatedSeconds: estSecs,
        };
      });

      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSecondsLeft(Math.max(0, estSecs - elapsed));
    }

    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Notify parent when job presence changes
  useEffect(() => {
    onJobActive?.(job !== null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job !== null]);

  // Countdown ticker
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!job) return;

    countdownRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - job.startedAt) / 1000);
      setSecondsLeft(Math.max(0, job.estimatedSeconds - elapsed));
    }, 1000);

    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [job?.startedAt, job?.estimatedSeconds]);

  if (!job) return null;

  const stageLabel = STAGE_LABELS[job.stageId] ?? 'Processing';

  return (
    <>
      <style>{pillCss}</style>
      <Link
        href="/app/upload"
        className="smd-proc-pill"
        aria-label={`Processing: ${job.title} — ${stageLabel}`}
        title={`${job.title} — ${stageLabel}`}
      >
        <span className="smd-proc-spinner" aria-hidden="true" />
        <span className="smd-proc-text">
          <span className="smd-proc-title">{job.title}</span>
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

/* Mobile: show only the spinner to save header space */
@media (max-width: 767px) {
  .smd-proc-text { display: none; }
  .smd-proc-pill { padding: 7px 9px; max-width: none; }
}
`;
