// scripts/seed-demo-lecture.mjs
// Inserts a demo lecture into Supabase for sync testing.
//
// USAGE:
//   1. Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY below
//   2. node scripts/seed-demo-lecture.mjs
//   3. Check your dashboard — "Introduction to StudyMD" should appear
//
// Safe to run multiple times — uses upsert, won't duplicate.

// ── Config — paste your real values here ─────────────────────────────────────
const SUPABASE_URL = 'https://vimuhpoeuvfzpzfeorsw.supabase.co';
const SERVICE_ROLE_KEY = 'sb_publishable_nR3SF7GFqp2-Eq2SQr5w1A_CxpjmIW9';
// Find the service role key:
//   Supabase Dashboard → Project Settings → API → service_role (secret key)
// ─────────────────────────────────────────────────────────────────────────────

if (SUPABASE_URL.includes('PASTE') || SERVICE_ROLE_KEY.includes('PASTE')) {
  console.error('❌  Fill in SUPABASE_URL and SERVICE_ROLE_KEY in the script first.');
  process.exit(1);
}

const DEMO_LECTURE = {
  internal_id: 'lec_demo_001',
  title: 'Introduction to StudyMD',
  subtitle: 'A demo lecture for testing sync',
  course: 'Demo Course',
  color: '#5b8dee',
  icon: '🧪',
  topics: ['Platform Features', 'Flashcard Basics', 'Exam Practice', 'Progress Tracking'],
  slide_count: 0,
  json_data: {
    flashcards: [
      {
        id: 'fc_001',
        question: 'What is StudyMD?',
        answer: 'A personalized lecture mastery platform for PA students, featuring adaptive flashcards, practice exams, and cross-device progress tracking.',
        topic: 'Platform Features',
        slide_number: null,
      },
      {
        id: 'fc_002',
        question: 'How do you mark a flashcard as "Got it"?',
        answer: 'After flipping the card, click the green "✓ Got it" button or press G (or 2) on the keyboard.',
        topic: 'Flashcard Basics',
        slide_number: null,
      },
      {
        id: 'fc_003',
        question: 'What happens to cards marked "Still learning"?',
        answer: 'They are tracked in a missed set. At the end of a session you can click "Focus on Missed" to drill only those cards.',
        topic: 'Flashcard Basics',
        slide_number: null,
      },
      {
        id: 'fc_004',
        question: 'What keyboard shortcut flips a flashcard?',
        answer: 'Space bar or Enter flips the card. Left/right arrows navigate. G = Got it, M = Still learning, S = Skip.',
        topic: 'Flashcard Basics',
        slide_number: null,
      },
      {
        id: 'fc_005',
        question: 'How does cross-device progress sync work in StudyMD v2?',
        answer: 'Progress writes to localStorage immediately for instant feedback, then syncs to Supabase in the background. On another device, the server state is fetched on load and merged with local data — newer timestamp wins.',
        topic: 'Progress Tracking',
        slide_number: null,
      },
      {
        id: 'fc_006',
        question: 'What four question types appear in practice exams?',
        answer: 'Multiple Choice (MCQ), True/False, Fill-in-the-Blank, and Matching. Each has custom interaction and auto-grading.',
        topic: 'Exam Practice',
        slide_number: null,
      },
      {
        id: 'fc_007',
        question: 'What is the Pomodoro technique?',
        answer: 'A focus method alternating 25-minute study blocks with 5-minute breaks. After 4 blocks, a longer break is taken. StudyMD has a built-in Pomodoro timer in the header.',
        topic: 'Platform Features',
        slide_number: null,
      },
      {
        id: 'fc_008',
        question: 'What does mastery percentage represent on a lecture card?',
        answer: 'The proportion of flashcards you have marked "Got it" at least once. Shown as a progress bar on every lecture card in the dashboard.',
        topic: 'Progress Tracking',
        slide_number: null,
      },
    ],
    questions: [
      {
        id: 'q_001',
        type: 'mcq',
        question: 'What is the primary purpose of StudyMD?',
        topic: 'Platform Features',
        options: [
          'To schedule medical appointments',
          'To provide personalized lecture mastery for PA students',
          'To store patient records',
          'To generate medical diagnoses',
        ],
        correct_answer: 'To provide personalized lecture mastery for PA students',
        explanation: 'StudyMD is purpose-built for PA students — flashcards, exams, and progress tracking in one place.',
      },
      {
        id: 'q_002',
        type: 'tf',
        question: 'StudyMD progress is only saved locally and cannot be accessed from another device.',
        topic: 'Progress Tracking',
        correct_answer: 'False',
        explanation: 'StudyMD v2 syncs to Supabase so progress is available on any device.',
      },
      {
        id: 'q_003',
        type: 'fillin',
        question: 'Press the _____ key to flip a flashcard.',
        topic: 'Flashcard Basics',
        correct_answer: 'Space',
        explanation: 'Space bar (or Enter) flips the card. G = Got it, M = Still learning, S = Skip.',
      },
      {
        id: 'q_004',
        type: 'mcq',
        question: 'Which of the following is NOT a question type in StudyMD practice exams?',
        topic: 'Exam Practice',
        options: [
          'Multiple Choice',
          'True / False',
          'Drag and Drop',
          'Fill in the Blank',
        ],
        correct_answer: 'Drag and Drop',
        explanation: 'The four supported types are MCQ, True/False, Fill-in-the-Blank, and Matching.',
      },
      {
        id: 'q_005',
        type: 'matching',
        question: 'Match each keyboard shortcut to its action in flashcard view.',
        topic: 'Flashcard Basics',
        correct_answer: JSON.stringify({
          'Space': 'Flip card',
          'G': 'Got it',
          'M': 'Still learning',
          'S': 'Skip card',
        }),
        explanation: 'StudyMD uses mnemonic shortcuts: G = Got it, M = Missed, S = Skip.',
      },
      {
        id: 'q_006',
        type: 'tf',
        question: 'The Pomodoro timer in StudyMD can send browser notifications when a phase ends.',
        topic: 'Platform Features',
        correct_answer: 'True',
        explanation: 'The timer requests browser notification permission and fires one at each phase transition.',
      },
      {
        id: 'q_007',
        type: 'mcq',
        question: 'When does StudyMD sync progress to the server if the device goes offline?',
        topic: 'Progress Tracking',
        options: [
          'It never syncs offline progress',
          'Immediately when back online via an offline queue',
          'After 24 hours',
          'Only when you click a manual Sync button',
        ],
        correct_answer: 'Immediately when back online via an offline queue',
        explanation: 'Failed writes are queued in localStorage and flushed automatically when the browser fires the "online" event.',
      },
      {
        id: 'q_008',
        type: 'fillin',
        question: 'A lecture\'s _____ percentage shows what proportion of its flashcards you\'ve marked "Got it".',
        topic: 'Progress Tracking',
        correct_answer: 'mastery',
        explanation: 'Mastery percentage is shown as a progress bar on each lecture card.',
      },
    ],
  },
};

