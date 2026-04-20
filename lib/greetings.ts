/**
 * Time-aware, deterministic greeting rotation.
 *
 * Seed: userId + UTC date + local time bucket → stable within the same
 * bucket (navigating away and back keeps the same greeting), rotates when
 * crossing into a new bucket or a new day.
 *
 * Time buckets use local clock hours so greetings are contextually correct
 * regardless of timezone.
 */

export type TimeBucket =
  | 'morning'        // 5:00 AM –  9:00 AM
  | 'late_morning'   // 9:00 AM – 12:00 PM
  | 'afternoon'      // 12:00 PM –  3:00 PM
  | 'late_afternoon' // 3:00 PM –  5:00 PM
  | 'early_evening'  // 5:00 PM –  7:00 PM
  | 'late_evening'   // 7:00 PM – 10:00 PM
  | 'night'          // 10:00 PM –  1:00 AM
  | 'late_night';    // 1:00 AM –  5:00 AM

/** Returns the local time bucket for the given hour (defaults to now). */
export function getTimeBucket(hour = new Date().getHours()): TimeBucket {
  if (hour >= 5  && hour < 9)  return 'morning';
  if (hour >= 9  && hour < 12) return 'late_morning';
  if (hour >= 12 && hour < 15) return 'afternoon';
  if (hour >= 15 && hour < 17) return 'late_afternoon';
  if (hour >= 17 && hour < 19) return 'early_evening';
  if (hour >= 19 && hour < 22) return 'late_evening';
  if (hour >= 22 || hour === 0) return 'night';
  return 'late_night'; // hours 1–4
}

// ─── Generic greeting pools (support {name} substitution) ────────────────────

export const genericGreetings: Record<TimeBucket, string[]> = {
  morning: [
    'Good morning, {name} — early start. Let\'s make it count.',
    'Rise and study, {name} — the day is yours.',
    'Early bird, {name}? The flashcards are ready 🌅',
    'Good morning, {name}. Best time to lock in new knowledge.',
    'Morning, {name} — fresh mind, fresh lecture.',
    'Up early, {name}? Respect. One lecture at a time.',
    'Good morning, {name}. Consistency starts with days like today.',
    'Hey {name} — morning energy is the best energy. Let\'s go.',
  ],
  late_morning: [
    'Morning, {name} — solid time to study.',
    'Good morning, {name}. Pre-lunch study session? Smart.',
    'Hey {name} — mid-morning grind. You\'re already ahead.',
    'Morning study session, {name}? Nice. Pick a lecture.',
    'Good morning, {name}. Morning momentum is real.',
    'Hey {name}, making the most of the morning. Let\'s go.',
    'Late morning, {name} — still counts, and it counts a lot 🌤',
    'Morning, {name}. Knowledge before lunch is a power move.',
  ],
  afternoon: [
    'Good afternoon, {name} — keeping the momentum going.',
    'Afternoon study session, {name}? You\'re doing great.',
    'Hey {name}, midday grind? Pick a lecture.',
    'Good afternoon, {name}. Progress over perfection.',
    'Back at it, {name}. Afternoon sessions build habits.',
    'Good afternoon, {name}. Your future self will thank you.',
    'Afternoon, {name} — what are we mastering today?',
    'Hey {name} — afternoon studying. Solid move.',
  ],
  late_afternoon: [
    'Late afternoon, {name} — solid commitment at this hour.',
    'Hey {name}, pushing through the afternoon? Respect.',
    'Late afternoon study session, {name}? Dedicated.',
    'Good afternoon, {name}. Last few hours of the day — use them.',
    'Hey {name}, late afternoon grind. You\'re consistent.',
    'Afternoon, {name}. Small sessions add up more than you think.',
    'Late afternoon, {name} — every session counts.',
    'Hey {name} — still studying this late in the afternoon. That\'s character.',
  ],
  early_evening: [
    'Good evening, {name} — evening study session?',
    'Evening, {name}. Solid choice to end the day with a lecture.',
    'Hey {name}, early evening study? You\'re dedicated.',
    'Good evening, {name}. One lecture before dinner?',
    'Evening study session, {name}. Nice consistency.',
    'Hey {name} — winding down with a lecture? Smart move.',
    'Good evening, {name}. Day\'s not over yet.',
    'Early evening, {name} — keep the streak alive.',
  ],
  late_evening: [
    'Evening, {name} — still at it? That\'s dedication.',
    'Good evening, {name}. Last push before winding down?',
    'Hey {name}, evening study session — committed.',
    'Evening grind, {name}? Your consistency is showing.',
    'Good evening, {name}. Knowledge earned tonight sticks longer.',
    'Hey {name} — late evening studying. Focused.',
    'Evening, {name}. One lecture before the night\'s done?',
    'Good evening, {name}. Dedicated to be here at this hour.',
  ],
  night: [
    'Late night studying, {name}? Impressive commitment 🌙',
    'Burning the midnight oil, {name}? The flashcards are ready.',
    'Night owl {name} — respect. Remember to rest too.',
    'Still at it, {name}? Dedication noted 🌙',
    'Late night session, {name} — your focus is something else.',
    'Hey {name}, midnight grind. One lecture at a time.',
    'Night mode, {name} — the quiet hours are great for studying 🌙',
    'Late night, {name}. Impressive — don\'t forget to sleep.',
  ],
  late_night: [
    'Still up, {name}? The dedication is real 🌙',
    'Late night studying, {name} — respect. Sleep matters too.',
    'Very late night, {name}? One lecture, then rest.',
    'Hey {name}, burning the midnight oil hard. Your commitment shows.',
    'Up this late studying, {name}? You\'re serious about this.',
    'Late night, {name} — the flashcards are ready whenever you are 🌙',
    'Pre-dawn studying, {name}? That\'s next level.',
    'Still at it, {name}. That level of dedication is rare 🌙',
  ],
};

