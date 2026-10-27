import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { fdMaturity, fdValueOn, INV_META, maturityDate, maturityValue, ppfMaturity, rdMaturity } from '../src/lib/invest';
import { investmentMonthly, investmentTotals, upcoming } from '../src/lib/finance';
import { processDueInvestments } from '../src/store/store';
import type { Investment } from '../src/types';

// FDs, RDs, PPF and the rest: each kind behaves like the real thing.

const base = (over: Partial<Investment>): Investment => ({
  id: 'x',
  name: 'Test',
  platform: 'SBI',
  kind: 'sip',
  amount: 1000,
  cycle: 'monthly',
  nextDate: '2026-10-05',
  status: 'active',
  fromAccount: 'hdfc',
  toAccount: 'groww',
  startDate: '2026-09-27',
  expectedReturn: 7,
  autoDeduct: true,
  ...over,
});

describe('maturity maths (Indian bank style, compounded every quarter)', () => {
  it('FD: ₹1,00,000 at 7% for a year gives about ₹1,07,186', () => {
    expect(fdMaturity(100000, 7, 12)).toBe(107186);
  });
  it('RD: ₹1,000 a month at 7% for 12 months gives about ₹12,462', () => {
    expect(rdMaturity(1000, 7, 12)).toBe(12462);
  });
  it('PPF: ₹1.5 lakh a year at 7.1% for 15 years gives about ₹40.68 lakh', () => {
    expect(ppfMaturity(150000, 7.1)).toBe(4068209);
  });
  it('an FD is worth a bit more each quarter, and stops growing at maturity', () => {
    const fd = base({ kind: 'fd', amount: 100000, startDate: '2026-01-01', tenureMonths: 12 });
    expect(fdValueOn(fd, '2026-01-01')).toBe(100000);
    const mid = fdValueOn(fd, '2026-07-01');
    expect(mid).toBeGreaterThan(100000);
    expect(mid).toBeLessThan(107186);
    expect(fdValueOn(fd, '2028-01-01')).toBe(107186);
  });
  it('maturity date is start + tenure; PPF is always 15 years', () => {
    expect(maturityDate(base({ kind: 'fd', startDate: '2026-03-12', tenureMonths: 12 }))).toBe('2027-03-12');
    expect(maturityDate(base({ kind: 'ppf', startDate: '2026-04-01' }))).toBe('2041-04-01');
    expect(maturityDate(base({ kind: 'sip' }))).toBeNull();
    expect(maturityValue(base({ kind: 'rd', amount: 1000, expectedReturn: 7, tenureMonths: 12 }))).toBe(12462);
  });
});

describe('what each kind allows', () => {
  it('only market-linked kinds have a step-up; RD, FD and PPF never do', () => {
    expect(INV_META.sip.stepUp).toBe(true);
    expect(INV_META.nps.stepUp).toBe(true);
    for (const k of ['rd', 'fd', 'ppf'] as const) expect(INV_META[k].stepUp).toBe(false);
  });
  it('an RD is monthly only, an FD is a one-time deposit', () => {
    expect(INV_META.rd.cycles).toEqual(['monthly']);
    expect(INV_META.fd.recurring).toBe(false);
  });
});

describe('FDs and RDs in the money flow', () => {
  it('an FD is not a monthly debit: not in "every month", not in upcoming payments', () => {
    const s = createSeed();
    const before = investmentTotals(s).monthly;
    s.investments.push(base({ id: 'fd1', kind: 'fd', amount: 50000, cycle: 'monthly', nextDate: '2026-11-01', autoDeduct: false, tenureMonths: 12 }));
    expect(investmentMonthly(s.investments.at(-1)!)).toBe(0);
    expect(investmentTotals(s).monthly).toBe(before);
    expect(upcoming(s, '2026-12-31').some((p) => p.ref === 'fd1')).toBe(false);
  });
  it('an FD paid today is recorded once, as "FD · name", and never again', () => {
    const s = createSeed();
    s.investments.push(base({ id: 'fd1', kind: 'fd', name: 'HDFC FD', amount: 50000, nextDate: s.today, startDate: s.today, autoDeduct: true, tenureMonths: 12 }));
    const made = processDueInvestments(s);
    expect(made).toHaveLength(1);
    expect(made[0].merchant).toBe('FD · HDFC FD');
    expect(made[0].amount).toBe(50000);
    s.today = '2027-01-15';
    expect(processDueInvestments(s).filter((t) => t.investmentId === 'fd1')).toHaveLength(0);
  });
  it('an RD is debited each month as "RD · name" and stops after its tenure', () => {
    const s = createSeed();
    s.investments.push(base({ id: 'rd1', kind: 'rd', name: 'SBI RD', amount: 1000, nextDate: '2026-06-10', startDate: '2026-06-10', tenureMonths: 3 }));
    const made = processDueInvestments(s).filter((t) => t.investmentId === 'rd1');
    expect(made.map((t) => t.date)).toEqual(['2026-08-10', '2026-07-10', '2026-06-10'].sort());
    expect(made.every((t) => t.merchant === 'RD · SBI RD')).toBe(true);
    expect(s.investments.find((i) => i.id === 'rd1')!.status).toBe('stopped');
  });
});
