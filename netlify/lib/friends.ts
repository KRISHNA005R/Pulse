// Friends on PULSE: people who share their splits with each other.
//
// Each pair has one channel with two sides, "a" (who sent the invite) and "b" (who accepted it).
// Each side publishes one sealed box: the splits and settle-ups it has recorded with the other
// person. The box is encrypted on the phone with a key that only travels inside the invite link,
// so the server stores it without being able to read it.
//
// A side proves it is itself with a token it made up; only the token's hash is kept here.
//
// Stored in the 'pulse-friends' blob store:
//   ch/<chan>/a          the inviter's side
//   ch/<chan>/b          the friend's side (exists once the invite is accepted)
//   g/<gid>/<mid>        one member of a shared group (see "Shared groups" below)
//   door/<id>/owner      a personal link: one link a person can give to everybody
//   door/<id>/k/<n>      someone who opened that link, waiting for the owner's phone (see "Personal links")
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
  if (typeof body.action === 'string' && body.action.startsWith('g-')) return handleGroups(body, ctx);
  if (typeof body.action === 'string' && body.action.startsWith('door-')) return handleDoor(body, ctx);
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

// ---------------------------------------------------------------------------------------------
// Shared groups: the same idea with more than two people. One invite link for the whole group;
// anyone who opens it becomes a member. Every member publishes one sealed box (the expenses and
// settle-ups they recorded in the group) and reads everyone else's. The key is in the link, so
// the boxes can't be read here.
// ---------------------------------------------------------------------------------------------
interface Member {
  th: string;
  box: string;
  rev: number;
  at: string;
  joined: string;
  devs: string[];
  /** Made the group. Can close it to new people and remove a member. */
  owner?: boolean;
  /** Owner only: nobody new can join with the link. */
  closed?: boolean;
  /** Left by themselves. What they added stays for the others. */
  gone?: boolean;
  /** Taken out by the owner. What they added goes with them. */
  removed?: boolean;
  day?: string;
  sent?: number;
}

const MID = /^[0-9a-f]{16}$/;
const MAX_MEMBERS = 30;
const gkey = (gid: string, mid: string) => `g/${gid}/${mid}`;

async function members(store: StoreLike, gid: string): Promise<{ mid: string; m: Member }[]> {
  const { blobs } = await store.list({ prefix: `g/${gid}/` });
  const all = await Promise.all(blobs.map(async (b) => ({ mid: b.key.slice(`g/${gid}/`.length), m: (await store.get(b.key, { type: 'json' })) as Member | null })));
  return (all.filter((x) => x.m) as { mid: string; m: Member }[]).sort((a, b) => (a.m.joined < b.m.joined ? -1 : a.m.joined > b.m.joined ? 1 : a.mid < b.mid ? -1 : 1));
}

