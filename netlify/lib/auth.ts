// PULSE accounts: who a person is, so their money follows them to any phone, browser or the app.
//
// A person signs in with Google, or with a 6-digit code sent to their email. Both lead to the same
// account when the email address is the same. There are no passwords.
//
// What an account holds is small: the email, a name, a member number (#1, #2, … in the order
// people joined) and the sync code their data is saved under. The data itself stays in the sync
// store (netlify/functions/sync.ts), filed under that code. Because the code is kept here, PULSE
// can hand a person's data to any device they sign in on. That is the trade the accounts make:
// easy recovery, and the server is able to open the data. The privacy page says so.
//
// Stored in the 'pulse-accounts' blob store:
//   mail/<sha256 of email>   -> { uid }                 finds the account for an email address
//   acct/<uid>               -> Account
//   sess/<sha256 of token>   -> { uid, at }             one signed-in device
//   otp/<sha256 of email>    -> a pending email code (its hash, expiry, tries, recent sends)
//   once/<sha256 of code>    -> a sign-in waiting to be picked up after a Google redirect (2 minutes)
//   n/<number>               -> { uid }                 a member number, claimed once, never reused
//   meta/count               -> { n }                   the highest number given out
//   rate/<kind>/<key>/<hour> -> { c }                   how many emails went out, per sender and in all
import { EMAIL, type Mail } from './emails';

export interface AuthStore {
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  setJSON(key: string, value: unknown, opts?: { onlyIfNew?: boolean }): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
}

export interface Account {
  uid: string;
  /** Member number. */
  n: number;
  email: string;
  name: string;
  created: string;
  /** The sync code this person's data is saved under. Set by the first device that signs in. */
  code?: string;
  /** Google's id for this person, when they have signed in with Google. */
  google?: string;
  /** Hashes of this account's sessions, newest last, so they can all be ended. */
  sess: string[];
}

export interface GoogleUser {
  sub: string;
  email: string;
  name: string;
}

export interface AuthCtx {
  store: AuthStore;
  /** Google sign-in is on when this is set (GOOGLE_CLIENT_ID in Netlify). */
  googleClientId: string;
  /** Checks a Google sign-in and says who it is, or null. */
  verifyGoogle(credential: string): Promise<GoogleUser | null>;
  /** Sends an email. Null when email sign-in is off (no verified sender yet). */
  sendMail: ((to: string, mail: Mail) => Promise<boolean>) | null;
  /** Builds the email that carries a code. */
  codeMail(code: string): Mail;
  now?: Date;
  /** The caller's address, to stop one sender asking for codes for many people. */
  ip?: string;
}

type Result = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): Result => ({ status, body: { ok: false, error } });

const SYNC_CODE = /^PULSE-(?:[0-9A-HJKMNP-TV-Z]{4}-){3}[0-9A-HJKMNP-TV-Z]{4}$/;
const TOKEN = /^[A-Za-z0-9_-]{40,64}$/;
const MAX_SESSIONS = 30;
const CODE_MINUTES = 10;
const CODE_TRIES = 6;
const SENDS_PER_HOUR = 5; // to one address
const SENDS_PER_HOUR_IP = 20; // from one sender
const SENDS_PER_DAY = 2000; // in all: a backstop so a flood can't use up the email allowance

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export async function sha256(s: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}
const get = <T>(store: AuthStore, key: string) => store.get(key, { type: 'json' }) as Promise<T | null>;
const clean = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const normEmail = (x: unknown) => clean(x, 160).toLowerCase();

/** What the app is told about an account. */
const pub = (a: Account) => ({ uid: a.uid, n: a.n, email: a.email, name: a.name, created: a.created, code: a.code ?? '' });

/** Give out the next member number. Each number can be claimed once, so two people joining together can't share one. */
async function nextNumber(store: AuthStore, uid: string): Promise<number> {
  let n = ((await get<{ n: number }>(store, 'meta/count'))?.n ?? 0) + 1;
  for (let i = 0; i < 200; i++, n++) {
    const res = (await store.setJSON(`n/${n}`, { uid }, { onlyIfNew: true })) as { modified?: boolean } | undefined;
    if (!res || res.modified !== false) break;
  }
  await store.setJSON('meta/count', { n });
  return n;
}

