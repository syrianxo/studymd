-- Slice G1: student_notes — per-user, per-slide freeform notes.
-- Each row is unique per (user_id, internal_id, slide_number).
-- RLS: a user may only read and write their own notes.

CREATE TABLE public.student_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  internal_id text NOT NULL REFERENCES public.lectures(internal_id) ON DELETE CASCADE,
  slide_number integer NOT NULL CHECK (slide_number >= 1),
  body text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, internal_id, slide_number)
);

ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_notes select own"
  ON public.student_notes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "student_notes insert own"
  ON public.student_notes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "student_notes update own"
  ON public.student_notes FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "student_notes delete own"
  ON public.student_notes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS student_notes_user_lecture_idx
  ON public.student_notes(user_id, internal_id);