// ─── Primary (Haley-specific) greeting pools ─────────────────────────────────

export const primaryGreetings: Record<TimeBucket, string[]> = {
  morning: [
    'Good morning, Haley 💛 early start — love to see it.',
    'Rise and shine, Haley — your future patients appreciate this dedication.',
    'Morning, Haley! Best time to lock in new knowledge 🌅',
    'Good morning, Haley. The flashcards are already warmed up.',
    'Early bird Haley — consistency like this builds great clinicians.',
    'Morning, Haley 💪 fresh mind, fresh lecture. Let\'s go.',
    'Good morning, Haley 💛 another day, another lecture mastered.',
    'Hey Haley — up early. Your future self will thank you 🌅',
  ],
  late_morning: [
    'Morning, Haley — mid-morning grind. You\'re already ahead.',
    'Good morning, Haley 💛 pre-lunch studying? Smart move.',
    'Hey Haley, morning energy is on your side. Let\'s use it.',
    'Morning study session, Haley? Nice. One lecture at a time.',
    'Good morning, Haley. Knowledge before lunch is a power move.',
    'Late morning, Haley 💛 still morning energy — and it shows.',
    'Hey Haley — morning momentum. Keep building on it.',
    'Good morning, Haley. Every morning session adds up.',
  ],
  afternoon: [
    'Good afternoon, Haley 💛 keeping the streak alive.',
    'Afternoon mastery session, Haley? You\'re crushing it.',
    'Afternoon, Haley — consistent students become great clinicians.',
    'Good afternoon, Haley. What lecture are we owning today?',
    'Hey Haley 💛 midday studying — your future self thanks you.',
    'Good afternoon, Haley. One lecture closer.',
    'Afternoon, Haley — this dedication is going to pay off.',
    'Good afternoon, Haley. Showing up every day matters 💛',
  ],
  late_afternoon: [
    'Late afternoon, Haley 💛 solid commitment at this hour.',
    'Hey Haley, pushing through the afternoon? Respect.',
    'Good afternoon, Haley. Last hours of the day — making them count.',
    'Late afternoon study, Haley? Consistent as always 💛',
    'Hey Haley — late afternoon grind. This is what separates great clinicians.',
    'Afternoon, Haley. Small sessions every day build real mastery.',
    'Late afternoon, Haley 💛 every session brings you closer.',
    'Hey Haley — still studying at this hour. That\'s dedication.',
  ],
  early_evening: [
    'Good evening, Haley 💛 end-of-day study session?',
    'Evening, Haley — you showed up today. That counts ⭐',
    'Good evening, Haley. One lecture before dinner?',
    'Hey Haley, early evening studying — dedicated as always.',
    'Good evening, Haley 💛 day\'s not over yet.',
    'Evening, Haley. Your consistency is genuinely impressive.',
    'Hey Haley — evening study session. Keep the streak going.',
    'Good evening, Haley. One lecture closer to where you want to be 💛',
  ],
  late_evening: [
    'Good evening, Haley 💛 last push of the day.',
    'Evening, Haley — still at it. That level of commitment shows.',
    'Good evening, Haley. Evening sessions are where habits are built.',
    'Hey Haley, late evening grind — your dedication is something else.',
    'Good evening, Haley 💛 knowledge earned tonight sticks.',
    'Evening, Haley — PA school\'s most dedicated student 🩺',
    'Hey Haley — still studying this evening. Proud of you.',
    'Good evening, Haley. One lecture before you rest 💛',
  ],
  night: [
    'Late night studying, Haley? 🌙 Your dedication is unreal.',
    'Night owl Haley — remember to rest too 💛',
    'Burning the midnight oil, Haley? You\'ve got this.',
    'Still at it, Haley? This kind of commitment pays off 🌙',
    'Late night, Haley — impressive. The flashcards are ready.',
    'Hey Haley, midnight studying. One lecture at a time 🌙',
    'Night mode, Haley. Your future patients are in good hands 💛',
    'Late night, Haley — almost there. You\'ve got this 🌙',
  ],
  late_night: [
    'Still up, Haley? 🌙 Your dedication is unreal — rest is studying too.',
    'Very late night, Haley? One lecture, then please rest 💛',
    'Late night, Haley — your commitment is something else entirely.',
    'Still at it, Haley? 🌙 This level of dedication is rare.',
    'Pre-dawn studying, Haley? That\'s next-level commitment.',
    'Hey Haley — up this late. Your dedication and care both show.',
    'Late night, Haley 💛 the flashcards are ready whenever you are 🌙',
    'Still studying, Haley? You\'ve got this — rest soon too.',
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
