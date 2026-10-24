import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminKeyHash, checkAdmin, MAX_TRIES } from '../netlify/lib/admin';
import * as statsFn from '../netlify/functions/stats';
import { sha256 } from '../netlify/functions/stats';
import { memStore } from './memstore';

// SEC-E: guessing the stats password must be limited. SEC-F: no built-in password (the repo is public).
const req = (key: string | null, ip = '1.2.3.4') => new Request('https://pulsemoney.in/api/stats', { headers: { ...(key !== null ? { 'x-stats-key': key } : {}), 'x-nf-client-connection-ip': ip } });
const NOW = new Date('2026-10-24T10:15:00Z');

describe('the private stats password', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('has no built-in fallback: without STATS_KEY_HASH every private page is closed', async () => {
    vi.stubEnv('STATS_KEY_HASH', '');
    expect(adminKeyHash()).toBe('');
    const r = await checkAdmin(req('anything'), adminKeyHash(), memStore(), NOW);
    expect(r?.status).toBe(503);
    expect((await r!.json()).error).toMatch(/STATS_KEY_HASH/);
    expect('DEFAULT_KEY_HASH' in statsFn).toBe(false);
  });

  it('lets the right password in', async () => {
    expect(await checkAdmin(req('secret'), await sha256('secret'), memStore(), NOW)).toBeNull();
  });

  it('turns away a wrong or missing password', async () => {
    const h = await sha256('secret');
    expect((await checkAdmin(req('nope'), h, memStore(), NOW))?.status).toBe(401);
    expect((await checkAdmin(req(null), h, memStore(), NOW))?.status).toBe(401);
  });

  it(`after ${MAX_TRIES} wrong tries in an hour, that address is blocked, even with the right password`, async () => {
    const h = await sha256('secret');
    const store = memStore();
    for (let i = 0; i < MAX_TRIES; i++) expect((await checkAdmin(req(`guess${i}`), h, store, NOW))?.status).toBe(401);
    expect((await checkAdmin(req('guess-more'), h, store, NOW))?.status).toBe(429);
    expect((await checkAdmin(req('secret'), h, store, NOW))?.status).toBe(429);
  });

  it('a burst of guesses all at once gets no more than the limit checked', async () => {
    const h = await sha256('secret');
    const store = memStore();
    const st = store as unknown as Record<string, (...a: never[]) => Promise<unknown>>;
    for (const k of ['get', 'setJSON', 'delete']) {
      const fn = st[k].bind(store);
      st[k] = async (...a: never[]) => {
        await new Promise((r) => setTimeout(r, 2 + Math.random() * 6));
        return fn(...a);
      };
    }
    const res = await Promise.all(Array.from({ length: 60 }, (_, i) => checkAdmin(req(`burst${i}`), h, store, NOW)));
    const checked = res.filter((r) => r?.status === 401).length;
    expect(checked).toBeLessThanOrEqual(MAX_TRIES);
  });

  it('the owner using the pages (right password, many times) is never locked out', async () => {
    const h = await sha256('secret');
    const store = memStore();
    for (let i = 0; i < 40; i++) expect(await checkAdmin(req('secret'), h, store, NOW)).toBeNull();
    const together = await Promise.all(Array.from({ length: 6 }, () => checkAdmin(req('secret'), h, store, NOW)));
    expect(together.every((r) => r === null)).toBe(true);
  });

  it('another address is not blocked, and the block ends the next hour', async () => {
    const h = await sha256('secret');
    const store = memStore();
    for (let i = 0; i < MAX_TRIES; i++) await checkAdmin(req(`g${i}`), h, store, NOW);
    expect(await checkAdmin(req('secret', '9.9.9.9'), h, store, NOW)).toBeNull();
    expect(await checkAdmin(req('secret'), h, store, new Date('2026-10-24T11:01:00Z'))).toBeNull();
  });

  it('does not store the address itself', async () => {
    const store = memStore();
    await checkAdmin(req('nope', '203.0.113.7'), await sha256('secret'), store, NOW);
    expect([...store.m.keys()].join(' ')).not.toContain('203.0.113.7');
  });
});

describe('every private endpoint uses it', () => {
  it('the stats dashboard is closed when no password hash is set', async () => {
    const r = await statsFn.handle(new Request('https://pulsemoney.in/api/stats?days=7', { headers: { 'x-stats-key': 'x' } }), memStore() as never, '');
    expect(r.status).toBe(503);
  });
});
