// Friends on PULSE: who someone is (a unique @username on their account) and who their friends are.
//
// Everyone signed in has a profile with a username made from their name ("krishna.kharcha"), which
// they can change to any free one. Friends are made with a request the other person accepts. The
// server knows who is friends with whom (that's what makes requests, blocking and finding someone by
// username work); it never sees money: splits between friends travel in channels locked with a key
// only their two phones can work out (each profile carries a public key for that).
//
// Stored in the 'pulse-accounts' store, next to the accounts:
//   pf/<uid>          a profile: { uid, u (username), name, face?, pub?, renames[] }
//   un/<username>     who has a username: { uid } — or, for 14 days after someone changes theirs, { uid, hold }
//   rel/<uid>|<uid>   one record per pair of people (the smaller uid first): request, friends, blocks
//   ln/<uid>/<other>  a pointer so each side can list their own pairs
//   rep/<id>          a report about someone, for the PULSE team
//
// Every change to a pair is a compare-and-swap on its one record, so two taps, two phones or both
// people acting at once can't make duplicates or a half-done state.
import { accountFor, allow, type Account } from './auth';
import { canon, ideas, problem } from './username';

export interface PeopleStore {
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  getWithMetadata(key: string, opts: { type: 'json' }): Promise<{ data: unknown; etag?: string } | null>;
  setJSON(key: string, value: unknown, opts?: { onlyIfNew?: boolean; onlyIfMatch?: string }): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
}

export interface Profile {
  uid: string;
  u: string;
  name: string;
  face?: string;
  /** Public key (ECDH P-256, JWK) friends use to lock the channel between them. */
  pub?: string;
  /** When the username was changed, newest last (at most 2 in 14 days). */
  renames: string[];
  created: string;
}
interface Name {
  uid: string;
  /** The previous owner keeps it until then (they just changed theirs). */
  hold?: string;
}
export interface Rel {
  /** The two people, smaller uid first. */
  a: string;
  b: string;
  /** none, a request from `by`, or friends. */
  s: 'none' | 'pending' | 'friends';
  by?: string;
  /** Who blocked whom. While anyone has, nothing else happens between them. */
  blk?: string[];
  at: string;
  since?: string;
}

type Result = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): Result => ({ status, body: { ok: false, error } });
const ok = (body: Record<string, unknown> = {}): Result => ({ status: 200, body: { ok: true, ...body } });

const HOLD_DAYS = 14;
const RENAMES_PER_14_DAYS = 2;
const REQUESTS_PER_DAY = 30;
const FINDS_PER_HOUR = 60;
const MAX_PUB = 400;
const UID = /^[0-9a-f]{8,64}$/i;

const pairKey = (x: string, y: string) => (x < y ? `rel/${x}|${y}` : `rel/${y}|${x}`);
const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000).toISOString();

async function get<T>(store: PeopleStore, key: string): Promise<T | null> {
  return ((await store.get(key, { type: 'json' })) as T | null) ?? null;
}

/** Change one record safely: read, change, write only if nobody else wrote in between (else retry). */
async function update<T>(store: PeopleStore, key: string, fn: (cur: T | null) => T | null): Promise<T | null | undefined> {
  for (let i = 0; i < 8; i++) {
    const got = (await store.getWithMetadata(key, { type: 'json' })) as { data: T; etag?: string } | null;
    const next = fn(got ? structuredClone(got.data) : null);
    if (next === null) return got?.data ?? null;
    const res = (await store.setJSON(key, next, !got ? { onlyIfNew: true } : got.etag ? { onlyIfMatch: got.etag } : undefined)) as { modified?: boolean } | undefined;
    if (!res || res.modified !== false) return next;
  }
  return undefined; // too busy
}

/** Take a username for someone if it's free (or theirs, or its hold is over). True if they have it now. */
async function takeName(store: PeopleStore, u: string, uid: string, now: Date): Promise<boolean> {
  const out = await update<Name>(store, `un/${u}`, (cur) => {
    if (cur && cur.uid === uid) return cur.hold ? { uid } : null;
    if (cur && !(cur.hold && cur.hold < now.toISOString())) return null; // someone else's
    return { uid };
  });
  return !!out && out.uid === uid;
}

