// Shared bhisi: a group puts in the same amount every month, and each month one chit is drawn from
// the matka. The person on it takes the pot. Everyone wins exactly once.
//
// Like shared groups, each member publishes one sealed box (their name, what they've paid) that
// this server can't read. What the server does know is who is in (member ids, plus the ids of
// people the organiser added by name) and the draws. The draw happens HERE, never on a phone:
//   - the pick uses crypto randomness,
//   - it is written once per round (a second tap, from anyone, gets the same result back),
//   - a round can't be drawn before its date (India time).
// So nobody can redraw, peek, or pick.
//
// Stored in the 'pulse-friends' blob store:
//   b/<bid>/meta        { owner, start, ghosts, created, deleted? }  (a deleted bhisi keeps only this, marked deleted)
//   b/<bid>/m/<mid>     one member's seat and sealed box (was: the name-only seat they took, if any)
//   b/<bid>/d/<round>   the draw for that round { w, at, by, odds, seats? }  (round 0 also locks the seat list)
//   b/<bid>/p/<round>   when each seat paid that round (server time, so nobody can back-date it)
//
// Luck, not a fix: everyone in the matka has a chance every round. Paying early adds a little:
//   not paid yet: 4 tickets · paid before the draw: 5 · paid 3+ days before the draw date: 6.
// So the most an early payer gets is 1.5× the chance of someone who hasn't paid. Still random.
import type { Payload, Sub } from './push';

async function sha256(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Result = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): Result => ({ status, body: { ok: false, error } });

interface Meta {
  owner: string;
  /** Date of the first draw (YYYY-MM-DD); then the same date each month. */
  start: string;
  /** Seat ids of people the organiser added by name (not on PULSE, or not joined yet). */
  ghosts: string[];
  created: string;
  /** The organiser deleted it. Everyone else's PULSE is told so, and it can't be made again. */
  deleted?: string;
}
interface Seat {
  th: string;
  box: string;
  rev: number;
  joined: string;
  devs: string[];
  owner?: boolean;
  gone?: boolean;
  /** Left because they deleted their PULSE account: their chit comes out of the matka. */
  deleted?: boolean;
  removed?: boolean;
  /** The name-only seat this person took when they joined (the organiser had added them by name). */
  was?: string;
}
interface Draw {
  w: string;
  at: string;
  by: string;
  /** Tickets each seat had in this draw (see "Luck" above), so everyone can see the odds. */
  odds?: Record<string, number>;
  /** Round 0 only: every seat at the moment of the first draw. From then on, nobody new joins. */
  seats?: string[];
}

const BID = /^[0-9a-f]{32}$/;
const MID = /^[0-9a-f]{16}$/;
const GHOST = /^g[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const DEV = /^[0-9a-f]{32}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BOX = 60_000;
const MAX_SEATS = 30;
const MAX_DEVS = 6;

const mkey = (bid: string) => `b/${bid}/meta`;
const skey = (bid: string, mid: string) => `b/${bid}/m/${mid}`;
const dkey = (bid: string, r: number) => `b/${bid}/d/${r}`;
const pkey = (bid: string, r: number) => `b/${bid}/p/${r}`;

export const TICKETS = { unpaid: 4, paid: 5, early: 6 };
export const EARLY_DAYS = 3;

/** Tickets for one seat: paid 3+ days before the round's date (India time) = early. */
export function tickets(paidAt: string | undefined, roundDate: string): number {
  if (!paidAt) return TICKETS.unpaid;
  const paidDay = todayIST(new Date(paidAt));
  return paidDay <= addMonthsISO(roundDate, 0) && daysBetweenISO(paidDay, roundDate) >= EARLY_DAYS ? TICKETS.early : TICKETS.paid;
}
function daysBetweenISO(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
}

/** A fair weighted pick: crypto randomness over every ticket, rejection-sampled (no bias). */
export function weightedPick(items: { id: string; w: number }[]): string {
  const total = items.reduce((a, x) => a + x.w, 0);
  const n = fairPick(Array.from({ length: total }, (_, i) => i));
  let acc = 0;
  for (const x of items) {
    acc += x.w;
    if (n < acc) return x.id;
  }
  return items[items.length - 1].id;
}
const clip = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const addDev = (devs: string[], dev: unknown) => (typeof dev === 'string' && DEV.test(dev) ? [...devs.filter((d) => d !== dev), dev].slice(-MAX_DEVS) : devs);

/** Today in India (the draws open by the Indian date). */
export const todayIST = (now: Date) => new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** The same date n months later (31 Jan + 1 = 28/29 Feb). */
export function addMonthsISO(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
}

/** A fair pick: crypto randomness, rejection-sampled so no seat is even slightly favoured. */
export function fairPick<T>(xs: T[]): T {
  const n = xs.length;
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a);
  while (a[0] >= limit);
  return xs[a[0] % n];
}

