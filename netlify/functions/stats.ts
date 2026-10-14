// PULSE anonymous usage stats.
//
//   POST /api/ping   { v, id, day, since, ... }   -> 204   (one device's summary for one day; re-sent = overwritten)
//   GET  /api/stats?days=60   header x-stats-key  -> aggregated numbers for the private dashboard
//
// A ping holds only counts and yes/no flags (see src/lib/stats.ts). Each device's summary for a day
// is its own blob, `u/YYYY-MM-DD/<id>`, so phones pinging at the same moment never collide. Once a
// day can't get pings any more (4+ days old), the stats page folds its `u/` blobs into one
// `day/YYYY-MM-DD` blob ({ users: { id: summary } }) and removes them. Days saved before this
// change are already in that shape.
import { getStore } from '@netlify/blobs';

declare const process: { env: Record<string, string | undefined> };

type StoreLike = {
  getWithMetadata(key: string, opts: { type: 'json' }): Promise<{ data: unknown; etag?: string } | null>;
  setJSON(key: string, value: unknown, opts?: { onlyIfMatch?: string; onlyIfNew?: boolean }): Promise<{ modified: boolean } | void>;
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
  delete(key: string): Promise<void>;
};

const EVENTS = ['expense', 'income', 'split', 'ai', 'plan', 'budget', 'backup', 'sync'] as const;
const NUMS = ['incomes', 'txMonth', 'catsMonth', 'plans', 'budgets', 'subs', 'invest', 'insure', 'accounts', 'streak'] as const;
const BOOLS = ['onboarded', 'personal', 'salary', 'sync'] as const;
// Sent by app versions from 14 Oct 2026. Kept only when sent, so older phones don't count as "no".
const NUMS2 = ['bills', 'friends', 'groups'] as const;
const BOOLS2 = ['reminders', 'account'] as const;
const PLATFORMS = ['ios', 'android', 'desktop', 'other'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[0-9a-f]{32}$/;
// SHA-256 of the dashboard key. Override with the STATS_KEY_HASH environment variable in Netlify.
export const DEFAULT_KEY_HASH = '6351fdef5f531536c8631adf33a550635c115d89fce09cc9cacde44588d1f106';

export interface Rec {
  since: string;
  ver: string;
  platform: string;
  installed: boolean;
  demo: boolean;
  ev: Record<(typeof EVENTS)[number], number>;
  s: Record<(typeof NUMS)[number], number> & Record<(typeof BOOLS)[number], boolean> & Partial<Record<(typeof NUMS2)[number], number> & Record<(typeof BOOLS2)[number], boolean>>;
  at: string;
}
type DayBlob = { users: Record<string, Rec> };

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function sha256(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const int = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(9999, Math.round(x))) : 0);
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const utcToday = () => new Date().toISOString().slice(0, 10);

/** Keep only the known fields, as numbers and booleans. Anything else is dropped. */
export function clean(b: Record<string, unknown>): { id: string; day: string; rec: Rec } | null {
  if (!b || b.v !== 1 || typeof b.id !== 'string' || !ID.test(b.id) || typeof b.day !== 'string' || !DAY.test(b.day)) return null;
  const today = utcToday();
  if (b.day < addDays(today, -3) || b.day > addDays(today, 1)) return null; // stale or from the future
  const since = typeof b.since === 'string' && DAY.test(b.since) && b.since <= b.day ? b.since : b.day;
  const ev = (b.ev ?? {}) as Record<string, unknown>;
  const s = (b.s ?? {}) as Record<string, unknown>;
  return {
    id: b.id,
    day: b.day,
    rec: {
      since,
      ver: typeof b.ver === 'string' ? b.ver.slice(0, 20) : '',
      platform: PLATFORMS.includes(b.platform as string) ? (b.platform as string) : 'other',
      installed: b.installed === true,
      demo: b.demo === true,
      ev: Object.fromEntries(EVENTS.map((e) => [e, int(ev[e])])) as Rec['ev'],
      s: {
        ...Object.fromEntries(NUMS.map((k) => [k, int(s[k])])),
        ...Object.fromEntries(BOOLS.map((k) => [k, s[k] === true])),
        ...Object.fromEntries(NUMS2.filter((k) => k in s).map((k) => [k, int(s[k])])),
        ...Object.fromEntries(BOOLS2.filter((k) => k in s).map((k) => [k, s[k] === true])),
      } as Rec['s'],
      at: new Date().toISOString(),
    },
  };
}