/** The profile for an account, made (with a fun username from their name) the first time. */
async function ensureProfile(store: PeopleStore, acct: Account, now: Date): Promise<Profile | null> {
  const have = await get<Profile>(store, `pf/${acct.uid}`);
  if (have) {
    // Name and photo follow the account.
    if (have.name !== acct.name || have.face !== acct.face) {
      const next = { ...have, name: acct.name, ...(acct.face ? { face: acct.face } : {}) };
      if (!acct.face) delete next.face;
      await store.setJSON(`pf/${acct.uid}`, next);
      return next;
    }
    return have;
  }
  const tries = [...ideas(acct.name, acct.uid, 12), ...ideas(acct.name, `${acct.uid}:more`, 12)];
  let u = '';
  for (const t of tries) if (await takeName(store, t, acct.uid, now)) {
    u = t;
    break;
  }
  if (!u) {
    // Every idea taken (a very common name): the name plus a few random letters.
    for (let i = 0; i < 10 && !u; i++) {
      const t = `${tries[0].split(/[._]/)[0].slice(0, 11)}.${Math.random().toString(36).slice(2, 7)}`;
      if (!problem(t) && (await takeName(store, t, acct.uid, now))) u = t;
    }
  }
  if (!u) return null;
  const pf: Profile = { uid: acct.uid, u, name: acct.name, ...(acct.face ? { face: acct.face } : {}), renames: [], created: now.toISOString() };
  // Two first visits at once: whoever writes first wins, and the other's username is given back.
  const res = (await store.setJSON(`pf/${acct.uid}`, pf, { onlyIfNew: true })) as { modified?: boolean } | undefined;
  if (res && res.modified === false) {
    await store.delete(`un/${u}`);
    return get<Profile>(store, `pf/${acct.uid}`);
  }
  return pf;
}

/** What other people see of someone. */
const card = (p: Profile) => ({ uid: p.uid, u: p.u, name: p.name, ...(p.face ? { face: p.face } : {}), ...(p.pub ? { pub: p.pub } : {}) });

/** Where a pair stands, from one side's point of view. */
function standing(r: Rel | null, me: string): 'none' | 'sent' | 'received' | 'friends' | 'blocked' {
  if (!r) return 'none';
  if (r.blk?.includes(me)) return 'blocked';
  if (r.blk?.length) return 'none'; // they blocked me: look like nothing
  if (r.s === 'friends') return 'friends';
  if (r.s === 'pending') return r.by === me ? 'sent' : 'received';
  return 'none';
}

async function point(store: PeopleStore, r: Rel) {
  const live = r.s !== 'none' || (r.blk?.length ?? 0) > 0;
  for (const [x, y] of [
    [r.a, r.b],
    [r.b, r.a],
  ]) {
    if (live) await store.setJSON(`ln/${x}/${y}`, {});
    else await store.delete(`ln/${x}/${y}`);
  }
}

