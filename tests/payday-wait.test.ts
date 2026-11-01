import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { mainIncome, refillReserves, safeToSpend, upcoming } from '../src/lib/finance';
import type { State } from '../src/types';
import { addDays } from '../src/lib/format';

// Payday, but the salary isn't in yet. The new month must not start early: counting a whole month
// of bills against last month's leftover made Safe to spend ₹0 at midnight on payday.

function onPayday(): State {
  const s = createSeed();
  s.mode = 'personal';
  const m = mainIncome(s)!;
  m.autoCredit = false;
  const payday = m.nextDate!;
  s.today = payday;
  // What the app does at midnight on payday: the salary's next date moves a month on.
  m.nextDate = payday.slice(0, 5) + String(Number(payday.slice(5, 7)) + 1).padStart(2, '0') + payday.slice(7);
  s.transactions = s.transactions.filter((t) => !(t.type === 'income' && t.date >= '2026-09-28'));
  return s;
}

describe('payday before the salary is added', () => {
  it('bridges to the salary: bills due in the next 7 days count, not the whole of next month', () => {
    const s = onPayday();
    const sts = safeToSpend(s);
    expect(sts.waiting).toBe(true);
    expect(sts.payday).toBe(s.today);
    expect(sts.daysLeft).toBe(1);
    const week = upcoming(s, addDays(s.today, 7)).filter((u) => u.kind !== 'investment' && u.kind !== 'card');
    expect(sts.billItems.map((b) => b.id).sort()).toEqual(week.map((b) => b.id).sort());
    expect(sts.billItems.every((b) => b.date < addDays(s.today, 7))).toBe(true);
    // Plain maths: bank − due today − card dues − old plan savings − buffer.
    expect(sts.safe).toBe(Math.max(0, sts.available - sts.bills - sts.invest - sts.cards - sts.goals - sts.setAside - sts.buffer));
    // Either there's money to spend, or it says which payment isn't covered (never a bare ₹0).
    expect(sts.safe > 0 || sts.shortFor !== null).toBe(true);
  });

  it("next month's plan savings aren't taken from last month's money", () => {
    const s = onPayday();
    const p = s.plans.find((x) => x.status === 'active')!;
    p.reserveEvery = 2000;
    p.cycleReserve = 2000;
    p.reserveFor = mainIncome(s)!.nextDate; // already set aside for the new month
    expect(safeToSpend(s).goalItems.some((g) => g.plan.id === p.id)).toBe(false);
  });

  it('plan savings for the new month are not refilled until the salary is in', () => {
    const s = onPayday();
    const p = s.plans.find((x) => x.status === 'active')!;
    p.reserveEvery = 2000;
    p.cycleReserve = 0;
    p.reserveFor = s.today;
    refillReserves(s);
    expect(p.cycleReserve).toBe(0);
  });

  it('once the salary is added, the new month starts as normal', () => {
    const s = onPayday();
    const m = mainIncome(s)!;
    s.transactions.unshift({ id: 'pay', merchant: 'Salary', amount: m.expected, type: 'income', category: 'salary', date: s.today, account: 'hdfc', recurring: true, status: 'completed', incomeId: m.id });
    const sts = safeToSpend(s);
    expect(sts.waiting).toBe(false);
    expect(sts.payday).toBe(m.nextDate);
  });

  it('auto-added salaries never wait', () => {
    const s = onPayday();
    mainIncome(s)!.autoCredit = true;
    expect(safeToSpend(s).waiting).toBe(false);
  });

  it('after a week with no salary, it stops waiting', () => {
    const s = onPayday();
    s.today = s.today.replace(/\d\d$/, (d) => String(Number(d) + 8).padStart(2, '0'));
    expect(safeToSpend(s).waiting).toBe(false);
  });

  it('rent due in 3 days is kept aside while waiting', () => {
    const s = onPayday();
    const rent = s.subscriptions.find((x) => x.id === 'bill-rent')!;
    rent.nextDate = addDays(s.today, 3);
    const sts = safeToSpend(s);
    expect(sts.billItems.some((b) => b.ref === 'bill-rent')).toBe(true);
    rent.nextDate = addDays(s.today, 9);
    expect(safeToSpend(s).billItems.some((b) => b.ref === 'bill-rent')).toBe(false);
  });
});

describe('short of money: say how short, not just ₹0', () => {
  it('names the first bill that the money can not cover, and by how much', () => {
    const s = onPayday();
    const rent = s.subscriptions.find((x) => x.id === 'bill-rent')!;
    rent.nextDate = addDays(s.today, 3);
    s.cards.forEach((c) => (c.balance = 0));
    s.plans.forEach((p) => (p.cycleReserve = 0));
    s.accounts.forEach((a) => (a.balance = 0));
    s.accounts.find((a) => a.spendable)!.balance = 8000;
    const sts = safeToSpend(s);
    expect(sts.safe).toBe(0);
    expect(sts.short).toBe(sts.bills + sts.invest + sts.setAside - 8000);
    expect(sts.shortFor?.name).toBe('Rent');
    expect(sts.shortFor?.date).toBe(rent.nextDate);
  });

  it('not short when the money covers everything (the buffer is a cushion, not a debt)', () => {
    const s = onPayday();
    s.cards.forEach((c) => (c.balance = 0));
    s.plans.forEach((p) => (p.cycleReserve = 0));
    s.accounts.find((a) => a.spendable)!.balance = 200000;
    const sts = safeToSpend(s);
    expect(sts.short).toBe(0);
    expect(sts.shortFor).toBeNull();
  });
});