interface Ctx {
  store: {
    get(key: string, opts: { type: 'json' }): Promise<unknown>;
    getWithMetadata(key: string, opts: { type: 'json' }): Promise<{ data: unknown; etag?: string } | null>;
    setJSON(key: string, value: unknown, opts?: { onlyIfNew?: boolean; onlyIfMatch?: string }): Promise<unknown>;
    delete(key: string): Promise<void>;
    list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
  };
  pushStore: { get(key: string, opts: { type: 'json' }): Promise<unknown> };
  send: (sub: Sub, payload: Payload, vapid: never) => Promise<number>;
  vapid: () => Promise<unknown>;
  now?: Date;
}

async function load(ctx: Ctx, bid: string) {
  const meta = (await ctx.store.get(mkey(bid), { type: 'json' })) as Meta | null;
  const [{ blobs: ms }, { blobs: ds }] = await Promise.all([ctx.store.list({ prefix: `b/${bid}/m/` }), ctx.store.list({ prefix: `b/${bid}/d/` })]);
  const seats = (await Promise.all(ms.map(async (b) => ({ mid: b.key.slice(`b/${bid}/m/`.length), s: (await ctx.store.get(b.key, { type: 'json' })) as Seat | null })))).filter((x) => x.s) as { mid: string; s: Seat }[];
  seats.sort((a, b) => (a.s.joined < b.s.joined ? -1 : a.s.joined > b.s.joined ? 1 : a.mid < b.mid ? -1 : 1));
  const draws = (await Promise.all(ds.map(async (b) => ({ r: Number(b.key.slice(`b/${bid}/d/`.length)), d: (await ctx.store.get(b.key, { type: 'json' })) as Draw | null })))).filter((x) => x.d && Number.isInteger(x.r)) as { r: number; d: Draw }[];
  draws.sort((a, b) => a.r - b.r);
  const { blobs: ps } = await ctx.store.list({ prefix: `b/${bid}/p/` });
  const paid: Record<number, Record<string, string>> = {};
  await Promise.all(ps.map(async (b) => void (paid[Number(b.key.slice(`b/${bid}/p/`.length))] = ((await ctx.store.get(b.key, { type: 'json' })) as Record<string, string> | null) ?? {})));
  // A paid mark the organiser put on a name-only seat belongs to the person who took that seat.
  const took = claims(seats);
  for (const round of Object.values(paid))
    for (const [ghost, m] of took)
      if (round[ghost]) {
        round[m] ??= round[ghost];
        delete round[ghost];
      }
  return { meta, seats, draws, paid };
}

/** Name-only seat → the member who took it (the first to, if two ever did). */
function claims(seats: { mid: string; s: Seat }[]) {
  const took = new Map<string, string>();
  for (const x of seats) if (x.s.was && !took.has(x.s.was)) took.set(x.s.was, x.mid);
  return took;
}

