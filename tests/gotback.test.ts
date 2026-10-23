import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { BACK_WORDS, applyMoney, incomeBetween, incomeThisMonth, monthRange, spendBetween, spendByCategory } from '../src/lib/finance';
import { parseAction } from '../src/lib/aiActions';
import type { State, Transaction } from '../src/types';

const tx = (s: State, t: Partial<Transaction>): Transaction => {
  const full: Transaction = { id: `t${Math.random()}`, merchant: 'x', amount: 0, type: 'expense', category: 'food', date: s.today, account: s.accounts[0].id, recurring: false, status: 'completed', ...t };
  s.transactions.unshift(full);
  applyMoney(s, full, 1);
  return full;
};

describe('got it back', () => {
  it('a dinner I paid for, with 5 friends paying me back, costs me only my share', () => {
    const s = createSeed();
    const [ms, me] = monthRange(s.today);
    const spent0 = spendBetween(s, ms, me);
    const food0 = spendByCategory(s, ms, me).find((x) => x.category === 'food')?.amount ?? 0;
    const income0 = incomeBetween(s, ms, me);
    const bal0 = s.accounts[0].balance;

    tx(s, { merchant: 'Dinner', amount: 3000, type: 'expense', category: 'food' });
    for (let i = 0; i < 5; i++) tx(s, { merchant: `Friend ${i}`, amount: 500, type: 'income', category: 'food', back: true });

    expect(spendBetween(s, ms, me)).toBe(spent0 + 500);
    expect(spendByCategory(s, ms, me).find((x) => x.category === 'food')?.amount).toBe(food0 + 500);
    expect(incomeBetween(s, ms, me)).toBe(income0); // not income
    expect(incomeThisMonth(s).total).toBe(incomeThisMonth(createSeed()).total);
    expect(s.accounts[0].balance).toBe(bal0 - 3000 + 2500); // the money did arrive
  });

  it('new money still counts as income', () => {
    const s = createSeed();
    const [ms, me] = monthRange(s.today);
    const income0 = incomeBetween(s, ms, me);
    tx(s, { merchant: 'Gift from mom', amount: 2000, type: 'income', category: 'income-other' });
    expect(incomeBetween(s, ms, me)).toBe(income0 + 2000);
  });

  it('a big refund never makes spending go below zero', () => {
    const s = createSeed();
    s.transactions = [];
    tx(s, { merchant: 'Refund', amount: 900, type: 'income', category: 'shopping', back: true });
    const [ms, me] = monthRange(s.today);
    expect(spendBetween(s, ms, me)).toBe(0);
    expect(spendByCategory(s, ms, me)).toEqual([]);
  });

  it('knows the usual words', () => {
    for (const w of ['Amazon refund', 'cashback', 'Rahul paid me back', 'office reimbursement', 'her share of dinner']) expect(BACK_WORDS.test(w)).toBe(true);
    for (const w of ['salary', 'freelance client', 'gift from mom', 'dinner split with rahul']) expect(BACK_WORDS.test(w)).toBe(false);
  });

  it('the assistant logs "got 500 refund from amazon" as money back, not income', () => {
    const s = createSeed();
    const a = parseAction(s, 'got 500 refund from amazon');
    expect(a && a.kind === 'income' && a.back).toBe(true);
    const b = parseAction(s, 'got salary 50000');
    expect(b && b.kind === 'income' && !b.back).toBe(true);
  });
});
