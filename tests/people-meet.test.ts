import { describe, expect, it } from 'vitest';
import { sha256 } from '../netlify/lib/auth';
import { backfillProfiles, handlePeople } from '../netlify/lib/people';
import { memStore } from './memstore';

// Usernames for people who signed up before usernames existed, said once; and Meet: one phone shows
// a code, the other scans it, and they're friends.

type Store = ReturnType<typeof memStore>;
const NOW = new Date('2026-11-16T10:00:00Z');
const later = (s: number) => new Date(NOW.getTime() + s * 1000);
let n = 100;
async function account(store: Store, name: string) {
  const uid = (++n).toString(16).padStart(32, 'b');
  const token = `tok_${uid}_${'y'.repeat(20)}`;
  await store.setJSON(`acct/${uid}`, { uid, n, email: `${uid}@x.in`, name, created: NOW.toISOString(), sess: [] });
  await store.setJSON(`sess/${await sha256(token)}`, { uid });
  const call = async (action: string, extra: Record<string, unknown> = {}, now = NOW) => {
    const r = await handlePeople({ action, ...extra }, store as never, token, now);
    return { status: r.status, ...(r.body as Record<string, any>) } as Record<string, any>;
  };
  return { uid, token, call };
}
const joined = async (store: Store, name: string) => {
  const a = await account(store, name);
  await a.call('me');
  return a;
};

describe('usernames for existing accounts', () => {
  it('the backfill gives every account a unique username, once, and leaves existing ones alone', async () => {
    const store = memStore({ jitter: true });
    const olds = await Promise.all(Array.from({ length: 12 }, () => account(store, 'Saloni Mehta')));
    const early = await olds[0].call('me');
    // Two runs at once, and the app asking at the same time.
    const [x, y] = await Promise.all([backfillProfiles(store as never, NOW), backfillProfiles(store as never, NOW), olds[1].call('me')]);
    expect(x.failed + y.failed).toBe(0);
    const names = await Promise.all(olds.map(async (o) => (await o.call('me')).me.u as string));
    expect(new Set(names).size).toBe(12);
    expect(names[0]).toBe(early.me.u);
    for (const u of names) expect(u).toMatch(/saloni/);
    const again = await backfillProfiles(store as never, NOW);
    expect(again).toMatchObject({ made: 0, failed: 0 });
    // Every name points back at its owner.
    for (const [i, u] of names.entries()) expect((await store.get(`un/${u}`)) as { uid: string }).toEqual({ uid: olds[i].uid });
  });

  it('"You’re @…" is said once: fresh until told, on any phone', async () => {
    const store = memStore();
    const k = await account(store, 'Krishna');
    expect((await k.call('me')).me.fresh).toBe(true);
    await Promise.all([k.call('told'), k.call('told')]);
    expect((await k.call('me')).me.fresh).toBeUndefined();
  });
});

describe('Meet: phones together', () => {
  it('scan the code: friends on both sides at once, and the shower sees who', async () => {
    const store = memStore();
    const k = await account(store, 'Krishna');
    const s = await account(store, 'Saloni');
    const { token } = await k.call('meet-open');
    expect(token).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect((await k.call('meet-open')).token).toBe(token); // reopening shows the same code
    const r = await s.call('meet', { token });
    expect(r).toMatchObject({ ok: true, standing: 'friends', person: { uid: k.uid } });
    expect((await k.call('meet-poll', { token })).got.map((x: { uid: string }) => x.uid)).toEqual([s.uid]);
    expect((await k.call('list')).friends.map((x: { uid: string }) => x.uid)).toEqual([s.uid]);
    expect((await s.call('list')).friends.map((x: { uid: string }) => x.uid)).toEqual([k.uid]);
    // Scanning twice changes nothing.
    expect(await s.call('meet', { token })).toMatchObject({ ok: true, already: true });
    expect((await k.call('meet-poll', { token })).got).toHaveLength(1);
  });

  it('a code runs out after 3 minutes; your own code, a made-up one and someone else’s poll do nothing', async () => {
    const store = memStore();
    const k = await account(store, 'Krishna');
    const s = await account(store, 'Saloni');
    const { token } = await k.call('meet-open');
    expect((await k.call('meet', { token })).status).toBe(400);
    expect((await s.call('meet', { token: 'A'.repeat(16) })).status).toBe(410);
    expect((await s.call('meet', { token: '../../acct' })).status).toBe(410);
    expect((await s.call('meet-poll', { token })).got).toEqual([]);
    expect((await s.call('meet', { token }, later(181))).status).toBe(410);
    expect((await s.call('list')).friends).toEqual([]);
  });

  it('a block holds: a blocked person’s scan looks like an old code', async () => {
    const store = memStore();
    const k = await joined(store, 'Krishna');
    const s = await joined(store, 'Saloni');
    await k.call('block', { uid: s.uid });
    const { token } = await k.call('meet-open');
    expect((await s.call('meet', { token })).status).toBe(410);
    expect((await k.call('meet-poll', { token })).got).toEqual([]);
  });

  it('a whole table scans at once: everyone connected, no duplicates', async () => {
    const store = memStore({ jitter: true });
    const k = await account(store, 'Krishna');
    const table = await Promise.all(Array.from({ length: 6 }, (_, i) => account(store, `Friend ${i}`)));
    const { token } = await k.call('meet-open');
    const res = await Promise.all([...table, ...table].map((p) => p.call('meet', { token })));
    expect(res.every((x) => x.ok)).toBe(true);
    expect((await k.call('meet-poll', { token })).got).toHaveLength(6);
    expect((await k.call('list')).friends).toHaveLength(6);
  });

  it('guessing codes is rate limited', async () => {
    const store = memStore();
    const s = await account(store, 'Saloni');
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await s.call('meet', { token: `${'Z'.repeat(14)}${i.toString().padStart(2, '0')}` })).status;
    expect(last).toBe(429);
  });
});
