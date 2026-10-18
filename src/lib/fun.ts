import type { Gullak, ISODate, State, Transaction } from '../types';
import { isAuto } from './auto';
import { roundMoney, scaled } from './currency';
import { addDays, endOfMonth, parseDate, startOfWeek } from './format';
import { planMetrics, safeToSpend } from './finance';
import { streak } from './streak';

// The small fun bits: money aura, guess the bill, survived payday, roast or toast, gullak.
// All worked out on the phone from what's logged. Friendly, never mean.

const FIXED = new Set(['rent', 'bills', 'subscriptions', 'insurance', 'emi', 'investments', 'transfer', 'fees', 'tax']);
/** Everyday spending: what people choose to spend on, day to day. */
export const everyday = (t: Transaction) => t.type === 'expense' && !t.recurring && !t.subscriptionId && !t.debtId && !t.insuranceId && !FIXED.has(t.category) && !isAuto(t);
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ------------------------------------------------------------------
// Money aura: the month's vibe, from how the money went
// ------------------------------------------------------------------
export interface Aura {
  key: string; // YYYY-MM
  label: string; // "September" or "October so far"
  name: string;
  emoji: string;
  line: string;
  stats: { label: string; value: string }[];
}

export function moneyAura(s: State): Aura | null {
  const today = s.today;
  const day = parseDate(today).getDate();
  // First week of a month: last month's aura. Otherwise: this month so far.
  const ref = day <= 7 ? addDays(today.slice(0, 8) + '01', -1) : today;
  const from = ref.slice(0, 8) + '01';
  const to = day <= 7 ? endOfMonth(ref) : today;
  const key = ref.slice(0, 7);
  const label = `${MONTHS[parseDate(ref).getMonth()]}${day <= 7 ? '' : ' so far'}`;
  const txs = s.transactions.filter((t) => t.date >= from && t.date <= to);
  const spends = txs.filter(everyday);
  if (spends.length < 6) return null;
  const total = spends.reduce((a, t) => a + t.amount, 0);
  const by = (f: (t: Transaction) => string) => {
    const m = new Map<string, number>();
    for (const t of spends) m.set(f(t), (m.get(f(t)) ?? 0) + t.amount);
    return m;
  };
  const cat = by((t) => t.category);
  const share = (...ids: string[]) => ids.reduce((a, id) => a + (cat.get(id) ?? 0), 0) / total;
  const merchants = [...by((t) => t.merchant.split(' · ')[0]).entries()].sort((a, b) => b[1] - a[1]);
  const weekend = spends.filter((t) => [0, 6].includes(parseDate(t.date).getDay())).reduce((a, t) => a + t.amount, 0) / total;
  const income = txs.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const allOut = txs.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const saveRate = income > 0 ? (income - allOut) / income : 0;
  const spendDays = new Set(spends.map((t) => t.date));
  const days = Math.max(1, Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 864e5) + 1);
  const noSpend = days - spendDays.size;
  const dayTotals = [...by((t) => t.date).entries()].sort((a, b) => b[1] - a[1]);
  const topDelivery = merchants.find(([m]) => /zepto|blinkit|instamart|swiggy|zomato|bigbasket|minutes/i.test(m))?.[0] ?? '';
  const avg = total / spends.length;

  let a: Pick<Aura, 'name' | 'emoji' | 'line'>;
  if (saveRate >= 0.35) a = { name: 'Silent Saver', emoji: '🤫', line: 'Spends like a ghost. Saves like a boss.' };
  else if (share('delivery') >= 0.22 || (share('food', 'delivery') >= 0.4 && topDelivery))
    a = /zepto|blinkit|instamart|minutes|bigbasket/i.test(topDelivery) ? { name: 'Zepto Zombie', emoji: '🧟', line: '10-minute delivery, 10 times a week. The rider knows your gate code.' } : { name: 'Swiggy Soulmate', emoji: '🛵', line: 'Cooking? Never heard of her.' };
  else if (share('cafe') >= 0.15) a = { name: 'Café Hopper', emoji: '☕', line: 'Oat milk is a personality trait.' };
  else if (share('shopping') >= 0.3) a = { name: 'Add-to-Cart Royalty', emoji: '🛍️', line: 'The cart is always full. So is the heart.' };
  else if (weekend >= 0.5) a = { name: 'Weekend Warrior', emoji: '🎉', line: 'Monday to Friday: monk. Saturday: main character.' };
  else if (share('travel') >= 0.3) a = { name: 'Wanderlust Wallet', emoji: '✈️', line: 'Money comes, money goes. Mostly to airports.' };
  else if (share('transport', 'fuel') >= 0.25) a = { name: 'Always On The Move', emoji: '🛺', line: 'Your Uber rating is better than your savings rate.' };
  else if (share('entertainment', 'gaming') >= 0.2) a = { name: 'Side Quest Spender', emoji: '🎮', line: 'Main quest: savings. Side quests: everything else.' };
  else if (noSpend >= 10) a = { name: 'Zen Mode', emoji: '🧘', line: `${noSpend} days without spending. Inner peace, outer balance.` };
  else if (spends.length >= 40 && avg < scaled(250)) a = { name: 'Tiny Tap Spender', emoji: '🪙', line: 'Death by a hundred ₹99s.' };
  else a = { name: 'Balanced Baddie', emoji: '⚖️', line: 'Not too much, not too little. Chef’s kiss.' };

  const stats = [
    { label: 'Spent on everyday stuff', value: inr(total) },
    ...(merchants[0] ? [{ label: 'Top spot', value: `${merchants[0][0].length > 16 ? merchants[0][0].slice(0, 15) + '…' : merchants[0][0]} · ${inr(merchants[0][1])}` }] : []),
    { label: 'No-spend days', value: String(noSpend) },
    ...(dayTotals[0] ? [{ label: 'Biggest day', value: `${parseDate(dayTotals[0][0]).getDate()} ${MONTHS[parseDate(dayTotals[0][0]).getMonth()].slice(0, 3)} · ${inr(dayTotals[0][1])}` }] : []),
  ];
  return { key, label, ...a, stats };
}

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
// Roast or toast (PULSE AI)
// ------------------------------------------------------------------
function week(s: State) {
  const from = addDays(s.today, -6);
  const spends = s.transactions.filter((t) => t.date >= from && t.date <= s.today && everyday(t));
  const sum = (f: (t: Transaction) => boolean) => spends.filter(f).reduce((a, t) => a + t.amount, 0);
  const count = (f: (t: Transaction) => boolean) => spends.filter(f).length;
  return { spends, sum, count, from };
}