export async function handlePeople(body: Record<string, unknown>, store: PeopleStore, bearer: string, now = new Date()): Promise<Result> {
  const acct = await accountFor(store as never, bearer);
  if (!acct) return fail(401, 'Sign in to use friends.');
  const action = String(body.action ?? '');
  const me = await ensureProfile(store, acct, now);
  if (!me) return fail(503, 'Busy. Try again in a moment.');

  if (action === 'me') {
    // The app sends its public key once; it's what friends use to lock the channel between them.
    const pub = typeof body.pub === 'string' && body.pub.length <= MAX_PUB ? body.pub : '';
    if (pub && pub !== me.pub) {
      me.pub = pub;
      await store.setJSON(`pf/${me.uid}`, me);
    }
    return ok({ me: { ...card(me), renamesLeft: renamesLeft(me, now) } });
  }

  if (action === 'check' || action === 'rename') {
    const u = canon(String(body.u ?? ''));
    const why = problem(u);
    if (why) return action === 'check' ? ok({ u, free: false, why }) : fail(400, why);
    if (u === me.u) return ok({ u, free: true, mine: true, ...(action === 'rename' ? { me: card(me) } : {}) });
    const cur = await get<Name>(store, `un/${u}`);
    const free = !cur || cur.uid === me.uid || !!(cur.hold && cur.hold < now.toISOString());
    if (action === 'check') return ok({ u, free, ...(free ? {} : { why: 'That one’s taken.', ideas: await freeIdeas(store, me, now) }) });
    if (renamesLeft(me, now) <= 0) return fail(429, 'You can change it twice in 14 days. Try again later.');
    if (!free || !(await takeName(store, u, me.uid, now))) return fail(409, 'That one’s taken.');
    // The old name stays yours for 14 days, in case you want it back; then anyone can take it.
    const old = me.u;
    await store.setJSON(`un/${old}`, { uid: me.uid, hold: addDays(now, HOLD_DAYS) } satisfies Name);
    const next: Profile = { ...me, u, renames: [...me.renames.filter((t) => t > addDays(now, -HOLD_DAYS)), now.toISOString()] };
    await store.setJSON(`pf/${me.uid}`, next);
    return ok({ me: { ...card(next), renamesLeft: renamesLeft(next, now) } });
  }

  if (action === 'ideas') return ok({ ideas: await freeIdeas(store, me, now) });

  if (action === 'find') {
    if (!(await allow(store as never, 'find', me.uid, now.toISOString().slice(0, 13), FINDS_PER_HOUR))) return fail(429, 'Too many searches. Try again in a bit.');
    const u = canon(String(body.u ?? ''));
    if (problem(u)) return ok({ found: null });
    const name = await get<Name>(store, `un/${u}`);
    // A name being held for someone who changed theirs doesn't find them.
    if (!name || name.hold) return ok({ found: null });
    const pf = await get<Profile>(store, `pf/${name.uid}`);
    if (!pf || pf.u !== u) return ok({ found: null });
    const r = await get<Rel>(store, pairKey(me.uid, pf.uid));
    // Someone who blocked me can't be found by me.
    if (r?.blk?.includes(pf.uid)) return ok({ found: null });
    return ok({ found: { ...card(pf), me: pf.uid === me.uid, standing: standing(r, me.uid) } });
  }

  if (action === 'list') {
    const keys = (await store.list({ prefix: `ln/${me.uid}/` })).blobs.map((b) => b.key.slice(`ln/${me.uid}/`.length)).filter((x) => UID.test(x));
    type Row = ReturnType<typeof card> & { since?: string; at: string };
    const out: Record<'friends' | 'received' | 'sent' | 'blocked', Row[]> = { friends: [], received: [], sent: [], blocked: [] };
    await Promise.all(
      keys.map(async (other) => {
        const [r, pf] = await Promise.all([get<Rel>(store, pairKey(me.uid, other)), get<Profile>(store, `pf/${other}`)]);
        if (!r || !pf) return;
        const st = standing(r, me.uid);
        if (st === 'none') return;
        out[st].push({ ...card(pf), at: r.at, ...(r.since ? { since: r.since } : {}) });
      }),
    );
    for (const k of Object.keys(out) as (keyof typeof out)[]) out[k].sort((x, y) => x.u.localeCompare(y.u));
    return ok(out);
  }

  // ---- Everything below is about one other person ----
  const other = String(body.uid ?? '');
  if (!UID.test(other) || other === me.uid) return fail(400, 'bad person');
  const them = await get<Profile>(store, `pf/${other}`);
  if (!them) return fail(404, 'That person isn’t on PULSE any more.');
  const key = pairKey(me.uid, other);
  const [a, b] = me.uid < other ? [me.uid, other] : [other, me.uid];
  const blank = (): Rel => ({ a, b, s: 'none', at: now.toISOString() });
  const done = async (r: Rel | null | undefined) => {
    if (r === undefined) return fail(503, 'Busy. Try again in a moment.');
    if (r) await point(store, r);
    return ok({ standing: standing(r, me.uid), person: card(them) });
  };

  if (action === 'request') {
    const before = await get<Rel>(store, key);
    // To someone who blocked me: looks sent, does nothing (so a block can't be detected).
    if (before?.blk?.includes(other)) return ok({ standing: 'sent', person: card(them) });
    if (before?.blk?.includes(me.uid)) return fail(409, 'You’ve blocked them. Unblock first.');
    const noop = before && (before.s === 'friends' || (before.s === 'pending' && before.by === me.uid));
    const answer = before?.s === 'pending' && before.by === other;
    if (!noop && !answer && !(await allow(store as never, 'freq', me.uid, day(now), REQUESTS_PER_DAY))) return fail(429, 'That’s a lot of requests today. Try again tomorrow.');
    return done(
      await update<Rel>(store, key, (cur) => {
        const r = cur ?? blank();
        if (r.blk?.length) return null;
        if (r.s === 'friends' || (r.s === 'pending' && r.by === me.uid)) return null; // already: nothing to do
        // They asked me too: that's a yes from both.
        if (r.s === 'pending' && r.by === other) return { ...r, s: 'friends', by: undefined, since: now.toISOString(), at: now.toISOString() };
        return { ...r, s: 'pending', by: me.uid, at: now.toISOString() };
      }),
    );
  }
  if (action === 'accept')
    return done(
      await update<Rel>(store, key, (cur) => {
        if (!cur || cur.blk?.length || cur.s === 'friends') return null;
        if (cur.s !== 'pending' || cur.by !== other) return null;
        return { ...cur, s: 'friends', by: undefined, since: now.toISOString(), at: now.toISOString() };
      }),
    );
  if (action === 'decline' || action === 'cancel' || action === 'remove')
    return done(
      await update<Rel>(store, key, (cur) => {
        if (!cur || cur.s === 'none') return null;
        if (action === 'decline' && !(cur.s === 'pending' && cur.by === other)) return null;
        if (action === 'cancel' && !(cur.s === 'pending' && cur.by === me.uid)) return null;
        if (action === 'remove' && cur.s !== 'friends') return null;
        return { ...cur, s: 'none', by: undefined, since: undefined, at: now.toISOString() };
      }),
    );
  if (action === 'block' || action === 'unblock')
    return done(
      await update<Rel>(store, key, (cur) => {
        const r = cur ?? blank();
        const blk = new Set(r.blk ?? []);
        if (action === 'block') {
          if (blk.has(me.uid)) return null;
          blk.add(me.uid);
          // A block ends everything between them.
          return { ...r, s: 'none', by: undefined, since: undefined, blk: [...blk], at: now.toISOString() };
        }
        if (!blk.delete(me.uid)) return null;
        return { ...r, blk: [...blk], at: now.toISOString() };
      }),
    );
  if (action === 'report') {
    const reason = String(body.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!(await allow(store as never, 'report', me.uid, day(now), 10))) return fail(429, 'Thanks, we’ve got your reports for today.');
    await store.setJSON(`rep/${now.getTime()}-${me.uid.slice(0, 6)}`, { by: me.uid, about: other, u: them.u, reason, at: now.toISOString() });
    return ok();
  }
  return fail(400, 'unknown action');
}