async function save(store: StoreLike, day: string, id: string, rec: Rec) {
  await store.setJSON(`u/${day}/${id}`, rec);
  return true;
}

/** Days that can still get pings (a ping may be for up to 3 days ago; India is ahead of UTC). */
const LIVE_DAYS = 4;

/**
 * Every device's summary for each day asked for. Days that can't change any more are folded into
 * one blob the first time they are read, so later reads stay cheap.
 */
export async function readDays(store: StoreLike, list: string[], today: string) {
  const loose = new Map<string, string[]>(); // day -> u/ keys
  for (const { key } of (await store.list({ prefix: 'u/' })).blobs) {
    const [, day, id] = key.split('/');
    if (!DAY.test(day ?? '') || !ID.test(id ?? '')) continue;
    if (!loose.has(day)) loose.set(day, []);
    loose.get(day)!.push(key);
  }
  const settled = addDays(today, -LIVE_DAYS);
  // Days older than the range asked for are folded too, so u/ never piles up.
  const all = [...new Set([...list, ...[...loose.keys()].filter((d) => d < settled)])].sort();
  const out = await Promise.all(
    all.map(async (day) => {
      const users = { ...((((await store.getWithMetadata(`day/${day}`, { type: 'json' }))?.data as DayBlob | undefined)?.users) ?? {}) };
      const keys = loose.get(day) ?? [];
      const recs = await Promise.all(keys.map(async (k) => [k.split('/')[2], (await store.getWithMetadata(k, { type: 'json' }))?.data as Rec | undefined] as const));
      for (const [id, r] of recs) if (r && (!users[id] || r.at >= users[id].at)) users[id] = r;
      if (keys.length && day < settled) {
        await store.setJSON(`day/${day}`, { users } satisfies DayBlob);
        await Promise.all(keys.map((k) => store.delete(k)));
      }
      return { day, users };
    }),
  );
  const want = new Set(list);
  return out.filter((d) => want.has(d.day));
}

// ---------------------------------------------------------------------------------------------
// The numbers for the dashboard
// ---------------------------------------------------------------------------------------------
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const real = (r: Rec) => r.s.personal && r.s.onboarded;