/**
 * Change one blob without losing a change someone else made at the same moment: read it, change it,
 * and write it only if nobody wrote in between (else read again). `fn` returns null for "nothing to write".
 * Undefined if it stayed busy.
 */
async function update<T>(ctx: Ctx, key: string, fn: (cur: T | null) => T | null): Promise<{ value: T | null } | undefined> {
  for (let i = 0; i < 8; i++) {
    const got = (await ctx.store.getWithMetadata(key, { type: 'json' })) as { data: T; etag?: string } | null;
    const next = fn(got ? structuredClone(got.data) : null);
    if (next === null) return { value: got?.data ?? null };
    // (A store that gives no etag, like the local test server, gets a plain write.)
    const res = (await ctx.store.setJSON(key, next, !got ? { onlyIfNew: true } : got.etag ? { onlyIfMatch: got.etag } : undefined)) as { modified?: boolean } | undefined;
    if (!res || res.modified !== false) return { value: next };
  }
  return undefined;
}
const BUSY = () => fail(503, 'Busy. Try again in a moment.');

/** Everyone in the matka's list: locked at the first draw, otherwise members who are in plus name-only seats. */
function seatList(meta: Meta, seats: { mid: string; s: Seat }[], draws: { r: number; d: Draw }[]) {
  const locked = draws.find((x) => x.r === 0)?.d.seats;
  // Someone who deleted their account can't take a pot any more: their chit comes out (unless they already won).
  const deleted = new Set(seats.filter((x) => x.s.deleted).map((x) => x.mid));
  const won = new Set(draws.map((x) => x.d.w));
  if (locked) return locked.filter((s) => !deleted.has(s) || won.has(s));
  // A name-only seat someone has taken is that person's seat now: one chit, not two.
  const took = claims(seats);
  return [...seats.filter((x) => !x.s.gone && !x.s.removed).map((x) => x.mid), ...meta.ghosts.filter((g) => !took.has(g))];
}

