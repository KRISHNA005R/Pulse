import { describe, expect, it } from 'vitest';
import { addMonthsISO, fairPick, handleBhisi, todayIST } from '../netlify/lib/bhisi';
import { memStore } from './memstore';

const BID = 'a'.repeat(32);
const seat = (n: number) => ({ mid: String(n).padStart(16, '0'), token: `token-${n}-abcdefghijklmnopqrstuv` });
const sent: { title: string }[] = [];
function ctx(store: ReturnType<typeof memStore>, now = new Date('2026-10-18T06:00:00Z')) {
  return {
    store,
    pushStore: { async get(k: string) { return k.startsWith('dev/') ? { sub: { endpoint: k, keys: { p256dh: 'x', auth: 'y' } } } : null; } },
    send: async (_s: unknown, p: { title: string }) => (sent.push(p), 201),
    vapid: async () => ({}),
    now,
  };
}
const call = (c: ReturnType<typeof ctx>, who: { mid: string; token: string }, action: string, extra: Record<string, unknown> = {}) => handleBhisi({ action, bid: BID, ...who, ...extra }, c as never);

describe('bhisi server', () => {
  it('dates and fairness helpers', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(todayIST(new Date('2026-10-18T20:00:00Z'))).toBe('2026-10-19');
    const n = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const x = fairPick(['a', 'b', 'c']);
      n.set(x, (n.get(x) ?? 0) + 1);
    }
    for (const v of n.values()) expect(v).toBeGreaterThan(1700); // ~2000 each
  });

  it('create, join, early draw blocked, then one locked result for everyone', async () => {
    const store = memStore();
    const [a, b, c] = [seat(1), seat(2), seat(3)];
    const early = ctx(store, new Date('2026-10-18T06:00:00Z'));
    expect((await call(early, a, 'b-create', { start: '2026-10-20', ghosts: ['g000000000001'], dev: '1'.repeat(32) })).status).toBe(200);
    expect((await call(early, b, 'b-join', { dev: '2'.repeat(32) })).status).toBe(200);
    expect((await call(early, c, 'b-join')).status).toBe(200);
    const g = await call(early, b, 'b-get');
    expect(g.body.seats).toHaveLength(4); // 3 members + 1 added by name
    // Not before the date
    const no = await call(early, b, 'b-draw', { round: 0 });
    expect(no.status).toBe(403);
    // On the date: two people tap at the same moment
    const on = ctx(store, new Date('2026-10-20T04:00:00Z'));
    const [x, y] = await Promise.all([call(on, b, 'b-draw', { round: 0, names: {}, title: 'Hostel BC', pot: '₹8,000' }), call(on, c, 'b-draw', { round: 0, names: {}, title: 'Hostel BC', pot: '₹8,000' })]);
    expect(x.status).toBe(200);
    expect(y.status).toBe(200);
    expect(x.body.winner).toBe(y.body.winner);
    // Drawing the same round again gives the same answer
    const again = await call(on, a, 'b-draw', { round: 0 });
    expect(again.body.winner).toBe(x.body.winner);
    // Round 2 isn't open yet
    expect((await call(on, a, 'b-draw', { round: 1 })).status).toBe(403);
    // Nobody new once the draws start
    expect((await call(on, seat(9), 'b-join')).status).toBe(403);
  });

  it('everyone wins exactly once', async () => {
    const store = memStore();
    const people = [seat(1), seat(2), seat(3), seat(4)];
    const c0 = ctx(store, new Date('2026-01-01T06:00:00Z'));
    await call(c0, people[0], 'b-create', { start: '2026-01-01' });
    for (const p of people.slice(1)) await call(c0, p, 'b-join');
    const winners: string[] = [];
    for (let r = 0; r < 4; r++) {
      const c = ctx(store, new Date(`${addMonthsISO('2026-01-01', r)}T06:00:00Z`));
      const res = await call(c, people[r % 4], 'b-draw', { round: r });
      expect(res.status).toBe(200);
      winners.push(String(res.body.winner));
    }
    expect(new Set(winners).size).toBe(4);
    const c5 = ctx(store, new Date('2026-06-01T06:00:00Z'));
    expect((await call(c5, people[0], 'b-draw', { round: 4 })).status).toBe(400);
  });

  it('strangers and bad tokens are kept out', async () => {
    const store = memStore();
    const c = ctx(store);
    await call(c, seat(1), 'b-create', { start: '2026-10-18' });
    expect((await call(c, { mid: seat(1).mid, token: 'wrong-token-abcdefghijklmnop' }, 'b-get')).status).toBe(403);
    expect((await call(c, seat(5), 'b-draw', { round: 0 })).status).toBe(403);
  });
});
