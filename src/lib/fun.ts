import type { Gullak, ISODate, State, Transaction } from '../types';
import { isAuto } from './auto';
import { roundMoney } from './currency';
import { addDays, parseDate, startOfWeek } from './format';

// The small fun bits: guess the bill, survived payday, gullak.
// All worked out on the phone from what's logged. Friendly, never mean.

export const FIXED = new Set(['rent', 'bills', 'subscriptions', 'insurance', 'emi', 'investments', 'transfer', 'fees', 'tax']);
/** Everyday spending: what people choose to spend on, day to day. */
export const everyday = (t: Transaction) => t.type === 'expense' && !t.recurring && !t.subscriptionId && !t.debtId && !t.insuranceId && !FIXED.has(t.category) && !isAuto(t);
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// ------------------------------------------------------------------
// Guess the bill: once a week, guess last week's spend on one thing
// ------------------------------------------------------------------
export interface GuessRound {
  week: ISODate; // Monday of last week
  cat: string;
  actual: number;
  count: number;
}

export function guessRound(s: State): GuessRound | null {
  const dow = (parseDate(s.today).getDay() + 6) % 7; // Monday = 0
  if (dow > 2) return null; // asked Monday to Wednesday, about last week
  const week = addDays(startOfWeek(s.today), -7);
  if ((s.guesses ?? []).some((g) => g.week === week)) return null;
  const end = addDays(week, 6);
  const spends = s.transactions.filter((t) => t.date >= week && t.date <= end && everyday(t));
  const m = new Map<string, { sum: number; n: number }>();
  for (const t of spends) {
    const x = m.get(t.category) ?? { sum: 0, n: 0 };
    x.sum += t.amount;
    x.n++;
    m.set(t.category, x);
  }
  const top = [...m.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].sum - a[1].sum)[0];
  return top ? { week, cat: top[0], actual: roundMoney(top[1].sum), count: top[1].n } : null;
}

export function guessVerdict(guess: number, actual: number): { title: string; emoji: string; line: string; good: boolean } {
  const err = Math.abs(guess - actual) / Math.max(1, actual);
  if (err <= 0.1) return { title: 'Spot on', emoji: '🎯', line: 'Basically a money psychic.', good: true };
  if (err <= 0.25) return { title: 'So close', emoji: '🤏', line: `Off by ${inr(Math.abs(guess - actual))}. You know your money.`, good: true };
  if (guess < actual) return { title: `${inr(actual - guess)} more than you thought`, emoji: '💀', line: 'The small ones add up. Now you know.', good: false };
  return { title: 'Less than you thought', emoji: '😌', line: `${inr(guess - actual)} under your guess. Love that for you.`, good: true };
}

// ------------------------------------------------------------------
// Survived payday: money left just before each main payday
// ------------------------------------------------------------------
/** What was left to spend: spendable accounts minus what's on the cards. */
export function moneyLeft(s: State): number {
  const cash = s.accounts.filter((a) => a.spendable).reduce((a, x) => a + x.balance, 0);
  const cards = s.cards.reduce((a, c) => a + Math.max(0, c.balance), 0);
  return roundMoney(cash - cards);
}

/** Remember how much was left the moment before a payday landed (once per payday). */
export function notePayday(s: State, date: ISODate) {
  s.paydays ??= [];
  if (s.paydays.some((p) => p.date.slice(0, 7) === date.slice(0, 7))) return;
  s.paydays.push({ date, left: moneyLeft(s) });
  if (s.paydays.length > 36) s.paydays.splice(0, s.paydays.length - 36);
}

/** The latest payday win, for 3 days after it. */
export function survived(s: State): { date: ISODate; left: number; inARow: number } | null {
  const list = (s.paydays ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const last = list[list.length - 1];
  if (!last || last.left <= 0 || s.settings.paydaySeen === last.date) return null;
  if (last.date > s.today || addDays(last.date, 3) < s.today) return null;
  let inARow = 0;
  for (let i = list.length - 1; i >= 0 && list[i].left > 0; i--) inARow++;
  return { ...last, inARow };
}

// ------------------------------------------------------------------
// Gullak
// ------------------------------------------------------------------
export const gullakTarget = (g: Pick<Gullak, 'mode' | 'step' | 'days'>) => roundMoney(g.mode === 'fixed' ? g.step * g.days : (g.step * g.days * (g.days + 1)) / 2);
export const nextCoin = (g: Gullak) => roundMoney(g.mode === 'fixed' ? g.step : g.step * (g.drops.length + 1));
export const gullakFull = (g: Gullak) => g.drops.length >= g.days;
