import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { applyMoney, nextPayday, planMetrics, refillReserves, safeToSpend } from '../src/lib/finance';
import { addDays } from '../src/lib/format';
import type { Plan, State, Transaction } from '../src/types';

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'trip',
  name: 'Goa',
  icon: '🏖️',
  kind: 'plan',
  target: 10000,
  saved: 0,
  startDate: '2026-10-01',
  targetDate: '2027-03-01',
  status: 'active',
  categories: [],
  cycleReserve: 0,
  contributions: [],
  ...over,
});

const fresh = (p: Plan): State => {
  const s = createSeed();
  s.plans = [p];
  return s;
};

describe('keep aside every payday', () => {
  it('refills once per pay cycle, after it was used up', () => {
    const s = fresh(plan({ reserveEvery: 2000, cycleReserve: 0, reserveFor: nextPayday(createSeed()) }));
    refillReserves(s);
    expect(s.plans[0].cycleReserve).toBe(0); // same cycle: no refill
    const pd = nextPayday(s);
    s.today = addDays(pd, 1); // payday has passed
    refillReserves(s);
    expect(s.plans[0].cycleReserve).toBe(2000);
    s.plans[0].cycleReserve = 500;
    refillReserves(s);
    expect(s.plans[0].cycleReserve).toBe(500); // still the same cycle
  });

  it('never holds more than what is left to save', () => {
    const s = fresh(plan({ saved: 9500, reserveEvery: 2000, reserveFor: '2000-01-01' }));
    refillReserves(s);
    expect(s.plans[0].cycleReserve).toBe(500);
  });

  it('treats an old held amount as every payday', () => {
    const s = fresh(plan({ cycleReserve: 1500 }));
    refillReserves(s);
    expect(s.plans[0].reserveEvery).toBe(1500);
    expect(s.plans[0].reserveFor).toBe(nextPayday(s));
  });

  it('holds the amount back from safe to spend', () => {
    const s = fresh(plan());
    const before = safeToSpend(s).safe;
    s.plans[0].reserveEvery = 1000;
    s.plans[0].reserveFor = '2000-01-01';
    refillReserves(s);
    expect(before - safeToSpend(s).safe).toBeCloseTo(1000, 0);
  });
});

describe('taking money out of a plan', () => {
  it('lowers the plan and puts the money back in the account', () => {
    const s = fresh(plan({ saved: 3000 }));
    const acct = s.accounts.find((a) => a.type === 'bank')!;
    const bal = acct.balance;
    const tx: Transaction = { id: 'w1', merchant: 'Taken from Goa', amount: 1200, type: 'transfer', direction: 'in', toAccount: 'pot:trip', category: 'transfer', date: s.today, account: acct.id, plan: 'trip', recurring: false, status: 'completed' };
    applyMoney(s, tx, 1);
    expect(s.plans[0].saved).toBe(1800);
    expect(acct.balance).toBe(bal + 1200);
    applyMoney(s, tx, -1); // deleting it undoes both
    expect(s.plans[0].saved).toBe(3000);
    expect(acct.balance).toBe(bal);
  });

  it('adding money still works the old way', () => {
    const s = fresh(plan({ saved: 0 }));
    const acct = s.accounts.find((a) => a.type === 'bank')!;
    const tx: Transaction = { id: 'c1', merchant: 'Goa', amount: 500, type: 'transfer', toAccount: 'pot:trip', category: 'transfer', date: s.today, account: acct.id, plan: 'trip', recurring: false, status: 'completed' };
    applyMoney(s, tx, 1);
    expect(s.plans[0].saved).toBe(500);
  });
});

describe('plan status', () => {
  it('a new empty plan says fresh start, not on schedule', () => {
    const s = fresh(plan({ startDate: createSeed().today }));
    expect(planMetrics(s, s.plans[0]).status).toMatch(/^Fresh start/);
  });
});