async function handleGroups(body: Record<string, unknown>, ctx: Ctx): Promise<Result> {
  const { store } = ctx;
  const now = ctx.now ?? new Date();
  const gid = String(body.gid ?? '');
  const mid = String(body.mid ?? '');
  const token = String(body.token ?? '');
  if (!CHAN.test(gid) || !MID.test(mid) || !TOKEN.test(token)) return fail(400, 'bad request');
  const action = body.action;
  const th = await sha256(token);
  const all = await members(store, gid);
  const mine = all.find((x) => x.mid === mid)?.m;
  const owner = all.find((x) => x.m.owner)?.m;
  const fresh = (extra: Partial<Member>): Member => ({ th, box: '', rev: 0, at: now.toISOString(), joined: now.toISOString(), devs: addDev([], body.dev), ...extra });

  if (action === 'g-create') {
    if (all.length && !(mine && mine.th === th && mine.owner)) return fail(409, 'taken');
    if (!mine) await store.setJSON(gkey(gid, mid), fresh({ owner: true }));
    return { status: 200, body: { ok: true } };
  }

  if (action === 'g-join') {
    if (mine) {
      if (mine.th !== th) return fail(409, 'taken');
      if (mine.removed) return fail(403, 'You were removed from this group.');
      if (mine.gone) await store.setJSON(gkey(gid, mid), { ...mine, gone: false, devs: addDev([], body.dev) });
      return { status: 200, body: { ok: true } };
    }
    if (!owner) return fail(404, 'This link is no longer valid. Ask for a new one.');
    if (owner.closed) return fail(403, 'This group is closed to new people. Ask the person who made it to open it again.');
    if (all.filter((x) => !x.m.gone && !x.m.removed).length >= MAX_MEMBERS) return fail(409, `This group is full (${MAX_MEMBERS} people).`);
    await store.setJSON(gkey(gid, mid), fresh({}));
    return { status: 200, body: { ok: true } };
  }

  if (!mine || mine.th !== th) return fail(403, 'not a member');
  if (mine.removed) return fail(403, 'removed');

  if (action === 'g-get') {
    const devs = addDev(mine.devs ?? [], body.dev);
    if (devs.join() !== (mine.devs ?? []).join()) await store.setJSON(gkey(gid, mid), { ...mine, devs });
    return {
      status: 200,
      body: { ok: true, closed: !!owner?.closed, members: all.filter((x) => !x.m.removed).map((x) => ({ mid: x.mid, box: x.m.box, rev: x.m.rev, owner: !!x.m.owner, gone: !!x.m.gone })) },
    };
  }

  if (action === 'g-put') {
    const box = typeof body.box === 'string' ? body.box : '';
    if (!box || box.length > MAX_BOX) return fail(400, 'bad box');
    const day = now.toISOString().slice(0, 10);
    const next: Member = { ...mine, box, rev: mine.rev + 1, at: now.toISOString(), devs: addDev(mine.devs ?? [], body.dev), gone: false };
    let notified = 0;
    // `per` holds a line for one member ("You owe Krishna ₹150."); everyone else gets `body`.
    // `only` = tell just the members who have a line of their own.
    const n = body.notify as { title?: unknown; body?: unknown; per?: Record<string, unknown>; only?: unknown } | undefined;
    const title = clip(n?.title, 80);
    const per = n?.per && typeof n.per === 'object' ? n.per : {};
    const count = next.day === day ? (next.sent ?? 0) : 0;
    if (title && count < MAX_NOTIFY_PER_DAY) {
      const vapid = await ctx.vapid();
      for (const other of all) {
        if (other.mid === mid || other.m.gone || other.m.removed) continue;
        if (n?.only === true && !clip(per[other.mid], 160)) continue;
        const payload: Payload = { title, body: clip(per[other.mid], 160) || clip(n?.body, 160), url: '/?tab=splits', tag: `gr-${gid.slice(0, 8)}-${mid.slice(0, 4)}-${next.rev}` };
        for (const dev of other.m.devs ?? []) {
          const rec = (await ctx.pushStore.get(`dev/${dev}`, { type: 'json' })) as { sub: Sub } | null;
          if (!rec) continue;
          const status = await ctx.send(rec.sub, payload, vapid).catch(() => 0);
          if (status >= 200 && status < 300) notified++;
        }
      }
      next.day = day;
      next.sent = count + 1;
    }
    await store.setJSON(gkey(gid, mid), next);
    return { status: 200, body: { ok: true, rev: next.rev, notified } };
  }

  // Leave: what this person added stays for the others. When the last person leaves, nothing is kept.
  if (action === 'g-leave') {
    const left = all.filter((x) => x.mid !== mid && !x.m.gone && !x.m.removed);
    if (!left.length) await Promise.all(all.map((x) => store.delete(gkey(gid, x.mid))));
    else await store.setJSON(gkey(gid, mid), { ...mine, gone: true, devs: [], rev: mine.rev + 1 });
    return { status: 200, body: { ok: true } };
  }

  if (action === 'g-close' || action === 'g-remove' || action === 'g-delete') {
    if (!mine.owner) return fail(403, 'Only the person who made the group can do this.');
    // The group is deleted: nothing of it is kept here. Each member's phone keeps its own copy of the history.
    if (action === 'g-delete') {
      await Promise.all(all.map((x) => store.delete(gkey(gid, x.mid))));
      return { status: 200, body: { ok: true } };
    }
    if (action === 'g-close') {
      await store.setJSON(gkey(gid, mid), { ...mine, closed: body.closed === true });
      return { status: 200, body: { ok: true, closed: body.closed === true } };
    }
    const target = String(body.target ?? '');
    const t = all.find((x) => x.mid === target)?.m;
    if (!t || t.owner) return fail(400, 'bad target');
    await store.setJSON(gkey(gid, target), { ...t, removed: true, box: '', devs: [], rev: t.rev + 1 });
    return { status: 200, body: { ok: true } };
  }

  return fail(400, 'unknown action');
}

