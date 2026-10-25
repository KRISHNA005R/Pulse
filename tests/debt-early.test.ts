import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { payDebtEarlyState, processDueDebts } from '../src/store/store';
import { debtDue, defaultAccount, emiParts, payoffMonths, prepaySavings } from '../src/lib/finance';
import { addDays } from '../src/lib/format';
import type { State } from '../src/types';

// Loans: "Paid early / extra" — this month's EMI early, an extra payment, or closing the loan.
function withLoan(auto = true): State {
  const s = createSeed();
  s.mode = 'personal';
  const d = s.debts[0]; // Education loan: ₹1,86,400 left, ₹4,850 EMI, 9.15%
  d.autoDebit = auto;
  d.nextDate = addDays(s.today, 7); // due in a week
  return s;
}
const bank = (s: State) => s.accounts.find((a) => a.id === defaultAccount(s))!.balance;

describe('this month’s EMI, paid early', () => {
  it('is recorded today, and the auto-debit on the due date does not record it again', () => {
    const s = withLoan(true);
    const d = s.debts[0];
    const due = debtDue(s, d);
    const emi = emiParts(d);
    const bank0 = bank(s);
    const left0 = d.remaining;
    const r = payDebtEarlyState(s, d.id, 'emi');
    expect(r.error).toBeUndefined();
    expect(r.tx).toMatchObject({ date: s.today, amount: emi.amount, debtId: d.id });
    expect(d.remaining).toBe(left0 - emi.principal);
    expect(bank(s)).toBe(bank0 - emi.amount);
    expect(debtDue(s, d) > due).toBe(true); // moved on to next month
    // The original due date arrives: nothing more is recorded.
    s.today = due;
    expect(processDueDebts(s)).toHaveLength(0);
    expect(bank(s)).toBe(bank0 - emi.amount);
  });

  it('works the same for a loan you mark paid yourself', () => {
    const s = withLoan(false);
    const r = payDebtEarlyState(s, s.debts[0].id, 'emi');
    expect(r.error).toBeUndefined();
    expect(r.tx?.notes).toMatch(/early/i);
  });
});

describe('an extra payment', () => {
  it('all of it comes off the loan; the EMI and its date stay the same', () => {
    const s = withLoan();
    const d = s.debts[0];
    const due = debtDue(s, d);
    const emi0 = d.minPayment;
    const bank0 = bank(s);
    const left0 = d.remaining;
    const r = payDebtEarlyState(s, d.id, 'extra', 10000);
    expect(r.error).toBeUndefined();
    expect(r.tx).toMatchObject({ amount: 10000, principal: 10000, debtId: d.id });
    expect(d.remaining).toBe(left0 - 10000);
    expect(bank(s)).toBe(bank0 - 10000);
    expect(d.minPayment).toBe(emi0);
    expect(debtDue(s, d)).toBe(due);
  });

  it('shows how much sooner you finish and the interest you save', () => {
    const s = withLoan();
    const d = s.debts[0];
    const before = payoffMonths(d.remaining, d.rate, d.minPayment)!;
    const save = prepaySavings(d, 10000);
    expect(save.months).toBeGreaterThan(0);
    expect(save.interest).toBeGreaterThan(0);
    expect(payoffMonths(d.remaining - 10000, d.rate, d.minPayment)).toBe(before - save.months);
  });

  it('refuses a zero, negative or missing amount, and more than what is left', () => {
    for (const bad of [0, -5, Number.NaN, undefined]) {
      const s = withLoan();
      const left0 = s.debts[0].remaining;
      expect(payDebtEarlyState(s, s.debts[0].id, 'extra', bad as number).error).toBeTruthy();
      expect(s.debts[0].remaining).toBe(left0);
    }
    const s = withLoan();
    expect(payDebtEarlyState(s, s.debts[0].id, 'extra', s.debts[0].remaining + 1).error).toMatch(/close/i);
  });
});

describe('closing the loan early', () => {
  it('pays off what is left (plus any closing charge you paid) and stops future EMIs', () => {
    const s = withLoan();
    const d = s.debts[0];
    const left0 = d.remaining;
    const bank0 = bank(s);
    const r = payDebtEarlyState(s, d.id, 'close', left0 + 1500); // ₹1,500 foreclosure charge
    expect(r.error).toBeUndefined();
    expect(r.left).toBe(0);
    expect(d.remaining).toBe(0);
    expect(r.tx).toMatchObject({ amount: left0 + 1500, principal: left0 });
    expect(bank(s)).toBe(bank0 - left0 - 1500);
    s.today = addDays(s.today, 90);
    expect(processDueDebts(s)).toHaveLength(0);
  });

  it('refuses an amount smaller than what is left', () => {
    const s = withLoan();
    expect(payDebtEarlyState(s, s.debts[0].id, 'close', 100).error).toMatch(/less than/i);
    expect(s.debts[0].remaining).toBeGreaterThan(0);
  });
});

describe('guards', () => {
  it('does nothing on a loan that is already paid off, or one that does not exist', () => {
    const s = withLoan();
    s.debts[0].remaining = 0;
    for (const m of ['emi', 'extra', 'close'] as const) expect(payDebtEarlyState(s, s.debts[0].id, m, 1000).error).toBeTruthy();
    expect(payDebtEarlyState(s, 'nope', 'emi').error).toBeTruthy();
    expect(s.transactions.some((t) => t.debtId === s.debts[0].id && t.notes?.match(/early|extra|closed/i))).toBe(false);
  });
});

// LOAN-01: a typo in the closing amount (one extra zero) must not be saved without a question.
import { closingCharge } from '../src/lib/finance';
describe('closing charge check', () => {
  it('a normal charge (up to 5% of what is left) needs no question', () => {
    expect(closingCharge(186400, 186400)).toEqual({ charge: 0, big: false });
    expect(closingCharge(186400, 186400 + 1500)).toEqual({ charge: 1500, big: false });
    expect(closingCharge(186400, 186400 + 9320)).toEqual({ charge: 9320, big: false }); // exactly 5%
  });
  it('a big one (more than 5%), like a typo, asks first', () => {
    expect(closingCharge(186400, 1864000)).toEqual({ charge: 1677600, big: true });
    expect(closingCharge(186400, 186400 + 9321).big).toBe(true);
  });
  it('a small loan still allows a typical fixed fee without a question', () => {
    expect(closingCharge(2000, 2500).big).toBe(false); // ₹500 fee on a tiny balance
    expect(closingCharge(2000, 20000).big).toBe(true);
  });
});
