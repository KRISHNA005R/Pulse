import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { applyBox } from '../src/lib/friends';
import { applyFriends, newKeys, pairLink } from '../src/lib/people';
import type { State } from '../src/types';

// Friends made by request: both phones work out the same locked channel on their own, and the
// friends list has exactly one person per account.

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const T = '2026-11-16';
function world(): State {
  const s = createSeed();
  s.mode = 'personal';
  s.people = [];
  s.splits = [];
  s.settlements = [];
  return s;
}

describe('the channel between two friends', () => {
  it('both phones get the same channel and lock, one opens it and one joins, each with its own write token', async () => {
    const ka = await newKeys();
    const kb = await newKeys();
    const la = (await pairLink(ka, A, B, kb.pub, T))!;
    const lb = (await pairLink(kb, B, A, ka.pub, T))!;
    expect(la.chan).toMatch(/^[0-9a-f]{32}$/);
    expect(la.chan).toBe(lb.chan);
    expect(la.key).toBe(lb.key);
    expect([la.role, lb.role]).toEqual(['a', 'b']);
    expect(la.token).not.toBe(lb.token);
    // The same on my other phone (same keys): the same token, so two phones never lock each other out.
    expect((await pairLink(ka, A, B, kb.pub, T))!.token).toBe(la.token);
  });
  it('someone else’s key gives a different channel (nobody can listen in)', async () => {
    const ka = await newKeys();
    const kb = await newKeys();
    const kx = await newKeys();
    expect((await pairLink(kx, 'c'.repeat(32), B, kb.pub, T))!.chan).not.toBe((await pairLink(ka, A, B, kb.pub, T))!.chan);
  });
  it('a broken key: no channel, no crash', async () => {
    expect(await pairLink(await newKeys(), A, B, '{bad', T)).toBeNull();
  });
});

describe('the friends list', () => {
  const link = { chan: 'c'.repeat(32), key: 'k', token: 't', status: 'invited' as const, since: T, via: 'acct' as const, role: 'a' as const, peer: 'p1' };
  it('one person per friend, with their @username and channel; again changes nothing', () => {
    const s = world();
    applyFriends(s, [{ uid: B, u: 'saloni.vibes', name: 'Saloni Mehta' }], { [B]: link });
    applyFriends(s, [{ uid: B, u: 'saloni.vibes', name: 'Saloni Mehta' }], { [B]: link });
    expect(s.people).toHaveLength(1);
    expect(s.people[0]).toMatchObject({ acct: B, username: 'saloni.vibes', name: 'Saloni Mehta', link: { chan: link.chan } });
  });
  it('a friend already connected by link is the same person (their account came with their box): no second entry', () => {
    const s = world();
    s.people.push({ id: 'old', name: 'saloni', short: 'saloni', hue: 1, link: { chan: 'd'.repeat(32), key: 'k', token: 't', status: 'linked', since: T } });
    applyBox(s, 'old', { v: 1, name: 'saloni', acct: B, items: [] });
    applyFriends(s, [{ uid: B, u: 'saloni.vibes', name: 'saloni' }], { [B]: link });
    expect(s.people).toHaveLength(1);
    expect(s.people[0].link!.chan).toBe('d'.repeat(32)); // keeps the channel that already works
    expect(s.people[0].username).toBe('saloni.vibes');
  });
  it('a new key on their side: a new channel; what came over the old one will come again', () => {
    const s = world();
    applyFriends(s, [{ uid: B, u: 's', name: 'S' }], { [B]: link });
    s.splits.push({ id: 'r1', description: 'x', amount: 1, paidBy: s.people[0].id, date: T, mode: 'equal', shares: [], category: 'food', remote: link.chan } as never);
    const leave = applyFriends(s, [{ uid: B, u: 's', name: 'S' }], { [B]: { ...link, chan: 'e'.repeat(32), peer: 'p2' } });
    expect(leave.map((l) => l.chan)).toEqual([link.chan]);
    expect(s.people[0].link!.chan).toBe('e'.repeat(32));
    expect(s.splits).toHaveLength(0);
  });
  it('no longer friends: the channel goes, the person and what you split stay', () => {
    const s = world();
    applyFriends(s, [{ uid: B, u: 's', name: 'S' }], { [B]: link });
    s.splits.push({ id: 'mine', description: 'x', amount: 1, paidBy: 'me', date: T, mode: 'equal', shares: [], category: 'food' } as never);
    const leave = applyFriends(s, [], {});
    expect(leave).toHaveLength(1);
    expect(s.people[0].link).toBeUndefined();
    expect(s.splits).toHaveLength(1);
  });
  it('a box can’t give someone an account another person here already has', () => {
    const s = world();
    s.people.push({ id: 'real', name: 'Saloni', short: 'Saloni', hue: 1, acct: B });
    s.people.push({ id: 'other', name: 'X', short: 'X', hue: 2, link: { chan: 'f'.repeat(32), key: 'k', token: 't', status: 'linked', since: T } });
    applyBox(s, 'other', { v: 1, name: 'X', acct: B, items: [] });
    expect(s.people.find((p) => p.id === 'other')!.acct).toBeUndefined();
  });
});
