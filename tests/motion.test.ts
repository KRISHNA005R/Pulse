import { describe, expect, it } from 'vitest';
import { rollTokens, rollTarget } from '../src/lib/motion';

// Rolling numbers: each digit is its own wheel, everything else (₹ , . L K) stays put.
describe('rollTokens', () => {
  it('splits an amount into digit wheels and fixed characters, keyed from the right', () => {
    const t = rollTokens('₹1,86,400');
    expect(t.map((x) => x.ch).join('')).toBe('₹1,86,400');
    expect(t.filter((x) => x.digit).map((x) => x.ch).join('')).toBe('186400');
    expect(t[t.length - 1].key).toBe('r0');
    // Keys are counted from the right, so the ones digit stays the ones digit when the number grows.
    expect(rollTokens('₹99').at(-1)!.key).toBe(rollTokens('₹1,000').at(-1)!.key);
  });
  it('keeps short forms and signs as fixed characters', () => {
    const t = rollTokens('−₹1.1L');
    expect(t.filter((x) => !x.digit).map((x) => x.ch).join('')).toBe('−₹.L');
  });
});

describe('rollTarget', () => {
  it('always rolls forward, landing on the new digit in the second band (10–19)', () => {
    expect(rollTarget(3)).toBe(13);
    expect(rollTarget(0)).toBe(10);
  });
});