function renamesLeft(p: Profile, now: Date) {
  return Math.max(0, RENAMES_PER_14_DAYS - p.renames.filter((t) => t > addDays(now, -HOLD_DAYS)).length);
}

/** A few free usernames from someone's name, for when the one they wanted is taken. */
async function freeIdeas(store: PeopleStore, me: Profile, now: Date) {
  const out: string[] = [];
  for (const u of ideas(me.name, `${me.uid}:${now.getTime()}`, 10)) {
    if (out.length >= 4) break;
    const cur = await get<Name>(store, `un/${u}`);
    if (!cur || cur.uid === me.uid || (cur.hold && cur.hold < now.toISOString())) out.push(u);
  }
  return out;
}

/** Someone deleted their account: their profile, username and every pair with them go. */
export async function forgetPerson(store: PeopleStore, uid: string) {
  const pf = await get<Profile>(store, `pf/${uid}`);
  if (pf) {
    const name = await get<Name>(store, `un/${pf.u}`);
    if (name?.uid === uid) await store.delete(`un/${pf.u}`);
  }
  for (const b of (await store.list({ prefix: `ln/${uid}/` })).blobs) {
    const other = b.key.slice(`ln/${uid}/`.length);
    await store.delete(pairKey(uid, other));
    await store.delete(`ln/${other}/${uid}`);
    await store.delete(b.key);
  }
  await store.delete(`pf/${uid}`);
}
