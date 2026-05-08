-- ============================================================================
-- Baseline schema for StudyMD
-- ----------------------------------------------------------------------------
-- Captures the schema that existed on production BEFORE per-feature migrations
-- in this directory were tracked in git. Without this baseline, the Supabase
-- Preview check (fresh DB + replay every committed migration) fails on the
-- first migration with:
--
--   ERROR: relation "public.processing_jobs" does not exist
--
-- because that migration is `ALTER TABLE processing_jobs …`.
--
-- DESIGN: this migration only creates TABLES that don't exist yet (and seeds
-- subscription_tiers). It does NOT define functions, triggers, or RLS policies
-- — those are owned by the production-existing migrations that run after this
-- baseline. Specifically:
--
--   - Functions: production already has them (they were created by p1-p5 and
--     other early migrations not tracked in git). On Preview, the later
--     `fix_function_search_paths` migration creates them via CREATE OR REPLACE.
--     Note: that migration ASSUMES the tables exist, which is why this
--     baseline must run first.
--   - RLS policies: production already has them. On Preview, the later
--     migrations (per_user_api_limits, slide_annotations, s12_lecture_packages,
--     etc.) create the policies relevant to their tables. The "open"
--     baseline state on Preview is fine because Preview has no data.
--   - Triggers: same as policies.
--   - The auth.users triggers (handle_new_user, sync_auth_display_name) are
--     intentionally omitted here so we do not accidentally downgrade
--     production's package-aware handle_new_user. Preview gets them via the
--     s12 migration.
--
-- IDEMPOTENCY: every CREATE here uses IF NOT EXISTS. Running on production is
-- a no-op (all tables already exist). Running on Preview creates everything
-- from scratch. Running again is a no-op.
-- ============================================================================

-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- ─── Tables (dependency order) ──────────────────────────────────────────────

-- 1. subscription_tiers (no FK)
CREATE TABLE IF NOT EXISTS public.subscription_tiers (
  id                    text PRIMARY KEY,
  name                  text NOT NULL,
  price_monthly_usd     numeric,
  max_lectures          integer,
  max_uploads_per_month integer,
  features              jsonb
);

-- 2. user_profiles (FK to auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  username     text UNIQUE,
  role         text NOT NULL DEFAULT 'student' CHECK (role IN ('admin','student','demo')),
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 3. user_preferences (FK to auth.users)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme        text NOT NULL DEFAULT 'midnight',
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  display_name text
);

-- 4. courses
CREATE TABLE IF NOT EXISTS public.courses (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  code          text,
  description   text,
  display_order integer NOT NULL DEFAULT 0,
  color         text,
  created_at    timestamptz DEFAULT now(),
  archived_at   timestamptz
);

-- 5. lectures
CREATE TABLE IF NOT EXISTS public.lectures (
  internal_id   text PRIMARY KEY,
  original_file text,
  title         text NOT NULL,
  subtitle      text,
  course        text NOT NULL,
  icon          text NOT NULL,
  topics        jsonb NOT NULL DEFAULT '[]'::jsonb,
  slide_count   integer NOT NULL DEFAULT 0,
  json_data     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  theme_colors  jsonb,
  course_id     text REFERENCES public.courses(id)
);

-- 6. folders (FK to auth.users + self-FK)
CREATE TABLE IF NOT EXISTS public.folders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id     uuid REFERENCES public.folders(id) ON DELETE CASCADE,
  name          text NOT NULL,
  icon          text DEFAULT '📁',
  color         text,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 7. user_lecture_settings
CREATE TABLE IF NOT EXISTS public.user_lecture_settings (
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  internal_id           text NOT NULL REFERENCES public.lectures(internal_id) ON DELETE CASCADE,
  display_order         integer NOT NULL DEFAULT 0,
  visible               boolean NOT NULL DEFAULT true,
  archived              boolean NOT NULL DEFAULT false,
  group_id              uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  tags                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  course_override       text,
  color_override_legacy text,
  custom_title          text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  color_override        jsonb,
  topics_override       jsonb,
  PRIMARY KEY (user_id, internal_id)
);

-- 8. processing_jobs
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  job_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending',
  storage_path        text NOT NULL,
  original_file       text NOT NULL,
  course              text NOT NULL,
  title               text,
  internal_id         text REFERENCES public.lectures(internal_id) ON DELETE SET NULL,
  slide_count         integer,
  error_message       text,
  model_used          text,
  input_tokens        integer,
  output_tokens       integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  original_filename   text,
  file_size_bytes     bigint,
  file_type           text,
  estimated_cost_usd  numeric,
  estimated_tokens    integer,
  progress            integer DEFAULT 0,
  completed_at        timestamptz,
  lecture_id          text,
  used_fallback       boolean DEFAULT false,
  estimated_cost      numeric,
  heartbeat_at        timestamptz,
  claimed_by          text,
  claim_expires_at    timestamptz,
  status_detail       text,
  status_message      text,
  anthropic_file_id   text
);

