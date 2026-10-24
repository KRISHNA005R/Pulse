// PROOF SCRIPTS for reported findings (SEC-A..D). Not part of npm test. They PASS while the problem exists.
// Security / reliability proofs for the announcement sender. These show behaviour; they don't fix it.
import { describe, expect, it } from 'vitest';
import { handleAnnounce, type AnnounceCtx } from '../netlify/lib/announce';
import { sha256 } from '../netlify/functions/stats';
import { memStore } from '../tests/memstore';

async function setup(n: number, extra: Partial<AnnounceCtx> = {}) {
  const store = memStore();
  for (let i = 1; i <= n; i++) {
    store.m.set(`n/${i}`, { uid: `u${i}` });
    store.m.set(`acct/u${i}`, { uid: `u${i}`, n: i, email: `p${i}@example.com`, name: `P${i}`, created: '', sess: [] });
  }
  store.m.set('meta/count', { n });
  const batches: { to: string; mail: { text: string } }[][] = [];
  const ctx: AnnounceCtx = {
    store: store as never,
    send: async (m) => { batches.push(m as never); return true; },
    owner: 'owner@example.com',
    keyHash: await sha256('k'),
    now: new Date('2026-10-24T08:00:00Z'),
    ...extra,
  };
  const call = (body?: unknown, q = '') =>
    handleAnnounce(new Request(`https://pulsemoney.in/api/announce${q}`, { method: body ? 'POST' : 'GET', headers: { 'x-stats-key': 'k', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), ctx);
  return { store, ctx, call, batches };
}

describe('POC', () => {
  it('SEC-A: two "send" presses at once can go past the daily cap', async () => {
    const t = await setup(10, { perDay: 4, perRun: 3 });
    await t.call({ action: 'test' }); // uses 1 of 4
    // Like Netlify Blobs: every read and write takes a few milliseconds over the network.
    const slow = (fn: (...a: never[]) => Promise<unknown>) => async (...a: never[]) => { await new Promise((r) => setTimeout(r, 5 + Math.random() * 10)); return fn(...a); };
    const st = t.store as unknown as Record<string, (...a: never[]) => Promise<unknown>>;
    for (const k of ['get', 'setJSON', 'list']) st[k] = slow(st[k].bind(t.store));
    await Promise.all([t.call({ action: 'send' }), t.call({ action: 'send' })]);
    const real = t.batches.slice(1).flat().length;
    const counted = ((await t.store.get('news/day/2026-10-24')) as { c: number }).c;
    console.log(`daily cap 4 (1 used by test) → real emails sent in the batches: ${real}, counter says ${counted}`);
    expect(real).toBeGreaterThan(3); // proves the cap was exceeded
  });

  it('SEC-B: a per-run size above Resend’s 100-per-batch limit marks everyone in it failed for good', async () => {
    const t = await setup(150, { perRun: 150, perDay: 500 });
    t.ctx.send = async (m) => { t.batches.push(m as never); return m.length <= 100; }; // Resend refuses >100
    await t.call({ action: 'test' });
    const r = await (await t.call({ action: 'send' })).json();
    const again = await (await t.call({ action: 'send' })).json();
    console.log('first press:', JSON.stringify({ sent: r.sent, failed: r.failed }), '| second press:', JSON.stringify({ sent: again.sent, left: again.left }));
    expect(r.failed).toBe(150);
    expect(again.left).toBe(0); // nobody left to retry: all 150 are stuck as failed
  });

  it('SEC-C: when FEEDBACK_TO has no PULSE account, the test email’s unsubscribe link is a dead link', async () => {
    const t = await setup(2);
    await t.call({ action: 'test' });
    const link = t.batches[0][0].mail.text.match(/https:\/\/pulsemoney\.in\/api\/announce\?u=[^\s]+/)![0];
    const r = await handleAnnounce(new Request(link), t.ctx);
    console.log('test email link:', link, '→ status', r.status);
    expect(r.status).toBe(400);
  });

  it('SEC-D: a failed batch has no way to be retried', async () => {
    const t = await setup(3);
    t.ctx.send = async (m) => { t.batches.push(m as never); return m.length === 1; };
    await t.call({ action: 'test' });
    await t.call({ action: 'send' });
    const s = await (await t.call(undefined, '?status=1')).json();
    console.log('after a failed batch:', JSON.stringify({ failed: s.failed, left: s.left }));
    expect(s.failed).toBe(3);
    expect(s.left).toBe(0);
  });
});

describe('POC (guarantee check)', () => {
  it('with network delay and 3 presses at once, nobody gets the email twice', async () => {
    const t = await setup(12, { perDay: 500, perRun: 5 });
    await t.call({ action: 'test' });
    const slow = (fn: (...a: never[]) => Promise<unknown>) => async (...a: never[]) => { await new Promise((r) => setTimeout(r, 5 + Math.random() * 10)); return fn(...a); };
    const st = t.store as unknown as Record<string, (...a: never[]) => Promise<unknown>>;
    for (const k of ['get', 'setJSON', 'list']) st[k] = slow(st[k].bind(t.store));
    await Promise.all([t.call({ action: 'send' }), t.call({ action: 'send' }), t.call({ action: 'send' })]);
    const to = t.batches.slice(1).flat().map((x) => x.to);
    console.log(`emails: ${to.length}, unique people: ${new Set(to).size}`);
    expect(new Set(to).size).toBe(to.length);
  });
});
