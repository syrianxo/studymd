-- scripts/seed-demo-lecture.sql
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times (uses ON CONFLICT DO UPDATE / DO NOTHING).

-- ── Step 1: Insert the demo lecture ──────────────────────────────────────────
INSERT INTO lectures (
  internal_id, title, subtitle, course, color, icon,
  topics, slide_count, json_data
)
VALUES (
  'lec_demo_001',
  'Introduction to StudyMD',
  'A demo lecture for testing sync',
  'Demo Course',
  '#5b8dee',
  '🧪',
  '["Platform Features", "Flashcard Basics", "Exam Practice", "Progress Tracking"]',
  0,
  '{
    "flashcards": [
      {"id":"fc_001","question":"What is StudyMD?","answer":"A personalized lecture mastery platform for PA students, featuring adaptive flashcards, practice exams, and cross-device progress tracking.","topic":"Platform Features","slide_number":null},
      {"id":"fc_002","question":"How do you mark a flashcard as \"Got it\"?","answer":"After flipping the card, click the green \"✓ Got it\" button or press G (or 2) on the keyboard.","topic":"Flashcard Basics","slide_number":null},
      {"id":"fc_003","question":"What happens to cards marked \"Still learning\"?","answer":"They are tracked in a missed set. At the end of a session you can click \"Focus on Missed\" to drill only those cards.","topic":"Flashcard Basics","slide_number":null},
      {"id":"fc_004","question":"What keyboard shortcut flips a flashcard?","answer":"Space bar or Enter flips the card. Left/right arrows navigate. G = Got it, M = Still learning, S = Skip.","topic":"Flashcard Basics","slide_number":null},
      {"id":"fc_005","question":"How does cross-device progress sync work in StudyMD v2?","answer":"Progress writes to localStorage immediately for instant feedback, then syncs to Supabase in the background. On another device, the server state is fetched on load and merged with local data — newer timestamp wins.","topic":"Progress Tracking","slide_number":null},
      {"id":"fc_006","question":"What four question types appear in practice exams?","answer":"Multiple Choice (MCQ), True/False, Fill-in-the-Blank, and Matching. Each has custom interaction and auto-grading.","topic":"Exam Practice","slide_number":null},
      {"id":"fc_007","question":"What is the Pomodoro technique?","answer":"A focus method alternating 25-minute study blocks with 5-minute breaks. After 4 blocks, a longer break is taken. StudyMD has a built-in Pomodoro timer in the header.","topic":"Platform Features","slide_number":null},
      {"id":"fc_008","question":"What does mastery percentage represent on a lecture card?","answer":"The proportion of flashcards you have marked \"Got it\" at least once. Shown as a progress bar on every lecture card in the dashboard.","topic":"Progress Tracking","slide_number":null}
    ],
    "questions": [
      {"id":"q_001","type":"mcq","question":"What is the primary purpose of StudyMD?","topic":"Platform Features","options":["To schedule medical appointments","To provide personalized lecture mastery for PA students","To store patient records","To generate medical diagnoses"],"correct_answer":"To provide personalized lecture mastery for PA students","explanation":"StudyMD is purpose-built for PA students — flashcards, exams, and progress tracking in one place."},
      {"id":"q_002","type":"tf","question":"StudyMD progress is only saved locally and cannot be accessed from another device.","topic":"Progress Tracking","correct_answer":"False","explanation":"StudyMD v2 syncs to Supabase so progress is available on any device."},
      {"id":"q_003","type":"fillin","question":"Press the _____ key to flip a flashcard.","topic":"Flashcard Basics","correct_answer":"Space","explanation":"Space bar (or Enter) flips the card. G = Got it, M = Still learning, S = Skip."},
      {"id":"q_004","type":"mcq","question":"Which of the following is NOT a question type in StudyMD practice exams?","topic":"Exam Practice","options":["Multiple Choice","True / False","Drag and Drop","Fill in the Blank"],"correct_answer":"Drag and Drop","explanation":"The four supported types are MCQ, True/False, Fill-in-the-Blank, and Matching."},
      {"id":"q_005","type":"matching","question":"Match each keyboard shortcut to its action in flashcard view.","topic":"Flashcard Basics","correct_answer":"{\"Space\":\"Flip card\",\"G\":\"Got it\",\"M\":\"Still learning\",\"S\":\"Skip card\"}","explanation":"G = Got it, M = Missed, S = Skip."},
      {"id":"q_006","type":"tf","question":"The Pomodoro timer in StudyMD can send browser notifications when a phase ends.","topic":"Platform Features","correct_answer":"True","explanation":"The timer requests browser notification permission and fires one at each phase transition."},
      {"id":"q_007","type":"mcq","question":"When does StudyMD sync progress to the server if the device goes offline?","topic":"Progress Tracking","options":["It never syncs offline progress","Immediately when back online via an offline queue","After 24 hours","Only when you click a manual Sync button"],"correct_answer":"Immediately when back online via an offline queue","explanation":"Failed writes are queued in localStorage and flushed automatically when the browser fires the online event."},
      {"id":"q_008","type":"fillin","question":"A lecture''s _____ percentage shows what proportion of its flashcards you''ve marked \"Got it\".","topic":"Progress Tracking","correct_answer":"mastery","explanation":"Mastery percentage is shown as a progress bar on each lecture card."}
    ]
  }'::jsonb
)
ON CONFLICT (internal_id) DO UPDATE SET
  title       = EXCLUDED.title,
  subtitle    = EXCLUDED.subtitle,
  json_data   = EXCLUDED.json_data;

-- ── Step 2: Add display settings for every existing user ──────────────────────
INSERT INTO user_lecture_settings (user_id, internal_id, display_order, visible, archived)
SELECT id, 'lec_demo_001', 1, true, false
FROM auth.users
ON CONFLICT (user_id, internal_id) DO NOTHING;

-- ── Step 3: Verify ────────────────────────────────────────────────────────────
SELECT
  l.internal_id,
  l.title,
  l.course,
  jsonb_array_length(l.json_data->'flashcards') AS flashcard_count,
  jsonb_array_length(l.json_data->'questions')  AS question_count,
  COUNT(uls.user_id)                             AS assigned_to_users
FROM lectures l
LEFT JOIN user_lecture_settings uls ON uls.internal_id = l.internal_id
WHERE l.internal_id = 'lec_demo_001'
GROUP BY l.internal_id, l.title, l.course, l.json_data;
