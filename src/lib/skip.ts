import type { ISODate, State, Transaction } from '../types';
import { isAuto } from './auto';
import { addDays, startOfWeek } from './format';
import { roundMoney } from './currency';

// Skip streak: days in a row without spending on the things you picked (or anything, for a no-spend run).
// PULSE only sees what's logged, so a day counts when you logged something else that day or tapped
// "Skipped it today". One slip a week (an order, or a day with no sign of life) is free: the streak survives.

export const ALL = 'all';

export const LEVELS = [
  { at: 3, name: 'Lowkey', emoji: '🌱' },
  { at: 7, name: 'Locked in', emoji: '🔒' },
  { at: 14, name: 'Built different', emoji: '💪' },
  { at: 30, name: 'Main character', emoji: '👑' },
];

/** Categories that make no sense to skip: fixed costs nobody "orders". */
export const NOT_SKIPPABLE = new Set(['rent', 'bills', 'subscriptions', 'insurance', 'emi', 'investments', 'transfer', 'fees', 'tax']);

const everyday = (t: Transaction) =>
  t.type === 'expense' && !t.recurring && !t.subscriptionId && !t.debtId && !t.insuranceId && !NOT_SKIPPABLE.has(t.category) && !isAuto(t);

/** Does this entry break the skip? */
export function isSlip(cats: string[], t: Transaction) {
  if (!everyday(t)) return false;
  return cats.includes(ALL) || cats.includes(t.category);
}

export type DayKind = 'clean' | 'slip' | 'freed' | 'missed' | 'today' | 'future' | 'off';

export interface SkipStatus {
  count: number;
  best: number;
  /** How today looks right now. */
  /** 'early': spent on it today before any streak existed (day one is tomorrow). */
  today: 'clean' | 'pending' | 'freed' | 'broke' | 'early';
  /** Monday to Sunday of this week. */
  week: { date: ISODate; kind: DayKind }[];
  /** Usual spend per day on the skipped things, from before the streak. */
  usualPerDay: number;
  /** Money not spent during the current run, vs usual. */
  saved: number;
  /** Of that, what hasn't been moved to a plan yet. */
  available: number;
  level?: (typeof LEVELS)[number];
  next?: (typeof LEVELS)[number];
  /** First day of the current run. */
  runStart?: ISODate;
}

export function skipStatus(s: State): SkipStatus | null {
  const sk = s.skip;
  if (!sk) return null;
  const today = s.today;
  const proof = new Set<string>(sk.checkins);
  const slips = new Set<string>();
  for (const t of s.transactions) {
    if (t.date < sk.since || t.date > today) continue;
    if (isSlip(sk.cats, t)) slips.add(t.date);
    else if (!isAuto(t) && !t.investmentId) proof.add(t.date);
  }
  const kind = (d: ISODate): 'clean' | 'slip' | 'missed' | 'pending' => (slips.has(d) ? 'slip' : proof.has(d) ? 'clean' : d === today ? 'pending' : 'missed');

  // Walk forward from the start. The first slip (or missed day) in each Monday-to-Sunday week is
  // forgiven; another one in the same week ends the run, and a new one starts the day after.
  let count = 0;
  let runStart: ISODate | undefined;
  const usedWeek = new Set<string>();
  const freed = new Set<string>();
  const broken = new Set<string>();
  const early = new Set<string>();
  for (let d = sk.since, guard = 0; d <= today && guard < 3700; d = addDays(d, 1), guard++) {
    const k = kind(d);
    if (k === 'pending') continue;
    if (k === 'clean') {
      if (!count) runStart = d;
      count++;
      continue;
    }
    const wk = startOfWeek(d);
    if (count && !usedWeek.has(wk)) {
      usedWeek.add(wk);
      freed.add(d);
      continue;
    }
    if (!count) {
      // Nothing to protect yet: just not a counted day.
      early.add(d);
      continue;
    }
    broken.add(d);
    count = 0;
    runStart = undefined;
  }
  const tk = kind(today);
  const todayState = tk === 'clean' ? 'clean' : tk === 'pending' ? 'pending' : freed.has(today) ? 'freed' : early.has(today) ? 'early' : 'broke';

  const monday = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    let k: DayKind;
    if (date > today) k = 'future';
    else if (date < sk.since) k = 'off';
    else if (date === today && tk === 'pending') k = 'today';
    else {
      const x = kind(date);
      k = x === 'clean' ? 'clean' : freed.has(date) ? 'freed' : x === 'missed' ? 'missed' : 'slip';
    }
    return { date, kind: k };
  });

  // Usual spend: the four weeks before the streak started (or the last four weeks, if that's empty).
  const sum = (from: ISODate, to: ISODate) => s.transactions.filter((t) => t.date >= from && t.date <= to && isSlip(sk.cats, t)).reduce((a, t) => a + t.amount, 0);
  let usual = sum(addDays(sk.since, -28), addDays(sk.since, -1));
  if (!usual) usual = sum(addDays(today, -28), addDays(today, -1));
  const usualPerDay = usual / 28;
  const saved = roundMoney(usualPerDay * count);
  const moved = runStart ? sk.moved.filter((m) => m.date >= runStart!).reduce((a, m) => a + m.amount, 0) : 0;
  const level = [...LEVELS].reverse().find((l) => count >= l.at);
  const next = LEVELS.find((l) => count < l.at);
  return { count, best: Math.max(sk.best, count), today: todayState, week, usualPerDay, saved, available: roundMoney(Math.max(0, saved - moved)), level, next, runStart };
}

/** How often each skippable category came up in the last 30 days: helps pick a weakness. */
export function skipSuggestions(s: State) {
  const from = addDays(s.today, -30);
  const n = new Map<string, number>();
  for (const t of s.transactions) if (t.date >= from && t.date <= s.today && everyday(t)) n.set(t.category, (n.get(t.category) ?? 0) + 1);
  return s.categories
    .filter((c) => c.kind === 'expense' && !NOT_SKIPPABLE.has(c.id))
    .map((c) => ({ cat: c, times: n.get(c.id) ?? 0 }))
    .sort((a, b) => b.times - a.times || a.cat.name.localeCompare(b.cat.name));
}

/** Should Home suggest a skip streak? When delivery or food orders keep coming. */
export function skipNudge(s: State): { cat: string; times: number } | null {
  if (s.skip || s.settings.skipPromoHidden) return null;
  const from = addDays(s.today, -14);
  const n = new Map<string, number>();
  for (const t of s.transactions) if (t.date >= from && t.date <= s.today && everyday(t) && ['delivery', 'food', 'shopping', 'cafe'].includes(t.category)) n.set(t.category, (n.get(t.category) ?? 0) + 1);
  const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 4 ? { cat: top[0], times: top[1] } : null;
}
