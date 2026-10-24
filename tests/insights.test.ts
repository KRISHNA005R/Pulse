import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { buildInsights } from '../src/lib/insights';
import type { State, Transaction } from '../src/types';

// BUG-01: "Food spending is down 100% on last month" early in the month.
function withFood(today: string, food: [string, number][]): State {
  const s = createSeed();
  s.today = today;
  s.budgets = [];
  s.transactions = food.map(([date, amount], i): Transaction => ({ id: `f${i}`, merchant: 'Food', amount, type: 'expense', category: 'food', date, account: s.accounts[0].id, recurring: false, status: 'completed' }));
  return s;
}
const foodMonth = (s: State) => buildInsights(s).find((i) => i.id === 'food-month');

describe('food this month vs last month', () => {
  it('says nothing when no food is logged yet this month (no "down 100%")', () => {
    const s = withFood('2026-10-20', [['2026-09-05', 2000], ['2026-09-25', 3000]]);
    expect(foodMonth(s)).toBeUndefined();
  });

  it('waits until a week of the month has gone by', () => {
    const s = withFood('2026-10-04', [['2026-09-02', 500], ['2026-10-02', 400]]);
    expect(foodMonth(s)).toBeUndefined();
  });

  it('compares with the same point last month, not the whole of last month', () => {
    // Sept 1–10: ₹1,000 (then ₹4,000 more later in Sept). Oct 1–10: ₹1,200 → 20% more, not "down 76%".
    const s = withFood('2026-10-10', [['2026-09-03', 1000], ['2026-09-25', 4000], ['2026-10-05', 1200]]);
    expect(foodMonth(s)?.text).toBe('You spent 20% more on food this month.');
  });

  it('down is still reported when it is real', () => {
    const s = withFood('2026-10-15', [['2026-09-10', 2000], ['2026-10-12', 1000]]);
    expect(foodMonth(s)?.text).toBe('Food spending is down 50% on last month.');
  });

  it('a short month is compared fairly (31 Oct vs 30 Sept)', () => {
    const s = withFood('2026-10-31', [['2026-09-30', 1000], ['2026-10-31', 1000]]);
    expect(foodMonth(s)?.text).toBe('You spent 0% more on food this month.');
  });
});
