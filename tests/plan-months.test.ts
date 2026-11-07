import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { perMonth, planMetrics } from '../src/lib/finance';
import type { Plan, State, Transaction } from '../src/types';

// "A month × N" on a plan: once this month's share is in, this month stops counting.
// Bali trip: ₹90,000 by 18 Jan 2027. Today is 7 Nov 2026.

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'bali',
  name: 'Bali trip',
  icon: '🏝️',
  kind: 'plan',
  target: 90000,
  saved: 0,
  startDate: '2026-10-20',
  targetDate: '2027-01-18',
  status: 'active',
  categories: [],
  cycleReserve: 0,
  contributions: [],
  ...over,
});

let n = 0;
const move = (date: string, amount: number, direction: 'out' | 'in' = 'out'): Transaction => ({
  id: `t${++n}`,
  merchant: direction === 'out' ? 'Moved to Bali trip' : 'Taken from Bali trip',
  amount,
  type: 'transfer',
  direction,
  toAccount: 'pot:bali',
  category: 'transfer',
  date,
  account: 'bank',
  plan: 'bali',
  recurring: false,
  status: 'completed',
});

const world = (p: Plan, txs: Transaction[], today = '2026-11-07'): State => {
  const s = createSeed();
  s.today = today;
  s.plans = [p];
  s.transactions = txs;
  return s;
};

describe('a month × N on a plan', () => {
  it("November's share is in: only December and January are left, ₹29,910 each", () => {
    const s = world(plan({ saved: 30180 }), [move('2026-11-04', 30180)]);
    const m = planMetrics(s, s.plans[0]);
    expect(m.saves.thisMonthIn).toBe(true);
    expect(m.saves.count).toBe(2);
    expect(m.saves.months.map((d) => d.slice(0, 7))).toEqual(['2026-12', '2027-01']);
    expect(m.monthly).toBe(29910);
  });

  it('saved last month, nothing yet this month: November still counts (₹19,940 × 3)', () => {
    const s = world(plan({ saved: 30180 }), [move('2026-10-25', 30180)]);
    const m = planMetrics(s, s.plans[0]);
    expect(m.saves.thisMonthIn).toBe(false);
    expect(m.saves.count).toBe(3);
    expect(m.saves.months.map((d) => d.slice(0, 7))).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(m.monthly).toBe(19940);
  });

  it('a small top-up is not the month\'s share', () => {
    const s = world(plan({ saved: 500 }), [move('2026-11-05', 500)]);
    expect(planMetrics(s, s.plans[0]).saves.count).toBe(3);
  });

  it('money taken back out this month is taken off', () => {
    const s = world(plan({ saved: 10180 }), [move('2026-11-04', 30180), move('2026-11-06', 20000, 'in')]);
    expect(planMetrics(s, s.plans[0]).saves.thisMonthIn).toBe(false);
  });

  it('saving more than the share this month still skips just this month', () => {
    const s = world(plan({ saved: 50000 }), [move('2026-11-04', 50000)]);
    const m = planMetrics(s, s.plans[0]);
    expect(m.saves.count).toBe(2);
    expect(m.monthly).toBe(20000);
  });

  it('a new plan made today with money already in it matches what the form said', () => {
    // The starting amount isn't a move this month, so nothing is skipped.
    const p = plan({ startDate: '2026-11-07', saved: 30000, contributions: [{ date: '2026-11-07', amount: 30000 }] });
    const s = world(p, []);
    expect(planMetrics(s, p).monthly).toBe(perMonth(60000, '2026-11-07', '2027-01-18'));
  });

  it('in the last month, with its share in, what is left is due in that month', () => {
    const s = world(plan({ saved: 89000 }), [move('2027-01-05', 29000)], '2027-01-07');
    const m = planMetrics(s, s.plans[0]);
    expect(m.saves.count).toBe(1);
    expect(m.monthly).toBe(1000);
  });

  it('another plan\'s moves do not count', () => {
    const other = { ...move('2026-11-04', 30180), toAccount: 'pot:other', plan: 'other' };
    const s = world(plan({ saved: 30180 }), [other]);
    expect(planMetrics(s, s.plans[0]).saves.thisMonthIn).toBe(false);
  });
});
