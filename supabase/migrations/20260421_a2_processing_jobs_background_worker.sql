-- Migration: a2_processing_jobs_background_worker
-- Date: 2026-04-21
-- Slice A2: True background processing + detailed progress
--
-- Adds heartbeat/claim columns so the Vercel Cron orphan-recovery job can
-- atomically claim and retry interrupted processing_jobs.
-- Adds status_detail / status_message for granular UI progress reporting.

ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_detail text,
  ADD COLUMN IF NOT EXISTS status_message text;

-- Partial index for the cron to quickly find claimable jobs
CREATE INDEX IF NOT EXISTS processing_jobs_status_idx
  ON public.processing_jobs(status, created_at)
  WHERE status IN ('pending', 'converting', 'generating');

-- Atomic claim function: marks a job as claimed by a specific run_id.
-- Returns true if the claim succeeded, false if the job was already claimed
-- or completed. SECURITY DEFINER + fixed search_path per ADR-020.
CREATE OR REPLACE FUNCTION public.claim_processing_job(
  p_job_id uuid,
  p_run_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_rows_updated integer;
BEGIN
  UPDATE public.processing_jobs
  SET
    claimed_by       = p_run_id,
    claim_expires_at = now() + interval '5 minutes',
    heartbeat_at     = now(),
    updated_at       = now()
  WHERE
    job_id = p_job_id
    AND completed_at IS NULL
    AND (
      status = 'pending'
      OR (
        status IN ('converting', 'generating')
        AND (claim_expires_at IS NULL OR claim_expires_at < now())
      )
    );

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RETURN v_rows_updated > 0;
END;
$$;
