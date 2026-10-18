import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { skipStatus } from '../src/lib/skip';
import { addDays } from '../src/lib/format';
import type { State, Transaction } from '../src/types';

// A clean slate on a Thursday, so a Monday-to-Sunday week is easy to reason about.
const TODAY = '2026-10-15';
const base = (): State => {
  const s = createSeed();
  s.today = TODAY;
  s.transactions = [];
  return s;
};
let n = 0;
const tx = (date: string, category: string, amount = 300): Transaction =>
  ({ id: `t${n++}`, merchant: category, amount, type: 'expense', category, date, account: 'cash', recurring: false, status: 'completed' }) as Transaction;

describe('skip streak', () => {
  it('counts days with something else logged, and waits on today', () => {
    const s = base();
    s.skip = { cats: ['delivery'], since: addDays(TODAY, -3), checkins: [], moved: [], best: 0, cheered: 0 };
    for (let i = 1; i <= 3; i++) s.transactions.push(tx(addDays(TODAY, -i), 'transport', 50));
    const st = skipStatus(s)!;
    expect(st.count).toBe(3);
    expect(st.today).toBe('pending');
  });

  it('a check-in counts the day', () => {
    const s = base();
    s.skip = { cats: ['delivery'], since: TODAY, checkins: [TODAY], moved: [], best: 0, cheered: 0 };
    expect(skipStatus(s)!.count).toBe(1);
    expect(skipStatus(s)!.today).toBe('clean');
  });

  it('one slip a week is free, the second breaks it', () => {
    const s = base();
    // Mon 12 Oct .. Thu 15 Oct. Since last Wednesday.
    s.skip = { cats: ['delivery'], since: '2026-10-07', checkins: ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-14'], moved: [], best: 0, cheered: 0 };
    s.transactions.push(tx('2026-10-13', 'delivery'));
    let st = skipStatus(s)!;
    expect(st.count).toBe(7); // 13th forgiven
    s.transactions.push(tx(TODAY, 'delivery'));
    st = skipStatus(s)!;
    expect(st.today).toBe('broke');
    expect(st.count).toBe(0);
  });

  it('a slip in a new week is free again', () => {
    const s = base();
    s.skip = { cats: ['delivery'], since: '2026-10-05', checkins: ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'], moved: [], best: 0, cheered: 0 };
    s.transactions.push(tx('2026-10-07', 'delivery'), tx(TODAY, 'delivery'));
    const st = skipStatus(s)!;
    expect(st.today).toBe('freed');
    expect(st.count).toBe(9);
  });

  it('no-spend counts any everyday spend, but not rent or bills', () => {
    const s = base();
    s.skip = { cats: ['all'], since: addDays(TODAY, -1), checkins: [addDays(TODAY, -1), TODAY], moved: [], best: 0, cheered: 0 };
    s.transactions.push(tx(TODAY, 'rent', 15000));
    expect(skipStatus(s)!.today).toBe('clean');
    s.transactions.push(tx(TODAY, 'shopping', 999));
    expect(skipStatus(s)!.today).toBe('freed');
  });

  it('shows money not spent vs usual, minus what was moved', () => {
    const s = base();
    const since = addDays(TODAY, -2);
    for (let i = 1; i <= 28; i++) s.transactions.push(tx(addDays(since, -i), 'delivery', 280)); // ₹280/day usual
    s.skip = { cats: ['delivery'], since, checkins: [since, addDays(since, 1), TODAY], moved: [{ date: TODAY, amount: 300 }], best: 0, cheered: 0 };
    const st = skipStatus(s)!;
    expect(st.count).toBe(3);
    expect(st.saved).toBe(840);
    expect(st.available).toBe(540);
    expect(st.level?.name).toBe('Lowkey');
  });
});
