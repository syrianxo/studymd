-- Migration: per-user API rate limiting
-- Applied: 2026-04-22
-- Related ADR: decisions.md (per-user rate limiting)
--
-- Adds:
--   1. user_daily_calls — per-user per-date successful lecture count
--   2. increment_user_calls — SECURITY DEFINER RPC for atomic upsert
--   3. processing_jobs_active_idx — partial index for pill polling queries

-- 1. Per-user daily call tracking table
CREATE TABLE IF NOT EXISTS public.user_daily_calls (
  user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date     date        NOT NULL,
  calls    integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

ALTER TABLE public.user_daily_calls ENABLE ROW LEVEL SECURITY;

-- Users can only read their own rows; writes go through the RPC below.
CREATE POLICY "users_read_own_daily_calls"
  ON public.user_daily_calls FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Atomic upsert RPC — called by recordUserCall() in api-limits.ts
--    SECURITY DEFINER so it can run with service-role-equivalent permissions
--    from server-side code without exposing write access to clients.
CREATE OR REPLACE FUNCTION public.increment_user_calls(
  p_user_id uuid,
  p_date    date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_daily_calls (user_id, date, calls)
  VALUES (p_user_id, p_date, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET calls = user_daily_calls.calls + 1;
END;
$$;

-- 3. Partial index for processing pill DB polling (user_id + active status)
CREATE INDEX IF NOT EXISTS processing_jobs_active_idx
  ON public.processing_jobs (user_id, status, created_at)
  WHERE completed_at IS NULL;
