-- Slice 10: slide_annotations table for AI-generated per-slide explanations.
-- Each row is unique per (internal_id, slide_number).
-- Authenticated users can read; only the service role (server-side API) may write.

CREATE TABLE public.slide_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_id text NOT NULL REFERENCES public.lectures(internal_id) ON DELETE CASCADE,
  slide_number integer NOT NULL,
  body text NOT NULL,
  model_used text NOT NULL,
  generated_at timestamptz DEFAULT now(),
  UNIQUE (internal_id, slide_number)
);

ALTER TABLE public.slide_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read annotations"
  ON public.slide_annotations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "service role writes annotations"
  ON public.slide_annotations
  FOR ALL TO public
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS slide_annotations_internal_id_idx
  ON public.slide_annotations(internal_id);
