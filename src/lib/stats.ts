// Anonymous usage stats, so the PULSE team can see how many people use the app and how.
//
// What leaves the device: a random id (made here, linked to nothing), today's date, and counts —
// how many expenses were added today, how many categories were used this month, yes/no for things
// like "has a salary added". Never amounts, names, merchants, notes, or the sync code.
//
// It's one small summary per device per day, re-sent (overwritten) a few times as the day goes on.
// The exact summary is shown in You → Data & privacy.
import type { State } from '../types';
import { BUILD_TIME } from './update';
import { isStandalone } from './pwa';
import { streak } from './streak';

const KEY = 'pulse-stats-v1';
const ENDPOINT = '/api/ping';
const MIN_GAP = 30 * 60_000; // at most one send every 30 minutes, plus one when the day changes

export type StatEvent = 'expense' | 'income' | 'split' | 'ai' | 'plan' | 'budget' | 'backup' | 'sync';
const EVENTS: StatEvent[] = ['expense', 'income', 'split', 'ai', 'plan', 'budget', 'backup', 'sync'];

interface Local {
  id: string;
  since: string;
  day: string;
  ev: Partial<Record<StatEvent, number>>;
  demo: boolean;
  lastSent: number;
  /** Something was counted since the last send. */
  dirty?: boolean;
}

export interface Summary {
  v: 1;
  id: string;
  day: string;
  since: string;
  ver: string;
  platform: 'ios' | 'android' | 'desktop' | 'other';
  installed: boolean;
  /** Opened the demo today. */
  demo: boolean;
  /** Things done today. */
  ev: Record<StatEvent, number>;
  /** Where their setup stands (counts and yes/no only). */
  s: {
    onboarded: boolean;
    personal: boolean;
    incomes: number;
    salary: boolean;
    txMonth: number;
    catsMonth: number;
    plans: number;
    budgets: number;
    subs: number;
    invest: number;
    accounts: number;
    sync: boolean;
    streak: number;
  };
}

/** The device's local calendar date (the person's day, not UTC). */
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const randomId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

function load(): Local {
  let l: Local | null = null;
  try {
    l = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    /* ignore */
  }
  const today = localDay();
  if (!l || !/^[0-9a-f]{32}$/.test(l.id)) l = { id: randomId(), since: today, day: today, ev: {}, demo: false, lastSent: 0 };
  return l;
}

function save(l: Local) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* storage full or blocked: stats just won't persist */
  }
}

function platform(): Summary['platform'] {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'desktop';
  return 'other';
}

let getState: () => State = () => {
  throw new Error('stats not started');
};
const enabled = () => true;

const syncOn = () => {
  try {
    return !!localStorage.getItem('pulse-sync-v1');
  } catch {
    return false;
  }
};

export function buildSummary(s: State, l: Local = load()): Summary {
  const personal = s.mode === 'personal';
  const month = s.today.slice(0, 7);
  const monthTx = personal ? s.transactions.filter((t) => t.date.startsWith(month)) : [];
  return {
    v: 1,
    id: l.id,
    day: l.day,
    since: l.since,
    ver: BUILD_TIME.slice(0, 16),
    platform: platform(),
    installed: isStandalone(),
    demo: l.demo,
    ev: Object.fromEntries(EVENTS.map((e) => [e, Math.min(999, l.ev[e] ?? 0)])) as Summary['ev'],
    s: personal
      ? {
          onboarded: s.onboarding.done,
          personal: true,
          incomes: s.incomes.length,
          salary: s.incomes.some((i) => i.cycle === 'monthly' && i.expected > 0),
          txMonth: monthTx.length,
          catsMonth: new Set(monthTx.filter((t) => t.type === 'expense').map((t) => t.category)).size,
          plans: s.plans.length,
          budgets: s.budgets.length,
          subs: s.subscriptions.length,
          invest: s.investments.length,
          accounts: s.accounts.length,
          sync: syncOn(),
          streak: streak(s).count,
        }
      : { onboarded: false, personal: false, incomes: 0, salary: false, txMonth: 0, catsMonth: 0, plans: 0, budgets: 0, subs: 0, invest: 0, accounts: 0, sync: false, streak: 0 },
  };
}

function post(body: Summary, beacon = false) {
  const text = JSON.stringify(body);
  try {
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([text], { type: 'application/json' }));
      return;
    }
    void fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: text, keepalive: true }).catch(() => {});
  } catch {
    /* offline or blocked: the next send carries the same numbers */
  }
}

/** Send the summary if it's due. When the date has changed, close out yesterday first. */
function flush(force = false, beacon = false) {
  if (!enabled() || !navigator.onLine) return;
  const l = load();
  const today = localDay();
  const s = getState();
  if (l.day !== today) {
    post(buildSummary(s, l), beacon); // yesterday's final numbers
    Object.assign(l, { day: today, ev: {}, demo: s.mode === 'demo', lastSent: 0 });
  }
  if (s.mode === 'demo') l.demo = true;
  // Leaving the app sends what changed; otherwise at most every 30 minutes.
  if (!force && !(beacon && l.dirty) && Date.now() - l.lastSent < MIN_GAP) return save(l);
  l.lastSent = Date.now();
  l.dirty = false;
  save(l);
  post(buildSummary(s, l), beacon);
}

/** Count something the person did (adding an expense, asking the AI…). */
export function track(e: StatEvent) {
  try {
    const l = load();
    const today = localDay();
    if (l.day !== today) {
      if (enabled()) post(buildSummary(getState(), l));
      Object.assign(l, { day: today, ev: {}, demo: false, lastSent: 0 });
    }
    l.ev[e] = (l.ev[e] ?? 0) + 1;
    l.dirty = true;
    save(l);
  } catch {
    /* never let stats break the app */
  }
}

export function markDemo() {
  const l = load();
  l.demo = true;
  l.dirty = true;
  save(l);
}

/** What would be sent right now. Shown in Data & privacy. */
export function previewSummary(s: State): Summary {
  return buildSummary(s);
}

let started = false;
export function startStats(read: () => State) {
  getState = read;
  if (started || typeof window === 'undefined') return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  started = true;
  save(load()); // fix the first-seen date on first open
  window.setTimeout(() => flush(), 4000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(false, true);
    else flush();
  });
}