/** Find or make the account for a proven email address, and start a session on it. */
async function signIn(ctx: AuthCtx, who: { email: string; name: string; google?: string }): Promise<Result> {
  const { store } = ctx;
  const now = (ctx.now ?? new Date()).toISOString();
  const mailKey = `mail/${await sha256(who.email)}`;
  let acct: Account | null = null;
  let fresh = false;
  const hit = await get<{ uid: string }>(store, mailKey);
  if (hit) acct = await get<Account>(store, `acct/${hit.uid}`);
  if (!acct) {
    const uid = hit?.uid ?? hex(rand(16));
    if (!hit) {
      const res = (await store.setJSON(mailKey, { uid }, { onlyIfNew: true })) as { modified?: boolean } | undefined;
      // Two sign-ins for the same new address at the same moment: the other one made the account.
      if (res && res.modified === false) return signIn(ctx, who);
    }
    acct = { uid, n: await nextNumber(store, uid), email: who.email, name: who.name, created: now, sess: [] };
    fresh = true;
  }
  if (!acct.name && who.name) acct.name = who.name;
  if (who.google) acct.google = who.google;
  const token = b64url(rand(36));
  const th = await sha256(token);
  await store.setJSON(`sess/${th}`, { uid: acct.uid, at: now });
  const old = acct.sess.slice(0, Math.max(0, acct.sess.length + 1 - MAX_SESSIONS));
  await Promise.all(old.map((h) => store.delete(`sess/${h}`)));
  acct.sess = [...acct.sess.slice(old.length), th];
  await store.setJSON(`acct/${acct.uid}`, acct);
  return { status: 200, body: { ok: true, token, account: pub(acct), fresh } };
}

/** Count something against an hourly (or daily) limit. False when the limit is already reached. */
async function allow(store: AuthStore, kind: string, key: string, slot: string, max: number): Promise<boolean> {
  const k = `rate/${kind}/${key}/${slot}`;
  const c = (await get<{ c: number }>(store, k))?.c ?? 0;
  if (c >= max) return false;
  await store.setJSON(k, { c: c + 1 });
  return true;
}

interface Otp {
  h: string;
  exp: string;
  tries: number;
  last: string;
}

/** What the app needs to know before showing its sign-in buttons. */
export const authConfig = (ctx: Pick<AuthCtx, 'googleClientId' | 'sendMail'>) => ({ ok: true, google: ctx.googleClientId, email: !!ctx.sendMail });

