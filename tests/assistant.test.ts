import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { askPulse, starterQuestions } from '../src/lib/assistant';
import { fromHinglish } from '../src/lib/assistantPlus';

const s = createSeed();
const ask = (q: string) => askPulse(s, q);
const FALLBACK = /I didn't get that/;

describe('PULSE AI: Hinglish', () => {
  it('rewrites common phrasings', () => {
    expect(fromHinglish('Kitna bacha hai?')).toContain('how much can i spend');
    expect(fromHinglish('paisa kab tak chalega')).toContain('how long will my money last');
    expect(fromHinglish('zomato pe kitna uda diya')).toContain('how much did i spend');
    expect(fromHinglish('salary kab aayegi')).toContain('when is payday');
  });

  it.each([
    ['Kitna bacha hai?', /safely spend/],
    ['kitne paise bache hain', /safely spend/],
    ['salary kab aayegi', /next salary/],
    ['zomato pe kitna uda diya?', /on Zomato this month/],
    ['3000 ke shoes le sakta hu?', /./],
    ['mujhe kisko dena hai', /owe/],
    ['Kabir ko kitna dena hai', /Kabir/],
    ['aaj kitna kharch hua', /today/],
    ['paisa kahan gaya', /spent/],
  ])('%s', (q, re) => {
    const a = ask(q);
    expect(a.text).not.toMatch(FALLBACK);
    expect(a.text).toMatch(re);
  });

  it('logs in Hinglish', () => {
    const a = ask('salary aa gayi 42000');
    const b = a.blocks?.[0];
    expect(b?.type).toBe('action');
    if (b?.type === 'action') expect(b.action.kind).toBe('income');
  });
});

describe('PULSE AI: new answers', () => {
  it('how long the money lasts', () => expect(ask('Paisa kab tak chalega?').text).toMatch(/pace of about/));
  it('skip a delivery app', () => expect(ask('Skip Zomato for a week, kitna bachega?').text).toMatch(/Skipping Zomato for a week saves about/));
  it('plan by a month', () => expect(ask('Goa ho payega December tak?').text).toMatch(/Goa 2026/));
  it('pay or remind a friend', () => {
    const a = ask('Pay Rahul');
    expect(a.text).toMatch(/Rahul/);
    expect(ask('Remind Sneha').text).toMatch(/Sneha/);
  });
  it('biggest expenses', () => expect(ask('Biggest expenses this month?').text).toMatch(/Your biggest this month/));
  it('no-spend days', () => expect(ask('No-spend days this month?').text).toMatch(/no-spend day|No no-spend days/));
  it('undo and change the last entry', () => {
    const u = ask('undo last')?.blocks?.[0];
    expect(u?.type === 'action' && u.action.kind).toBe('undo-last');
    const f = ask('change last to 400')?.blocks?.[0];
    expect(f?.type === 'action' && f.action.kind === 'fix-last' && f.action.amount).toBe(400);
  });
  it('still logs plain entries', () => {
    const b = ask('zomato 349').blocks?.[0];
    expect(b?.type === 'action' && b.action.kind).toBe('expense');
  });
});

describe('PULSE AI: every quick question has a real answer', () => {
  it.each(starterQuestions(s).map((q) => [q]))('%s', (q) => {
    expect(ask(q).text).not.toMatch(FALLBACK);
  });
});
