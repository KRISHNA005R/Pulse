import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { bufferNote, safeToSpend } from '../src/lib/finance';
import type { State, Subscription } from '../src/types';

// Safe-to-spend: the tester's exact numbers, and what the screen must be able to say about them.
// Income ₹60,000 (salary, next 1 Dec). Bank ₹25,000 + cash ₹500. Rent ₹12,000 on the 5th,
// electricity ₹1,500 on the 15th. Today 8 Nov 2026.

const bill = (id: string, name: string, amount: number, nextDate: string, extra: Partial<Subscription> = {}): Subscription => ({ id, name, amount, cycle: 'monthly', nextDate, category: 'bills', status: 'active', kind: 'bill', account: 'bank', ...extra });

function tester(over: Partial<State> = {}): State {
  const s = createSeed();
  s.mode = 'personal';
  s.today = '2026-11-08';
  s.accounts = [
    { id: 'bank', name: 'HDFC', kind: 'bank', balance: 25000, spendable: true },
    { id: 'cash', name: 'Cash', kind: 'cash', balance: 500, spendable: true },
  ] as never;
  s.cards = [];
  s.plans = [];
  s.investments = [];
  s.insurance = [];
  s.debts = [];
  s.bhisis = [];
  s.incomes = [{ id: 'inc', name: 'Salary', kind: 'salary', expected: 60000, cycle: 'monthly', nextDate: '2026-12-01' }] as never;
  s.subscriptions = [bill('rent', 'Rent', 12000, '2026-12-05'), bill('elec', 'Electricity', 1500, '2026-11-15')];
  s.settings.buffer = 1800;
  return Object.assign(s, over);
}

describe('the tester’s numbers', () => {
  it('₹25,500 − ₹1,500 electricity − ₹1,800 buffer = ₹22,200, ₹965 a day for 23 days', () => {
    const t = safeToSpend(tester());
    expect(t.available).toBe(25500);
    expect(t.billItems.map((b) => b.name)).toEqual(['Electricity']);
    expect(t.safe).toBe(22200);
    expect(t.daysLeft).toBe(23);
    expect(t.daily).toBe(965);
    expect(t.payday).toBe('2026-12-01');
    expect(t.fixedPayday).toBe(true);
  });

  it('rent on 5 Dec is not forgotten: it is named as due just after payday (paid from that pay)', () => {
    const t = safeToSpend(tester());
    expect(t.afterItems.map((b) => [b.name, b.amount, b.date])).toEqual([['Rent', 12000, '2026-12-05']]);
  });

  it('the ₹1,800 is explained: about 3% of monthly income, and where to change it', () => {
    expect(bufferNote(tester())).toMatch(/3% of your income/);
    const custom = tester();
    custom.settings.buffer = 5000;
    expect(bufferNote(custom)).not.toMatch(/3%/);
    expect(bufferNote(custom)).toMatch(/You → Budget preferences/);
  });

  it('a bill already paid this month (date moved to next month) is not counted again', () => {
    const t = safeToSpend(tester({ subscriptions: [bill('elec', 'Electricity', 1500, '2026-12-15')] }));
    expect(t.bills).toBe(0);
    expect(t.safe).toBe(23700);
  });

  it('a bill paid by hand that is past due and not marked paid still counts', () => {
    const t = safeToSpend(tester({ subscriptions: [bill('elec', 'Electricity', 1500, '2026-11-05', { autoDebit: false })] }));
    expect(t.billItems.map((b) => b.name)).toEqual(['Electricity']);
    expect(t.safe).toBe(22200);
  });
});

describe('no fixed payday (freelance)', () => {
  const free = (today: string) =>
    tester({ today, incomes: [{ id: 'f', name: 'Freelance work', kind: 'freelance', expected: 60000, cycle: 'irregular' }] as never, subscriptions: [bill('rent', 'Rent', 12000, '2026-12-05'), bill('elec', 'Electricity', 1500, '2026-12-15')] });

  it('late in the month the money is not spread over just a few days: planned 30 days ahead', () => {
    const t = safeToSpend(free('2026-11-28'));
    expect(t.fixedPayday).toBe(false);
    expect(t.payday).toBe('2026-12-28');
    expect(t.daysLeft).toBe(30);
    // Rent on 5 Dec falls inside those 30 days, so it is kept aside.
    expect(t.billItems.map((b) => b.name).sort()).toEqual(['Electricity', 'Rent']);
    expect(t.daily).toBeLessThan(1000);
  });

  it('never more generous than the old month-end horizon', () => {
    for (const day of ['2026-11-02', '2026-11-15', '2026-11-29', '2026-12-31', '2027-02-27']) {
      const t = safeToSpend(free(day));
      expect(t.daysLeft).toBeGreaterThanOrEqual(28);
    }
  });
});
