import { describe, expect, it } from 'vitest';
import { handleBhisi } from '../netlify/lib/bhisi';
import { memStore } from './memstore';

// Bhisi server: deleting, people added by name who then join with the link, and two phones
// marking "paid" at the same moment.

const BID = 'c'.repeat(32);
const seat = (n: number) => ({ mid: String(n).padStart(16, '0'), token: `token-${n}-abcdefghijklmnopqrstuv` });
const G1 = 'g000000000001';
const G2 = 'g000000000002';
function ctx(store: ReturnType<typeof memStore>, now = new Date('2026-11-01T06:00:00Z')) {
  return { store, pushStore: { async get() { return null; } }, send: async () => 201, vapid: async () => ({}), now };
}
const call = (c: ReturnType<typeof ctx>, who: { mid: string; token: string }, action: string, extra: Record<string, unknown> = {}) => handleBhisi({ action, bid: BID, ...who, ...extra }, c as never);
type View = { seats: string[]; ghosts: string[]; paid: Record<string, Record<string, string>>; members: { mid: string; was?: string }[] };

describe('deleting a bhisi', () => {
  it('everyone else is told it was deleted (not just "not found"), and an old phone of the organiser cannot bring it back', async () => {
    const store = memStore();
    const c = ctx(store);
    await call(c, seat(1), 'b-create', { start: '2026-11-10', ghosts: [G1] });
    await call(c, seat(2), 'b-join');
    await call(c, seat(2), 'b-paid', { round: 0, paid: true });
    expect((await call(c, seat(1), 'b-delete')).status).toBe(200);

    const r = await call(c, seat(2), 'b-get');
    expect(r.status).toBe(410);
    expect(r.body.deleted).toBe(true);
    // Every other action says the same.
    expect((await call(c, seat(2), 'b-put', { box: 'x' })).status).toBe(410);
    expect((await call(c, seat(3), 'b-join')).status).toBe(410);
    // The organiser's other phone, which still has it, tries to "re-create" it: no.
    expect((await call(c, seat(1), 'b-create', { start: '2026-11-10' })).status).toBe(410);
    expect((await call(c, seat(1), 'b-get')).status).toBe(410);
    // Nothing else is left behind on the server.
    expect([...store.m.keys()].filter((k) => k.startsWith(`b/${BID}/`))).toEqual([`b/${BID}/meta`]);
  });

  it('only the organiser can delete', async () => {
    const store = memStore();
    const c = ctx(store);
    await call(c, seat(1), 'b-create', { start: '2026-11-10' });
    await call(c, seat(2), 'b-join');
    expect((await call(c, seat(2), 'b-delete')).status).toBe(403);
    expect((await call(c, seat(2), 'b-get')).status).toBe(200);
  });
});

