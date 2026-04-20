/**
 * Deterministic daily greeting rotation.
 *
 * pickGreeting() uses FNV-1a hash of (userId + UTC date) as a seed so:
 *  - The same user sees the same greeting all day (no flash on re-mount).
 *  - Different users see different greetings on the same day.
 *  - The greeting rotates at UTC midnight.
 *
 * Templates may contain {name} which buildGreetingLine() substitutes with
 * the resolved display name.
 */

export const genericGreetings: string[] = [
  'Welcome back, {name} — ready to study?',
  'Good to see you, {name}. Pick a lecture.',
  "Let's make today count, {name}.",
  'Your next exam won\'t know what hit it, {name}.',
  'One lecture at a time, {name}. You\'ve got this.',
  'Back again, {name} — consistency is everything.',
  'Hey {name} — knowledge compounds. Keep going.',
  'Great to have you back, {name}. What are we mastering today?',
  'Progress over perfection, {name}. Let\'s study.',
  'You showed up, {name}. That\'s already half the battle.',
  'Another day, another lecture conquered — hey {name}.',
  '{name}, your future patients will thank you for this.',
  'Looking sharp, {name}. Time to get sharper.',
  'The flashcards are ready, {name}. Are you?',
  'New day, new mastery. Welcome back, {name}.',
  "Clinics are earned in the library, {name}. Let's go.",
  'Hi {name} — every card you flip counts.',
  'Small steps, big results. Keep it up, {name}.',
];

export const primaryGreetings: string[] = [
  'Hi Haley 💛 you\'ve got this.',
  'Back at it, Haley — one lecture at a time.',
  'Ready to conquer your exams? Let\'s go, Haley 💪',
  'Every card you flip is one step closer. Keep going. 🩵',
  'Built just for you, studied just by you, Haley 🎓',
  'Your hard work is paying off. Keep going, Haley ⭐',
  'PA school\'s most dedicated student just logged in. 🩺',
  'New day, new mastery. What are we studying today, Haley?',
  'Knowledge is power — and you\'re powerfully focused, Haley 💙',
  'The flashcards are ready, Haley. Let\'s master it.',
  'Hey Haley 👋 your future patients are rooting for you.',
  'Small steps every day, Haley. You\'re building something real.',
  'Haley, consistency is your superpower. Keep showing up.',
  'Another study session in the books — hey Haley 🌟',
  'You make this look easy, Haley. It\'s because you work hard.',
  'Hi Haley 💛 clinics are earned in the library.',
  'Proud of you for showing up again, Haley. Let\'s go.',
  'One lecture closer to being the PA you\'re meant to be, Haley.',
];

/** FNV-1a 32-bit hash — fast, good distribution, no dependencies. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Returns a greeting string for the given user and day.
 * Deterministic: same user + same UTC date → same greeting.
 */
export function pickGreeting(userId: string, isPrimary: boolean): string {
  const pool = isPrimary ? primaryGreetings : genericGreetings;
  if (!userId) return pool[0];
  const utcDay = new Date().toISOString().slice(0, 10);
  const seed = hash(userId + '|' + utcDay);
  return pool[seed % pool.length];
}

/**
 * Returns the final greeting line with {name} substituted.
 * This is what the Dashboard renders in <h1>.
 */
export function buildGreetingLine(
  displayName: string,
  userId: string,
  isPrimary: boolean
): string {
  const greeting = pickGreeting(userId, isPrimary);
  return greeting.replace(/\{name\}/g, displayName);
}