-- 9. api_usage
CREATE TABLE IF NOT EXISTS public.api_usage (
  id             serial PRIMARY KEY,
  date           date NOT NULL UNIQUE,
  calls_count    integer NOT NULL DEFAULT 0,
  input_tokens   integer NOT NULL DEFAULT 0,
  output_tokens  integer NOT NULL DEFAULT 0,
  estimated_cost numeric NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 10. feedback
CREATE TABLE IF NOT EXISTS public.feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type       text DEFAULT 'Feedback',
  message    text NOT NULL,
  page_url   text,
  status     text NOT NULL DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

-- 11. shared_decks
CREATE TABLE IF NOT EXISTS public.shared_decks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  internal_id text REFERENCES public.lectures(internal_id) ON DELETE CASCADE,
  share_code  text UNIQUE,
  is_public   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- 12. sr_card_state
CREATE TABLE IF NOT EXISTS public.sr_card_state (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  internal_id   text NOT NULL REFERENCES public.lectures(internal_id) ON DELETE CASCADE,
  card_id       text NOT NULL,
  ease_factor   numeric DEFAULT 2.5,
  interval_days integer DEFAULT 0,
  repetitions   integer DEFAULT 0,
  lapses        integer DEFAULT 0,
  due_date      date,
  last_reviewed timestamptz,
  PRIMARY KEY (user_id, internal_id, card_id)
);

-- 13. study_plans
CREATE TABLE IF NOT EXISTS public.study_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  test_date       date NOT NULL,
  lecture_ids     text[] NOT NULL DEFAULT '{}'::text[],
  schedule        jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_days  text[] NOT NULL DEFAULT '{}'::text[],
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 14. system_config
CREATE TABLE IF NOT EXISTS public.system_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- 15. user_card_overrides
CREATE TABLE IF NOT EXISTS public.user_card_overrides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  internal_id    text NOT NULL,
  card_id        text NOT NULL,
  card_type      text NOT NULL CHECK (card_type IN ('flashcard','question')),
  overrides      jsonb NOT NULL DEFAULT '{}'::jsonb,
  canonical_hash text NOT NULL DEFAULT '',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (user_id, internal_id, card_id)
);

-- 16. user_progress
CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  internal_id        text NOT NULL REFERENCES public.lectures(internal_id) ON DELETE CASCADE,
  flashcard_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  exam_progress      jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_studied       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, internal_id)
);

-- 17. user_subscriptions
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id    text DEFAULT 'free' REFERENCES public.subscription_tiers(id),
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz
);


-- ─── Seed: subscription_tiers (FK target for user_subscriptions) ────────────
INSERT INTO public.subscription_tiers (id, name, price_monthly_usd, max_lectures, max_uploads_per_month, features) VALUES
  ('free',    'Free',    0.00,  5,    2,    '{"batchUpload": false, "spacedRepetition": false}'::jsonb),
  ('basic',   'Basic',   9.99,  25,   10,   '{"batchUpload": false, "spacedRepetition": false}'::jsonb),
  ('premium', 'Premium', 19.99, NULL, NULL, '{"batchUpload": true,  "spacedRepetition": true}'::jsonb)
ON CONFLICT (id) DO NOTHING;


-- ─── Indexes (non-PK) ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_api_usage_date
  ON public.api_usage USING btree (date DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status
  ON public.feedback USING btree (status);
CREATE INDEX IF NOT EXISTS idx_feedback_user
  ON public.feedback USING btree (user_id);
CREATE INDEX IF NOT EXISTS processing_jobs_user_status
  ON public.processing_jobs USING btree (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_decks_code
  ON public.shared_decks USING btree (share_code);
CREATE INDEX IF NOT EXISTS idx_shared_decks_owner
  ON public.shared_decks USING btree (owner_id);
CREATE INDEX IF NOT EXISTS idx_sr_card_state_due
  ON public.sr_card_state USING btree (user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_study_plans_active
  ON public.study_plans USING btree (user_id, is_active) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_study_plans_user_id
  ON public.study_plans USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_card_overrides_user_lecture
  ON public.user_card_overrides USING btree (user_id, internal_id);
CREATE INDEX IF NOT EXISTS idx_user_lecture_settings_group
  ON public.user_lecture_settings USING btree (user_id, group_id) WHERE (group_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_user_lecture_settings_user_order
  ON public.user_lecture_settings USING btree (user_id, display_order);
CREATE INDEX IF NOT EXISTS user_profiles_username_idx
  ON public.user_profiles USING btree (username);
CREATE INDEX IF NOT EXISTS idx_user_progress_last_studied
  ON public.user_progress USING btree (user_id, last_studied DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_user_progress_user
  ON public.user_progress USING btree (user_id, internal_id);