describe('added by name, then joined with the link', () => {
  async function setup() {
    const store = memStore();
    const c = ctx(store);
    await call(c, seat(1), 'b-create', { start: '2026-11-10', ghosts: [G1, G2] });
    // The organiser marked Rahul (added by name) paid before he joined.
    await call(c, seat(1), 'b-paid', { round: 0, target: G1, paid: true });
    await call(c, seat(2), 'b-join');
    return { store, c };
  }

  it('Rahul takes his own name-only seat: one seat, not two, and the paid mark stays with him', async () => {
    const { c } = await setup();
    expect(((await call(c, seat(2), 'b-get')).body as unknown as View).seats).toHaveLength(4); // before: me, Rahul by name, Priya by name, Rahul
    expect((await call(c, seat(2), 'b-link', { ghost: G1 })).status).toBe(200);
    const v = (await call(c, seat(1), 'b-get')).body as unknown as View;
    expect(v.seats).toEqual([seat(1).mid, seat(2).mid, G2]);
    expect(v.paid[0][seat(2).mid]).toBe('2026-11-01T06:00:00.000Z');
    expect(v.paid[0][G1]).toBeUndefined();
    expect(v.members.find((m) => m.mid === seat(2).mid)?.was).toBe(G1);
  });

  it('the organiser can link them too (an older PULSE on the joining phone)', async () => {
    const { c } = await setup();
    expect((await call(c, seat(1), 'b-link', { ghost: G1, target: seat(2).mid })).status).toBe(200);
    const v = (await call(c, seat(2), 'b-get')).body as unknown as View;
    expect(v.seats).toEqual([seat(1).mid, seat(2).mid, G2]);
  });

  it('linking twice, from both sides at once, still gives one seat', async () => {
    const { c } = await setup();
    const [a, b] = await Promise.all([call(c, seat(2), 'b-link', { ghost: G1 }), call(c, seat(1), 'b-link', { ghost: G1, target: seat(2).mid })]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(((await call(c, seat(2), 'b-get')).body as unknown as View).seats).toEqual([seat(1).mid, seat(2).mid, G2]);
  });

  it('a seat already taken by someone else, a stranger, or a member speaking for someone else: refused', async () => {
    const { c } = await setup();
    await call(c, seat(3), 'b-join');
    expect((await call(c, seat(2), 'b-link', { ghost: G1 })).status).toBe(200);
    expect((await call(c, seat(3), 'b-link', { ghost: G1 })).status).toBe(409); // Rahul's already
    expect((await call(c, seat(3), 'b-link', { ghost: 'g0000000000ff' })).status).toBe(400); // not a name-only seat here
    expect((await call(c, seat(3), 'b-link', { ghost: G2, target: seat(2).mid })).status).toBe(403); // only the organiser links others
    expect((await call(c, seat(1), 'b-link', { ghost: G2 })).status).toBe(400); // the organiser isn't anyone's name-only seat
    expect((await call(c, seat(9), 'b-link', { ghost: G2 })).status).toBe(403);
  });

  it('marking the old name-only seat paid (an older PULSE) lands on the person who took it', async () => {
    const { c } = await setup();
    await call(c, seat(2), 'b-link', { ghost: G1 });
    await call(c, seat(1), 'b-paid', { round: 0, target: G1, paid: false });
    let v = (await call(c, seat(1), 'b-get')).body as unknown as View;
    expect(v.paid[0]?.[seat(2).mid]).toBeUndefined();
    await call(c, seat(1), 'b-paid', { round: 0, target: G1, paid: true });
    v = (await call(c, seat(1), 'b-get')).body as unknown as View;
    expect(v.paid[0][seat(2).mid]).toBeTruthy();
    expect(v.paid[0][G1]).toBeUndefined();
  });

  it('once the draws start, nobody can be linked (the list is locked)', async () => {
    const { store } = await setup();
    const on = ctx(store, new Date('2026-11-10T06:00:00Z'));
    expect((await call(on, seat(1), 'b-draw', { round: 0 })).status).toBe(200);
    expect((await call(on, seat(2), 'b-link', { ghost: G1 })).status).toBe(403);
  });

  it('an organiser saving the name-only list again does not bring a taken seat back', async () => {
    const { c } = await setup();
    await call(c, seat(2), 'b-link', { ghost: G1 });
    await call(c, seat(1), 'b-setup', { ghosts: [G1, G2] });
    expect(((await call(c, seat(1), 'b-get')).body as unknown as View).seats).toEqual([seat(1).mid, seat(2).mid, G2]);
  });
});

describe('two phones at the same moment', () => {
  it('everyone marking paid together: no mark is lost', async () => {
    const store = memStore({ jitter: true });
    const c = ctx(store);
    const people = [1, 2, 3, 4, 5, 6].map(seat);
    await call(c, people[0], 'b-create', { start: '2026-11-10' });
    for (const p of people.slice(1)) await call(c, p, 'b-join');
    const res = await Promise.all(people.map((p) => call(c, p, 'b-paid', { round: 0, paid: true })));
    expect(res.map((r) => r.status)).toEqual(people.map(() => 200));
    const v = (await call(c, people[0], 'b-get')).body as unknown as View;
    expect(Object.keys(v.paid[0]).sort()).toEqual(people.map((p) => p.mid).sort());
  });
});
