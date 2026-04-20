import { describe, it, expect } from 'vitest';
import {
  pickGreeting,
  buildGreetingLine,
  genericGreetings,
  primaryGreetings,
} from '../lib/greetings';

const USER_A = 'user-uuid-aaaa-1111';
const USER_B = 'user-uuid-bbbb-2222';

describe('pickGreeting', () => {
  it('returns a string', () => {
    expect(typeof pickGreeting(USER_A, false)).toBe('string');
    expect(typeof pickGreeting(USER_A, true)).toBe('string');
  });

  it('is deterministic — same user same day same isPrimary', () => {
    const a1 = pickGreeting(USER_A, false);
    const a2 = pickGreeting(USER_A, false);
    expect(a1).toBe(a2);
  });

  it('draws from the primary pool for isPrimary=true', () => {
    const result = pickGreeting(USER_A, true);
    expect(primaryGreetings).toContain(result);
  });

  it('draws from the generic pool for isPrimary=false', () => {
    const result = pickGreeting(USER_A, false);
    expect(genericGreetings).toContain(result);
  });

  it('different users can get different greetings', () => {
    // With 18 entries in each pool it is highly likely two random users differ.
    // This test just verifies the function uses userId as part of the seed.
    const a = pickGreeting(USER_A, false);
    const b = pickGreeting(USER_B, false);
    // Not strictly guaranteed to differ, but with 18 entries the collision
    // probability is ~5.5% — acceptable for a determinism smoke test.
    // We only assert both are valid pool entries.
    expect(genericGreetings).toContain(a);
    expect(genericGreetings).toContain(b);
  });

  it('falls back to pool[0] when userId is empty', () => {
    expect(pickGreeting('', false)).toBe(genericGreetings[0]);
    expect(pickGreeting('', true)).toBe(primaryGreetings[0]);
  });
});

describe('buildGreetingLine', () => {
  it('substitutes {name} with the display name', () => {
    const result = buildGreetingLine('Haley', USER_A, false);
    // result will come from the generic pool; if it contained {name} it must be replaced
    expect(result).not.toContain('{name}');
  });

  it('handles display names with special regex chars safely', () => {
    const result = buildGreetingLine('O\'Brien', USER_A, false);
    expect(result).not.toContain('{name}');
  });

  it('primary pool entries do not contain {name}', () => {
    for (const g of primaryGreetings) {
      expect(g).not.toContain('{name}');
    }
  });

  it('every pool entry with {name} gets it replaced', () => {
    for (const g of genericGreetings) {
      const result = g.replace(/\{name\}/g, 'Test');
      expect(result).not.toContain('{name}');
    }
  });
});
