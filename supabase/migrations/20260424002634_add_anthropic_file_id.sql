-- Add anthropic_file_id to processing_jobs.
--
-- Used by the Files API path (lib/job-runner.ts, behind the STUDYMD_FILES_API
-- flag). When enabled, the lecture PDF is uploaded once to Anthropic's Files
-- API and the returned file_id is persisted here so that the Haiku → Sonnet
-- fallback retry (and any future admin reprocess) can reference the same
-- uploaded file by id instead of re-base64-ing and re-sending the payload.

ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS anthropic_file_id text;
