-- ============================================================================
-- Baseline schema for StudyMD
-- ----------------------------------------------------------------------------
-- This migration captures the schema that existed on production BEFORE the
-- per-feature migrations in this directory were tracked in git. Without it,
-- the Supabase Preview check (which spins up a fresh database and replays
-- every committed migration) fails on the very first migration:
--
--   ERROR: relation "public.processing_jobs" does not exist
--
-- because that migration is `ALTER TABLE processing_jobs …` against a table
-- this directory never created.
--
-- Idempotency: every statement here uses `IF NOT EXISTS`,
-- `CREATE OR REPLACE`, or `DROP … IF EXISTS; CREATE …`. Production already has
-- this schema, so applying this migration there is a no-op. Preview branches
-- start empty, so applying it builds the schema from scratch.
--
-- Tables created here are everything in the public schema EXCEPT the ones
-- created by later migrations (user_daily_calls, lecture_packages,
-- user_package_access, slide_annotations, student_notes) — those migrations
-- still own their CREATE TABLE statements.
-- ============================================================================

-- ─── Extensions ─────────────────────────────────────────────────────────────
-- pgcrypto is normally pre-installed by Supabase, but be defensive.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- ─── Functions (must exist before triggers reference them) ──────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_study_plans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_card_overrides_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_preferences(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO user_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_api_usage(
  p_date date,
  p_calls integer,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO api_usage (date, calls_count, input_tokens, output_tokens, estimated_cost)
  VALUES (p_date, p_calls, p_input_tokens, p_output_tokens, p_cost)
  ON CONFLICT (date)
  DO UPDATE SET
    calls_count    = api_usage.calls_count    + EXCLUDED.calls_count,
    input_tokens   = api_usage.input_tokens   + EXCLUDED.input_tokens,
    output_tokens  = api_usage.output_tokens  + EXCLUDED.output_tokens,
    estimated_cost = api_usage.estimated_cost + EXCLUDED.estimated_cost;
END;
$$;

-- handle_new_user references user_preferences and user_package_access. The
-- latter is created by 20260422_s12_lecture_packages.sql; this function will
-- be replaced by that migration with the package-aware version. We define the
-- preferences-only version here so the auth.users trigger can fire on a fresh
-- DB without erroring during the gap between this baseline and that migration.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_auth_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'full_name' IS NOT NULL THEN
    UPDATE public.user_preferences
    SET display_name = NEW.raw_user_meta_data->>'full_name'
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


-- ─── Tables (dependency order) ──────────────────────────────────────────────

-- 1. subscription_tiers (no FK) — referenced by user_subscriptions.
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

-- 4. courses (no FK; referenced by lectures.course_id)
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

-- 5. lectures (FK to courses)
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

-- 7. user_lecture_settings (FKs to auth.users, lectures, folders)
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

-- 8. processing_jobs (FKs to auth.users, lectures)
-- Includes columns added by 20260421_a2 and 20260423_add_anthropic_file_id;
-- those migrations use ADD COLUMN IF NOT EXISTS so they remain idempotent.
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

-- 12. sr_card_state (spaced-repetition state)
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

-- 17. user_subscriptions (FK to subscription_tiers)
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id    text DEFAULT 'free' REFERENCES public.subscription_tiers(id),
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz
);


-- ─── Indexes (non-PK / non-UNIQUE) ──────────────────────────────────────────

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


-- ─── Triggers (drop-then-create for idempotency) ────────────────────────────

DROP TRIGGER IF EXISTS trg_api_usage_updated_at ON public.api_usage;
CREATE TRIGGER trg_api_usage_updated_at
  BEFORE UPDATE ON public.api_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS folders_updated_at ON public.folders;
CREATE TRIGGER folders_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_processing_jobs_updated_at ON public.processing_jobs;
CREATE TRIGGER trg_processing_jobs_updated_at
  BEFORE UPDATE ON public.processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS study_plans_updated_at ON public.study_plans;
CREATE TRIGGER study_plans_updated_at
  BEFORE UPDATE ON public.study_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_study_plans_updated_at();

DROP TRIGGER IF EXISTS trg_user_card_overrides_updated_at ON public.user_card_overrides;
CREATE TRIGGER trg_user_card_overrides_updated_at
  BEFORE UPDATE ON public.user_card_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_user_card_overrides_updated_at();

DROP TRIGGER IF EXISTS trg_user_lecture_settings_updated_at ON public.user_lecture_settings;
CREATE TRIGGER trg_user_lecture_settings_updated_at
  BEFORE UPDATE ON public.user_lecture_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER trg_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_user_profiles_updated_at();

DROP TRIGGER IF EXISTS trg_user_progress_updated_at ON public.user_progress;
CREATE TRIGGER trg_user_progress_updated_at
  BEFORE UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auth.users triggers (handle_new_user is replaced by 20260422_s12_lecture_packages)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_metadata_change ON auth.users;
CREATE TRIGGER on_auth_user_metadata_change
  AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_display_name();


-- ─── Enable Row Level Security ──────────────────────────────────────────────

ALTER TABLE public.api_usage             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lectures              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_decks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_card_state         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_tiers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_card_overrides   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_lecture_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions    ENABLE ROW LEVEL SECURITY;


-- ─── RLS Policies (drop-then-create for idempotency) ────────────────────────

-- api_usage
DROP POLICY IF EXISTS "Service role only" ON public.api_usage;
CREATE POLICY "Service role only" ON public.api_usage
  FOR ALL TO public USING (false);
DROP POLICY IF EXISTS "api_usage: admin read" ON public.api_usage;
CREATE POLICY "api_usage: admin read" ON public.api_usage
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid() AND role = 'admin'));

