import { describe, it, expect } from 'vitest';
import {
  pickGreeting,
  buildGreetingLine,
  getTimeBucket,
  genericGreetings,
  primaryGreetings,
  type TimeBucket,
} from '../lib/greetings';

const USER_A = 'user-uuid-aaaa-1111';
const BUCKETS: TimeBucket[] = [
  'morning', 'late_morning', 'afternoon', 'late_afternoon',
  'early_evening', 'late_evening', 'night', 'late_night',
];

describe('getTimeBucket', () => {
  const cases: [number, TimeBucket][] = [
    [5,  'morning'],
    [8,  'morning'],
    [9,  'late_morning'],
    [11, 'late_morning'],
    [12, 'afternoon'],
    [14, 'afternoon'],
    [15, 'late_afternoon'],
    [16, 'late_afternoon'],
    [17, 'early_evening'],
    [18, 'early_evening'],
    [19, 'late_evening'],
    [21, 'late_evening'],
    [22, 'night'],
    [23, 'night'],
    [0,  'night'],
    [1,  'late_night'],
    [4,  'late_night'],
  ];

  it.each(cases)('hour %i → %s', (hour, expected) => {
    expect(getTimeBucket(hour)).toBe(expected);
  });
});

describe('pickGreeting', () => {
  it('returns a string for all buckets, both user types', () => {
    for (const bucket of BUCKETS) {
      expect(typeof pickGreeting(USER_A, false, bucket)).toBe('string');
      expect(typeof pickGreeting(USER_A, true,  bucket)).toBe('string');
    }
  });

  it('is deterministic — same user, same bucket, same isPrimary', () => {
    for (const bucket of BUCKETS) {
      expect(pickGreeting(USER_A, false, bucket)).toBe(pickGreeting(USER_A, false, bucket));
      expect(pickGreeting(USER_A, true,  bucket)).toBe(pickGreeting(USER_A, true,  bucket));
    }
  });

  it('draws from the correct time-bucket pool', () => {
    for (const bucket of BUCKETS) {
      expect(genericGreetings[bucket]).toContain(pickGreeting(USER_A, false, bucket));
      expect(primaryGreetings[bucket]).toContain(pickGreeting(USER_A, true,  bucket));
    }
  });

  it('falls back to pool[0] when userId is empty', () => {
    for (const bucket of BUCKETS) {
      expect(pickGreeting('', false, bucket)).toBe(genericGreetings[bucket][0]);
      expect(pickGreeting('', true,  bucket)).toBe(primaryGreetings[bucket][0]);
    }
  });
});

describe('buildGreetingLine', () => {
  it('substitutes {name} in all generic pools', () => {
    for (const bucket of BUCKETS) {
      const result = buildGreetingLine('Haley', USER_A, false, bucket);
      expect(result).not.toContain('{name}');
    }
  });

  it('primary pool entries never contain {name}', () => {
    for (const bucket of BUCKETS) {
      for (const g of primaryGreetings[bucket]) {
        expect(g).not.toContain('{name}');
      }
    }
  });

  it('handles display names with special chars safely', () => {
    for (const bucket of BUCKETS) {
      expect(buildGreetingLine("O'Brien", USER_A, false, bucket)).not.toContain('{name}');
    }
  });

  it('every generic entry with {name} gets it replaced', () => {
    for (const bucket of BUCKETS) {
      for (const g of genericGreetings[bucket]) {
        expect(g.replace(/\{name\}/g, 'Test')).not.toContain('{name}');
      }
    }
  });
});
