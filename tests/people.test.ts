import { describe, expect, it } from 'vitest';
import { sha256 } from '../netlify/lib/auth';
import { handlePeople } from '../netlify/lib/people';
import { memStore } from './memstore';

// Friends on PULSE, on the server: usernames that are unique and fun, requests that can't duplicate,
// blocks that hold, and everything safe when two things happen at once.

type Store = ReturnType<typeof memStore>;
const NOW = new Date('2026-11-16T10:00:00Z');
let n = 0;
async function person(store: Store, name: string) {
  const uid = (++n).toString(16).padStart(32, 'a');
  const token = `tok_${uid}_${'x'.repeat(20)}`;
  await store.setJSON(`acct/${uid}`, { uid, n, email: `${uid}@x.in`, name, created: NOW.toISOString(), sess: [] });
  await store.setJSON(`sess/${await sha256(token)}`, { uid });
  const call = async (action: string, extra: Record<string, unknown> = {}, now = NOW) => (await handlePeople({ action, ...extra }, store as never, token, now)).body as Record<string, any>;
  const me = (await call('me')).me;
  return { uid, token, call, u: me.u as string };
}

describe('usernames', () => {
  it('everyone gets one straight away, from their name, with a fun word, and no two are the same', async () => {
    const store = memStore();
    const people = await Promise.all(Array.from({ length: 30 }, () => person(store, 'Krishna Rao')));
    const names = people.map((p) => p.u);
    expect(new Set(names).size).toBe(30);
    for (const u of names) expect(u).toMatch(/krishna/);
  });
  it('even when 30 people sign up at the same moment', async () => {
    const store = memStore({ jitter: true });
    const people = await Promise.all(Array.from({ length: 30 }, () => person(store, 'Riya')));
    expect(new Set(people.map((p) => p.u)).size).toBe(30);
  });
  it('change to any free one; capitals and look-alike letters count as the same name', async () => {
    const store = memStore();
    const k = await person(store, 'Krishna');
    const r = await person(store, 'Riya');
    expect((await k.call('rename', { u: 'Krishna.Kharcha' })).me.u).toBe('krishna.kharcha');
    expect(await r.call('check', { u: 'KRISHNA.kharcha' })).toMatchObject({ free: false, why: 'That one’s taken.' });
    expect((await r.call('check', { u: 'krishnа.kharcha' })).free).toBe(false); // Cyrillic а
    expect((await r.call('check', { u: 'krishna.kharcha' })).ideas.length).toBeGreaterThan(0);
    expect((await r.call('rename', { u: 'krishna.kharcha' })).error).toBe('That one’s taken.');
  });
  it('two people grabbing the same free name at once: exactly one gets it', async () => {
    const store = memStore({ jitter: true });
    const ps = await Promise.all(Array.from({ length: 6 }, (_, i) => person(store, `P${i}`)));
    const res = await Promise.all(ps.map((p) => p.call('rename', { u: 'chai.lover' })));
    expect(res.filter((x) => x.ok).length).toBe(1);
  });
  it('your old name is held for you 14 days, then anyone can take it; twice in 14 days at most', async () => {
    const store = memStore();
    const k = await person(store, 'Krishna');
    const r = await person(store, 'Riya');
    const first = k.u;
    await k.call('rename', { u: 'krishna.one' });
    expect((await r.call('check', { u: first })).free).toBe(false);
    expect((await r.call('find', { u: first })).found).toBeNull(); // a held name doesn't find anyone
    await k.call('rename', { u: 'krishna.two' });
    expect((await k.call('rename', { u: 'krishna.three' })).error).toMatch(/twice in 14 days/);
    const later = new Date(NOW.getTime() + 15 * 86400_000);
    expect((await r.call('check', { u: first }, later)).free).toBe(true);
  });
  it('bad names are refused on the server too', async () => {
    const store = memStore();
    const k = await person(store, 'Krishna');
    expect((await k.call('rename', { u: 'ab' })).ok).toBe(false);
    expect((await k.call('rename', { u: 'pulse' })).ok).toBe(false);
    expect((await k.call('rename', { u: 'k r' })).ok).toBe(false);
  });
});

