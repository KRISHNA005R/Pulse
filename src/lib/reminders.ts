// Reminders by web push.
//
// The app works out which reminders this person should get from their own data, then gives the
// server only what it needs to deliver them: a time and the text to show. With "details" off,
// that text has no names or amounts. The server part is netlify/lib/push.ts.
//
// One reminder is different: the daily message (netlify/lib/daily.ts). The server picks it and
// sends the same one to everybody at 10 am India time, so it uses nothing from this person's data.
import type { ReminderPrefs, State } from '../types';
import { isAuto } from './auto';
import { mainIncome, upcoming } from './finance';
import { addDays, rupees } from './format';
import { streak } from './streak';

export const DEFAULT_REMINDERS: ReminderPrefs = { daily: true, dailyAt: '21:00', payday: true, bills: true, streak: true, weekly: true, details: false, message: true };
export const prefsOf = (s: State): ReminderPrefs => ({ ...DEFAULT_REMINDERS, ...(s.settings.reminders ?? {}) });

export interface Reminder {
  at: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** A local date and clock time as a real moment. */
const moment = (date: string, time: string) => new Date(`${date}T${time}:00`);

/** Every reminder for the next few weeks, worked out from the person's data. */
export function buildReminders(s: State, p: ReminderPrefs = prefsOf(s), now = new Date()): Reminder[] {
  if (s.mode !== 'personal' || !s.onboarding.done) return [];
  const out: Reminder[] = [];
  const today = s.today;
  const add = (date: string, time: string, r: Omit<Reminder, 'at'>) => {
    const at = moment(date, time);
    if (at.getTime() > now.getTime() + 60_000) out.push({ at: at.toISOString(), ...r });
  };
  const time = /^\d\d:\d\d$/.test(p.dailyAt) ? p.dailyAt : '21:00';
  const loggedToday = s.transactions.some((t) => t.date === today && !isAuto(t));
  const st = streak(s);

  // 1. Log your day (and 4. the streak warning, which replaces today's nudge when there's a streak to lose)
  for (let d = 0; d < 14; d++) {
    const date = addDays(today, d);
    const atRisk = d === 0 && p.streak && st.count >= 2 && !st.today;
    if (d === 0 && loggedToday) continue; // already logged today: no nudge tonight
    if (atRisk) add(date, time, { title: `Your ${st.count}-day streak ends tonight 🔥`, body: 'Log one thing to keep it going.', url: '/?action=add', tag: `daily-${date}` });
    else if (p.daily) add(date, time, { title: 'Log today’s spends', body: 'Ten seconds now keeps your safe-to-spend honest.', url: '/?action=add', tag: `daily-${date}` });
  }

  // 2. Payday
  if (p.payday) {
    const main = mainIncome(s);
    s.incomes
      .filter((i) => i.cycle === 'monthly' && i.nextDate && i.expected > 0 && i.nextDate >= today && i.nextDate <= addDays(today, 34))
      .forEach((i, n) => {
        const isMain = i === main;
        const title = isMain ? 'Payday 💸' : 'Money day 💸';
        const body = i.autoCredit
          ? p.details
            ? `${rupees(i.expected)} from ${i.name} is in. Open PULSE to see your new safe-to-spend.`
            : 'Your salary is in. Open PULSE to see your new safe-to-spend.'
          : p.details
            ? `Did ${rupees(i.expected)} from ${i.name} land? Tap to add it.`
            : 'Did your salary land? Tap to add it and start the new month.';
        add(i.nextDate!, '10:00', { title, body, url: '/', tag: `payday-${i.nextDate}-${n}` });
      });
  }

  // 3. Bills, subscriptions, card bills, EMIs and SIPs due tomorrow: one reminder per day, the evening before
  if (p.bills) {
    const byDate = new Map<string, { name: string; amount: number }[]>();
    for (const u of upcoming(s, addDays(today, 32))) {
      if (u.date <= today) continue;
      byDate.set(u.date, [...(byDate.get(u.date) ?? []), { name: u.name.replace(/^SIP · /, ''), amount: u.amount }]);
    }
    for (const [date, items] of byDate) {
      const total = items.reduce((a, x) => a + x.amount, 0);
      const title = p.details
        ? items.length === 1
          ? `${items[0].name} is due tomorrow`
          : `${items.length} payments due tomorrow`
        : items.length === 1
          ? 'A payment is due tomorrow'
          : `${items.length} payments are due tomorrow`;
      const body = p.details
        ? items.length === 1
          ? `${rupees(total)}. Open PULSE to see what else is coming up.`
          : `${items.slice(0, 3).map((x) => x.name).join(', ')}${items.length > 3 ? ` and ${items.length - 3} more` : ''}: ${rupees(total)} in total.`
        : 'Open PULSE to see what’s coming up.';
      add(addDays(date, -1), '19:00', { title, body, url: '/', tag: `bills-${date}` });
    }
  }

  // 5. Sunday recap
  if (p.weekly) {
    let found = 0;
    for (let d = 0; d < 35 && found < 4; d++) {
      const date = addDays(today, d);
      if (new Date(`${date}T12:00:00`).getDay() !== 0) continue;
      found++;
      add(date, '18:00', { title: 'Your week in PULSE', body: 'See where this week’s money went.', url: '/?tab=activity', tag: `week-${date}` });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

// ---------------------------------------------------------------------------------------------
// This device
// ---------------------------------------------------------------------------------------------
const KEY = 'pulse-push-v1';
const ENDPOINT = '/api/push';

interface Local {
  id: string;
  /** Reminders are switched on for this device. */
  on: boolean;
  /** The Home "want a nudge?" card was answered. */
  asked?: boolean;
  hash?: string;
  syncedAt?: number;
}

const randomId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
function load(): Local {
  try {
    const l = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Local | null;
    if (l && /^[0-9a-f]{32}$/.test(l.id)) return l;
  } catch {
    /* ignore */
  }
  return { id: randomId(), on: false };
}
function save(l: Local) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* ignore */
  }
}

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushPermission = (): NotificationPermission | 'unsupported' => (pushSupported() ? Notification.permission : 'unsupported');
export const remindersOn = () => load().on && pushPermission() === 'granted';
export const reminderAsked = () => !!load().asked;
/** This device's id on the notification server, when reminders are on here. Lets a friend's split reach this phone. */
export const reminderDeviceId = () => (remindersOn() ? load().id : undefined);
export const markReminderAsked = () => save({ ...load(), asked: true });

const post = (body: unknown) => fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** The service worker, or null if there isn't one within a few seconds (previews, private windows). */
function worker(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => window.setTimeout(() => r(null), 4000))]);
}

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function subscription(create: boolean): Promise<PushSubscription | null> {
  const reg = await worker();
  if (!reg) return null;
  const have = await reg.pushManager.getSubscription();
  if (have || !create) return have;
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error('no key');
  const { publicKey } = (await res.json()) as { publicKey: string };
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

export type EnableResult = 'ok' | 'denied' | 'unsupported' | 'error';

/** Ask for permission (must be called from a tap), subscribe this device and queue its reminders. */
export async function enableReminders(s: State): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported';
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      save({ ...load(), asked: true });
      return 'denied';
    }
    const sub = await subscription(true);
    if (!sub) return 'error';
    save({ ...load(), on: true, asked: true, hash: undefined });
    return (await syncReminders(s, true)) ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export async function disableReminders() {
  const l = load();
  save({ ...l, on: false, hash: undefined });
  try {
    await post({ action: 'off', id: l.id });
    // Waited for, so turning reminders straight back on gets a fresh address and not the one being closed.
    await (await subscription(false))?.unsubscribe().catch(() => {});
  } catch {
    /* offline: the server drops the device the first time a send fails */
  }
}

