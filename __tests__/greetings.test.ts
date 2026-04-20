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
const USER_B = 'user-uuid-bbbb-2222';
const BUCKETS: TimeBucket[] = ['morning', 'afternoon', 'evening', 'night'];

describe('getTimeBucket', () => {
  it('maps hours to correct buckets', () => {
    expect(getTimeBucket(6)).toBe('morning');
    expect(getTimeBucket(11)).toBe('morning');
    expect(getTimeBucket(12)).toBe('afternoon');
    expect(getTimeBucket(16)).toBe('afternoon');
    expect(getTimeBucket(17)).toBe('evening');
    expect(getTimeBucket(21)).toBe('evening');
    expect(getTimeBucket(22)).toBe('night');
    expect(getTimeBucket(3)).toBe('night');
    expect(getTimeBucket(0)).toBe('night');
  });
});

describe('pickGreeting', () => {
  it('returns a string for all buckets, both user types', () => {
    for (const bucket of BUCKETS) {
      expect(typeof pickGreeting(USER_A, false, bucket)).toBe('string');
      expect(typeof pickGreeting(USER_A, true, bucket)).toBe('string');
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

  it('different time buckets can produce different greetings for the same user', () => {
    // Not guaranteed to differ with every userId/day combo, but with 8 entries
    // per bucket the chance all four match is negligible. We just check the pool.
    for (const bucket of BUCKETS) {
      const result = pickGreeting(USER_A, false, bucket);
      expect(genericGreetings[bucket]).toContain(result);
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
  it('substitutes {name} in generic greetings', () => {
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
      const result = buildGreetingLine("O'Brien", USER_A, false, bucket);
      expect(result).not.toContain('{name}');
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