async function seed() {
  console.log('🌱  Seeding demo lecture...\n');

  // ── 1. Upsert lecture row ─────────────────────────────────────────────────
  const lectureRes = await fetch(`${SUPABASE_URL}/rest/v1/lectures`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(DEMO_LECTURE),
  });

  if (!lectureRes.ok) {
    const err = await lectureRes.text();
    console.error('❌  Lecture insert failed:', err);
    process.exit(1);
  }
  console.log('✅  Lecture row upserted: lec_demo_001');

  // ── 2. Get all existing users so we can add display settings for each ─────
  const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=50`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  if (!usersRes.ok) {
    console.warn('⚠️  Could not fetch users (service role key may lack auth admin access).');
    console.log('\n📋  Run this SQL in Supabase SQL Editor to finish setup:\n');
    printManualSQL();
    return;
  }

  const usersData = await usersRes.json();
  const users = usersData.users ?? [];

  if (users.length === 0) {
    console.warn('⚠️  No user accounts found yet.');
    console.log('\n📋  After creating your user accounts, run this SQL in Supabase SQL Editor:\n');
    printManualSQL();
    return;
  }

  // ── 3. Upsert user_lecture_settings for every user ────────────────────────
  for (const user of users) {
    const settingsRes = await fetch(`${SUPABASE_URL}/rest/v1/user_lecture_settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: user.id,
        internal_id: 'lec_demo_001',
        display_order: 1,
        visible: true,
        archived: false,
        custom_title: null,
      }),
    });

    const label = user.email ?? user.id;
    if (settingsRes.ok) {
      console.log(`✅  Settings added for ${label}`);
    } else {
      const err = await settingsRes.text();
      console.warn(`⚠️  Settings failed for ${label}:`, err);
    }
  }

  console.log('\n🎉  Done!');
  console.log('    → Open your dashboard — "Introduction to StudyMD" should appear.');
  console.log('    → Study some flashcards, then open the site on a second device.');
  console.log('    → Progress (sessions, mastery %) should sync within a few seconds.\n');
}

function printManualSQL() {
  console.log(`INSERT INTO user_lecture_settings (user_id, internal_id, display_order, visible, archived)
SELECT id, 'lec_demo_001', 1, true, false
FROM auth.users
ON CONFLICT (user_id, internal_id) DO NOTHING;`);
  console.log('');
}

seed().catch((err) => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
