// Announcement emails to everyone with a PULSE account (first one: Bhisi and Gullak).
//
// Used from the private stats page (/stats/announce/), with the stats key:
//   GET  /api/announce?status=1        -> who would get it, how many went out, today's count
//   GET  /api/announce?preview=1       -> the email as a web page
//   POST /api/announce { action: 'test' }  -> one copy to the owner (FEEDBACK_TO)
//   POST /api/announce { action: 'send' }  -> the next batch (refused until a test copy went out)
// And for everyone, no key:
//   GET or POST /api/announce?u=<uid>&t=<token>  -> unsubscribe (POST is Gmail's one-click)
//
// Rules: each person is claimed before their email goes out, so nobody gets it twice, even when
// "send" is pressed twice at once. A failed batch is marked failed, never resent. A daily cap keeps
// PULSE inside Resend's daily limit (login codes need room too).
//
// Stored in the 'pulse-accounts' store, next to the accounts:
//   news/secret                  -> { k }   signs unsubscribe links (made once)
//   news/off/<uid>               -> { at }  unsubscribed from announcements
//   news/<campaign>/test         -> { at }  a test copy went to the owner
//   news/<campaign>/claim/<uid>  -> { at }  this person's email went out (or was tried)
//   news/<campaign>/fail/<uid>   -> { at }  ...and the batch failed
//   news/day/<YYYY-MM-DD>        -> { c }   announcement emails sent that India day
import type { Account, AuthStore } from './auth';
import { EMAIL, SITE, announceEmail, esc, type Mail } from './emails';

export { announceEmail };
export const CAMPAIGN = 'bhisi-gullak-2026-10';
const PER_RUN = 80;
const PER_DAY = 90;
const MAX_MEMBERS = 5000;

export interface AnnounceCtx {
  store: AuthStore;
  /** Sends many emails in one go (Resend's batch API). Null when email isn't set up. */
  send: ((mails: { to: string; mail: Mail }[]) => Promise<boolean>) | null;
  /** Where the test copy goes: the owner's own address. */
  owner: string;
  /** SHA-256 of the stats key. */
  keyHash: string;
  /** Shown on the stats page: who the emails come from. */
  from?: string;
  /** False when the sender is Resend's sandbox address, which only delivers to the owner. */
  canBroadcast?: boolean;
  perRun?: number;
  perDay?: number;
  now?: Date;
}

type Person = { uid: string; email: string; name: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const page = (title: string, line: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>` +
      `<body style="margin:0;background:#F6F5F2;color:#17140F;font-family:-apple-system,'Segoe UI',Roboto,sans-serif"><div style="max-width:420px;margin:18vh auto 0;padding:0 20px;text-align:center">` +
      `<div style="font-weight:800;font-size:24px;letter-spacing:-0.5px">PULSE<span style="color:#EC5B2B">.</span></div><h1 style="font-size:22px;margin:22px 0 8px">${esc(title)}</h1><p style="color:#57524A;line-height:1.5">${esc(line)}</p>` +
      `<p><a href="${SITE}" style="color:#17140F;font-weight:700">Open PULSE</a></p></div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const get = <T>(store: AuthStore, key: string) => store.get(key, { type: 'json' }) as Promise<T | null>;
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

async function secret(store: AuthStore): Promise<string> {
  const have = await get<{ k: string }>(store, 'news/secret');
  if (have?.k) return have.k;
  const k = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  await store.setJSON('news/secret', { k }, { onlyIfNew: true });
  return (await get<{ k: string }>(store, 'news/secret'))!.k;
}

async function token(store: AuthStore, uid: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(await secret(store)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`unsub:${uid}`))).slice(0, 32);
}

const unsubUrl = async (store: AuthStore, uid: string) => `${SITE}/api/announce?u=${encodeURIComponent(uid)}&t=${await token(store, uid)}`;

/** Everyone with a live account and a real email address, in member order. */
async function people(store: AuthStore): Promise<Person[]> {
  const highest = Math.min((await get<{ n: number }>(store, 'meta/count'))?.n ?? 0, MAX_MEMBERS);
  const out: Person[] = [];
  for (let i = 1; i <= highest; i += 25) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(25, highest - i + 1) }, async (_, j) => {
        const n = i + j;
        const claim = await get<{ uid: string }>(store, `n/${n}`);
        const a = claim ? await get<Account>(store, `acct/${claim.uid}`) : null;
        return a && a.n === n && EMAIL.test(a.email ?? '') ? { uid: a.uid, email: a.email, name: a.name ?? '' } : null;
      }),
    );
    for (const p of batch) if (p) out.push(p);
  }
  return out;
}

const keys = async (store: AuthStore, prefix: string) => new Set((await store.list({ prefix })).blobs.map((b) => b.key.slice(prefix.length)));

async function overview(ctx: AnnounceCtx, campaign = CAMPAIGN) {
  const { store } = ctx;
  const all = await people(store);
  const [off, claimed, failed] = await Promise.all([keys(store, 'news/off/'), keys(store, `news/${campaign}/claim/`), keys(store, `news/${campaign}/fail/`)]);
  const today = istDay(ctx.now ?? new Date());
  const used = (await get<{ c: number }>(store, `news/day/${today}`))?.c ?? 0;
  const pending = all.filter((p) => !off.has(p.uid) && !claimed.has(p.uid));
  return {
    all,
    pending,
    used,
    today,
    body: {
      campaign,
      subject: announceEmail('', '').subject,
      total: all.length,
      sent: [...claimed].filter((u) => !failed.has(u)).length,
      failed: failed.size,
      off: all.filter((p) => off.has(p.uid)).length,
      left: pending.length,
      tested: !!(await get(store, `news/${campaign}/test`)),
      emailOn: !!ctx.send,
      canBroadcast: ctx.canBroadcast !== false,
      from: ctx.from ?? '',
      perRun: ctx.perRun ?? PER_RUN,
      perDay: ctx.perDay ?? PER_DAY,
      sentToday: used,
    },
  };
}