// ---------------------------------------------------------------------------------------------
// Personal links: one link a person can post anywhere. Whoever opens it makes a fresh two-person
// channel (as above) and leaves a sealed note here saying which one. The owner's phone picks the
// notes up, takes the second seat on each channel, and the two are connected. The note is sealed
// with a key that is only in the link, so it can't be read here.
// ---------------------------------------------------------------------------------------------
interface Door {
  th: string;
  at: string;
  devs: string[];
}
const NOTE = /^f1\.[A-Za-z0-9_-]{12,24}\.[A-Za-z0-9_-]{20,4000}$/;
const MAX_WAITING = 60;
const dkey = (id: string) => `door/${id}/owner`;

async function handleDoor(body: Record<string, unknown>, ctx: Ctx): Promise<Result> {
  const { store } = ctx;
  const now = ctx.now ?? new Date();
  const id = String(body.door ?? '');
  if (!CHAN.test(id)) return fail(400, 'bad request');
  const action = body.action;
  const door = (await store.get(dkey(id), { type: 'json' })) as Door | null;

  // Someone opened the link. No token: anybody who has the link may knock.
  if (action === 'door-knock') {
    if (!door) return fail(404, 'This link is no longer valid. Ask for a new one.');
    const note = typeof body.box === 'string' ? body.box : '';
    if (!NOTE.test(note)) return fail(400, 'bad box');
    const { blobs } = await store.list({ prefix: `door/${id}/k/` });
    if (blobs.length >= MAX_WAITING) return fail(429, 'Too many people are waiting on this link. Try again later.');
    const n = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await store.setJSON(`door/${id}/k/${n}`, { box: note, at: now.toISOString() });
    let notified = 0;
    const title = clip((body.notify as { title?: unknown } | undefined)?.title, 80);
    if (title) {
      const payload: Payload = { title, body: clip((body.notify as { body?: unknown }).body, 160), url: '/?tab=splits', tag: `door-${n}` };
      const vapid = await ctx.vapid();
      for (const dev of door.devs ?? []) {
        const rec = (await ctx.pushStore.get(`dev/${dev}`, { type: 'json' })) as { sub: Sub } | null;
        if (!rec) continue;
        const status = await ctx.send(rec.sub, payload, vapid).catch(() => 0);
        if (status >= 200 && status < 300) notified++;
      }
    }
    return { status: 200, body: { ok: true, notified } };
  }

  const token = String(body.token ?? '');
  if (!TOKEN.test(token)) return fail(400, 'bad request');
  const th = await sha256(token);

  if (action === 'door-open') {
    if (door && door.th !== th) return fail(409, 'taken');
    if (!door) await store.setJSON(dkey(id), { th, at: now.toISOString(), devs: addDev([], body.dev) } satisfies Door);
    return { status: 200, body: { ok: true } };
  }

  if (!door) return fail(404, 'no such link');
  if (door.th !== th) return fail(403, 'not yours');

  // The owner's phone collects who is waiting. Also the moment it says where to notify it.
  if (action === 'door-read') {
    const devs = addDev(door.devs ?? [], body.dev);
    if (devs.join() !== (door.devs ?? []).join()) await store.setJSON(dkey(id), { ...door, devs });
    const { blobs } = await store.list({ prefix: `door/${id}/k/` });
    const notes = await Promise.all(blobs.slice(0, MAX_WAITING).map(async (b) => ({ n: b.key.slice(`door/${id}/k/`.length), box: ((await store.get(b.key, { type: 'json' })) as { box?: string } | null)?.box ?? '' })));
    return { status: 200, body: { ok: true, notes } };
  }

  if (action === 'door-clear') {
    const ns = Array.isArray(body.ns) ? body.ns.filter((n): n is string => typeof n === 'string' && /^[0-9a-f]{16}$/.test(n)).slice(0, MAX_WAITING) : [];
    await Promise.all(ns.map((n) => store.delete(`door/${id}/k/${n}`)));
    return { status: 200, body: { ok: true } };
  }

  // The owner made a new link: this one stops working. People already connected stay connected.
  if (action === 'door-close') {
    const { blobs } = await store.list({ prefix: `door/${id}/` });
    await Promise.all(blobs.map((b) => store.delete(b.key)));
    return { status: 200, body: { ok: true } };
  }

  return fail(400, 'unknown action');
}
