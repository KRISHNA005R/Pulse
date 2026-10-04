// Friends on PULSE: two people who share their splits with each other.
//
// Each pair has one channel with two sides, "a" (who sent the invite) and "b" (who accepted it).
// Each side publishes one sealed box: the splits and settle-ups it has recorded with the other
// person. The box is encrypted on the phone with a key that only travels inside the invite link,
// so the server stores it without being able to read it.
//
// A side proves it is itself with a token it made up; only the token's hash is kept here.
//
// Stored in the 'pulse-friends' blob store:
//   ch/<chan>/a      the inviter's side
//   ch/<chan>/b      the friend's side (exists once the invite is accepted)
//
// The one thing that is not end-to-end encrypted is the notification: its text passes through the
// server on its way to the friend's phone, and is not stored.
import type { Payload, Sender, StoreLike, Sub, Vapid } from './push';

interface Side {
  /** SHA-256 of this side's token. */
  th: string;
  /** The sealed box (ciphertext), or '' before the first one. */
  box: string;
  rev: number;
  at: string;
  /** Devices to notify (ids from the reminders store), newest last. */
  devs: string[];
  /** Notifications sent today, so one side can't flood the other. */
  day?: string;
  sent?: number;
  /** This side disconnected. */
  gone?: boolean;
}

const CHAN = /^[0-9a-f]{32}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const DEV = /^[0-9a-f]{32}$/;
const MAX_BOX = 300_000;
const MAX_DEVS = 6;
const MAX_NOTIFY_PER_DAY = 40;

const key = (chan: string, side: 'a' | 'b') => `ch/${chan}/${side}`;
const clip = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export async function sha256(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Result = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): Result => ({ status, body: { ok: false, error } });

interface Ctx {
  store: StoreLike;
  /** Where the reminders keep each device's push address. */
  pushStore: StoreLike;
  send: Sender;
  vapid: () => Promise<Vapid>;
  now?: Date;
}

async function sides(store: StoreLike, chan: string) {
  const [a, b] = (await Promise.all([store.get(key(chan, 'a'), { type: 'json' }), store.get(key(chan, 'b'), { type: 'json' })])) as [Side | null, Side | null];
  return { a, b };
}

/** Which side this token belongs to, or null. */
async function whoAmI(store: StoreLike, chan: string, token: string) {
  const { a, b } = await sides(store, chan);
  const th = await sha256(token);
  if (a && a.th === th) return { side: 'a' as const, mine: a, theirs: b };
  if (b && b.th === th) return { side: 'b' as const, mine: b, theirs: a };
  return null;
}

const addDev = (devs: string[], dev: unknown) => {
  if (typeof dev !== 'string' || !DEV.test(dev)) return devs;
  return [...devs.filter((d) => d !== dev), dev].slice(-MAX_DEVS);
};

export async function handleFriends(body: Record<string, unknown>, ctx: Ctx): Promise<Result> {
  const { store } = ctx;
  const now = ctx.now ?? new Date();
  const chan = String(body.chan ?? '');
  const token = String(body.token ?? '');
  if (!CHAN.test(chan) || !TOKEN.test(token)) return fail(400, 'bad request');
  const action = body.action;

  // The inviter opens the channel.
  if (action === 'create') {
    const { a } = await sides(store, chan);
    const th = await sha256(token);
    if (a && a.th !== th) return fail(409, 'taken');
    if (!a) await store.setJSON(key(chan, 'a'), { th, box: '', rev: 0, at: now.toISOString(), devs: addDev([], body.dev) } satisfies Side);
    return { status: 200, body: { ok: true } };
  }

  // The friend accepts. An invite works for one person only.
  if (action === 'join') {
    const { a, b } = await sides(store, chan);
    if (!a || a.gone) return fail(404, 'This invite is no longer valid. Ask for a new one.');
    const th = await sha256(token);
    if (a.th === th) return fail(409, 'This is your own invite. Send it to your friend.');
    if (b && b.th !== th && !b.gone) return fail(409, 'This invite was already used. Ask for a new one.');
    if (!b || b.gone) await store.setJSON(key(chan, 'b'), { th, box: '', rev: 0, at: now.toISOString(), devs: addDev([], body.dev) } satisfies Side);
    return { status: 200, body: { ok: true } };
  }

  const me = await whoAmI(store, chan, token);
  if (!me) return fail(403, 'not a member');

  // Read both boxes. Also the moment a device says where to notify it.
  if (action === 'get') {
    const devs = addDev(me.mine.devs ?? [], body.dev);
    if (devs.join() !== (me.mine.devs ?? []).join()) await store.setJSON(key(chan, me.side), { ...me.mine, devs });
    const t = me.theirs;
    return { status: 200, body: { ok: true, side: me.side, mine: { box: me.mine.box, rev: me.mine.rev }, theirs: t ? { box: t.box, rev: t.rev, at: t.at, gone: !!t.gone } : null } };
  }

  // Publish my box, and optionally tell the other side something changed.
  if (action === 'put') {
    const box = typeof body.box === 'string' ? body.box : '';
    if (!box || box.length > MAX_BOX) return fail(400, 'bad box');
    const day = now.toISOString().slice(0, 10);
    const mine: Side = { ...me.mine, box, rev: me.mine.rev + 1, at: now.toISOString(), devs: addDev(me.mine.devs ?? [], body.dev), gone: false };
    let notified = 0;
    const n = body.notify as { title?: unknown; body?: unknown } | undefined;
    const title = clip(n?.title, 80);
    const count = mine.day === day ? (mine.sent ?? 0) : 0;
    if (title && me.theirs && !me.theirs.gone && count < MAX_NOTIFY_PER_DAY) {
      const payload: Payload = { title, body: clip(n?.body, 160), url: '/?tab=splits', tag: `fr-${chan.slice(0, 8)}-${mine.rev}` };
      const vapid = await ctx.vapid();
      const alive: string[] = [];
      for (const dev of me.theirs.devs ?? []) {
        const rec = (await ctx.pushStore.get(`dev/${dev}`, { type: 'json' })) as { sub: Sub } | null;
        if (!rec) continue; // that device turned reminders off
        const status = await ctx.send(rec.sub, payload, vapid).catch(() => 0);
        if (status === 404 || status === 410) continue;
        alive.push(dev);
        if (status >= 200 && status < 300) notified++;
      }
      if (alive.length !== (me.theirs.devs ?? []).length) await store.setJSON(key(chan, me.side === 'a' ? 'b' : 'a'), { ...me.theirs, devs: alive });
      mine.day = day;
      mine.sent = count + 1;
    }
    await store.setJSON(key(chan, me.side), mine);
    return { status: 200, body: { ok: true, rev: mine.rev, notified } };
  }

  // Disconnect. My side is emptied and marked gone so the other phone can see it; once both are gone, nothing is kept.
  if (action === 'leave') {
    if (!me.theirs || me.theirs.gone) {
      await Promise.all([store.delete(key(chan, 'a')), store.delete(key(chan, 'b'))]);
    } else await store.setJSON(key(chan, me.side), { th: me.mine.th, box: '', rev: me.mine.rev + 1, at: now.toISOString(), devs: [], gone: true } satisfies Side);
    return { status: 200, body: { ok: true } };
  }

  return fail(400, 'unknown action');
}
