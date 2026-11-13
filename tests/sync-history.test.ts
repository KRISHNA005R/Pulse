import { afterEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../netlify/functions/sync';
import { memStore } from './memstore';

// The account keeps earlier versions, so a bad change (like the demo getting in) can be undone:
// the newest few, at least 30 minutes apart, plus one a day for two weeks.

const ID = 'a'.repeat(64);
const W = 'b'.repeat(64);
const req = (method: string, body?: unknown, q = '') => new Request(`https://x/api/sync${q}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' } });

async function put(store: ReturnType<typeof memStore>, baseRev: number, data: string) {
  const r = await handle(req('PUT', { id: ID, write: W, baseRev, data }), store as never);
  return (await r.json()) as { rev: number };
}
const history = async (store: ReturnType<typeof memStore>) => ((await (await handle(req('GET', undefined, `?id=${ID}&history=1`), store as never)).json()) as { versions: { rev: number; at: string }[] }).versions;

afterEach(() => vi.useRealTimers());

describe('earlier versions', () => {
  it('a version is kept when the next save comes 30+ minutes later, and can be read back', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const store = memStore();
    vi.setSystemTime(new Date('2026-11-13T08:00:00Z'));
    await put(store, 0, 'v1-clean');
    vi.setSystemTime(new Date('2026-11-13T08:40:00Z'));
    await put(store, 1, 'v2-mixed');
    const v = await history(store);
    expect(v.map((x) => x.rev)).toEqual([1]);
    const old = (await (await handle(req('GET', undefined, `?id=${ID}&rev=1`), store as never)).json()) as { data: string };
    expect(old.data).toBe('v1-clean');
  });

  it('quick saves one after another do not each make a version', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const store = memStore();
    let t = Date.parse('2026-11-13T08:00:00Z');
    for (let rev = 0; rev < 10; rev++) {
      vi.setSystemTime(new Date((t += 60_000)));
      await put(store, rev, `v${rev + 1}`);
    }
    expect((await history(store)).length).toBe(1); // only the very first
  });

  it('keeps the newest 8 plus one a day, for 14 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const store = memStore();
    let t = Date.parse('2026-10-01T08:00:00Z');
    for (let rev = 0; rev < 120; rev++) {
      vi.setSystemTime(new Date((t += 6 * 3600_000))); // every 6 hours for 30 days
      await put(store, rev, `v${rev + 1}`);
    }
    const v = await history(store);
    const days = new Set(v.map((x) => x.at.slice(0, 10)));
    expect(v.length).toBeLessThanOrEqual(8 + 14);
    expect(days.size).toBeGreaterThanOrEqual(14);
    // Old versions that were let go are really gone from the store.
    const kept = new Set(v.map((x) => `${ID}.v${x.rev}`));
    expect([...store.m.keys()].filter((k) => k.includes('.v') && !kept.has(k))).toEqual([]);
  });

  it('deleting the data deletes its versions too', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const store = memStore();
    vi.setSystemTime(new Date('2026-11-13T08:00:00Z'));
    await put(store, 0, 'v1');
    vi.setSystemTime(new Date('2026-11-13T09:00:00Z'));
    await put(store, 1, 'v2');
    await handle(req('DELETE', { id: ID, write: W }), store as never);
    expect([...store.m.keys()]).toEqual([]);
  });

  it('a bad rev or id is refused', async () => {
    const store = memStore();
    expect((await handle(req('GET', undefined, `?id=${ID}&rev=abc`), store as never)).status).toBe(400);
    expect((await handle(req('GET', undefined, `?id=${ID}&rev=5`), store as never)).status).toBe(404);
  });
});
