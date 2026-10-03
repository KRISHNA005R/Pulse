// Reminders by web push: the logic shared by the API (netlify/functions/push.ts) and the
// 15-minute sender (netlify/functions/push-cron.ts).
//
// PULSE's money data never comes here. Each device works out its own reminders and sends only
// what is needed to deliver them: a time and the text to show. With "details" off in the app,
// that text has no names or amounts.
//
// Stored in the 'pulse-push' blob store:
//   vapid                         the server's push identity (made once, kept private)
//   dev/<id>                      one device: its push address and the reminders it has queued
//   due/<slot>/<id>/<tag>         one queued reminder; <slot> is its time rounded down to 15 minutes (UTC)
//   cron                          when the sender last ran, for the stats page
//   daily/...                     the daily message (netlify/lib/daily.ts)

export interface StoreLike {
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  setJSON(key: string, value: unknown, opts?: { onlyIfNew?: boolean }): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
}

export interface Sub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface Vapid {
  publicKey: string;
  privateKey: string;
}
export interface Payload {
  title: string;
  body: string;
  url: string;
  tag: string;
}
export interface Reminder extends Payload {
  /** When to send it, as an ISO time. */
  at: string;
}
interface Device {
  sub: Sub;
  keys: Record<string, string>;
  at: string;
  /** false = this person switched the daily message off (see netlify/lib/daily.ts). */
  daily?: boolean;
}

/** Sends one push. Returns the push service's HTTP status (201 = accepted, 404/410 = this device is gone). */
export type Sender = (sub: Sub, payload: Payload, vapid: Vapid) => Promise<number>;

const ID = /^[0-9a-f]{32}$/;
const TAG = /^[a-z0-9-]{1,48}$/;
// Only real browser push services, so this can't be used to make the server call arbitrary addresses.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
const MAX_REMINDERS = 90;
const HORIZON_DAYS = 36;
const SLOT_MIN = 15;

export const slotOf = (d: Date) => {
  const t = new Date(Math.floor(d.getTime() / (SLOT_MIN * 60_000)) * SLOT_MIN * 60_000);
  return t.toISOString().slice(0, 16).replace(/[-:]/g, '');
};

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

export function cleanSub(x: unknown): Sub | null {
  const s = x as Sub | null;
  if (!s || typeof s.endpoint !== 'string' || s.endpoint.length > 1200) return null;
  let host = '';
  try {
    const u = new URL(s.endpoint);
    if (u.protocol !== 'https:') return null;
    host = u.hostname;
  } catch {
    return null;
  }
  if (!PUSH_HOSTS.some((r) => r.test(host))) return null;
  const p256dh = str(s.keys?.p256dh, 200);
  const auth = str(s.keys?.auth, 100);
  if (!p256dh || !auth) return null;
  return { endpoint: s.endpoint, keys: { p256dh, auth } };
}

export function cleanReminders(list: unknown, now: Date): Reminder[] {
  if (!Array.isArray(list)) return [];
  const out: Reminder[] = [];
  const seen = new Set<string>();
  for (const r of list.slice(0, MAX_REMINDERS * 2) as Record<string, unknown>[]) {
    const at = Date.parse(String(r?.at ?? ''));
    const tag = str(r?.tag, 48);
    const title = str(r?.title, 80);
    const url = str(r?.url, 120) || '/';
    if (!Number.isFinite(at) || !TAG.test(tag) || !title || seen.has(tag)) continue;
    if (at < now.getTime() - 5 * 60_000 || at > now.getTime() + HORIZON_DAYS * 864e5) continue;
    if (!url.startsWith('/') || url.startsWith('//')) continue;
    seen.add(tag);
    out.push({ at: new Date(at).toISOString(), title, body: str(r?.body, 200), url, tag });
    if (out.length >= MAX_REMINDERS) break;
  }
  return out;
}

export async function getVapid(store: StoreLike, make: () => Vapid): Promise<Vapid> {
  const have = (await store.get('vapid', { type: 'json' })) as Vapid | null;
  if (have?.publicKey && have.privateKey) return have;
  // First call ever: make the keys. If two calls race, the first one saved wins.
  await store.setJSON('vapid', make(), { onlyIfNew: true });
  return (await store.get('vapid', { type: 'json' })) as Vapid;
}