export async function handleAuth(body: Record<string, unknown>, ctx: AuthCtx, bearer = ''): Promise<Result> {
  const { store } = ctx;
  const now = ctx.now ?? new Date();
  const action = body.action;

  if (action === 'config') return { status: 200, body: authConfig(ctx) };

  // ---- Google ----
  if (action === 'google') {
    if (!ctx.googleClientId) return fail(400, 'Google sign-in is not switched on.');
    const who = await ctx.verifyGoogle(String(body.credential ?? ''));
    if (!who) return fail(401, 'Google could not confirm that sign-in. Try again.');
    return signIn(ctx, { email: normEmail(who.email), name: clean(who.name, 40), google: who.sub });
  }

  // ---- Email: ask for a code ----
  if (action === 'email-start') {
    if (!ctx.sendMail) return fail(400, 'Email sign-in is not switched on.');
    const email = normEmail(body.email);
    if (!EMAIL.test(email)) return fail(400, 'That email address doesn’t look right.');
    const key = `otp/${await sha256(email)}`;
    const prev = await get<Otp>(store, key);
    if (prev && now.getTime() - new Date(prev.last).getTime() < 40_000) return fail(429, 'We just sent a code. Give it a minute, and check spam too.');
    const hour = now.toISOString().slice(0, 13);
    if (!(await allow(store, 'mail', await sha256(email), hour, SENDS_PER_HOUR))) return fail(429, 'Too many codes for this address. Try again in an hour.');
    if (ctx.ip && !(await allow(store, 'ip', await sha256(ctx.ip), hour, SENDS_PER_HOUR_IP))) return fail(429, 'Too many tries from here. Try again in an hour.');
    if (!(await allow(store, 'all', 'day', now.toISOString().slice(0, 10), SENDS_PER_DAY))) return fail(429, 'Email sign-in is busy right now. Use Google, or try again later.');
    const code = String(100000 + (new DataView(rand(4).buffer).getUint32(0) % 900000));
    await store.setJSON(key, { h: await sha256(`${code}:${email}`), exp: new Date(now.getTime() + CODE_MINUTES * 60_000).toISOString(), tries: 0, last: now.toISOString() } satisfies Otp);
    if (!(await ctx.sendMail(email, ctx.codeMail(code)))) {
      await store.delete(key);
      return fail(502, 'We couldn’t send the email. Check the address and try again.');
    }
    return { status: 200, body: { ok: true } };
  }

  // ---- Email: the code ----
  if (action === 'email-verify') {
    const email = normEmail(body.email);
    const code = String(body.code ?? '').replace(/\D/g, '');
    const key = `otp/${await sha256(email)}`;
    const otp = await get<Otp>(store, key);
    if (!otp || new Date(otp.exp) < now) {
      if (otp) await store.delete(key);
      return fail(400, 'That code has expired. Ask for a new one.');
    }
    if (otp.tries >= CODE_TRIES) {
      await store.delete(key);
      return fail(429, 'Too many wrong tries. Ask for a new code.');
    }
    if (code.length !== 6 || (await sha256(`${code}:${email}`)) !== otp.h) {
      await store.setJSON(key, { ...otp, tries: otp.tries + 1 });
      return fail(400, 'That code isn’t right. Check the email and try again.');
    }
    await store.delete(key);
    return signIn(ctx, { email, name: '' });
  }

  // ---- Picking up a sign-in after Google sent the person back to the app ----
  if (action === 'exchange') {
    const key = `once/${await sha256(String(body.once ?? ''))}`;
    const hit = await get<{ body: Record<string, unknown>; exp: string }>(store, key);
    if (hit) await store.delete(key);
    if (!hit || new Date(hit.exp) < now) return fail(400, 'That sign-in took too long. Try again.');
    return { status: 200, body: hit.body };
  }

  // ---- Everything below needs a signed-in session ----
  const token = bearer || String(body.token ?? '');
  if (!TOKEN.test(token)) return fail(401, 'signed out');
  const th = await sha256(token);
  const sess = await get<{ uid: string }>(store, `sess/${th}`);
  const acct = sess ? await get<Account>(store, `acct/${sess.uid}`) : null;
  if (!acct) return fail(401, 'signed out');

  if (action === 'me') return { status: 200, body: { ok: true, account: pub(acct) } };

  // The first device to sign in says which sync code the data is under; every later device is told it.
  if (action === 'code') {
    const code = String(body.code ?? '');
    if (!acct.code) {
      if (!SYNC_CODE.test(code)) return fail(400, 'bad code');
      acct.code = code;
      await store.setJSON(`acct/${acct.uid}`, acct);
    }
    return { status: 200, body: { ok: true, account: pub(acct) } };
  }

  if (action === 'name') {
    const name = clean(body.name, 40);
    if (name && name !== acct.name) {
      acct.name = name;
      await store.setJSON(`acct/${acct.uid}`, acct);
    }
    return { status: 200, body: { ok: true, account: pub(acct) } };
  }

  if (action === 'signout') {
    await store.delete(`sess/${th}`);
    acct.sess = acct.sess.filter((h) => h !== th);
    await store.setJSON(`acct/${acct.uid}`, acct);
    return { status: 200, body: { ok: true } };
  }

  // Delete the account: every session, the email lookup and the account itself. The member number is not given to anyone else.
  if (action === 'delete') {
    await Promise.all(acct.sess.map((h) => store.delete(`sess/${h}`)));
    await store.delete(`sess/${th}`);
    await store.delete(`mail/${await sha256(acct.email)}`);
    await store.delete(`acct/${acct.uid}`);
    return { status: 200, body: { ok: true } };
  }

  return fail(400, 'unknown action');
}

/**
 * Google sent the person back to PULSE with their sign-in (the full-page way, used inside the
 * installed app). Sign them in and keep the result for two minutes under a one-time code, which the
 * app collects with 'exchange'. Returns that code, or null.
 */
export async function googleReturn(credential: string, ctx: AuthCtx): Promise<string | null> {
  const res = await handleAuth({ action: 'google', credential }, ctx);
  if (res.status !== 200) return null;
  const once = b64url(rand(24));
  await ctx.store.setJSON(`once/${await sha256(once)}`, { body: res.body, exp: new Date((ctx.now ?? new Date()).getTime() + 120_000).toISOString() });
  return once;
}

// ---------------------------------------------------------------------------------------------
// Checking a Google sign-in
//
// Google gives the browser a signed note (a JWT) saying "this is so-and-so, for this app". We check
// Google's signature with Google's public keys, that it was made for PULSE, that it hasn't
// expired, and that Google has verified the email address.
// ---------------------------------------------------------------------------------------------
interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}
const fromB64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

