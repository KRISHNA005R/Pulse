import { describe, expect, it } from 'vitest';
import { rescaleShares } from '../src/lib/splitEdit';

// Changing a split's amount: everyone keeps their part, and it still adds up.

const sum = (s: { amount: number }[]) => s.reduce((a, x) => a + x.amount, 0);

describe('rescaling shares', () => {
  it('equal stays equal', () => {
    const s = rescaleShares({ amount: 600, shares: [{ person: 'me', amount: 300 }, { person: 'r', amount: 300 }] }, 900);
    expect(s).toEqual([{ person: 'me', amount: 450 }, { person: 'r', amount: 450 }]);
  });
  it('60/40 stays 60/40, and adds up to the new total', () => {
    const s = rescaleShares({ amount: 1000, shares: [{ person: 'me', amount: 600 }, { person: 'r', amount: 400 }] }, 750);
    expect(s.map((x) => x.amount)).toEqual([450, 300]);
    expect(sum(s)).toBe(750);
  });
  it('three people, odd total: still adds up', () => {
    const s = rescaleShares({ amount: 300, shares: [{ person: 'me', amount: 100 }, { person: 'a', amount: 100 }, { person: 'b', amount: 100 }] }, 1000);
    expect(sum(s)).toBeCloseTo(1000, 6);
  });
  it('shares of zero: split evenly', () => {
    expect(rescaleShares({ amount: 0, shares: [{ person: 'me', amount: 0 }, { person: 'r', amount: 0 }] }, 500).map((x) => x.amount)).toEqual([250, 250]);
  });
});
