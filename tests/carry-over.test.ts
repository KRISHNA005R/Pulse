import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { carryOver, leftAtPayday, mainIncome, nextPayday, safeToSpend } from '../src/lib/finance';
import { addMonths } from '../src/lib/format';

// "How it works": where today's money came from. Left from before this payday + what came in since
// − what went out since = Available now.

describe('carry-over from before payday', () => {
  it('adds up exactly to Available now', () => {
    const s = createSeed();
    const c = carryOver(s);
    expect(c.since).toBe(addMonths(nextPayday(s), -1));
    expect(c.left + c.cameIn - c.wentOut).toBeCloseTo(safeToSpend(s).available, 2);
  });

  it('a salary since payday is in "came in"; a spend from the bank is in "went out"; card spends are not', () => {
    const s = createSeed();
    const since = carryOver(s).since;
    const before = carryOver(s);
    const bank = s.accounts.find((a) => a.spendable)!;
    const card = s.cards[0];
    s.transactions.push({ id: 'in1', merchant: 'Salary', amount: 1000, type: 'income', category: 'salary', date: since, account: bank.id, recurring: false, status: 'completed' });
    bank.balance += 1000;
    s.transactions.push({ id: 'out1', merchant: 'Lunch', amount: 300, type: 'expense', category: 'food', date: since, account: bank.id, recurring: false, status: 'completed' });
    bank.balance -= 300;
    if (card) s.transactions.push({ id: 'cc1', merchant: 'Shoes', amount: 2000, type: 'expense', category: 'shopping', date: since, account: card.id, recurring: false, status: 'completed' });
    const after = carryOver(s);
    expect(after.cameIn - before.cameIn).toBe(1000);
    expect(after.wentOut - before.wentOut).toBe(300);
    expect(after.left).toBeCloseTo(before.left, 2);
  });

  it('moving money from bank to cash is neither in nor out', () => {
    const s = createSeed();
    const since = carryOver(s).since;
    const [a, b] = s.accounts.filter((x) => x.spendable);
    if (!b) return;
    const before = carryOver(s);
    s.transactions.push({ id: 'mv', merchant: 'ATM', amount: 500, type: 'transfer', category: 'transfer', date: since, account: a.id, toAccount: b.id, recurring: false, status: 'completed' } as never);
    const after = carryOver(s);
    expect(after.cameIn).toBe(before.cameIn);
    expect(after.wentOut).toBe(before.wentOut);
  });

});

describe('what a finished month carried over: money left just before the next payday', () => {
  it('a month ends the day before the next payday (salary on the 4th: September ends before 4 Oct)', () => {
    const s = createSeed();
    s.today = '2026-10-20';
    const day = Number(mainIncome(s)!.nextDate!.slice(8));
    const r = leftAtPayday(s, '2026-09-01')!;
    expect(r.date).toBe(`2026-10-${String(day).padStart(2, '0')}`);
  });

  it('this cycle\'s carry-over is the same number as the last month\'s "carried over"', () => {
    const s = createSeed();
    const c = carryOver(s);
    const month = addMonths(c.since, -1).slice(0, 8) + '01';
    expect(leftAtPayday(s, month)!.left).toBeCloseTo(c.left, 2);
  });

  it('a spend after payday does not change what the month before carried over', () => {
    const s = createSeed();
    const since = carryOver(s).since;
    const month = addMonths(since, -1).slice(0, 8) + '01';
    const before = leftAtPayday(s, month)!.left;
    const bank = s.accounts.find((a) => a.spendable)!;
    s.transactions.push({ id: 'x', merchant: 'Dinner', amount: 900, type: 'expense', category: 'food', date: since, account: bank.id, recurring: false, status: 'completed' });
    bank.balance -= 900;
    expect(leftAtPayday(s, month)!.left).toBeCloseTo(before, 2);
  });

  it('a month whose payday has not come yet has no carried-over number', () => {
    const s = createSeed();
    expect(leftAtPayday(s, s.today.slice(0, 8) + '01')).toBeNull();
  });
});