export async function verifyGoogleJwt(credential: string, clientId: string, keys: (fresh?: boolean) => Promise<Jwk[]>, now = new Date()): Promise<GoogleUser | null> {
  try {
    const [h, p, sig] = credential.split('.');
    if (!h || !p || !sig || !clientId) return null;
    const head = JSON.parse(new TextDecoder().decode(fromB64Url(h))) as { alg?: string; kid?: string };
    if (head.alg !== 'RS256') return null;
    // Google changes its keys now and then: an unknown key id means "fetch them again", once.
    const jwk = (await keys()).find((k) => k.kid === head.kid) ?? (await keys(true)).find((k) => k.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64Url(sig), new TextEncoder().encode(`${h}.${p}`)))) return null;
    const c = JSON.parse(new TextDecoder().decode(fromB64Url(p))) as Record<string, unknown>;
    if (c.aud !== clientId) return null;
    if (c.iss !== 'accounts.google.com' && c.iss !== 'https://accounts.google.com') return null;
    if (typeof c.exp !== 'number' || c.exp * 1000 < now.getTime() - 60_000) return null;
    if (typeof c.email !== 'string' || !(c.email_verified === true || c.email_verified === 'true')) return null;
    if (typeof c.sub !== 'string' || !c.sub) return null;
    return { sub: c.sub, email: c.email, name: clean(c.given_name, 40) || clean(c.name, 40) };
  } catch {
    return null;
  }
}

let cached: { at: number; keys: Jwk[] } | null = null;
/** Google's public keys, fetched at most once an hour. */
export async function googleKeys(fresh = false, fetcher: typeof fetch = fetch): Promise<Jwk[]> {
  if (!fresh && cached && Date.now() - cached.at < 3_600_000) return cached.keys;
  const res = await fetcher('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) return cached?.keys ?? [];
  const keys = ((await res.json()) as { keys?: Jwk[] }).keys ?? [];
  cached = { at: Date.now(), keys };
  return keys;
}

// ---------------------------------------------------------------------------------------------
// For the private stats page: how many people have an account, and the latest to join.
// Email addresses are shown with the middle hidden: the page is behind one shared password, and a
// list of everyone's full address is more than it needs.
// ---------------------------------------------------------------------------------------------
export function maskEmail(email: string): string {
  const [name, domain = ''] = email.split('@');
  const keep = name.length <= 2 ? 1 : 2;
  return `${name.slice(0, keep)}${'•'.repeat(Math.max(3, Math.min(6, name.length - keep)))}@${domain}`;
}

export async function membersOverview(store: AuthStore, now = new Date()) {
  const total = (await store.list({ prefix: 'acct/' })).blobs.length;
  const highest = (await get<{ n: number }>(store, 'meta/count'))?.n ?? 0;
  // India's day, since that is where the people are.
  const ist = (d: Date | string) => new Date(new Date(d).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const today = ist(now);
  const days: Record<string, number> = {};
  for (let i = 0; i < 14; i++) days[ist(new Date(now.getTime() - i * 86_400_000))] = 0;
  const oldest = Object.keys(days).sort()[0];
  const latest: { n: number; email: string; name: string; at: string; google: boolean }[] = [];
  let google = 0;
  let counted = 0;
  // Walk back from the newest member number. Numbers of deleted accounts are skipped.
  for (let from = highest; from > 0 && from > highest - 600; from -= 25) {
    const ns = Array.from({ length: Math.min(25, from) }, (_, i) => from - i);
    const batch = await Promise.all(
      ns.map(async (n) => {
        const claim = await get<{ uid: string }>(store, `n/${n}`);
        const a = claim ? await get<Account>(store, `acct/${claim.uid}`) : null;
        return a && a.n === n ? a : null;
      }),
    );
    let stop = false;
    for (const a of batch) {
      if (!a) continue;
      const day = ist(a.created);
      if (day in days) days[day]++;
      counted++;
      if (a.google) google++;
      if (latest.length < 12) latest.push({ n: a.n, email: maskEmail(a.email), name: a.name.split(' ')[0], at: a.created, google: !!a.google });
      if (day < oldest && latest.length >= 12) stop = true;
    }
    if (stop) break;
  }
  const week = Object.entries(days).filter(([d]) => d > ist(new Date(now.getTime() - 7 * 86_400_000))).reduce((s, [, c]) => s + c, 0);
  return {
    ok: true,
    total,
    today: days[today] ?? 0,
    week,
    /** Member numbers given out so far; higher than `total` when accounts were deleted. */
    highest,
    /** Of the accounts looked at, how many have used Google (the rest signed in by email code only). */
    google,
    counted,
    days: Object.entries(days).sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, n]) => ({ day, n })),
    latest,
  };
}
