-- Drop the duplicate index on public.processing_jobs.
--
-- Two indexes existed with identical definitions:
--   - idx_processing_jobs_user_status  ← drop this one (legacy name)
--   - processing_jobs_user_status      ← keep (shorter name, matches convention)
--
-- Both are btree(user_id, status, created_at DESC). Keeping both doubles the
-- write amplification for the hot processing_jobs table.

DROP INDEX IF EXISTS public.idx_processing_jobs_user_status;
