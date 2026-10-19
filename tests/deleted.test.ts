import { describe, expect, it } from 'vitest';
import { handleFriends } from '../netlify/lib/friends';
import { memStore } from './memstore';

const ctx = (store: ReturnType<typeof memStore>, iso = '2026-10-19T06:00:00Z') =>
  ({ store, pushStore: { async get() { return null; } }, send: async () => 0, vapid: async () => ({}), now: new Date(iso) }) as never;
const T = (n: number) => `token-${n}-abcdefghijklmnopqrstuvwxyz`;

describe('a friend deletes their PULSE account', () => {
  it('two-person link: the other side learns it was a deleted account', async () => {
    const store = memStore();
    const chan = 'c'.repeat(32);
    await handleFriends({ action: 'create', chan, token: T(1) }, ctx(store));
    await handleFriends({ action: 'join', chan, token: T(2) }, ctx(store));
    await handleFriends({ action: 'leave', chan, token: T(2), deleted: true }, ctx(store));
    const r = await handleFriends({ action: 'get', chan, token: T(1) }, ctx(store));
    expect(r.body.theirs).toMatchObject({ gone: true, deleted: true });
  });

  it('shared group: the member is marked as a deleted account', async () => {
    const store = memStore();
    const gid = 'd'.repeat(32);
    await handleFriends({ action: 'g-create', gid, mid: '0000000000000001', token: T(1) }, ctx(store));
    await handleFriends({ action: 'g-join', gid, mid: '0000000000000002', token: T(2) }, ctx(store));
    await handleFriends({ action: 'g-leave', gid, mid: '0000000000000002', token: T(2), deleted: true }, ctx(store));
    const r = await handleFriends({ action: 'g-get', gid, mid: '0000000000000001', token: T(1) }, ctx(store));
    expect((r.body.members as { mid: string; deleted: boolean }[]).find((m) => m.mid === '0000000000000002')).toMatchObject({ gone: true, deleted: true });
  });

  it('bhisi: their chit comes out of the matka, even after the draws started', async () => {
    const store = memStore();
    const bid = 'e'.repeat(32);
    const s = (n: number) => ({ bid, mid: String(n).padStart(16, '0'), token: T(n) });
    await handleFriends({ action: 'b-create', ...s(1), start: '2026-10-19' }, ctx(store));
    await handleFriends({ action: 'b-join', ...s(2) }, ctx(store));
    await handleFriends({ action: 'b-join', ...s(3) }, ctx(store));
    const d = await handleFriends({ action: 'b-draw', ...s(1), round: 0 }, ctx(store));
    const winner = String(d.body.winner);
    const quitter = [s(1), s(2), s(3)].find((x) => x.mid !== winner && x.mid !== s(1).mid)!;
    await handleFriends({ action: 'b-leave', ...quitter, deleted: true }, ctx(store));
    const v = await handleFriends({ action: 'b-get', ...s(1) }, ctx(store));
    expect(v.body.seats).not.toContain(quitter.mid);
    expect(v.body.seats).toContain(winner); // a past winner stays in the history
    // The organiser can leave only by deleting their account
    expect((await handleFriends({ action: 'b-leave', ...s(1) }, ctx(store))).status).toBe(403);
    expect((await handleFriends({ action: 'b-leave', ...s(1), deleted: true }, ctx(store))).status).toBe(200);
  });
});
