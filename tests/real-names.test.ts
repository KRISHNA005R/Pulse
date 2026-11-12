import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { applyBox, tidyPeople } from '../src/lib/friends';
import type { Person, State } from '../src/types';

// A friend on PULSE is shown by the name they use on PULSE, not a name typed for them earlier.
// (Krishna had invited "Rii"; Saloni opened that invite. After tidying, Saloni showed as "Rii".)

const U = 'a'.repeat(32);
const link = { chan: 'c'.repeat(32), key: 'k', token: 't', status: 'linked' as const, since: '2026-11-01', theirName: 'saloni' };
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

describe('the name a friend uses on PULSE', () => {
  it('two entries for the same PULSE account become one, called what they call themselves', () => {
    const s = world([
      { id: 'typed', name: 'Rii', short: 'Rii', hue: 1, uid: U, link },
      { id: 'pu-x', name: 'saloni', short: 'saloni', hue: 2, uid: U, photo: 'data:s' },
    ]);
    s.groups.push({ id: 'g', name: 'Riya ka ghar', emoji: '🍜', members: ['me', 'pu-x'], createdAt: '2026-11-01' } as never);
    tidyPeople(s);
    expect(s.people).toHaveLength(1);
    expect(s.people[0]).toMatchObject({ id: 'typed', name: 'saloni', short: 'saloni', photo: 'data:s' });
    expect(s.groups[0].members).toEqual(['me', 'typed']);
  });

  it('already merged under the typed name: tidying puts their own name back', () => {
    const s = world([{ id: 'typed', name: 'Rii', short: 'Rii', hue: 1, uid: U, link }]);
    tidyPeople(s);
    expect(s.people[0].name).toBe('saloni');
  });

  it('their name arrives with what they share, and follows when they change it', () => {
    const s = world([{ id: 'typed', name: 'Rii', short: 'Rii', hue: 1, link: { ...link, theirName: undefined } }]);
    applyBox(s, 'typed', { v: 1, name: 'Saloni Mehta', uid: U, items: [] });
    expect(s.people[0]).toMatchObject({ name: 'Saloni Mehta', short: 'Saloni' });
    applyBox(s, 'typed', { v: 1, name: 'Salu', uid: U, items: [] });
    expect(s.people[0].name).toBe('Salu');
  });

  it('a blank name from them changes nothing', () => {
    const s = world([{ id: 'p', name: 'Saloni', short: 'Saloni', hue: 1, link: { ...link, theirName: undefined } }]);
    applyBox(s, 'p', { v: 1, name: '  ', uid: U, items: [] });
    expect(s.people[0].name).toBe('Saloni');
  });
});
