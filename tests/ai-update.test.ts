import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { askPulse, starterQuestions, type AIBlock } from '../src/lib/assistant';
import { spendBetween } from '../src/lib/finance';
import type { Bhisi, Person, State } from '../src/types';

// PULSE AI, brought up to date: no fixed payday, bhisi money by UPI and invite links, real friends
// only, picking your own dates, and short answers.

const ask = (s: State, q: string) => askPulse(s, q);
const links = (blocks?: AIBlock[]) => (blocks ?? []).filter((b) => b.type === 'link') as Extract<AIBlock, { type: 'link' }>[];

const freelance = (): State => {
  const s = createSeed();
  s.incomes = [{ id: 'f', name: 'Freelance work', kind: 'freelance', expected: 60000, cycle: 'irregular' }] as never;
  return s;
};

describe('no fixed payday', () => {
  it('safe to spend says "the next 30 days", never "until payday"', () => {
    const a = ask(freelance(), 'kitna bacha hai?');
    expect(a.text).toMatch(/next 30 days/);
    expect(a.text).not.toMatch(/payday/);
  });
  it('asked about payday: says there is no fixed one', () => {
    expect(ask(freelance(), 'when is payday?').text).toMatch(/No fixed payday/);
  });
  it('with a salary: payday is named once, plainly', () => {
    const a = ask(createSeed(), 'when is payday?');
    expect(a.text).toMatch(/^Payday is \w{3}, \d+ \w{3}/);
    expect(a.text).not.toMatch(/\(\d+ \w{3}\)/);
    expect(ask(createSeed(), 'kitna bacha hai?').text).toMatch(/until payday/);
  });
});

const rahul = { id: 'p-r', name: 'Rahul', short: 'Rahul', hue: 30, upi: 'rahul@okaxis', link: { status: 'linked' } } as unknown as Person;
function bhisiState(owner: boolean, over: Partial<Bhisi> = {}): State {
  const s = createSeed();
  s.mode = 'personal';
  s.people.push(rahul);
  s.bhisis = [
    {
      id: 'b1',
      name: 'Hostel gang',
      emoji: '🏺',
      amount: 1000,
      members: ['me', 'p-r'],
      createdAt: s.today,
      rounds: [{ date: '2026-12-01', paid: [] }, { date: '2027-01-01', paid: [] }],
      share: { bid: 'x', key: 'k', mid: 'm', token: 't', owner, seats: {}, ...(owner ? {} : { org: 'p-r' }) },
      ...over,
    } as Bhisi,
  ];
  return s;
}

describe('bhisi money', () => {
  it('a member asks who to pay: the organiser, with a Pay button that opens UPI', () => {
    const a = ask(bhisiState(false), 'bhisi ka paisa kisko dena hai?');
    expect(a.text).toMatch(/Pay Rahul ₹1,000/);
    const pay = links(a.blocks).find((l) => l.to.kind === 'sheet' && l.to.sheet.type === 'bhisi-pay');
    expect(pay?.to).toMatchObject({ sheet: { bhisiId: 'b1', kind: 'share' } });
  });
  it('already paid: says so', () => {
    const s = bhisiState(false);
    s.bhisis![0].rounds[0].paid = ['me'];
    expect(ask(s, 'how do i pay my bhisi?').text).toMatch(/already paid/i);
  });
  it('the organiser after a draw: send the winner the pot', () => {
    const s = bhisiState(true);
    s.bhisis![0].rounds[0] = { date: '2026-09-01', paid: ['me', 'p-r'], winner: 'p-r' };
    const a = ask(s, 'bhisi pot kisko bhejna hai?');
    expect(a.text).toMatch(/Send Rahul the pot, ₹2,000/);
    expect(links(a.blocks).some((l) => l.to.kind === 'sheet' && l.to.sheet.type === 'bhisi-pay' && l.to.sheet.kind === 'pot')).toBe(true);
  });
  it('how people join: the invite link, until the first draw', () => {
    const a = ask(bhisiState(true), 'how do i add people to my bhisi?');
    expect(a.text).toMatch(/invite link/);
    expect(a.text).toMatch(/first draw/);
  });
  it('explains bhisi briefly, including who holds the money', () => {
    const a = ask(createSeed(), 'how does bhisi work?');
    expect(a.text.length).toBeLessThan(140);
    const rows = a.blocks?.find((b) => b.type === 'list');
    expect(JSON.stringify(rows)).toMatch(/organiser/);
    expect(JSON.stringify(rows)).toMatch(/1\.5×/);
  });
  it('a member who owes this round gets a quick question for it', () => {
    expect(starterQuestions(bhisiState(false)).join(' ')).toMatch(/Pay my bhisi/);
  });
});

describe('real friends only', () => {
  const personal = () => {
    const s = createSeed();
    s.mode = 'personal';
    s.people = [rahul, { id: 'p-a', name: 'Aman', short: 'Aman', hue: 10 } as Person];
    return s;
  };
  it('a split with a friend on PULSE', () => {
    const a = ask(personal(), '450 dinner with rahul');
    const act = a.blocks?.find((b) => b.type === 'action');
    expect(act && act.type === 'action' && act.action.kind).toBe('split');
  });
  it('someone who is not a friend on PULSE: logged as your spend, with how to connect', () => {
    const a = ask(personal(), '450 dinner with aman');
    const act = a.blocks?.find((b) => b.type === 'action');
    expect(act && act.type === 'action' && act.action.kind).toBe('expense');
    expect(a.text).toMatch(/Aman isn’t on PULSE with you/);
  });
  it('how to add a friend: your PULSE link', () => {
    const a = ask(personal(), 'how do i add a friend?');
    expect(links(a.blocks).some((l) => l.to.kind === 'sheet' && l.to.sheet.type === 'friend-invite')).toBe(true);
  });
});

describe('your own dates', () => {
  it('spend between two dates', () => {
    const s = createSeed();
    const y = s.today.slice(0, 4);
    const m = s.today.slice(5, 7);
    const mon = new Date(`${s.today}T00:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toLowerCase();
    const a = ask(s, `how much did i spend from 1 ${mon} to 5 ${mon}?`);
    expect(a.text).toContain(`from 1 ${mon[0].toUpperCase()}${mon.slice(1)} to 5`);
    const total = spendBetween(s, `${y}-${m}-01`, `${y}-${m}-05`);
    expect(a.text).toContain(total.toLocaleString('en-IN'));
  });
});

describe('short answers', () => {
  it('every common answer fits in about two lines', () => {
    const s = createSeed();
    for (const q of [...starterQuestions(s), 'what is got it back?', 'what is gullak?', 'how much am I investing?', 'guess the bill', 'survived payday', 'how do i take money out of my plan', 'can i afford 5000 shoes', 'how did I spend this year', 'blah blah', "what's new in pulse?"]) {
      expect(ask(s, q).text.length, q).toBeLessThanOrEqual(150);
    }
  });
  it('what’s new lists the latest changes', () => {
    const rows = JSON.stringify(ask(createSeed(), "what's new in pulse?").blocks);
    expect(rows).toMatch(/UPI/);
    expect(rows).toMatch(/Pick dates/);
  });
});