/** Replace this device's queued reminders with a new set, writing only what changed. */
export async function syncDevice(store: StoreLike, id: string, subIn: unknown, remindersIn: unknown, now = new Date(), daily: unknown = undefined) {
  if (!ID.test(id)) return { ok: false as const, error: 'bad id' };
  const sub = cleanSub(subIn);
  if (!sub) return { ok: false as const, error: 'bad subscription' };
  const reminders = cleanReminders(remindersIn, now);
  const old = (await store.get(`dev/${id}`, { type: 'json' })) as Device | null;
  const next: Record<string, string> = {};
  const writes: Promise<unknown>[] = [];
  for (const r of reminders) {
    const key = `due/${slotOf(new Date(r.at))}/${id}/${r.tag}`;
    const payload: Payload = { title: r.title, body: r.body, url: r.url, tag: r.tag };
    const h = hash(JSON.stringify(payload));
    next[key] = h;
    if (old?.keys?.[key] !== h) writes.push(store.setJSON(key, payload));
  }
  for (const key of Object.keys(old?.keys ?? {})) if (!(key in next)) writes.push(store.delete(key));
  await Promise.all(writes);
  // Older versions of the app don't say either way: they keep getting the daily message.
  await store.setJSON(`dev/${id}`, { sub, keys: next, at: now.toISOString(), ...(daily === false ? { daily: false } : {}) } satisfies Device);
  return { ok: true as const, scheduled: reminders.length, changed: writes.length };
}

export async function removeDevice(store: StoreLike, id: string) {
  if (!ID.test(id)) return;
  const old = (await store.get(`dev/${id}`, { type: 'json' })) as Device | null;
  await Promise.all(Object.keys(old?.keys ?? {}).map((k) => store.delete(k)));
  await store.delete(`dev/${id}`);
}

/**
 * Send one notification now. When it can't, `reason` says which part failed, so the app can
 * repair itself (subscribe again) or tell the person what to do:
 *   no-device    the server doesn't know this device (it was dropped, or never finished signing up)
 *   gone         the phone's push address has expired (404 / 410)
 *   rejected     the push service refused it (401 / 403: the address was made with a different key)
 *   unreachable  the push service didn't answer, or had an error of its own
 */
export async function sendTest(store: StoreLike, id: string, send: Sender, vapid: Vapid) {
  if (!ID.test(id)) return { ok: false, status: 400, reason: 'no-device' };
  const dev = (await store.get(`dev/${id}`, { type: 'json' })) as Device | null;
  if (!dev) return { ok: false, status: 404, reason: 'no-device' };
  // A new tag each time, so a second test isn't swallowed as an update of the first.
  const status = await send(dev.sub, { title: 'Test 2 of 2 🔔', body: 'Sent over the internet, the way real reminders arrive.', url: '/', tag: `test-${Date.now().toString(36)}` }, vapid).catch(() => 0);
  if (status === 404 || status === 410) await removeDevice(store, id);
  const ok = status >= 200 && status < 300;
  return { ok, status, ...(ok ? {} : { reason: status === 404 || status === 410 ? 'gone' : status === 401 || status === 403 ? 'rejected' : 'unreachable' }) };
}

/** Send everything that has fallen due in the last two hours. Run every 15 minutes. */
export async function runDue(store: StoreLike, send: Sender, vapid: Vapid, now = new Date()) {
  const slots = Array.from({ length: 9 }, (_, i) => slotOf(new Date(now.getTime() - i * SLOT_MIN * 60_000)));
  const devices = new Map<string, Device | null>();
  const touched = new Set<string>();
  const gone = new Set<string>();
  let sent = 0;
  let failed = 0;
  for (const slot of slots) {
    const { blobs } = await store.list({ prefix: `due/${slot}/` });
    for (const { key } of blobs) {
      const id = key.split('/')[2];
      if (gone.has(id)) continue;
      if (!devices.has(id)) devices.set(id, (await store.get(`dev/${id}`, { type: 'json' })) as Device | null);
      const dev = devices.get(id);
      const payload = (await store.get(key, { type: 'json' })) as Payload | null;
      if (!dev || !payload) {
        await store.delete(key); // nobody to send it to any more
        continue;
      }
      const status = await send(dev.sub, payload, vapid).catch(() => 0);
      if (status === 404 || status === 410) {
        gone.add(id); // the person turned notifications off or removed the app
        failed++;
        continue;
      }
      if (status >= 200 && status < 300) {
        sent++;
        await store.delete(key);
        delete dev.keys[key];
        touched.add(id);
      } else failed++; // left in place: the next run tries again, for up to two hours
    }
  }
  for (const id of gone) await removeDevice(store, id);
  for (const id of touched) if (!gone.has(id)) await store.setJSON(`dev/${id}`, devices.get(id));
  const prev = ((await store.get('cron', { type: 'json' })) as { day?: string; sentToday?: number } | null) ?? {};
  const day = now.toISOString().slice(0, 10);
  await store.setJSON('cron', { lastRun: now.toISOString(), sent, failed, day, sentToday: (prev.day === day ? (prev.sentToday ?? 0) : 0) + sent });
  return { sent, failed, removed: gone.size };
}

export async function status(store: StoreLike) {
  const { blobs } = await store.list({ prefix: 'dev/' });
  const cron = ((await store.get('cron', { type: 'json' })) as Record<string, unknown> | null) ?? {};
  return { devices: blobs.length, ...cron };
}