-- courses
DROP POLICY IF EXISTS "admin manages courses" ON public.courses;
CREATE POLICY "admin manages courses" ON public.courses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "authenticated read courses" ON public.courses;
CREATE POLICY "authenticated read courses" ON public.courses
  FOR SELECT TO authenticated USING (archived_at IS NULL);

-- feedback
DROP POLICY IF EXISTS "Service role full access on feedback" ON public.feedback;
CREATE POLICY "Service role full access on feedback" ON public.feedback
  FOR ALL TO public USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Users can insert feedback" ON public.feedback;
CREATE POLICY "Users can insert feedback" ON public.feedback
  FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can read own feedback" ON public.feedback;
CREATE POLICY "Users can read own feedback" ON public.feedback
  FOR SELECT TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS feedback_insert ON public.feedback;
CREATE POLICY feedback_insert ON public.feedback
  FOR INSERT TO public WITH CHECK ((auth.uid() = user_id) OR (user_id IS NULL));
DROP POLICY IF EXISTS feedback_own_read ON public.feedback;
CREATE POLICY feedback_own_read ON public.feedback
  FOR SELECT TO public USING (auth.uid() = user_id);

-- folders
DROP POLICY IF EXISTS "users manage own folders" ON public.folders;
CREATE POLICY "users manage own folders" ON public.folders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- lectures: a placeholder open-read policy. 20260422_s12_lecture_packages drops
-- this and replaces it with the package-scoped read.
DROP POLICY IF EXISTS "lectures: authenticated users can read" ON public.lectures;
CREATE POLICY "lectures: authenticated users can read" ON public.lectures
  FOR SELECT TO authenticated USING (true);

-- processing_jobs
DROP POLICY IF EXISTS "Users can view their own jobs" ON public.processing_jobs;
CREATE POLICY "Users can view their own jobs" ON public.processing_jobs
  FOR SELECT TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "processing_jobs: users insert their own" ON public.processing_jobs;
CREATE POLICY "processing_jobs: users insert their own" ON public.processing_jobs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "processing_jobs: users read their own" ON public.processing_jobs;
CREATE POLICY "processing_jobs: users read their own" ON public.processing_jobs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- shared_decks
DROP POLICY IF EXISTS "Anyone can read public shared_decks" ON public.shared_decks;
CREATE POLICY "Anyone can read public shared_decks" ON public.shared_decks
  FOR SELECT TO public USING (is_public = true);
DROP POLICY IF EXISTS "Owners manage own shared_decks" ON public.shared_decks;
CREATE POLICY "Owners manage own shared_decks" ON public.shared_decks
  FOR ALL TO public USING (auth.uid() = owner_id);