export function aggregate(days: { day: string; users: Record<string, Rec> }[], today: string) {
  // Days are oldest → newest.
  const activeDays = new Map<string, Set<string>>(); // real users only
  const firstSeen = new Map<string, string>(); // every device
  const latest = new Map<string, Rec>(); // latest summary per device, last 30 days
  const from30 = addDays(today, -29);
  const from7 = addDays(today, -6);

  const daily = days.map(({ day, users }) => {
    let opened = 0, active = 0, fresh = 0, logged = 0, expenses = 0, incomes = 0, demo = 0;
    for (const [id, r] of Object.entries(users)) {
      opened++;
      const fs = firstSeen.get(id);
      if (!fs || r.since < fs) firstSeen.set(id, r.since);
      if (r.since === day) fresh++;
      if (r.demo) demo++;
      if (day >= from30) latest.set(id, r);
      if (!real(r)) continue;
      active++;
      if (!activeDays.has(id)) activeDays.set(id, new Set());
      activeDays.get(id)!.add(day);
      if (r.ev.expense + r.ev.income > 0) logged++;
      expenses += r.ev.expense;
      incomes += r.ev.income;
    }
    return { day, opened, active, newcomers: fresh, logged, logs: expenses + incomes, expenses, incomes, demo };
  });

  const activeIn = (from: string) => [...activeDays.values()].filter((set) => [...set].some((d) => d >= from)).length;
  const todayRow = daily.find((d) => d.day === today);
  const dau = todayRow?.active ?? 0;
  const mau = activeIn(from30);

  // Coming back: of the devices that started on a given day, how many were active later.
  const back = (minAge: number, lo: number, hi: number) => {
    let base = 0, hit = 0;
    for (const [id, since] of firstSeen) {
      if (since > addDays(today, -minAge) || since < days[0]?.day) continue;
      const set = activeDays.get(id);
      if (!set) continue; // never set up: counted in the setup funnel instead
      base++;
      const a = addDays(since, lo), b = addDays(since, hi);
      if ([...set].some((d) => d >= a && d <= b)) hit++;
    }
    return { eligible: base, came: hit, pct: pct(hit, base) };
  };
  // Next day; 7–13 days after starting; 28–35 days after starting.
  const retention = { d1: back(1, 1, 1), w1: back(13, 7, 13), m1: back(35, 28, 35) };

  const L = [...latest.values()];
  const R = L.filter(real);
  const count = (xs: Rec[], f: (r: Rec) => boolean) => xs.filter(f).length;
  const funnel = [
    { label: 'Opened PULSE', n: L.length },
    { label: 'Finished setup', n: count(L, real) },
    { label: 'Added a salary', n: count(R, (r) => r.s.salary) },
    { label: 'Logged something this month', n: count(R, (r) => r.s.txMonth > 0) },
    { label: 'Used 5+ categories this month', n: count(R, (r) => r.s.catsMonth >= 5) },
    { label: 'Made a plan', n: count(R, (r) => r.s.plans > 0) },
    { label: 'Added a SIP', n: count(R, (r) => r.s.invest > 0) },
    { label: 'Installed the app', n: count(R, (r) => r.installed) },
  ];
  // Only app versions from 14 Oct 2026 report these, so older phones count as "no" until they update.
  const fresh = R.filter((r) => typeof r.s.reminders === 'boolean');
  const setup = {
    reporting: fresh.length,
    rows: [
      { label: 'Signed in', n: count(fresh, (r) => r.s.account === true) },
      { label: 'Added rent or bills', n: count(fresh, (r) => (r.s.bills ?? 0) > 0) },
      { label: 'Added any recurring payment', n: count(fresh, (r) => r.s.subs > 0) },
      { label: 'Connected a friend', n: count(fresh, (r) => (r.s.friends ?? 0) > 0) },
      { label: 'In a shared group', n: count(fresh, (r) => (r.s.groups ?? 0) > 0) },
      { label: 'Reminders on', n: count(fresh, (r) => r.s.reminders === true) },
    ],
  };

  // Feature use in the last 30 days, by real users.
  const used = (e: keyof Rec['ev']) => {
    const ids = new Set<string>();
    for (const d of days) if (d.day >= from30) for (const [id, r] of Object.entries(d.users)) if (real(r) && r.ev[e] > 0) ids.add(id);
    return ids.size;
  };
  const demoOpeners = new Set<string>();
  for (const d of days) if (d.day >= from30) for (const [id, r] of Object.entries(d.users)) if (r.demo) demoOpeners.add(id);

  const userDays = daily.filter((d) => d.day >= from30).reduce((a, d) => a + d.active, 0);
  const loggedDays = daily.filter((d) => d.day >= from30).reduce((a, d) => a + d.logged, 0);
  const logs30 = daily.filter((d) => d.day >= from30).reduce((a, d) => a + d.expenses + d.incomes, 0);

  const bucket = (xs: number[], edges: [string, number, number][]) => edges.map(([label, lo, hi]) => ({ label, n: xs.filter((x) => x >= lo && x <= hi).length }));
  const daysActive30 = [...activeDays.values()].map((set) => [...set].filter((d) => d >= from30).length).filter((n) => n > 0);
  const tally = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n }));

  return {
    today,
    from: days[0]?.day ?? today,
    totals: { dau, wau: activeIn(from7), mau, stickiness: pct(dau, mau), people: firstSeen.size, openedToday: todayRow?.opened ?? 0 },
    daily,
    retention,
    funnel,
    setup,
    habit: {
      logsPerActiveDay: userDays ? Math.round((logs30 / userDays) * 10) / 10 : 0,
      daysWithLogPct: pct(loggedDays, userDays),
      streakAvg: R.length ? Math.round((R.reduce((a, r) => a + r.s.streak, 0) / R.length) * 10) / 10 : 0,
      streakBest: R.reduce((a, r) => Math.max(a, r.s.streak), 0),
      daysActive: bucket(daysActive30, [['1 day', 1, 1], ['2–3', 2, 3], ['4–7', 4, 7], ['8–14', 8, 14], ['15–24', 15, 24], ['25+', 25, 99]]),
    },
    categories: {
      avg: R.length ? Math.round((R.reduce((a, r) => a + r.s.catsMonth, 0) / R.length) * 10) / 10 : 0,
      spread: bucket(R.map((r) => r.s.catsMonth), [['None', 0, 0], ['1–2', 1, 2], ['3–4', 3, 4], ['5–7', 5, 7], ['8+', 8, 999]]),
    },
    features: [
      { label: 'Logged an expense', n: used('expense') },
      { label: 'Logged income', n: used('income') },
      { label: 'Asked PULSE AI', n: used('ai') },
      { label: 'Split with friends', n: used('split') },
      { label: 'Made a plan', n: used('plan') },
      { label: 'Made a budget', n: used('budget') },
      { label: 'Copied a backup code', n: used('backup') },
      { label: 'Opened the demo (anyone)', n: demoOpeners.size },
    ],
    devices: {
      platform: tally(L.map((r) => r.platform)),
      mode: [
        { label: 'Installed app', n: count(L, (r) => r.installed) },
        { label: 'Browser', n: count(L, (r) => !r.installed) },
      ],
      version: tally(L.map((r) => r.ver || 'unknown')).slice(0, 6),
    },
  };
}

