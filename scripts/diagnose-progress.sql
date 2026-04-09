-- scripts/diagnose-progress.sql
-- Run in Supabase SQL Editor to diagnose why user_progress inserts might fail.

-- 1. Check user_progress table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_progress'
ORDER BY ordinal_position;

-- 2. Check foreign key constraints (these can block inserts)
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'user_progress';

-- 3. Check what lectures exist (FK target)
SELECT internal_id, title FROM lectures;

-- 4. Check all users
SELECT id, email FROM auth.users;

-- 5. Try a manual test insert (replace the UUIDs with real values from query 4)
-- Uncomment and fill in real values to test:
-- INSERT INTO user_progress (user_id, internal_id, flashcard_progress, exam_progress, last_studied, updated_at)
-- VALUES (
--   'YOUR-USER-UUID-HERE',
--   'lec_demo_001',
--   '{"sessions": 1, "mastery_pct": 50}'::jsonb,
--   '{"sessions": 0, "best_score": null, "avg_score": null}'::jsonb,
--   NOW(),
--   NOW()
-- );
