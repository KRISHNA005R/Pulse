import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { mainIncome, refillReserves, safeToSpend, upcoming } from '../src/lib/finance';
import type { State } from '../src/types';

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
  it('stays on the old month: only what is due today counts, not the whole of next month', () => {
    const s = onPayday();
    const sts = safeToSpend(s);
    expect(sts.waiting).toBe(true);
    expect(sts.payday).toBe(s.today);
    expect(sts.daysLeft).toBe(1);
    const dueToday = upcoming(s, s.today.replace(/\d\d$/, (d) => String(Number(d) + 1).padStart(2, '0'))).filter((u) => u.kind !== 'investment' && u.kind !== 'card');
    expect(sts.billItems.map((b) => b.id).sort()).toEqual(dueToday.map((b) => b.id).sort());
    // Plain maths: bank − due today − card dues − old plan savings − buffer.
    expect(sts.safe).toBe(Math.max(0, sts.available - sts.bills - sts.invest - sts.cards - sts.goals - sts.setAside - sts.buffer));
    expect(sts.safe).toBeGreaterThan(0);
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
});
