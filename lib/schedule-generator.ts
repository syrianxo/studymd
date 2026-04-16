/**
 * lib/schedule-generator.ts
 *
 * Pure, server-safe schedule generation logic.
 * No Claude API needed — uses flashcard count as a proxy for lecture weight.
 *
 * Algorithm:
 *  1. Count days between today and the test date (exclusive of test day).
 *  2. Require every lecture to appear at least TWICE (minimum review passes).
 *  3. Distribute lectures proportionally by weight (flashcard + question count).
 *  4. Build a day-keyed schedule map.
 */

import type { StudySchedule } from '@/types';

export interface LectureWeight {
  internalId: string;
  /** Number of flashcards + exam questions — proxy for content volume */
  cardCount: number;
}

interface ScheduleOptions {
  testDate: string;         // ISO "YYYY-MM-DD"
  lectures: LectureWeight[];
  today?: Date;             // injectable for tests
}

/**
 * Returns a StudySchedule or throws if the date range is too short.
 */
export function generateSchedule({
  testDate,
  lectures,
  today = new Date(),
}: ScheduleOptions): StudySchedule {
  if (lectures.length === 0) {
    throw new Error('Select at least one lecture.');
  }

  // ── Compute available days ────────────────────────────────────────────────
  const todayMidnight = toMidnight(today);
  const testMidnight  = toMidnight(new Date(testDate + 'T00:00:00'));

  // Days from today up to (but not including) the test day
  const totalDays = daysBetween(todayMidnight, testMidnight);

  if (totalDays < 1) {
    throw new Error('Test date must be at least 1 day in the future.');
  }

  // ── Assign weights ────────────────────────────────────────────────────────
  const totalCards = lectures.reduce((s, l) => s + l.cardCount, 0);
  // Minimum weight so lectures with 0 cards still get a slot
  const safeTotalCards = Math.max(totalCards, lectures.length);

  const MIN_REVIEW_PASSES = 2;

  // Total "slots" to assign = lectures * MIN_REVIEW_PASSES, then stretch if
  // there are more days available to add extra passes for heavier lectures.
  const minSlots = lectures.length * MIN_REVIEW_PASSES;

  // Each "virtual slot" is one lecture appearance in the schedule.
  // We'll fill `totalDays` days, capping slots at totalDays * 3 (avoid cramming).
  const targetSlots = Math.min(
    Math.max(minSlots, totalDays),
    totalDays * 3
  );

  // Weight each lecture: guaranteed MIN_REVIEW_PASSES plus proportional extras
  const extraSlots  = Math.max(0, targetSlots - minSlots);
  const weightedLectures: Array<{ internalId: string; slots: number }> = lectures.map((l) => {
    const proportion = l.cardCount / safeTotalCards;
    const extra      = Math.round(proportion * extraSlots);
    return { internalId: l.internalId, slots: MIN_REVIEW_PASSES + extra };
  });

  // ── Flatten into an ordered slot list ─────────────────────────────────────
  // Spread lectures evenly: interleave rather than grouping all slots of one lecture.
  const slotList: string[] = buildInterleavedSlots(weightedLectures);

  // ── Distribute slots across days ──────────────────────────────────────────
  const lecturesPerDay = Math.ceil(slotList.length / totalDays);

  const schedule: StudySchedule = {};
  for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
    const start = dayIndex * lecturesPerDay;
    const end   = start + lecturesPerDay;
    const daySlots = slotList.slice(start, end);
    if (daySlots.length === 0) continue;

    const date = addDays(todayMidnight, dayIndex);
    const key  = toISODate(date);
    schedule[key] = daySlots;
  }

  return schedule;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Interleaves slots so that no two consecutive slots are the same lecture
 * (where possible). Uses a round-robin pass strategy.
 */
function buildInterleavedSlots(
  weighted: Array<{ internalId: string; slots: number }>
): string[] {
  // Expand each lecture into its pass numbers
  const queues: string[][] = weighted.map(({ internalId, slots }) =>
    Array.from({ length: slots }, () => internalId)
  );

  const result: string[] = [];
  let lastAdded = '';

  while (queues.some((q) => q.length > 0)) {
    // Pick the queue with the most remaining slots that isn't the last added
    queues.sort((a, b) => b.length - a.length);
    const pick = queues.find(
      (q) => q.length > 0 && q[0] !== lastAdded
    ) ?? queues.find((q) => q.length > 0);

    if (!pick) break;
    lastAdded = pick.shift()!;
    result.push(lastAdded);
  }

  return result;
}

function toMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
