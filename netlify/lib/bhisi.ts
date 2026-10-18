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
//   b/<bid>/meta        { owner, start, ghosts, created }
//   b/<bid>/m/<mid>     one member's seat and sealed box
//   b/<bid>/d/<round>   the draw for that round { w, at, by, seats? }  (round 0 also locks the seat list)
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
}
interface Seat {
  th: string;
  box: string;
  rev: number;
  joined: string;
  devs: string[];
  owner?: boolean;
  gone?: boolean;
  removed?: boolean;
}
interface Draw {
  w: string;
  at: string;
  by: string;
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
    setJSON(key: string, value: unknown, opts?: { onlyIfNew?: boolean }): Promise<unknown>;
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
  return { meta, seats, draws };
}

/** Everyone in the matka's list: locked at the first draw, otherwise members who are in plus name-only seats. */
function seatList(meta: Meta, seats: { mid: string; s: Seat }[], draws: { r: number; d: Draw }[]) {
  const locked = draws.find((x) => x.r === 0)?.d.seats;
  if (locked) return locked;
  return [...seats.filter((x) => !x.s.gone && !x.s.removed).map((x) => x.mid), ...meta.ghosts];
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
  const { meta, seats, draws } = await load(ctx, bid);
  const mine = seats.find((x) => x.mid === mid)?.s;
  const fresh = (extra: Partial<Seat>): Seat => ({ th, box: '', rev: 0, joined: now.toISOString(), devs: addDev([], body.dev), ...extra });
  const ghosts = (x: unknown) => (Array.isArray(x) ? x.filter((g): g is string => typeof g === 'string' && GHOST.test(g)).slice(0, MAX_SEATS) : []);

  if (action === 'b-create') {
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

  if (action === 'b-join') {
    if (mine) {
      if (mine.th !== th) return fail(409, 'taken');
      if (mine.removed) return fail(403, 'You were taken out of this bhisi.');
      if (mine.gone) await store.setJSON(skey(bid, mid), { ...mine, gone: false, devs: addDev([], body.dev) });
      return { status: 200, body: { ok: true } };
    }
    if (draws.length) return fail(403, 'The draws have started, so nobody new can join this bhisi.');
    if (seatList(meta, seats, draws).length >= MAX_SEATS) return fail(409, `This bhisi is full (${MAX_SEATS} people).`);
    await store.setJSON(skey(bid, mid), fresh({}));
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
    members: seats.filter((x) => !x.s.removed).map((x) => ({ mid: x.mid, box: x.s.box, rev: x.s.rev, owner: !!x.s.owner, gone: !!x.s.gone })),
    draws: draws.map((x) => ({ r: x.r, w: x.d.w, at: x.d.at })),
  });

  if (action === 'b-get') {
    const devs = addDev(mine.devs ?? [], body.dev);
    if (devs.join() !== (mine.devs ?? []).join()) await store.setJSON(skey(bid, mid), { ...mine, devs });
    return { status: 200, body: view() };
  }

  if (action === 'b-put') {
    const box = typeof body.box === 'string' ? body.box : '';
    if (!box || box.length > MAX_BOX) return fail(400, 'bad box');
    const next: Seat = { ...mine, box, rev: mine.rev + 1, devs: addDev(mine.devs ?? [], body.dev), gone: false };
    await store.setJSON(skey(bid, mid), next);
    return { status: 200, body: { ok: true, rev: next.rev } };
  }

  // Organiser: people added by name, and the first draw date (both only before the draws start).
  if (action === 'b-setup') {
    if (!mine.owner) return fail(403, 'Only the person who made the bhisi can change this.');
    if (draws.length) return fail(403, 'The draws have started. The list is locked now.');
    const start = String(body.start ?? meta.start);
    await store.setJSON(mkey(bid), { ...meta, ghosts: body.ghosts === undefined ? meta.ghosts : ghosts(body.ghosts), start: DATE.test(start) ? start : meta.start });
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
    const winner = fairPick(pool);
    const rec: Draw = { w: winner, at: now.toISOString(), by: mid, ...(r === 0 ? { seats: list } : {}) };
    const res = (await store.setJSON(dkey(bid, r), rec, { onlyIfNew: true })) as { modified?: boolean } | undefined;
    if (res && res.modified === false) {
      // Someone else drew this round a moment earlier: theirs stands.
      const theirs = (await store.get(dkey(bid, r), { type: 'json' })) as Draw;
      const again = await load(ctx, bid);
      return { status: 200, body: { ...view(), draws: again.draws.map((x) => ({ r: x.r, w: x.d.w, at: x.d.at })), winner: theirs.w, round: r, already: true } };
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
    return { status: 200, body: { ...view(), draws: after.draws.map((x) => ({ r: x.r, w: x.d.w, at: x.d.at })), seats: seatList(meta, after.seats, after.draws), locked: true, winner, round: r, notified } };
  }

  if (action === 'b-leave') {
    if (mine.owner) return fail(403, 'You made this bhisi. Delete it instead.');
    await store.setJSON(skey(bid, mid), { ...mine, gone: true, devs: [], rev: mine.rev + 1 });
    return { status: 200, body: { ok: true } };
  }

  if (action === 'b-delete') {
    if (!mine.owner) return fail(403, 'Only the person who made the bhisi can delete it.');
    const keys = [mkey(bid), ...seats.map((x) => skey(bid, x.mid)), ...draws.map((x) => dkey(bid, x.r))];
    await Promise.all(keys.map((k) => store.delete(k)));
    return { status: 200, body: { ok: true } };
  }

  return fail(400, 'unknown action');
}
