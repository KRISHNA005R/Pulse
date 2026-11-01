import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { leftAtPayday, mainIncome, nextPayday } from '../src/lib/finance';
import { addMonths } from '../src/lib/format';

// Spending history, a finished month: what it carried over = the money in bank and cash just before
// the next payday. That money moves on into the next month.

describe('what a finished month carried over: money left just before the next payday', () => {
  it('a month ends the day before the next payday (salary on the 4th: September ends before 4 Oct)', () => {
    const s = createSeed();
    s.today = '2026-10-20';
    const day = Number(mainIncome(s)!.nextDate!.slice(8));
    const r = leftAtPayday(s, '2026-09-01')!;
    expect(r.date).toBe(`2026-10-${String(day).padStart(2, '0')}`);
  });

  it('bank + cash now, with everything since that payday taken back out', () => {
    const s = createSeed();
    const since = addMonths(nextPayday(s), -1);
    const month = addMonths(since, -1).slice(0, 8) + '01';
    const before = leftAtPayday(s, month)!.left;
    const bank = s.accounts.find((a) => a.spendable)!;
    // A salary and a spend after payday: what the month before carried over doesn't change.
    s.transactions.push({ id: 'in', merchant: 'Salary', amount: 1000, type: 'income', category: 'salary', date: since, account: bank.id, recurring: false, status: 'completed' });
    s.transactions.push({ id: 'x', merchant: 'Dinner', amount: 900, type: 'expense', category: 'food', date: since, account: bank.id, recurring: false, status: 'completed' });
    bank.balance += 1000 - 900;
    expect(leftAtPayday(s, month)!.left).toBeCloseTo(before, 2);
  });

  it('moving money from bank to cash changes nothing', () => {
    const s = createSeed();
    const since = addMonths(nextPayday(s), -1);
    const month = addMonths(since, -1).slice(0, 8) + '01';
    const [a, b] = s.accounts.filter((x) => x.spendable);
    if (!b) return;
    const before = leftAtPayday(s, month)!.left;
    s.transactions.push({ id: 'mv', merchant: 'ATM', amount: 500, type: 'transfer', category: 'transfer', date: since, account: a.id, toAccount: b.id, recurring: false, status: 'completed' } as never);
    expect(leftAtPayday(s, month)!.left).toBeCloseTo(before, 2);
  });

  it('a month whose payday has not come yet has no carried-over number', () => {
    const s = createSeed();
    expect(leftAtPayday(s, s.today.slice(0, 8) + '01')).toBeNull();
  });
});
