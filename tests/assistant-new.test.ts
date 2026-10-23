import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { askPulse, starterQuestions } from '../src/lib/assistant';
import type { State } from '../src/types';

const withBhisi = (): State => {
  const s = createSeed();
  s.people.push({ id: 'p-r', name: 'Rahul', short: 'Rahul', hue: 30 } as State['people'][number]);
  s.bhisis = [
    {
      id: 'b1',
      name: 'Hostel gang',
      emoji: '🏺',
      amount: 1000,
      members: ['me', 'p-r'],
      createdAt: s.today,
      rounds: [
        { date: '2026-11-01', paid: ['me'], paidAt: { me: '2026-10-20T10:00:00+05:30' } },
        { date: '2026-12-01', paid: [] },
      ],
    },
  ];
  s.plans.push({ id: 'g1', name: 'Coin a day', icon: '🪙', target: 600, saved: 60, targetDate: '2026-12-31', status: 'active', kind: 'plan', gullak: { mode: 'fixed', step: 20, days: 30, drops: ['2026-10-01', '2026-10-02', s.today] } } as unknown as State['plans'][number]);
  return s;
};

describe('PULSE AI knows the new features', () => {
  it('says what is new', () => {
    const a = askPulse(createSeed(), "what's new in pulse?");
    const rows = a.blocks?.find((b) => b.type === 'list');
    expect(rows && rows.type === 'list' && rows.rows.map((r) => r.label).join(' ')).toMatch(/Bhisi.*Gullak.*Got it back/);
  });

  it('explains bhisi to someone without one', () => {
    expect(askPulse(createSeed(), 'how does bhisi work?').text).toMatch(/whole pot/);
  });

  it('tells me my next draw and my chance', () => {
    const s = withBhisi();
    expect(askPulse(s, 'bhisi draw kab hai?').text).toMatch(/Hostel gang.*1 Nov/);
    const c = askPulse(s, 'what are my chances in bhisi?');
    expect(c.text).toMatch(/your chance this round is 60%/); // early bird: 6 tickets vs 4
  });

  it('shows gullak progress', () => {
    expect(askPulse(withBhisi(), 'gullak kitna bhara?').text).toMatch(/3 of 30 coins/);
  });

  it('adds up what I got back, and explains it', () => {
    const s = createSeed();
    s.transactions.unshift({ id: 'gb', merchant: 'Rahul paid back dinner', amount: 500, type: 'income', category: 'food', back: true, date: s.today, account: s.accounts[0].id, recurring: false, status: 'completed' });
    expect(askPulse(s, 'how much did I get back this month?').text).toMatch(/₹500 back this month/);
    expect(askPulse(s, 'what is got it back?').text).toMatch(/isn’t income/);
  });

  it('still logs "Rahul paid me back 500" as an action, not a question', () => {
    const a = askPulse(createSeed(), 'Rahul paid me back 500 for dinner');
    expect(a.blocks?.some((b) => b.type === 'action')).toBe(true);
  });

  it('suggests bhisi and gullak questions to people who use them', () => {
    const q = starterQuestions(withBhisi()).join(' | ');
    expect(q).toMatch(/Bhisi draw kab hai/);
    expect(q).toMatch(/Gullak kitna bhara/);
  });
});