export async function handleBhisi(body: Record<string, unknown>, ctx: Ctx): Promise<Result> {
  const { store } = ctx;
  const now = ctx.now ?? new Date();
  const bid = String(body.bid ?? '');
  const mid = String(body.mid ?? '');
  const token = String(body.token ?? '');
  if (!BID.test(bid) || !MID.test(mid) || !TOKEN.test(token)) return fail(400, 'bad request');
  const action = body.action;
  const th = await sha256(token);
  const { meta, seats, draws, paid } = await load(ctx, bid);
  const mine = seats.find((x) => x.mid === mid)?.s;
  const fresh = (extra: Partial<Seat>): Seat => ({ th, box: '', rev: 0, joined: now.toISOString(), devs: addDev([], body.dev), ...extra });
  const ghosts = (x: unknown) => (Array.isArray(x) ? x.filter((g): g is string => typeof g === 'string' && GHOST.test(g)).slice(0, MAX_SEATS) : []);

  const GONE: Result = { status: 410, body: { ok: false, deleted: true, error: 'This bhisi was deleted by the person who made it.' } };

  if (action === 'b-create') {
    if (meta?.deleted) return GONE;
    if (meta && !(mine && mine.th === th && mine.owner)) return fail(409, 'taken');
    const start = String(body.start ?? '');
    if (!DATE.test(start)) return fail(400, 'bad start');
    if (!meta) {
      await store.setJSON(mkey(bid), { owner: mid, start, ghosts: ghosts(body.ghosts), created: now.toISOString() } satisfies Meta, { onlyIfNew: true });
      await store.setJSON(skey(bid, mid), fresh({ owner: true }));
    }
    return { status: 200, body: { ok: true } };
  }

  if (!meta) return fail(404, 'This bhisi link no longer works. Ask for a new one.');
  if (meta.deleted) return GONE;

  // Before joining: the organiser's sealed box (only someone with the link's key can open it) and
  // how many are in. The link carries only the key; the id comes from it, so this needs the link.
  if (action === 'b-peek') {
    const owner = seats.find((x) => x.mid === meta.owner)?.s;
    return { status: 200, body: { ok: true, box: owner?.box ?? '', count: seatList(meta, seats, draws).length, locked: draws.length > 0 } };
  }

  if (action === 'b-join') {
    if (mine) {
      if (mine.th !== th) return fail(409, 'taken');
      if (mine.removed) return fail(403, 'You were taken out of this bhisi.');
      if (mine.gone) await store.setJSON(skey(bid, mid), { ...mine, gone: false, devs: addDev([], body.dev) });
      return { status: 200, body: { ok: true } };
    }
    if (draws.length) return fail(403, 'The draws have started, so nobody new can join this bhisi.');
    if (seatList(meta, seats, draws).length >= MAX_SEATS) return fail(409, `This bhisi is full (${MAX_SEATS} people).`);
    await store.setJSON(skey(bid, mid), fresh({}), { onlyIfNew: true });
    return { status: 200, body: { ok: true } };
  }

  if (!mine || mine.th !== th) return fail(403, 'not a member');
  if (mine.removed) return fail(403, 'removed');

  const view = () => ({
    ok: true,
    today: todayIST(now),
    start: meta.start,
    owner: meta.owner,
    ghosts: meta.ghosts,
    seats: seatList(meta, seats, draws),
    locked: draws.some((x) => x.r === 0),
    members: seats.filter((x) => !x.s.removed).map((x) => ({ mid: x.mid, box: x.s.box, rev: x.s.rev, owner: !!x.s.owner, gone: !!x.s.gone, deleted: !!x.s.deleted, ...(x.s.was ? { was: x.s.was } : {}) })),
    draws: draws.map((x) => ({ r: x.r, w: x.d.w, at: x.d.at, by: x.d.by, odds: x.d.odds })),
    paid,
  });

  if (action === 'b-get') {
    const devs = addDev(mine.devs ?? [], body.dev);
    if (devs.join() !== (mine.devs ?? []).join()) await update<Seat>(ctx, skey(bid, mid), (cur) => (cur && cur.th === th ? { ...cur, devs: addDev(cur.devs ?? [], body.dev) } : null));
    return { status: 200, body: view() };
  }

  if (action === 'b-put') {
    const box = typeof body.box === 'string' ? body.box : '';
    if (!box || box.length > MAX_BOX) return fail(400, 'bad box');
    const done = await update<Seat>(ctx, skey(bid, mid), (cur) => (cur && cur.th === th ? { ...cur, box, rev: cur.rev + 1, devs: addDev(cur.devs ?? [], body.dev), gone: false } : null));
    if (!done) return BUSY();
    return { status: 200, body: { ok: true, rev: done.value?.rev ?? mine.rev } };
  }

  // Who has paid a round. The time is the server's, so paying "early" can't be faked.
  // Members mark themselves; the organiser can mark anyone (including people added by name).
  if (action === 'b-paid') {
    const r = Number(body.round);
    const asked = typeof body.target === 'string' && body.target ? body.target : mid;
    if (!Number.isInteger(r) || r < 0 || r >= MAX_SEATS) return fail(400, 'bad round');
    if (asked !== mid && !mine.owner) return fail(403, 'Only the person who made the bhisi can mark other people.');
    // A name-only seat someone has taken: the mark is theirs (an older PULSE may still send the old seat).
    const took = claims(seats);
    const target = took.get(asked) ?? asked;
    const old = [...took].filter(([, m]) => m === target).map(([g]) => g);
    if (!seatList(meta, seats, draws).includes(target)) return fail(400, 'not in this bhisi');
    if (draws.some((x) => x.r === r)) return fail(409, 'That round has already been drawn.');
    // Each mark is written only if nobody else wrote this round's list in between: two people paying
    // at the same moment both count.
    const done = await update<Record<string, string>>(ctx, pkey(bid, r), (cur0) => {
      const cur = cur0 ?? {};
      const at = cur[target] ?? old.map((g) => cur[g]).find(Boolean);
      for (const g of old) delete cur[g];
      if (body.paid === false) delete cur[target];
      else cur[target] = at ?? now.toISOString();
      return cur;
    });
    if (!done) return BUSY();
    return { status: 200, body: { ok: true, paid: done.value } };
  }

  // Organiser: people added by name, and the first draw date (both only before the draws start).
  if (action === 'b-setup') {
    if (!mine.owner) return fail(403, 'Only the person who made the bhisi can change this.');
    if (draws.length) return fail(403, 'The draws have started. The list is locked now.');
    const start = String(body.start ?? meta.start);
    // Never over a deletion made a moment ago.
    const done = await update<Meta>(ctx, mkey(bid), (cur) => (!cur || cur.deleted ? null : { ...cur, ghosts: body.ghosts === undefined ? cur.ghosts : ghosts(body.ghosts), start: DATE.test(start) ? start : cur.start }));
    if (!done) return BUSY();
    if (!done.value || (done.value as Meta).deleted) return GONE;
    return { status: 200, body: { ok: true } };
  }

  // Someone the organiser added by name has joined with the link: they take that name-only seat, so
  // they're in the matka once, and the paid marks made for them stay theirs. They do it themselves
  // when they join; the organiser's PULSE does it too when it recognises them (target = their seat).
  if (action === 'b-link') {
    const ghost = String(body.ghost ?? '');
    const target = typeof body.target === 'string' && body.target ? body.target : mid;
    if (target !== mid && !mine.owner) return fail(403, 'Only the person who made the bhisi can do this.');
    if (draws.length) return fail(403, 'The draws have started. The list is locked now.');
    if (!GHOST.test(ghost) || !meta.ghosts.includes(ghost)) return fail(400, 'not a name-only seat here');
    const them = seats.find((x) => x.mid === target)?.s;
    if (!them || them.owner || them.gone || them.removed) return fail(400, 'not in this bhisi');
    const other = seats.find((x) => x.mid !== target && x.s.was === ghost);
    if (other) return fail(409, 'Someone else already took that seat.');
    if (them.was && them.was !== ghost) return fail(409, 'Already linked to someone else.');
    if (them.was === ghost) return { status: 200, body: { ok: true } };
    const done = await update<Seat>(ctx, skey(bid, target), (cur) => (!cur ? null : cur.was === ghost ? null : { ...cur, was: cur.was ?? ghost }));
    if (!done) return BUSY();
    if (done.value?.was !== ghost) return fail(409, 'Already linked to someone else.');
    return { status: 200, body: { ok: true } };
  }

  // The draw. Anyone in the bhisi can do it once the round's date has come.
  if (action === 'b-draw') {
    const r = Number(body.round);
    const list = seatList(meta, seats, draws);
    if (!Number.isInteger(r) || r !== draws.length) {
      const done = draws.find((x) => x.r === r);
      if (done) return { status: 200, body: { ...view(), winner: done.d.w, round: r, already: true } };
      return fail(409, 'That round isn’t up yet.');
    }
    if (list.length < 2) return fail(400, 'A bhisi needs at least 2 people.');
    if (r >= list.length) return fail(400, 'Everyone has already won. This bhisi is complete.');
    const date = addMonthsISO(meta.start, r);
    if (todayIST(now) < date) return fail(403, `This round opens on ${date}.`);
    const won = new Set(draws.map((x) => x.d.w));
    const pool = list.filter((s) => !won.has(s));
    // Luck, not a fix: paying early adds tickets, but anyone in the matka can come out.
    const odds = Object.fromEntries(pool.map((s) => [s, tickets(paid[r]?.[s], date)]));
    const winner = weightedPick(pool.map((s) => ({ id: s, w: odds[s] })));
    const rec: Draw = { w: winner, at: now.toISOString(), by: mid, odds, ...(r === 0 ? { seats: list } : {}) };
    const res = (await store.setJSON(dkey(bid, r), rec, { onlyIfNew: true })) as { modified?: boolean } | undefined;
    if (res && res.modified === false) {
      // Someone else drew this round a moment earlier: theirs stands.
      const theirs = (await store.get(dkey(bid, r), { type: 'json' })) as Draw;
      const again = await load(ctx, bid);
      return { status: 200, body: { ...view(), draws: again.draws.map((x) => ({ r: x.r, w: x.d.w, at: x.d.at, by: x.d.by, odds: x.d.odds })), winner: theirs.w, round: r, already: true } };
    }
    // Tell everyone. Names are sent by the drawing phone (the server can't read them) and not kept.
    const names = (body.names && typeof body.names === 'object' ? body.names : {}) as Record<string, unknown>;
    const title = clip(body.title, 40) || 'the bhisi';
    const pot = clip(body.pot, 20);
    const who = clip(names[winner], 30) || 'Someone';
    const next = r + 1 < list.length ? addMonthsISO(meta.start, r + 1) : '';
    let notified = 0;
    try {
      const vapid = (await ctx.vapid()) as never;
      for (const x of seats) {
        if (x.s.gone || x.s.removed) continue;
        const me = x.mid === winner;
        const payload: Payload = me
          ? { title: `🎉 Your chit came out! You won ${title}`, body: `${pot ? `${pot} is yours` : 'The pot is yours'} this round. Open PULSE to see it.`, url: '/?tab=bhisi', tag: `bh-${bid.slice(0, 8)}-${r}` }
          : { title: `🏺 ${who} won round ${r + 1} of ${title}`, body: `${pot ? `${pot} goes to ${who}. ` : ''}${next ? `Next draw opens ${next}.` : 'That was the last round.'}`, url: '/?tab=bhisi', tag: `bh-${bid.slice(0, 8)}-${r}` };
        for (const dev of x.s.devs ?? []) {
          const sub = (await ctx.pushStore.get(`dev/${dev}`, { type: 'json' })) as { sub: Sub } | null;
          if (!sub) continue;
          const status = await ctx.send(sub.sub, payload, vapid).catch(() => 0);
          if (status >= 200 && status < 300) notified++;
        }
      }
    } catch {
      /* a draw stands even if a notification fails */
    }
    const after = await load(ctx, bid);
    return { status: 200, body: { ...view(), draws: after.draws.map((x) => ({ r: x.r, w: x.d.w, at: x.d.at, by: x.d.by, odds: x.d.odds })), seats: seatList(meta, after.seats, after.draws), locked: true, winner, round: r, notified } };
  }

  if (action === 'b-leave') {
    // The organiser can only leave by deleting their account (their box stays, so the bhisi keeps its name and amount).
    if (mine.owner && body.deleted !== true) return fail(403, 'You made this bhisi. Delete it instead.');
    const done = await update<Seat>(ctx, skey(bid, mid), (cur) => (cur ? { ...cur, gone: true, devs: [], rev: cur.rev + 1, ...(body.deleted === true ? { deleted: true } : {}) } : null));
    if (!done) return BUSY();
    return { status: 200, body: { ok: true } };
  }

  if (action === 'b-delete') {
    if (!mine.owner) return fail(403, 'Only the person who made the bhisi can delete it.');
    // First mark it deleted, so from this moment every member's PULSE is told so (even if clearing
    // the rest stops halfway). That mark stays: an old phone of the organiser can't make it again.
    await store.setJSON(mkey(bid), { ...meta, ghosts: [], deleted: now.toISOString() } satisfies Meta);
    const { blobs } = await store.list({ prefix: `b/${bid}/` });
    await Promise.all(blobs.map((b) => b.key).filter((k) => k !== mkey(bid)).map((k) => store.delete(k)));
    return { status: 200, body: { ok: true } };
  }

  return fail(400, 'unknown action');
}
