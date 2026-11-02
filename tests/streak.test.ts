import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { streak } from '../src/lib/streak';
import { merge3 } from '../src/lib/sync';
import { addDays } from '../src/lib/format';
import type { State } from '../src/types';

// The streak counts days you logged something yourself, and days you tapped the streak to check in.

function fresh(): State {
  const s = createSeed();
  s.today = '2026-11-02';
  s.transactions = [];
  return s;
}
const spend = (date: string) => ({ id: `t-${date}`, merchant: 'Chai', amount: 20, type: 'expense' as const, category: 'food', date, account: 'hdfc', recurring: false, status: 'completed' as const });

describe('streak with check-ins', () => {
  it('a check-in today keeps the streak going, the same as logging a spend', () => {
    const s = fresh();
    s.transactions = [spend('2026-10-31'), spend('2026-11-01')];
    expect(streak(s)).toMatchObject({ count: 2, today: false });
    s.checkIns = ['2026-11-02'];
    expect(streak(s)).toMatchObject({ count: 3, today: true });
  });

  it('check-ins and logged days join up into one run', () => {
    const s = fresh();
    s.transactions = [spend('2026-10-30'), spend('2026-11-01')];
    s.checkIns = ['2026-10-31', '2026-11-02'];
    expect(streak(s).count).toBe(4);
  });

  it('a missed day still breaks it', () => {
    const s = fresh();
    s.checkIns = ['2026-10-30', '2026-11-02'];
    expect(streak(s).count).toBe(1);
  });

  it('a future check-in does not count', () => {
    const s = fresh();
    s.checkIns = [addDays(s.today, 1)];
    expect(streak(s).count).toBe(0);
  });

  it('check-ins from two phones are kept together when they sync', () => {
    const base = fresh();
    const a = structuredClone(base);
    const b = structuredClone(base);
    a.checkIns = ['2026-11-01'];
    b.checkIns = ['2026-11-02'];
    expect(merge3(base, a, b).checkIns).toEqual(['2026-11-01', '2026-11-02']);
  });
});