export function roastMe(s: State): string {
  const w = week(s);
  if (!w.spends.length) return 'Nothing logged this week. Either you’re a monk, or you’re hiding receipts 👀';
  const lines: string[] = [];
  const delivery = (t: Transaction) => t.category === 'delivery' || /zepto|blinkit|instamart|swiggy|zomato/i.test(t.merchant);
  const app = w.spends.filter(delivery).map((t) => t.merchant.split(' · ')[0])[0];
  if (w.count(delivery) >= 3) lines.push(`${w.count(delivery)} ${app ?? 'delivery'} orders this week. At this point you’re not a customer, you’re a shareholder.`, `${inr(w.sum(delivery))} on delivery in 7 days. Your kitchen is just a very expensive storage room.`);
  if (w.count((t) => t.category === 'cafe') >= 3) lines.push(`${w.count((t) => t.category === 'cafe')} coffees this week. Your blood type is cold brew.`);
  if (w.sum((t) => t.category === 'shopping') >= scaled(1500)) lines.push(`${inr(w.sum((t) => t.category === 'shopping'))} on shopping. Your cart has more commitment than your situationship.`);
  if (w.sum((t) => t.category === 'transport') >= scaled(800)) lines.push(`${inr(w.sum((t) => t.category === 'transport'))} on rides this week. Walking is free cardio, just saying.`);
  const wk = w.sum((t) => [0, 6].includes(parseDate(t.date).getDay()));
  if (wk >= scaled(1500)) lines.push(`${inr(wk)} on the weekend alone. Saturday you is a menace to Monday you.`);
  const safe = safeToSpend(s).safe;
  if (safe < scaled(1000)) lines.push(`Safe to spend: ${inr(safe)}. Your bank balance is in its flop era.`);
  if (!lines.length) lines.push(`${inr(w.sum(() => true))} this week and nothing wild. Honestly, too boring to roast. Respect.`, 'Your money said “going out for milk” and never came back. Kidding, you’re doing fine.');
  return pick(lines);
}

export function toastMe(s: State): string {
  const w = week(s);
  const lines: string[] = [];
  const days = new Set(w.spends.map((t) => t.date));
  const none = 7 - days.size;
  if (none >= 2) lines.push(`${none} no-spend days this week. Monk mode unlocked 🧘`);
  const plan = s.plans.filter((p) => p.status === 'active').map((p) => ({ p, m: planMetrics(s, p) })).sort((a, b) => b.m.progress - a.m.progress)[0];
  if (plan && plan.m.progress >= 0.2) lines.push(`${plan.p.name} is ${Math.round(plan.m.progress * 100)}% done. Future you is screaming thank you.`);
  const st = streak(s);
  if (st.count >= 3) lines.push(`${st.count}-day logging streak. Consistency is your love language.`);
  const lastWeek = s.transactions.filter((t) => t.date >= addDays(w.from, -7) && t.date < w.from && everyday(t)).reduce((a, t) => a + t.amount, 0);
  const now = w.sum(() => true);
  if (lastWeek > 0 && now < lastWeek) lines.push(`${inr(lastWeek - now)} less than last week. That’s a glow-up.`);
  const safe = safeToSpend(s).safe;
  if (safe >= scaled(2000)) lines.push(`${inr(safe)} safe to spend till payday. You’re good, bestie.`);
  if (!lines.length) lines.push('You opened a budgeting app on purpose. That alone is elite behaviour.', 'You’re tracking every rupee. Most people can’t even find their UPI PIN.');
  return pick(lines);
}

// ------------------------------------------------------------------
// Gullak
// ------------------------------------------------------------------
export const gullakTarget = (g: Pick<Gullak, 'mode' | 'step' | 'days'>) => roundMoney(g.mode === 'fixed' ? g.step * g.days : (g.step * g.days * (g.days + 1)) / 2);
export const nextCoin = (g: Gullak) => roundMoney(g.mode === 'fixed' ? g.step : g.step * (g.drops.length + 1));
export const gullakFull = (g: Gullak) => g.drops.length >= g.days;
