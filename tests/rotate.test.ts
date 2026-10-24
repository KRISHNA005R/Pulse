import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { buildInsights } from '../src/lib/insights';
import { dayIndex, everyOtherDay, pickDaily } from '../src/lib/rotate';
import { starterQuestions } from '../src/lib/assistant';
import { quickQuestions } from '../src/lib/assistantPlus';
import { addDays } from '../src/lib/format';
import type { Insight } from '../src/types';

const ins = (id: string, priority = 50, urgent = false): Insight => ({ id, text: id, tone: 'neutral', priority, urgent, detail: { kind: 'list', title: '', rows: [] } });
const D = '2026-10-24';

describe('Home suggestion: a different one every day', () => {
  const list = [ins('food', 90), ins('weekends', 45), ins('saving', 50)];

  it('changes from one day to the next, and comes back round', () => {
    const seen = [0, 1, 2].map((i) => pickDaily(list, addDays(D, i))!.id);
    expect(new Set(seen).size).toBe(3);
    expect(pickDaily(list, addDays(D, 3))!.id).toBe(seen[0]);
  });

  it('stays the same all through one day', () => {
    expect(pickDaily(list, D)!.id).toBe(pickDaily([...list], D)!.id);
  });

  it('an urgent one always shows first, whatever the day', () => {
    const withUrgent = [...list, ins('budget-food', 75, true)];
    for (let i = 0; i < 5; i++) expect(pickDaily(withUrgent, addDays(D, i))!.id).toBe('budget-food');
  });

  it('two urgent ones: the most important first', () => {
    const two = [ins('recurring-week', 55, true), ins('budget-food', 75, true), ins('food', 90)];
    expect(pickDaily(two, D)!.id).toBe('budget-food');
  });

  it('works with one or none', () => {
    expect(pickDaily([ins('only')], D)!.id).toBe('only');
    expect(pickDaily([ins('only')], addDays(D, 1))!.id).toBe('only');
    expect(pickDaily([], D)).toBeUndefined();
  });

  it('does not depend on the order the list comes in', () => {
    expect(pickDaily([...list].reverse(), D)!.id).toBe(pickDaily(list, D)!.id);
  });
});

describe('PULSE AI questions: a new order every 2 days', () => {
  const qs = ['a', 'b', 'c', 'd', 'e'];
  // The first day of a 2-day pair.
  const first = () => {
    let d = D;
    while (dayIndex(d) % 2 !== 0) d = addDays(d, 1);
    return d;
  };

  it('same order on both days of a pair, a new one on the next pair', () => {
    const start = first();
    expect(everyOtherDay(qs, start)).toEqual(everyOtherDay(qs, addDays(start, 1)));
    expect(everyOtherDay(qs, addDays(start, 2))[0]).not.toBe(everyOtherDay(qs, start)[0]);
  });

  it('keeps every question, just in a different order', () => {
    const start = first();
    expect([...everyOtherDay(qs, addDays(start, 4))].sort()).toEqual(qs);
  });

  it('every question gets a turn at the front', () => {
    const start = first();
    const fronts = new Set(Array.from({ length: 5 }, (_, i) => everyOtherDay(qs, addDays(start, i * 2))[0]));
    expect(fronts.size).toBe(5);
  });

  it('the real starter questions use this order (the questions themselves follow the person’s data)', () => {
    const start = first();
    const s = createSeed();
    for (const d of [start, addDays(start, 1), addDays(start, 2)]) {
      s.today = d;
      expect(starterQuestions(s)).toEqual(everyOtherDay(quickQuestions(s), d));
    }
    s.today = start;
    const a = starterQuestions(s)[0];
    s.today = addDays(start, 2);
    expect(starterQuestions(s)[0]).not.toBe(a);
  });
});

describe('what counts as urgent', () => {
  it('a budget that is over is urgent', () => {
    const s = createSeed();
    const b = s.budgets[0];
    s.transactions.unshift({ id: 'big', merchant: 'Big spend', amount: b.amount * 3, type: 'expense', category: b.category, date: s.today, account: s.accounts[0].id, recurring: false, status: 'completed' });
    const hit = buildInsights(s).find((i) => i.id === `budget-${b.id}`);
    expect(hit?.urgent).toBe(true);
  });

  it('bills this week are urgent only when one is due today or tomorrow', () => {
    const s = createSeed();
    s.subscriptions = s.subscriptions.slice(0, 2).map((x, i) => ({ ...x, status: 'active', nextDate: addDays(s.today, 4 + i) }));
    expect(buildInsights(s).find((i) => i.id === 'recurring-week')?.urgent).toBeFalsy();
    s.subscriptions[0].nextDate = addDays(s.today, 1);
    expect(buildInsights(s).find((i) => i.id === 'recurring-week')?.urgent).toBe(true);
  });
});
