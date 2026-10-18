import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { currentRound, inBowl, myStanding, pickWinner, pot, bhisiDues } from '../src/lib/bhisi';
import { guessVerdict, gullakTarget, moneyAura, nextCoin, roastMe, toastMe, survived, notePayday } from '../src/lib/fun';
import { safeToSpend } from '../src/lib/finance';
import type { Bhisi } from '../src/types';

const bhisi = (): Bhisi => ({ id: 'b1', name: 'Hostel BC', emoji: '🏺', amount: 2000, members: ['me', 'p1', 'p2', 'p3'], createdAt: '2026-09-01', rounds: [0, 1, 2, 3].map((i) => ({ date: `2026-${String(9 + i).padStart(2, '0')}-27`, paid: [] })) });

describe('bhisi', () => {
  it('pot is everyone’s share, one round per person', () => {
    const b = bhisi();
    expect(pot(b)).toBe(8000);
    expect(currentRound(b)).toBe(0);
    expect(inBowl(b)).toHaveLength(4);
  });
  it('a winner leaves the matka, and the next round starts', () => {
    const b = bhisi();
    b.rounds[0].winner = 'p2';
    expect(inBowl(b)).toEqual(['me', 'p1', 'p3']);
    expect(currentRound(b)).toBe(1);
  });
  it('the pick is always someone in the matka', () => {
    for (let i = 0; i < 50; i++) expect(['a', 'b', 'c']).toContain(pickWinner(['a', 'b', 'c']));
  });
  it('explains early vs late wins', () => {
    const b = bhisi();
    b.rounds[0].paid = ['me'];
    b.rounds[0].winner = 'me';
    expect(myStanding(b).line).toMatch(/interest-free loan of ₹6,000/);
    const c = bhisi();
    c.rounds.forEach((r) => (r.paid = ['me']));
    c.rounds[3].winner = 'me';
    expect(myStanding(c).line).toMatch(/forced savings/);
  });
  it('my unpaid share is held back from safe to spend', () => {
    const s = createSeed();
    const before = safeToSpend(s).safe;
    s.bhisis = [{ ...bhisi(), rounds: bhisi().rounds.map((r, i) => ({ ...r, date: i === 0 ? s.today : r.date })) }];
    expect(bhisiDues(s, '2099-01-01')).toHaveLength(1);
    expect(before - safeToSpend(s).safe).toBe(2000);
    s.bhisis[0].rounds[0].paid = ['me'];
    expect(safeToSpend(s).safe).toBe(before);
  });
});

describe('gullak', () => {
  it('fixed and rising totals', () => {
    expect(gullakTarget({ mode: 'fixed', step: 50, days: 30 })).toBe(1500);
    expect(gullakTarget({ mode: 'rising', step: 10, days: 30 })).toBe(4650);
    expect(nextCoin({ mode: 'rising', step: 10, days: 30, drops: ['a', 'b'] })).toBe(30);
  });
});

describe('the fun bits', () => {
  it('guess verdicts', () => {
    expect(guessVerdict(1000, 1050).title).toBe('Spot on');
    expect(guessVerdict(500, 1500).good).toBe(false);
    expect(guessVerdict(2000, 1500).title).toBe('Less than you thought');
  });
  it('the demo month has an aura', () => {
    const a = moneyAura(createSeed());
    expect(a?.name).toBeTruthy();
    expect(a?.stats.length).toBeGreaterThan(1);
  });
  it('roast and toast always say something', () => {
    const s = createSeed();
    expect(roastMe(s).length).toBeGreaterThan(10);
    expect(toastMe(s).length).toBeGreaterThan(10);
  });
  it('survived payday shows for 3 days, with a run count', () => {
    const s = createSeed();
    s.paydays = [{ date: '2026-07-01', left: 900 }, { date: '2026-08-01', left: 1200 }];
    notePayday(s, s.today);
    const w = survived(s);
    if (s.paydays[2].left > 0) expect(w?.inARow).toBe(3);
    s.settings.paydaySeen = s.today;
    expect(survived(s)).toBeNull();
  });
});
