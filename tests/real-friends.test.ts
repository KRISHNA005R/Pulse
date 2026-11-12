import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { mergePeople, tidyPeople } from '../src/lib/friends';
import type { Bhisi, Person, State } from '../src/types';

// Real friends only: the list of people is tidied once, and again whenever a bhisi or group goes.
// - The same PULSE person in the list twice (same PULSE id) becomes one, with everything moved over.
// - Names nobody is connected to and nothing refers to (no split, payment, group, bhisi or spend) go.
// - Anyone with history, and every connected friend, stays.

const link = { chan: 'c'.repeat(32), key: 'k', token: 't', status: 'linked' as const, since: '2026-11-01' };
const p = (id: string, name: string, extra: Partial<Person> = {}): Person => ({ id, name, short: name.split(' ')[0], hue: 1, ...extra });
function world(people: Person[]): State {
  const s = createSeed();
  s.mode = 'personal';
  s.people = people;
  s.splits = [];
  s.settlements = [];
  s.groups = [];
  s.bhisis = [];
  s.transactions = [];
  return s;
}

describe('tidying the people list', () => {
  it('six "Rii"s: the connected one stays, the unused name-only ones go, the one with a split stays', () => {
    const s = world([
      p('real', 'Rii', { uid: 'u-rii', link, photo: 'data:x' }),
      p('n1', 'Rii'),
      p('n2', 'Rii'),
      p('n3', 'Rii'),
      p('used', 'Rii'),
      p('riya', 'Riya'),
    ]);
    s.splits.push({ id: 's1', description: 'Chai', amount: 100, date: '2026-11-01', paidBy: 'me', shares: [{ person: 'me', amount: 50 }, { person: 'used', amount: 50 }] } as never);
    tidyPeople(s);
    expect(s.people.map((x) => x.id)).toEqual(['real', 'used']);
  });

  it('the same PULSE person twice (from a bhisi and a group): one person, everything moved to them', () => {
    const s = world([p('friend', 'Rii', { uid: 'u-rii', link }), p('from-bhisi', 'Rii', { uid: 'u-rii' }), p('from-group', 'Rii Sharma', { uid: 'u-rii' })]);
    s.settlements.push({ id: 'st', from: 'from-group', to: 'me', amount: 200, date: '2026-11-01' } as never);
    s.groups.push({ id: 'g', name: 'Goa', emoji: '🏝️', members: ['me', 'from-group'], createdAt: '2026-11-01' } as never);
    tidyPeople(s);
    expect(s.people.map((x) => x.id)).toEqual(['friend']);
    expect(s.settlements[0].from).toBe('friend');
    expect(s.groups[0].members).toEqual(['me', 'friend']);
  });

  it('nothing is lost: people in a group, a bhisi, a payment or a spend stay', () => {
    const s = world([p('g', 'In group'), p('b', 'In bhisi'), p('t', 'On a spend'), p('st', 'Paid me'), p('x', 'Nobody')]);
    s.groups.push({ id: 'g1', name: 'Flat', emoji: '🏠', members: ['me', 'g'], createdAt: '2026-11-01' } as never);
    s.bhisis!.push({ id: 'b1', name: 'BC', emoji: '🏺', amount: 1000, members: ['me', 'b'], createdAt: '2026-11-01', rounds: [] } as Bhisi);
    s.transactions.push({ id: 't1', merchant: 'Dinner', amount: 500, type: 'expense', category: 'food', date: '2026-11-01', account: 'bank', recurring: false, status: 'completed', people: ['t'] } as never);
    s.settlements.push({ id: 's', from: 'st', to: 'me', amount: 10, date: '2026-11-01' } as never);
    tidyPeople(s);
    expect(s.people.map((x) => x.id).sort()).toEqual(['b', 'g', 'st', 't']);
  });

  it('a friend invited but not connected yet stays (the invite is still out)', () => {
    const s = world([p('inv', 'Asha', { link: { ...link, status: 'invited' } })]);
    tidyPeople(s);
    expect(s.people).toHaveLength(1);
  });

  it('the demo is left alone', () => {
    const s = createSeed();
    const before = s.people.length;
    tidyPeople(s);
    expect(s.people).toHaveLength(before);
  });

  it('two different connected friends are never merged, even with the same PULSE id', () => {
    const s = world([p('a', 'Rii', { uid: 'u', link }), p('b', 'Rii', { uid: 'u', link: { ...link, chan: 'd'.repeat(32) } })]);
    tidyPeople(s);
    expect(s.people).toHaveLength(2);
  });
});

describe('merging two people also moves their bhisi seats', () => {
  it('members, seats, the organiser, and who paid / won each round', () => {
    const s = world([p('a', 'Rii'), p('b', 'Rii', { uid: 'u', link })]);
    s.bhisis!.push({
      id: 'b1',
      name: 'BC',
      emoji: '🏺',
      amount: 1000,
      members: ['me', 'a'],
      createdAt: '2026-11-01',
      rounds: [{ date: '2026-11-10', paid: ['a'], winner: 'a', drawnBy: 'a', paidAt: { a: 'x' }, odds: { a: 5, me: 4 }, srv: ['a'] }],
      share: { bid: 'x', key: 'k', mid: 'm', token: 't', owner: false, seats: { s1: 'a', m: 'me' }, org: 'a' },
    } as Bhisi);
    mergePeople(s, 'a', 'b');
    const b = s.bhisis![0];
    expect(b.members).toEqual(['me', 'b']);
    expect(b.share!.seats).toEqual({ s1: 'b', m: 'me' });
    expect(b.share!.org).toBe('b');
    expect(b.rounds[0]).toMatchObject({ paid: ['b'], winner: 'b', drawnBy: 'b', paidAt: { b: 'x' }, odds: { b: 5, me: 4 }, srv: ['b'] });
  });
});