export async function handle(req: Request, store: StoreLike, keyHash = DEFAULT_KEY_HASH): Promise<Response> {
  try {
    const url = new URL(req.url);
    if (req.method === 'POST') {
      if (Number(req.headers.get('content-length') ?? 0) > 4000) return json({ error: 'too big' }, 413);
      const text = await req.text();
      if (text.length > 4000) return json({ error: 'too big' }, 413);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      const c = clean(body);
      if (!c) return json({ error: 'bad ping' }, 400);
      await save(store, c.day, c.id, c.rec);
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    }

    if (req.method === 'GET') {
      const key = req.headers.get('x-stats-key') ?? '';
      if (!key || (await sha256(key)) !== keyHash) return json({ error: 'wrong key' }, 401);
      const n = Math.max(7, Math.min(120, Number(url.searchParams.get('days')) || 60));
      // The person's "today" is up to a day ahead of UTC (India is +5:30).
      const today = url.searchParams.get('today') && DAY.test(url.searchParams.get('today')!) ? url.searchParams.get('today')! : utcToday();
      const list = Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
      return json(aggregate(await readDays(store, list, today), today));
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (e) {
    console.error('stats error', e);
    return json({ error: 'server error' }, 500);
  }
}

export default async (req: Request) =>
  handle(req, getStore({ name: 'pulse-stats', consistency: 'strong' }) as unknown as StoreLike, process.env.STATS_KEY_HASH || DEFAULT_KEY_HASH);

// Reached at /.netlify/functions/stats; public/_redirects maps /api/ping and /api/stats to it.
