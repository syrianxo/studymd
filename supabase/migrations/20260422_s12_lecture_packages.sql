-- Slice 12: lecture_packages + user_package_access tables
-- Replaces open authenticated-read policy on lectures with package-scoped access.
-- ADR-032

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE public.lecture_packages (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  lecture_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.lecture_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read packages" ON public.lecture_packages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin writes packages" ON public.lecture_packages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE TABLE public.user_package_access (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id text REFERENCES public.lecture_packages(id) ON DELETE CASCADE,
  source text NOT NULL,
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (user_id, package_id)
);
ALTER TABLE public.user_package_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own access" ON public.user_package_access
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin manages access" ON public.user_package_access
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- ── Lectures RLS ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "lectures: authenticated users can read" ON public.lectures;

CREATE POLICY "lectures: package-scoped read" ON public.lectures
  FOR SELECT TO authenticated
  USING (
    internal_id = ANY(
      SELECT unnest(lp.lecture_ids)
      FROM public.lecture_packages lp
      JOIN public.user_package_access upa
        ON upa.package_id = lp.id
      WHERE upa.user_id = auth.uid()
        AND (upa.expires_at IS NULL OR upa.expires_at > now())
    )
  );

-- ── Seed ──────────────────────────────────────────────────────────────────────

INSERT INTO public.lecture_packages (id, name, description, lecture_ids)
VALUES (
  'pa-year-1-fall-2026',
  'PA Year 1 — Fall 2026',
  'All lectures for the first year of the Physician Assistant program, Fall 2026 cohort.',
  ARRAY[
    'lec_demo_001','lec_779095d2','lec_001','lec_002','lec_003','lec_004','lec_005',
    'lec_006','lec_007','lec_008','lec_009','lec_010','lec_011','lec_012','lec_013',
    'lec_014','lec_015','lec_20260422_d982a2','lec_20260422_0d3f25'
  ]
);

-- Grant access to all existing non-admin users
INSERT INTO public.user_package_access (user_id, package_id, source)
SELECT up.user_id, 'pa-year-1-fall-2026', 'backfill'
FROM public.user_profiles up
WHERE up.role != 'admin'
ON CONFLICT (user_id, package_id) DO NOTHING;

-- ── Auto-grant trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_package_access (user_id, package_id, source)
  VALUES (NEW.id, 'pa-year-1-fall-2026', 'auto-grant')
  ON CONFLICT (user_id, package_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
