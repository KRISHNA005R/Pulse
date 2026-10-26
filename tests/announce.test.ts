import { describe, expect, it } from 'vitest';
import { announceEmail, CAMPAIGN, handleAnnounce, type AnnounceCtx } from '../netlify/lib/announce';
import { sha256 } from '../netlify/functions/stats';
import type { Mail } from '../netlify/lib/emails';
import { memStore } from './memstore';

const KEY = 'test-admin-key';
const SITE = 'https://pulsemoney.in';

type Sent = { to: string; mail: Mail & { headers?: Record<string, string> } };

async function setup(opts: { people?: [string, string][]; perRun?: number; perDay?: number; fail?: boolean; noEmail?: boolean } = {}) {
  const store = memStore();
  const people = opts.people ?? [
    ['Asha', 'asha@example.com'],
    ['Ravi', 'ravi@example.com'],
    ['Meera', 'meera@example.com'],
  ];
  people.forEach(([name, email], i) => {
    const uid = `u${i + 1}`;
    store.m.set(`n/${i + 1}`, { uid });
    store.m.set(`acct/${uid}`, { uid, n: i + 1, email, name, created: '2026-10-01T00:00:00Z', sess: [] });
  });
  store.m.set('meta/count', { n: people.length });
  const batches: Sent[][] = [];
  const ctx: AnnounceCtx = {
    store: store as unknown as AnnounceCtx['store'],
    send: opts.noEmail
      ? null
      : async (mails) => {
          batches.push(mails as Sent[]);
          return !opts.fail;
        },
    owner: 'owner@example.com',
    keyHash: await sha256(KEY),
    perRun: opts.perRun,
    perDay: opts.perDay,
    now: new Date('2026-10-24T08:00:00Z'),
  };
  const call = async (method: 'GET' | 'POST', query = '', body?: unknown, key: string | null = KEY) =>
    handleAnnounce(
      new Request(`${SITE}/api/announce${query}`, {
        method,
        headers: { 'content-type': 'application/json', ...(key ? { 'x-stats-key': key } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
      ctx,
    );
  const sentTo = () => batches.flat().map((x) => x.to);
  return { store, ctx, call, batches, sentTo };
}

describe('the announcement email', () => {
  const make = () => announceEmail('Asha', `${SITE}/api/announce?u=u1&t=abc`);

  it('talks about Bhisi and Gullak, with a plain link to each', () => {
    const mail = make();
    expect(mail.html).toContain('Hey Asha');
    expect(mail.html).toContain(`${SITE}/?tab=bhisi`);
    expect(mail.html).toContain(`${SITE}/?action=gullak`);
    expect(mail.text).toContain('Bhisi');
    expect(mail.text).toContain('Gullak');
  });

  it('is the designed PULSE email with a proper button for each feature', () => {
    const mail = make();
    expect(mail.html).toContain('/email/mark.png'); // PULSE header
    expect(mail.html).toMatch(/border-radius:999px[^>]*>\s*<a href="https:\/\/pulsemoney\.in\/\?tab=bhisi/); // button, not a text link
    expect(mail.html).toMatch(/>Start a bhisi</);
    expect(mail.html).toMatch(/>Start a gullak</);
  });

  // Gmail decides the tab. These keep the signals that push mail into Promotions as low as a designed email allows.
  it('keeps the subject plain: no emoji, no hype words', () => {
    const mail = make();
    expect(mail.subject).toBe('Two new things in PULSE');
    expect(mail.subject).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(mail.subject).not.toMatch(/dropped|free|offer|!/i);
  });

  it('asks people to move it to Primary if it lands in Promotions', () => {
    expect(make().text).toMatch(/Promotions.*Primary/);
  });

  it('asks people to reply, and signs off as a person', () => {
    const mail = make();
    expect(mail.text).toMatch(/reply/i);
    expect(mail.text).toMatch(/Krishna/);
    expect(mail.html).toMatch(/Krishna/);
  });

  it('has an unsubscribe link in both the HTML and the plain text', () => {
    const mail = make();
    expect(mail.html).toContain(`${SITE}/api/announce?u=u1&amp;t=abc`);
    expect(mail.text).toContain(`${SITE}/api/announce?u=u1&t=abc`);
  });

  it('escapes a name that has HTML in it', () => {
    const bad = announceEmail('<img src=x onerror=alert(1)>', `${SITE}/x`);
    expect(bad.html).not.toContain('<img src=x');
    expect(bad.html).toContain('Hey &lt;img'); // only the first word of a name is used
  });

  it('falls back to "there" with no name', () => {
    expect(announceEmail('', `${SITE}/x`).html).toContain('Hey there');
  });
});

describe('sending it', () => {
  it('refuses without the right key', async () => {
    const t = await setup();
    expect((await t.call('GET', '?status=1', undefined, null)).status).toBe(401);
    expect((await t.call('GET', '?status=1', undefined, 'wrong')).status).toBe(401);
    expect((await t.call('POST', '', { action: 'send' }, 'wrong')).status).toBe(401);
    expect(t.batches).toHaveLength(0);
  });

  it('shows who would get it', async () => {
    const t = await setup();
    const s = await (await t.call('GET', '?status=1')).json();
    expect(s).toMatchObject({ campaign: CAMPAIGN, total: 3, sent: 0, failed: 0, off: 0, left: 3, tested: false, emailOn: true });
  });

  it('will not send to everyone before a test copy went out', async () => {
    const t = await setup();
    const r = await t.call('POST', '', { action: 'send' });
    expect(r.status).toBe(409);
    expect(t.batches).toHaveLength(0);
  });

  it('sends the test only to the owner', async () => {
    const t = await setup();
    const r = await t.call('POST', '', { action: 'test' });
    expect(r.status).toBe(200);
    expect(t.sentTo()).toEqual(['owner@example.com']);
  });

  it('sends everyone exactly one email, each with their own unsubscribe link', async () => {
    const t = await setup();
    await t.call('POST', '', { action: 'test' });
    const r = await (await t.call('POST', '', { action: 'send' })).json();
    expect(r).toMatchObject({ sent: 3, failed: 0, left: 0 });
    const real = t.batches.slice(1).flat();
    expect(real.map((x) => x.to).sort()).toEqual(['asha@example.com', 'meera@example.com', 'ravi@example.com']);
    const links = real.map((x) => x.mail.text.match(/\/api\/announce\?u=[^\s]+/)?.[0]);
    expect(new Set(links).size).toBe(3);
    for (const x of real) expect(x.mail.headers?.['List-Unsubscribe']).toMatch(/^<https:\/\/pulsemoney\.in\/api\/announce\?u=/);

    // Pressing send again sends nobody.
    const again = await (await t.call('POST', '', { action: 'send' })).json();
    expect(again).toMatchObject({ sent: 0, left: 0 });
    expect(t.batches.slice(1).flat()).toHaveLength(3);
  });

  it('two sends at the same moment still email each person once', async () => {
    const t = await setup();
    await t.call('POST', '', { action: 'test' });
    await Promise.all([t.call('POST', '', { action: 'send' }), t.call('POST', '', { action: 'send' })]);
    const real = t.batches.slice(1).flat().map((x) => x.to);
    expect(real.sort()).toEqual(['asha@example.com', 'meera@example.com', 'ravi@example.com']);
  });

  it('sends in batches: a few per press', async () => {
    const t = await setup({ perRun: 2 });
    await t.call('POST', '', { action: 'test' });
    expect(await (await t.call('POST', '', { action: 'send' })).json()).toMatchObject({ sent: 2, left: 1 });
    expect(await (await t.call('POST', '', { action: 'send' })).json()).toMatchObject({ sent: 1, left: 0 });
  });

  it('stops at the daily limit (the test copy counts too)', async () => {
    const t = await setup({ perDay: 3 });
    await t.call('POST', '', { action: 'test' });
    expect(await (await t.call('POST', '', { action: 'send' })).json()).toMatchObject({ sent: 2, left: 1 });
    const r = await t.call('POST', '', { action: 'send' });
    expect(r.status).toBe(429);
    expect(t.batches.flat()).toHaveLength(3);
  });

  it('a failed batch is counted as failed and never sent twice', async () => {
    const t = await setup({ fail: true });
    t.ctx.send = async (mails) => {
      t.batches.push(mails as Sent[]);
      return mails.length === 1; // the test copy works, the real batch fails
    };
    await t.call('POST', '', { action: 'test' });
    expect(await (await t.call('POST', '', { action: 'send' })).json()).toMatchObject({ sent: 0, failed: 3, left: 0 });
    await t.call('POST', '', { action: 'send' });
    expect(t.batches.slice(1).flat()).toHaveLength(3);
  });

  it('skips people with no valid email and deleted accounts', async () => {
    const t = await setup({ people: [['Asha', 'asha@example.com'], ['Nope', 'not-an-email'], ['Gone', 'gone@example.com']] });
    t.store.m.delete('n/3'); // deleted account: its number is no longer claimed
    const s = await (await t.call('GET', '?status=1')).json();
    expect(s.total).toBe(1);
  });

  it('with only a sandbox sender, the test works but sending to everyone is refused (nobody gets marked failed)', async () => {
    const t = await setup();
    t.ctx.canBroadcast = false;
    expect((await t.call('POST', '', { action: 'test' })).status).toBe(200);
    const r = await t.call('POST', '', { action: 'send' });
    expect(r.status).toBe(503);
    const s = await (await t.call('GET', '?status=1')).json();
    expect(s).toMatchObject({ sent: 0, failed: 0, left: 3, canBroadcast: false });
  });

  it('says email is off when Resend is not set up', async () => {
    const t = await setup({ noEmail: true });
    expect((await (await t.call('GET', '?status=1')).json()).emailOn).toBe(false);
    expect((await t.call('POST', '', { action: 'test' })).status).toBe(503);
  });

  it('shows a preview of the email', async () => {
    const t = await setup();
    const r = await t.call('GET', '?preview=1');
    expect(r.headers.get('content-type')).toContain('text/html');
    expect(await r.text()).toContain('Bhisi');
  });
});

describe('unsubscribing', () => {
  async function linkFor(t: Awaited<ReturnType<typeof setup>>, to: string) {
    await t.call('POST', '', { action: 'test' });
    t.ctx.perRun = 100;
    await t.call('POST', '', { action: 'send' });
    const x = t.batches.flat().find((b) => b.to === to)!;
    return new URL(x.mail.text.match(/https:\/\/pulsemoney\.in\/api\/announce\?u=[^\s]+/)![0]);
  }

  it('the link works without the admin key, and that person is skipped from then on', async () => {
    const t = await setup();
    const url = await linkFor(t, 'ravi@example.com');
    const r = await t.call('GET', url.search, undefined, null);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('unsubscribed');
    const s = await (await t.call('GET', '?status=1')).json();
    expect(s.off).toBe(1);
  });

  it('one-click unsubscribe (POST) works too', async () => {
    const t = await setup();
    const url = await linkFor(t, 'asha@example.com');
    expect((await t.call('POST', url.search, undefined, null)).status).toBe(200);
    expect((await (await t.call('GET', '?status=1')).json()).off).toBe(1);
  });

  it('a made-up or swapped link does nothing', async () => {
    const t = await setup();
    const url = await linkFor(t, 'asha@example.com');
    const token = url.searchParams.get('t')!;
    expect((await t.call('GET', `?u=u1&t=${'0'.repeat(token.length)}`, undefined, null)).status).toBe(400);
    expect((await t.call('GET', `?u=u2&t=${token}`, undefined, null)).status).toBe(400); // Asha's token on Ravi
    expect((await (await t.call('GET', '?status=1')).json()).off).toBe(0);
  });

  it('someone who unsubscribed is skipped in later batches', async () => {
    const t = await setup({ perRun: 1 });
    await t.call('POST', '', { action: 'test' });
    await t.call('POST', '', { action: 'send' }); // Asha (u1) gets hers
    const asha = new URL(t.batches[1][0].mail.text.match(/https:\/\/pulsemoney\.in\/api\/announce\?u=[^\s]+/)![0]);
    expect(asha.searchParams.get('u')).toBe('u1');
    t.store.m.set('news/off/u2', { at: '2026-10-24T08:00:00Z' }); // Ravi unsubscribed (as the link does)
    t.ctx.perRun = 10;
    await t.call('POST', '', { action: 'send' });
    expect(t.sentTo()).not.toContain('ravi@example.com');
    expect(t.sentTo()).toContain('meera@example.com');
  });
});

// Regression tests for the problems found in the security review (SEC-A … SEC-G).
describe('fixed problems stay fixed', () => {
  const slow = (store: Record<string, unknown>) => {
    const st = store as Record<string, (...a: never[]) => Promise<unknown>>;
    for (const k of ['get', 'setJSON', 'list', 'delete']) {
      const fn = st[k].bind(store);
      st[k] = async (...a: never[]) => {
        await new Promise((r) => setTimeout(r, 3 + Math.random() * 8));
        return fn(...a);
      };
    }
  };

  it('SEC-A: two presses at the same moment never go past the daily cap', async () => {
    const people: [string, string][] = Array.from({ length: 10 }, (_, i) => [`P${i}`, `p${i}@example.com`]);
    for (let run = 0; run < 3; run++) {
      const t = await setup({ people, perDay: 4, perRun: 3 });
      await t.call('POST', '', { action: 'test' }); // 1 of 4 used
      slow(t.store as unknown as Record<string, unknown>);
      await Promise.all([t.call('POST', '', { action: 'send' }), t.call('POST', '', { action: 'send' })]);
      const real = t.batches.slice(1).flat().map((x) => x.to);
      expect(real.length).toBeLessThanOrEqual(3);
      expect(new Set(real).size).toBe(real.length);
      // Nobody who didn't get it is stuck as "sent": they're still waiting.
      const s = await (await t.call('GET', '?status=1')).json();
      expect(s.sent + s.left).toBe(10);
    }
  });

  it('SEC-B: a batch never has more than 100 emails (Resend’s limit), whatever ANNOUNCE_PER_RUN says', async () => {
    const people: [string, string][] = Array.from({ length: 150 }, (_, i) => [`P${i}`, `p${i}@example.com`]);
    const t = await setup({ people, perRun: 150, perDay: 500 });
    t.ctx.send = async (mails) => {
      t.batches.push(mails as Sent[]);
      return mails.length <= 100;
    };
    await t.call('POST', '', { action: 'test' });
    const r = await (await t.call('POST', '', { action: 'send' })).json();
    expect(r).toMatchObject({ sent: 100, failed: 0, left: 50 });
    expect(Math.max(...t.batches.map((b) => b.length))).toBeLessThanOrEqual(100);
  });

  it('SEC-C: the unsubscribe link in the test copy works, even when the owner has no PULSE account', async () => {
    const t = await setup();
    await t.call('POST', '', { action: 'test' });
    const link = t.batches[0][0].mail.text.match(/https:\/\/pulsemoney\.in\/api\/announce\?u=[^\s]+/)![0];
    const r = await handleAnnounce(new Request(link), t.ctx);
    expect(r.status).toBe(200);
  });

  it('SEC-D: a failed batch can be retried from the page, and then goes out', async () => {
    const t = await setup();
    let ok = false;
    t.ctx.send = async (mails) => {
      t.batches.push(mails as Sent[]);
      return mails.length === 1 || ok;
    };
    await t.call('POST', '', { action: 'test' });
    await t.call('POST', '', { action: 'send' });
    expect(await (await t.call('GET', '?status=1')).json()).toMatchObject({ failed: 3, left: 0 });
    const r = await (await t.call('POST', '', { action: 'retry' })).json();
    expect(r).toMatchObject({ failed: 0, left: 3 });
    ok = true;
    expect(await (await t.call('POST', '', { action: 'send' })).json()).toMatchObject({ sent: 3, failed: 0, left: 0 });
  });

  it('SEC-D: retry needs the password', async () => {
    const t = await setup();
    expect((await t.call('POST', '', { action: 'retry' }, null)).status).toBe(401);
  });

  it('SEC-G: nobody is silently left out above 5,000 accounts', async () => {
    const people: [string, string][] = Array.from({ length: 5003 }, (_, i) => [`P${i}`, `p${i}@example.com`]);
    const t = await setup({ people });
    expect((await (await t.call('GET', '?status=1')).json()).total).toBe(5003);
  });
});

describe('announcement email picture', () => {
  it('has the two-friends picture at the top: a PNG on pulsemoney.in, sized, decorative', async () => {
    const { announceEmail } = await import('../netlify/lib/emails');
    const m = announceEmail('Krishna', 'https://pulsemoney.in/unsub');
    const img = m.html.match(/<img[^>]*email\/hero\.png[^>]*>/)?.[0] ?? '';
    expect(img).toContain('src="https://pulsemoney.in/email/hero.png"');
    expect(img).toContain('alt=""');
    expect(img).toMatch(/width="\d+"/);
    expect(m.html.indexOf('email/hero.png')).toBeLessThan(m.html.indexOf('Two new ways to save'));
  });
});