/** Throw away this device's push address and get a new one. Fixes an address that expired or was made with an old key. */
async function resubscribe(): Promise<PushSubscription | null> {
  const reg = await worker();
  if (!reg) return null;
  await (await reg.pushManager.getSubscription())?.unsubscribe().catch(() => {});
  return subscription(true);
}

/**
 * The "Send a test" button: one notification, sent by the server the way real reminders travel.
 * If the server can't deliver, this device signs up again from scratch and tries once more.
 */
export async function runReminderTest(s: State): Promise<boolean> {
  const ask = async (): Promise<{ ok: boolean; reason?: string }> => {
    try {
      const res = await post({ action: 'test', id: load().id });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      return { ok: res.ok && j.ok !== false, reason: j.reason };
    } catch {
      return { ok: false, reason: 'offline' };
    }
  };
  const r = await ask();
  if (r.ok) return true;
  if (r.reason === 'offline') return false;
  try {
    const sub = r.reason === 'unreachable' ? await subscription(true) : await resubscribe();
    if (!sub) return false;
    save({ ...load(), hash: undefined });
    return (await syncReminders(s, true)) && (await ask()).ok;
  } catch {
    return false;
  }
}

/** Send this device's reminders to the server, if they changed. Safe to call often. */
export async function syncReminders(s: State, force = false): Promise<boolean> {
  const l = load();
  if (!l.on || pushPermission() !== 'granted' || !navigator.onLine) return false;
  if (s.mode !== 'personal') return false; // the demo never changes anyone's reminders
  try {
    const reminders = buildReminders(s);
    // The daily message is sent by the server to everyone who hasn't switched it off; this device only says yes or no.
    const daily = prefsOf(s).message;
    const hash = JSON.stringify([reminders, daily]);
    if (!force && hash === l.hash && Date.now() - (l.syncedAt ?? 0) < 12 * 3600_000) return true;
    const sub = await subscription(true); // re-subscribes quietly if the browser dropped it
    if (!sub) return false;
    const res = await post({ action: 'sync', id: l.id, sub: sub.toJSON(), reminders, daily });
    if (!res.ok) return false;
    save({ ...load(), hash, syncedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}
