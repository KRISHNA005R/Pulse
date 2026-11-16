import { describe, expect, it } from 'vitest';
import { addInvites, invitedTo, invitesFor, inviteHash, openInvites, takeInvites } from '../src/lib/invites';
import type { State } from '../src/types';

const NOW = Date.parse('2026-11-16T10:00:00Z');
const G = 'https://pulse.app/#group=0123456789abcdef0123456789abcdef.KEYkeyKEYkeyKEYkeyKEYkey.R29h';
const B = 'https://pulse.app/#b=AbCdEfGhIjKlMnOpQrStUv';

function state(): State {
  return {
    mode: 'personal',
    people: [
      { id: 'p1', name: 'Saloni Mehta', short: 'Saloni', hue: 1, link: { chan: 'c1', key: 'k', status: 'linked', since: '2026-11-01' } },
      { id: 'p2', name: 'Arnav', short: 'Arnav', hue: 2 },
    ],
    groups: [],
    bhisis: [],
  } as unknown as State;
}

describe('invites to a group or bhisi, over the friend channel', () => {
  it('only takes the #part of a real invite link', () => {
    expect(inviteHash(G)).toBe(G.slice(G.indexOf('#')));
    expect(inviteHash('https://evil.example/#group=x')).toBe('');
    expect(inviteHash('https://pulse.app/#sync=PULSE-1234-5678')).toBe('');
  });

  it('goes only to connected friends, once per friend and link', () => {
    const s = state();
    expect(addInvites(s, 'g', G, 'Goa trip', ['p1', 'p2'], NOW)).toBe(1);
    addInvites(s, 'g', G, 'Goa trip', ['p1'], NOW + 1000);
    expect(s.invitesOut).toHaveLength(1);
    expect(invitedTo(s, G).has('p1')).toBe(true);
    expect(invitesFor(s, 'p1', NOW)).toHaveLength(1);
    expect(invitesFor(s, 'p2', NOW)).toHaveLength(0);
  });

  it('arrives once, can be turned down, and comes back if sent again', () => {
    const me = state();
    const sent = state();
    addInvites(sent, 'b', B, 'Hostel BC', ['p1'], NOW);
    const box = invitesFor(sent, 'p1', NOW);
    expect(takeInvites(me, 'p1', box, NOW)).toHaveLength(1);
    expect(takeInvites(me, 'p1', box, NOW)).toHaveLength(0);
    expect(openInvites(me, 'b')).toHaveLength(1);
    expect(openInvites(me, 'g')).toHaveLength(0);
    me.invites![0].done = 'no';
    expect(openInvites(me)).toHaveLength(0);
    addInvites(sent, 'b', B, 'Hostel BC', ['p1'], NOW + 60_000);
    takeInvites(me, 'p1', invitesFor(sent, 'p1', NOW + 60_000), NOW + 60_000);
    expect(openInvites(me)).toHaveLength(1);
  });

  it('ignores junk, and hides a group I am already in', () => {
    const me = state();
    expect(takeInvites(me, 'p1', [{ id: 'abc123', k: 'g', h: 'javascript:alert(1)', name: 'x', at: new Date(NOW).toISOString() }, 'nope', null], NOW)).toHaveLength(0);
    takeInvites(me, 'p1', [{ id: 'abc123', k: 'g', h: G.slice(G.indexOf('#')), name: 'Goa', at: new Date(NOW).toISOString() }], NOW);
    expect(openInvites(me)).toHaveLength(1);
    me.groups.push({ id: 'g1', shared: { gid: '0123456789abcdef0123456789abcdef' } } as never);
    expect(openInvites(me)).toHaveLength(0);
  });

  it('old invites drop off', () => {
    const s = state();
    addInvites(s, 'g', G, 'Goa', ['p1'], NOW);
    expect(invitesFor(s, 'p1', NOW + 31 * 864e5)).toHaveLength(0);
  });
});
