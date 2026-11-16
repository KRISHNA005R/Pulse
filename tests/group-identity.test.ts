import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { applyGroup, buildGroupBox } from '../src/lib/friends';
import { personBalances } from '../src/lib/finance';
import type { Group, Person, State } from '../src/types';

// Who's who in a shared group. Krishna's case: saloni added "Chicken chinese" split with a name she
// had typed by hand; her phone then said that name was Krishna, so Krishna's phone counted the ₹653
// share as his, though saloni never put him in it. Rule now: only I can say a name is me.

const T = '2026-11-16';
const MK = '1'.repeat(16); // Krishna
const MS = '2'.repeat(16); // saloni
const GID = 'abcdef0123456789';
function world(people: Person[]): State {
  const s = createSeed();
  s.mode = 'personal';
  s.today = T;
  s.people = people;
  s.splits = [];
  s.settlements = [];
  s.groups = [];
  s.bhisis = [];
  return s;
}
const share = (mid: string, refs: Record<string, string>, extra = {}) => ({ gid: GID, key: 'k', mid, token: 't', refs, on: Object.keys(refs).filter((r) => /^[0-9a-f]{16}$/.test(r)), since: T, ...extra });

function salonisBox(also: [string, string][] = []) {
  return {
    v: 1 as const,
    uid: '',
    name: 'saloni',
    g: { name: 'Hum chaar', emoji: '🍜' },
    ghosts: [{ id: `${MS}.arn`, name: 'Arnav' }],
    ...(also.length ? { also } : {}),
    items: [{ id: 'ch', d: 'Chicken chinese', t: 1305, date: T, cat: 'food', by: MS, sh: [[MS, 652.5], [`${MS}.arn`, 652.5]] as [string, number][] }],
    pays: [{ id: 'p1', from: MS, to: `${MS}.arn`, a: 653, date: T }],
  };
}
function krishna(claim?: string) {
  const s = world([{ id: 'sal', name: 'saloni', short: 'saloni', hue: 1 }]);
  s.groups.push({ id: 'g', name: 'Hum chaar', emoji: '🍜', members: ['me', 'sal'], createdAt: T, shared: share(MK, { [MS]: 'sal' }, claim ? { claim } : {}) } as unknown as Group);
  return s;
}
const view = (box: unknown) => ({ closed: false, members: [{ mid: MS, box: box as never, gone: false, owner: true }] });

describe('only I can say a name is me', () => {
  it('saloni’s phone says her typed "Arnav" is Krishna: Krishna’s phone doesn’t take Arnav’s share or payment', () => {
    const s = krishna();
    applyGroup(s, 'g', view(salonisBox([[`${MS}.arn`, MK]])));
    const ch = s.splits.find((x) => x.description === 'Chicken chinese')!;
    expect(ch.shares.map((x) => x.person)).not.toContain('me');
    expect(s.settlements.some((x) => x.from === 'me' || x.to === 'me')).toBe(false);
    expect(personBalances(s, 'g').get('sal') ?? 0).toBe(0);
    // Arnav is his own (name-only) person here.
    expect(s.people.some((p) => p.name === 'Arnav')).toBe(true);
  });
  it('a typed name that turned out to be someone else (not me) still folds into them', () => {
    const MR = '3'.repeat(16);
    const s = krishna();
    s.people.push({ id: 'rii', name: 'Rii', short: 'Rii', hue: 2 });
    s.groups[0].shared!.refs[MR] = 'rii';
    s.groups[0].shared!.on.push(MR);
    s.groups[0].members.push('rii');
    applyGroup(s, 'g', { closed: false, members: [{ mid: MS, box: salonisBox([[`${MS}.arn`, MR]]) as never, gone: false, owner: true }, { mid: MR, box: { v: 1, uid: '', name: 'Rii', g: { name: 'Hum chaar', emoji: '🍜' }, ghosts: [], items: [], pays: [] } as never, gone: false, owner: false }] });
    expect(s.splits.find((x) => x.description === 'Chicken chinese')!.shares.map((x) => x.person)).toContain('rii');
  });
  it('my own claim (I said "I’m Arnav" when I joined) still counts', () => {
    const s = krishna(`${MS}.arn`);
    applyGroup(s, 'g', view(salonisBox()));
    expect(s.splits.find((x) => x.description === 'Chicken chinese')!.shares.map((x) => x.person)).toContain('me');
  });
  it('and I can take it back: the share goes back to the typed name', () => {
    const s = krishna(`${MS}.arn`);
    applyGroup(s, 'g', view(salonisBox()));
    delete s.groups[0].shared!.claim;
    applyGroup(s, 'g', view(salonisBox()));
    expect(s.splits.find((x) => x.description === 'Chicken chinese')!.shares.map((x) => x.person)).not.toContain('me');
    // …and my box no longer says it either.
    expect(buildGroupBox(s, s.groups[0]).claim).toBeUndefined();
  });
  it('instead, it asks: "saloni says “Arnav” is you". That’s me → the share is mine; Not me → never asked again', () => {
    const s = krishna();
    applyGroup(s, 'g', view(salonisBox([[`${MS}.arn`, MK]])));
    expect(s.groups[0].shared!.asks).toEqual([{ ghost: `${MS}.arn`, name: 'Arnav', by: 'saloni' }]);
    // That's me.
    const yes = structuredClone(s);
    yes.groups[0].shared!.claim = `${MS}.arn`;
    applyGroup(yes, 'g', view(salonisBox([[`${MS}.arn`, MK]])));
    expect(yes.splits.find((x) => x.description === 'Chicken chinese')!.shares.map((x) => x.person)).toContain('me');
    expect(yes.groups[0].shared!.asks).toBeUndefined();
    // Not me.
    s.groups[0].shared!.notMe = [`${MS}.arn`];
    applyGroup(s, 'g', view(salonisBox([[`${MS}.arn`, MK]])));
    expect(s.groups[0].shared!.asks).toBeUndefined();
    expect(s.splits.find((x) => x.description === 'Chicken chinese')!.shares.map((x) => x.person)).not.toContain('me');
  });
});