async function countToday(store: AuthStore, day: string, n: number) {
  const k = `news/day/${day}`;
  const c = (await get<{ c: number }>(store, k))?.c ?? 0;
  await store.setJSON(k, { c: c + n });
}

function withHeaders(mail: Mail, link: string, owner: string): Mail {
  return { ...mail, replyTo: owner || undefined, headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

async function trySend(ctx: AnnounceCtx, mails: { to: string; mail: Mail }[]) {
  try {
    return await ctx.send!(mails);
  } catch (e) {
    console.error('announce send error', e);
    return false;
  }
}

export async function handleAnnounce(req: Request, ctx: AnnounceCtx): Promise<Response> {
  const url = new URL(req.url);
  const { store } = ctx;

  // --- Unsubscribe: anyone with a signed link, no key ---
  if (url.searchParams.has('u')) {
    const uid = url.searchParams.get('u') ?? '';
    const t = url.searchParams.get('t') ?? '';
    if (!/^[\w-]{1,64}$/.test(uid) || !/^[0-9a-f]{32}$/.test(t) || !same(t, await token(store, uid))) return page('This link doesn’t work', 'It may be cut off. Try the link from the email again.', 400);
    await store.setJSON(`news/off/${uid}`, { at: (ctx.now ?? new Date()).toISOString() });
    return req.method === 'POST' ? json({ ok: true }) : page('You’re unsubscribed', 'You won’t get announcement emails from PULSE any more. Login codes still work as usual.');
  }

  // --- Everything else is for the owner only ---
  const key = req.headers.get('x-stats-key') ?? '';
  if (!key || !same(await sha256(key), ctx.keyHash)) return json({ error: 'wrong key' }, 401);

  if (req.method === 'GET') {
    if (url.searchParams.has('status')) return json((await overview(ctx)).body);
    if (url.searchParams.has('preview')) {
      const html = announceEmail('Krishna', `${SITE}/api/announce?u=preview&t=preview`).html;
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return json({ error: 'bad request' }, 400);
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;
  if (action !== 'test' && action !== 'send') return json({ error: 'bad request' }, 400);
  if (!ctx.send) return json({ error: 'Email is off: RESEND_API_KEY and a sender (AUTH_FROM or FEEDBACK_FROM) are needed in Netlify.' }, 503);

  const o = await overview(ctx);
  const perDay = ctx.perDay ?? PER_DAY;
  const room = perDay - o.used;
  if (room <= 0) return json({ ...o.body, error: `Today’s limit of ${perDay} announcement emails is reached. Press again tomorrow.` }, 429);

  if (action === 'test') {
    if (!EMAIL.test(ctx.owner)) return json({ error: 'FEEDBACK_TO is not a valid email address.' }, 400);
    const me = o.all.find((p) => p.email.toLowerCase() === ctx.owner.toLowerCase());
    const link = me ? await unsubUrl(store, me.uid) : `${SITE}/api/announce?u=test&t=test`;
    await countToday(store, o.today, 1);
    const ok = await trySend(ctx, [{ to: ctx.owner, mail: withHeaders(announceEmail(me?.name ?? 'Krishna', link), link, '') }]);
    if (!ok) return json({ ok: false, error: 'Resend did not accept the test email. Check the Netlify function log.' }, 502);
    await store.setJSON(`news/${CAMPAIGN}/test`, { at: (ctx.now ?? new Date()).toISOString() });
    return json({ ok: true, to: ctx.owner });
  }

  // action === 'send'
  if (ctx.canBroadcast === false) return json({ error: 'The sender is Resend’s test address, which only delivers to you. Verify pulsemoney.in in Resend and set AUTH_FROM (e.g. PULSE <hello@pulsemoney.in>) in Netlify first.' }, 503);
  if (!o.body.tested) return json({ error: 'Send yourself the test copy first, and check it in your inbox.' }, 409);
  const take = Math.min(ctx.perRun ?? PER_RUN, room);
  const at = (ctx.now ?? new Date()).toISOString();
  const batch: Person[] = [];
  for (const p of o.pending) {
    if (batch.length >= take) break;
    const res = (await store.setJSON(`news/${CAMPAIGN}/claim/${p.uid}`, { at }, { onlyIfNew: true })) as { modified?: boolean } | undefined;
    if (res?.modified !== false) batch.push(p); // claimed by this press; skipped when another press got there first
  }
  if (!batch.length) {
    const now = await overview(ctx);
    return json({ ...now.body, sent: 0, failed: 0 });
  }
  await countToday(store, o.today, batch.length);
  const mails = await Promise.all(
    batch.map(async (p) => {
      const link = await unsubUrl(store, p.uid);
      return { to: p.email, mail: withHeaders(announceEmail(p.name, link), link, ctx.owner) };
    }),
  );
  const ok = await trySend(ctx, mails);
  if (!ok) await Promise.all(batch.map((p) => store.setJSON(`news/${CAMPAIGN}/fail/${p.uid}`, { at })));
  const after = await overview(ctx);
  return json({ ...after.body, ok, sent: ok ? batch.length : 0, failed: ok ? 0 : batch.length, totalSent: after.body.sent, totalFailed: after.body.failed }, ok ? 200 : 502);
}
