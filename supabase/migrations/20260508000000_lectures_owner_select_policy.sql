-- Allow uploaders to see their own lectures.
--
-- The existing `lectures: package-scoped read` policy (s12_lecture_packages)
-- only grants SELECT access if the lecture's internal_id is in some
-- lecture_packages.lecture_ids array the user has user_package_access to.
-- That works for the seeded "PA Year 1 — Fall 2026" cohort, but it leaves
-- newly uploaded lectures invisible to the uploader: the upload flow
-- inserts a user_lecture_settings row for the new lecture, but does NOT
-- append the lecture's internal_id to any package's lecture_ids. So
-- post-upload the lecture exists in the DB but the user cannot see it.
--
-- Postgres ORs SELECT policies, so we add a SECOND policy that grants
-- SELECT when the requesting user has a user_lecture_settings row for the
-- lecture (i.e., is the uploader / has the lecture in their library).
-- This is OR'd with the package policy, so cohort users still see their
-- shared package lectures, and uploaders see their own.
--
-- Idempotent: drop-then-create.

DROP POLICY IF EXISTS "lectures: own settings read" ON public.lectures;
CREATE POLICY "lectures: own settings read"
  ON public.lectures FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_lecture_settings uls
      WHERE uls.internal_id = lectures.internal_id
        AND uls.user_id = auth.uid()
    )
  );
