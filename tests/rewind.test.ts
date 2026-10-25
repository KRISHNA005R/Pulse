import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { buildRewind, rewindPrompt } from '../src/lib/rewind';
import type { State, Transaction } from '../src/types';

// PULSE Rewind: a month in 5 slides, with no rupee amounts anywhere.
let n = 0;
const tx = (date: string, amount: number, category: string, merchant = 'Thing', extra: Partial<Transaction> = {}): Transaction => ({ id: `r${n++}`, merchant, amount, type: 'expense', category, date, account: 'acc-hdfc', recurring: false, status: 'completed', ...extra });

function october(): State {
  const s = createSeed();
  s.mode = 'personal';
  s.today = '2026-11-02';
  s.plans = [];
  s.transactions = [
    // Food 4,200 (14 Swiggy orders = 4,200 → 42%), rides 1,800, shopping 1,400, other 2,600 → 10,000
    ...Array.from({ length: 14 }, (_, i) => tx(`2026-10-${String(2 + i).padStart(2, '0')}`, 300, 'food', 'Swiggy · dinner')),
    ...Array.from({ length: 6 }, (_, i) => tx(`2026-10-${String(2 + i).padStart(2, '0')}`, 300, 'transport', 'Uber')),
    tx('2026-10-10', 1400, 'shopping', 'Myntra'),
    tx('2026-10-17', 2600, 'entertainment', 'Concert'), // a Saturday
    // September for comparison: 12,000 spent
    tx('2026-09-12', 12000, 'shopping', 'Phone'),
    // Income and savings in October: 20,000 in, 3,600 to a plan → saved 18%
    tx('2026-10-01', 20000, 'salary', 'Salary', { type: 'income' }),
    tx('2026-10-05', 3600, 'transfer', 'Moved to Goa', { type: 'transfer', direction: 'out', toAccount: 'pot:goa' }),
  ];
  return s;
}

describe('the numbers', () => {
  it('top categories as a share of the month, and the favourite app', () => {
    const r = buildRewind(october(), '2026-10-15');
    expect(r.monthName).toBe('October');
    expect(r.enough).toBe(true);
    expect(r.top[0]).toMatchObject({ category: 'food', pct: 42 });
    expect(r.top.map((x: { category: string }) => x.category)).toEqual(['food', 'entertainment', 'transport']);
    expect(r.app).toEqual({ name: 'Swiggy', count: 14 });
  });

  it('rent, bills and EMIs are left out of "where it went" (only everyday spending)', () => {
    const s = october();
    s.transactions.push(tx('2026-10-05', 15000, 'rent', 'Rent'), tx('2026-10-06', 2000, 'bills', 'Electricity'));
    const r = buildRewind(s, '2026-10-31');
    expect(r.top[0]).toMatchObject({ category: 'food', pct: 42 });
    expect(r.top.map((x: { category: string }) => x.category)).not.toContain('rent');
    expect(r.title).toBe('Food era, saver arc.');
  });

  it('habits: no-spend days, longest logging streak, spendiest weekday', () => {
    const r = buildRewind(october(), '2026-10-01');
    // Spending on 2–15, 17 → no everyday spend on 1, 16, 18–31 = 16 days
    expect(r.noSpendDays).toBe(16);
    expect(r.bestStreak).toBe(15); // 1 Oct (salary logged) through 15 Oct
    expect(r.spendiestDay).toBe('Sat');
  });

  it('the biggest W: share of income saved', () => {
    const r = buildRewind(october(), '2026-10-31');
    expect(r.win.text).toMatch(/saved 18%/);
  });

  it('the W falls back to spending less than last month', () => {
    const s = october();
    s.transactions = s.transactions.filter((t) => t.type === 'expense');
    expect(buildRewind(s, '2026-10-31').win.text).toMatch(/less than September/);
  });

  it('gives the month a title from the top category and the W', () => {
    expect(buildRewind(october(), '2026-10-31').title).toBe('Food era, saver arc.');
  });

  it('never shows a rupee amount', () => {
    const r = buildRewind(october(), '2026-10-31');
    const text = JSON.stringify([r.title, r.chips, r.win, r.habitsTitle, r.opener]);
    expect(text).not.toMatch(/₹|Rs\.?\s?\d|\d{4,}/);
  });

  it('a quiet month says so instead of empty slides', () => {
    const s = createSeed();
    s.today = '2026-11-02';
    s.transactions = [tx('2026-10-03', 200, 'food')];
    expect(buildRewind(s, '2026-10-31').enough).toBe(false);
  });

  it('money got back is taken off before the percentages', () => {
    const s = october();
    s.transactions.push(tx('2026-10-20', 2100, 'food', 'Friends paid back', { type: 'income', back: true }));
    // Food 4,200 − 2,100 = 2,100 out of 7,900 → 27%
    expect(buildRewind(s, '2026-10-31').top[0]).toMatchObject({ category: 'entertainment' });
  });

  it('the current month so far stops at today', () => {
    const s = october();
    s.today = '2026-10-10';
    const r = buildRewind(s, '2026-10-10');
    expect(r.partial).toBe(true);
    expect(r.days).toBe(10);
  });
});

describe('when PULSE offers it', () => {
  it('the first week of a month: last month’s Rewind is ready', () => {
    const s = october();
    expect(rewindPrompt(s)).toMatchObject({ kind: 'ready', month: '2026-10-01', monthName: 'October' });
  });
  it('the last 3 days of a month: rewind this month so far', () => {
    const s = october();
    s.today = '2026-10-29';
    expect(rewindPrompt(s)).toMatchObject({ kind: 'soon', month: '2026-10-01' });
  });
  it('mid-month, or once seen: nothing', () => {
    const s = october();
    s.today = '2026-10-15';
    expect(rewindPrompt(s)).toBeNull();
    const t = october();
    t.settings.rewindSeen = '2026-10';
    expect(rewindPrompt(t)).toBeNull();
  });
});

// PULSE AI knows the Rewind and suggests it at the right time.
import { askPulse, starterQuestions } from '../src/lib/assistant';
describe('PULSE AI and the Rewind', () => {
  it('first week: the top suggestion is to share last month’s Rewind', () => {
    expect(starterQuestions(october())[0]).toBe('📼 Share my October Rewind');
  });
  it('month end: the top suggestion is to rewind this month so far', () => {
    const s = october();
    s.today = '2026-10-30';
    expect(starterQuestions(s)[0]).toBe('📼 Rewind my October so far');
  });
  it('mid-month: no Rewind suggestion', () => {
    const s = october();
    s.today = '2026-10-15';
    expect(starterQuestions(s).join(' ')).not.toMatch(/Rewind/);
  });
  it('answers "show my rewind" with the month’s title and a button to open it', () => {
    const a = askPulse(october(), '📼 Share my October Rewind');
    expect(a.text).toMatch(/Food era, saver arc/);
    const link = a.blocks?.find((b) => b.type === 'link');
    expect(link && link.type === 'link' && link.to.kind === 'sheet' && link.to.sheet.type).toBe('rewind');
  });
  it('a quiet month gets a gentle answer, not empty numbers', () => {
    const s = createSeed();
    s.today = '2026-11-02';
    s.transactions = [];
    expect(askPulse(s, 'show my rewind').text).toMatch(/log a bit more/i);
  });
});
