/**
 * Time-aware, deterministic greeting rotation.
 *
 * The seed is userId + UTC date + local time bucket, so:
 *  - Stable within a session: navigating to /upload and back keeps the same
 *    greeting because the time bucket hasn't changed.
 *  - Rotates across time-of-day: studying in the morning then returning in
 *    the evening shows a new, evening-appropriate greeting.
 *  - Rotates daily: the next morning is a fresh seed from the current morning.
 *
 * Time buckets use local clock time so greetings are contextually correct
 * regardless of timezone.
 */

export type TimeBucket = 'morning' | 'afternoon' | 'evening' | 'night';

/** Returns the local time bucket for the current moment. */
export function getTimeBucket(hour = new Date().getHours()): TimeBucket {
  if (hour >= 5  && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

// ─── Generic greeting pools (support {name} substitution) ────────────────────

export const genericGreetings: Record<TimeBucket, string[]> = {
  morning: [
    'Good morning, {name} — let\'s make today count.',
    'Early bird, {name}? Nice. The flashcards are ready 🌅',
    'Morning, {name}. Best time to lock in new knowledge.',
    'Rise and study, {name} — you\'ve got this.',
    'Good morning, {name}. What are we mastering today?',
    'Morning momentum, {name} — pick a lecture.',
    'Up early, {name}? Great. One lecture at a time.',
    'Good morning, {name}. Consistency compounds.',
  ],
  afternoon: [
    'Good afternoon, {name} — keeping the momentum going.',
    'Afternoon study session, {name}? You\'re doing great.',
    'Hey {name}, midday grind? Respect. Pick a lecture.',
    'Good afternoon, {name}. Progress over perfection.',
    'Back at it, {name}. Afternoon sessions count just as much.',
    'Good afternoon, {name}. Your future self will thank you.',
    'Hey {name} — afternoon mastery session. Let\'s go.',
    'Afternoon, {name}. What are we studying today?',
  ],
  evening: [
    'Good evening, {name} — solid choice to end the day with a lecture.',
    'Evening, {name}. One more before calling it a day?',
    'Good evening, {name} — winding down with some studying?',
    'Hey {name}, evening study session — dedicated.',
    'Good evening, {name}. Last push of the day.',
    'Evening, {name} — you showed up today. That counts.',
    'Good evening, {name}. Knowledge earned tonight sticks longer.',
    'Hey {name}, end-of-day studying? You\'re serious about this.',
  ],
  night: [
    'Late night studying, {name}? Impressive commitment 🌙',
    'Burning the midnight oil, {name}? The flashcards are ready.',
    'Night owl {name} — respect. Don\'t forget to rest too.',
    'Still at it, {name}? Dedication noted.',
    'Late night session, {name} — your focus is admirable.',
    'Hey {name}, burning the midnight oil. One lecture at a time.',
    'Night mode activated, {name}. Let\'s keep it sharp.',
    'Late night, {name} — the quiet hours are great for studying 🌙',
  ],
};

// ─── Primary (Haley-specific) greeting pools ─────────────────────────────────

export const primaryGreetings: Record<TimeBucket, string[]> = {
  morning: [
    'Good morning, Haley 💛 early start — love to see it.',
    'Morning, Haley! Best time to lock in new knowledge 🌅',
    'Early bird Haley — your future patients appreciate this.',
    'Good morning, Haley. The flashcards are already warmed up.',
    'Morning, Haley 💪 let\'s make it count.',
    'Up early, Haley? Consistent mornings build great clinicians.',
    'Good morning, Haley 💛 another day, another lecture mastered.',
    'Rise and shine, Haley — you\'ve got this 🌅',
  ],
  afternoon: [
    'Good afternoon, Haley 💛 keeping the streak alive.',
    'Hey Haley, midday mastery session? You\'re crushing it.',
    'Afternoon, Haley — consistent students become great clinicians.',
    'Good afternoon, Haley. What lecture are we owning today?',
    'Afternoon grind, Haley. This dedication shows.',
    'Hey Haley 💛 afternoon studying — your future self thanks you.',
    'Good afternoon, Haley. One lecture closer.',
    'Midday momentum, Haley — let\'s keep it going 💪',
  ],
  evening: [
    'Good evening, Haley 💛 end-of-day study session?',
    'Evening, Haley — you showed up today. That counts ⭐',
    'Good evening, Haley. Last push of the day 🌙',
    'Hey Haley, evening grind — your dedication shows.',
    'Good evening, Haley. Knowledge earned tonight sticks.',
    'Evening, Haley 💛 one more before you rest?',
    'Hey Haley — solid evening session incoming.',
    'Good evening, Haley. PA school\'s most dedicated student 🩺',
  ],
  night: [
    'Late night studying, Haley? 🌙 Your dedication is unreal.',
    'Night owl Haley — remember to rest too 💛',
    'Burning the midnight oil, Haley? You\'ve got this.',
    'Still at it, Haley? This kind of commitment pays off.',
    'Late night, Haley — impressive. The flashcards are ready 🌙',
    'Hey Haley, late night session — one lecture at a time.',
    'Midnight studier, Haley? Your future patients are lucky.',
    'Late night, Haley 💛 almost there. Keep going.',
  ],
};

// ─── Core logic ───────────────────────────────────────────────────────────────

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
 * Picks a greeting from the appropriate time-bucket pool.
 *
 * Seed: userId + UTC date + timeBucket.
 * Stable within the same bucket (navigating away and back keeps the same
 * greeting). Rotates when crossing into a new bucket or a new day.
 */
export function pickGreeting(userId: string, isPrimary: boolean, timeBucket?: TimeBucket): string {
  const bucket = timeBucket ?? getTimeBucket();
  const pool = isPrimary ? primaryGreetings[bucket] : genericGreetings[bucket];
  if (!userId) return pool[0];
  const utcDay = new Date().toISOString().slice(0, 10);
  const seed = hash(userId + '|' + utcDay + '|' + bucket);
  return pool[seed % pool.length];
}

/**
 * Returns the final greeting line with {name} substituted.
 * This is what the Dashboard renders in <h1>.
 */
export function buildGreetingLine(
  displayName: string,
  userId: string,
  isPrimary: boolean,
  timeBucket?: TimeBucket
): string {
  const greeting = pickGreeting(userId, isPrimary, timeBucket);
  return greeting.replace(/\{name\}/g, displayName);
}