-- sr_card_state
DROP POLICY IF EXISTS "Users manage own sr_card_state" ON public.sr_card_state;
CREATE POLICY "Users manage own sr_card_state" ON public.sr_card_state
  FOR ALL TO public USING (auth.uid() = user_id);

-- study_plans
DROP POLICY IF EXISTS "Users can manage their own study plans" ON public.study_plans;
CREATE POLICY "Users can manage their own study plans" ON public.study_plans
  FOR ALL TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- subscription_tiers
DROP POLICY IF EXISTS "Anyone can read subscription tiers" ON public.subscription_tiers;
CREATE POLICY "Anyone can read subscription tiers" ON public.subscription_tiers
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Service role manages tiers" ON public.subscription_tiers;
CREATE POLICY "Service role manages tiers" ON public.subscription_tiers
  FOR ALL TO public USING (auth.role() = 'service_role');

-- user_card_overrides
DROP POLICY IF EXISTS users_own_overrides_delete ON public.user_card_overrides;
CREATE POLICY users_own_overrides_delete ON public.user_card_overrides
  FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS users_own_overrides_insert ON public.user_card_overrides;
CREATE POLICY users_own_overrides_insert ON public.user_card_overrides
  FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS users_own_overrides_select ON public.user_card_overrides;
CREATE POLICY users_own_overrides_select ON public.user_card_overrides
  FOR SELECT TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS users_own_overrides_update ON public.user_card_overrides;
CREATE POLICY users_own_overrides_update ON public.user_card_overrides
  FOR UPDATE TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_lecture_settings
DROP POLICY IF EXISTS "user_lecture_settings: users own their rows" ON public.user_lecture_settings;
CREATE POLICY "user_lecture_settings: users own their rows" ON public.user_lecture_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_preferences
DROP POLICY IF EXISTS "user_preferences: users own their row" ON public.user_preferences;
CREATE POLICY "user_preferences: users own their row" ON public.user_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_profiles
DROP POLICY IF EXISTS "Users insert own profile" ON public.user_profiles;
CREATE POLICY "Users insert own profile" ON public.user_profiles
  FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users read own profile" ON public.user_profiles;
CREATE POLICY "Users read own profile" ON public.user_profiles
  FOR SELECT TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own profile" ON public.user_profiles;
CREATE POLICY "Users update own profile" ON public.user_profiles
  FOR UPDATE TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS user_profiles_admin_read ON public.user_profiles;
CREATE POLICY user_profiles_admin_read ON public.user_profiles
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'));
DROP POLICY IF EXISTS user_profiles_own_read ON public.user_profiles;
CREATE POLICY user_profiles_own_read ON public.user_profiles
  FOR SELECT TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS user_profiles_own_update ON public.user_profiles;
CREATE POLICY user_profiles_own_update ON public.user_profiles
  FOR UPDATE TO public USING (auth.uid() = user_id);

-- user_progress
DROP POLICY IF EXISTS "user_progress: users own their rows" ON public.user_progress;
CREATE POLICY "user_progress: users own their rows" ON public.user_progress
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_subscriptions
DROP POLICY IF EXISTS "Service role full access on user_subscriptions" ON public.user_subscriptions;
CREATE POLICY "Service role full access on user_subscriptions" ON public.user_subscriptions
  FOR ALL TO public USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Users can read own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can read own subscription" ON public.user_subscriptions
  FOR SELECT TO public USING (auth.uid() = user_id);


-- ─── Seed: subscription_tiers (must exist before user_subscriptions FK works)

INSERT INTO public.subscription_tiers (id, name, price_monthly_usd, max_lectures, max_uploads_per_month, features) VALUES
  ('free',    'Free',    0.00,  5,    2,    '{"batchUpload": false, "spacedRepetition": false}'::jsonb),
  ('basic',   'Basic',   9.99,  25,   10,   '{"batchUpload": false, "spacedRepetition": false}'::jsonb),
  ('premium', 'Premium', 19.99, NULL, NULL, '{"batchUpload": true,  "spacedRepetition": true}'::jsonb)
ON CONFLICT (id) DO NOTHING;