describe('friend requests', () => {
  it('find by @username, request, accept: friends on both sides', async () => {
    const store = memStore();
    const k = await person(store, 'Krishna');
    const s = await person(store, 'Saloni');
    const found = (await k.call('find', { u: `@${s.u.toUpperCase()}` })).found;
    expect(found).toMatchObject({ uid: s.uid, name: 'Saloni', standing: 'none' });
    expect((await k.call('request', { uid: s.uid })).standing).toBe('sent');
    expect((await s.call('list')).received.map((x: { uid: string }) => x.uid)).toEqual([k.uid]);
    expect((await s.call('accept', { uid: k.uid })).standing).toBe('friends');
    expect((await k.call('list')).friends.map((x: { uid: string }) => x.uid)).toEqual([s.uid]);
  });
  it('tapping send five times at once: one request', async () => {
    const store = memStore({ jitter: true });
    const k = await person(store, 'Krishna');
    const s = await person(store, 'Saloni');
    await Promise.all(Array.from({ length: 5 }, () => k.call('request', { uid: s.uid })));
    expect((await s.call('list')).received).toHaveLength(1);
    expect([...store.m.keys()].filter((x) => x.startsWith('rel/'))).toHaveLength(1);
  });
  it('both send a request at the same moment: they’re friends', async () => {
    const store = memStore({ jitter: true });
    const k = await person(store, 'Krishna');
    const s = await person(store, 'Saloni');
    await Promise.all([k.call('request', { uid: s.uid }), s.call('request', { uid: k.uid })]);
    expect((await k.call('list')).friends).toHaveLength(1);
    expect((await s.call('list')).friends).toHaveLength(1);
  });
  it('accepted on two phones at once: still one friendship', async () => {
    const store = memStore({ jitter: true });
    const k = await person(store, 'Krishna');
    const s = await person(store, 'Saloni');
    await k.call('request', { uid: s.uid });
    const res = await Promise.all([s.call('accept', { uid: k.uid }), s.call('accept', { uid: k.uid })]);
    expect(res.map((x) => x.standing)).toEqual(['friends', 'friends']);
    expect((await s.call('list')).friends).toHaveLength(1);
  });
  it('cancel, decline and remove each end it; you can’t accept your own request', async () => {
    const store = memStore();
    const k = await person(store, 'Krishna');
    const s = await person(store, 'Saloni');
    await k.call('request', { uid: s.uid });
    expect((await k.call('accept', { uid: s.uid })).standing).toBe('sent');
    expect((await k.call('cancel', { uid: s.uid })).standing).toBe('none');
    expect((await s.call('list')).received).toHaveLength(0);
    await k.call('request', { uid: s.uid });
    expect((await s.call('decline', { uid: k.uid })).standing).toBe('none');
    await k.call('request', { uid: s.uid });
    await s.call('accept', { uid: k.uid });
    expect((await k.call('remove', { uid: s.uid })).standing).toBe('none');
    expect((await s.call('list')).friends).toHaveLength(0);
  });
  it('a block ends the friendship, hides you from them, and their requests do nothing', async () => {
    const store = memStore();
    const k = await person(store, 'Krishna');
    const x = await person(store, 'Spammer');
    await x.call('request', { uid: k.uid });
    await k.call('accept', { uid: x.uid });
    expect((await k.call('block', { uid: x.uid })).standing).toBe('blocked');
    expect((await x.call('list')).friends).toHaveLength(0);
    expect((await x.call('find', { u: k.u })).found).toBeNull();
    // Their request looks sent to them, but nothing reaches me.
    expect((await x.call('request', { uid: k.uid })).standing).toBe('sent');
    expect((await k.call('list')).received).toHaveLength(0);
    expect((await k.call('list')).blocked.map((p: { uid: string }) => p.uid)).toEqual([x.uid]);
    expect((await k.call('request', { uid: x.uid })).error).toMatch(/Unblock first/);
    expect((await k.call('unblock', { uid: x.uid })).standing).toBe('none');
  });
  it('not signed in, or someone else’s id: refused', async () => {
    const store = memStore();
    const k = await person(store, 'Krishna');
    expect((await handlePeople({ action: 'list' }, store as never, 'nope')).status).toBe(401);
    expect((await k.call('request', { uid: k.uid })).ok).toBe(false);
    expect((await k.call('request', { uid: 'f'.repeat(32) })).error).toMatch(/isn’t on PULSE/);
  });
  it('too many requests in a day: stopped', async () => {
    const store = memStore();
    const k = await person(store, 'Krishna');
    const others = await Promise.all(Array.from({ length: 31 }, (_, i) => person(store, `F${i}`)));
    const res = [];
    for (const o of others) res.push(await k.call('request', { uid: o.uid }));
    expect(res.filter((r) => r.ok).length).toBe(30);
    expect(res[30].error).toMatch(/a lot of requests/);
  });
  it('report: saved for the team', async () => {
    const store = memStore();
    const k = await person(store, 'Krishna');
    const x = await person(store, 'Fake Krishna');
    expect((await k.call('report', { uid: x.uid, reason: 'Pretending to be me' })).ok).toBe(true);
    expect([...store.m.keys()].some((key) => key.startsWith('rep/'))).toBe(true);
  });
});
