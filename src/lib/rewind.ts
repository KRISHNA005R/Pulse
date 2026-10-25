// PULSE Rewind: a month in 5 story slides, worked out from the person's own data on the phone.
// Only percentages, counts and wins: never a rupee amount, so the share card is safe to post.
import type { CategoryId, ISODate, State } from '../types';
import { isAuto } from './auto';
import { categoryName, incomeBetween, investedBetween, isBack, monthRange, myCost, prevMonth, savedBetween, spendBetween } from './finance';
import { addDays, daysBetween, monthName, parseDate } from './format';
import { everyday, FIXED } from './fun';

export type WinKind = 'saved' | 'less' | 'plan' | 'nospend' | 'streak' | 'none';
export interface Rewind {
  month: ISODate; // first day of the month
  monthName: string;
  /** The month isn't over yet: counted up to today. */
  partial: boolean;
  days: number;
  logged: number;
  /** Enough logged for a real Rewind (otherwise a gentle "log a bit more"). */
  enough: boolean;
  top: { category: CategoryId; name: string; emoji: string; pct: number }[];
  app: { name: string; count: number } | null;
  noSpendDays: number;
  bestStreak: number;
  spendiestDay: string | null;
  win: { kind: WinKind; text: string; chip: string; sub?: string };
  title: string;
  habitsTitle: string;
  opener: string;
  chips: string[];
}

const MIN_LOGGED = 10;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ERA: Record<string, string> = {
  food: 'Food era', delivery: 'Delivery era', transport: 'Rides era', shopping: 'Shopping era', entertainment: 'Going-out era',
  travel: 'Travel era', bills: 'Bills era', rent: 'Rent era', subscriptions: 'Streaming era', health: 'Self-care era', education: 'Study era', fitness: 'Gym era',
};
const ARC: Record<WinKind, string> = { saved: 'saver arc', less: 'glow-up arc', plan: 'goal-getter arc', nospend: 'zen arc', streak: 'consistency arc', none: 'main character arc' };

export function buildRewind(s: State, anyDay: ISODate): Rewind {
  const [start, end] = monthRange(anyDay);
  const partial = s.today < end;
  const until = partial ? s.today : end;
  const days = Math.max(1, daysBetween(start, until) + 1);
  const name = monthName(start).split(' ')[0];
  const inMonth = s.transactions.filter((t) => t.date >= start && t.date <= until);
  const logged = inMonth.filter((t) => !isAuto(t) && !t.investmentId);

  // Where it went: everyday spending only (rent, bills, EMIs and subscriptions are left out: they
  // aren't a vibe), with money got back taken off.
  const byCat = new Map<CategoryId, number>();
  for (const t of inMonth) {
    if (everyday(t)) byCat.set(t.category, (byCat.get(t.category) ?? 0) + myCost(s, t));
    else if (isBack(t) && !FIXED.has(t.category)) byCat.set(t.category, (byCat.get(t.category) ?? 0) - t.amount);
  }
  const cats = [...byCat.entries()].map(([category, amount]) => ({ category, amount: Math.max(0, amount) })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = cats.reduce((a, c) => a + c.amount, 0);
  const top = cats.slice(0, 3).map((c) => ({
    category: c.category,
    name: categoryName(s, c.category),
    emoji: s.categories.find((x) => x.id === c.category)?.emoji ?? '✨',
    pct: total > 0 ? Math.round((c.amount / total) * 100) : 0,
  }));

  // The app or place used most (3+ times).
  const counts = new Map<string, number>();
  for (const t of inMonth) if (t.type === 'expense' && !isAuto(t)) counts.set(t.merchant.split(' · ')[0], (counts.get(t.merchant.split(' · ')[0]) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const app = best && best[1] >= 3 ? { name: best[0], count: best[1] } : null;

  // Habits.
  const spentOn = new Set(inMonth.filter(everyday).map((t) => t.date));
  let noSpendDays = 0;
  for (let i = 0; i < days; i++) if (!spentOn.has(addDays(start, i))) noSpendDays++;
  const loggedDays = new Set(logged.map((t) => t.date));
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < days; i++) {
    run = loggedDays.has(addDays(start, i)) ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }
  const byDay = new Array(7).fill(0);
  for (const t of inMonth.filter(everyday)) byDay[parseDate(t.date).getDay()] += t.amount;
  const maxDay = Math.max(...byDay);
  const spendiestDay = maxDay > 0 ? WEEKDAYS[byDay.indexOf(maxDay)] : null;

  // The biggest W, best first.
  const earned = incomeBetween(s, start, until);
  const savedPct = earned > 0 ? Math.round(((savedBetween(s, start, until) + investedBetween(s, start, until)) / earned) * 100) : 0;
  const [pStart, pEnd] = monthRange(prevMonth(start));
  const prevName = monthName(pStart).split(' ')[0];
  const spent = spendBetween(s, start, until);
  const prevSpent = spendBetween(s, pStart, partial ? addDays(pStart, days - 1) : pEnd);
  const lessPct = prevSpent > 0 ? Math.round(((prevSpent - spent) / prevSpent) * 100) : 0;
  const plan = s.plans.filter((p) => p.status === 'active' && p.target > 0 && !p.gullak).map((p) => ({ p, pct: Math.min(100, Math.round((p.saved / p.target) * 100)) })).sort((a, b) => b.pct - a.pct)[0];
  let win: Rewind['win'];
  if (savedPct >= 5) win = { kind: 'saved', text: `You saved ${savedPct}% of what came in.`, chip: `🏆 saved ${savedPct}%`, sub: plan ? `${plan.p.name} is now ${plan.pct}% loaded.` : undefined };
  else if (lessPct >= 5) win = { kind: 'less', text: `You spent ${lessPct}% less than ${prevName}.`, chip: `📉 ${lessPct}% less spent` };
  else if (plan && plan.pct >= 10) win = { kind: 'plan', text: `${plan.p.name} is ${plan.pct}% loaded.`, chip: `🎯 ${plan.p.name} ${plan.pct}%` };
  else if (noSpendDays >= 5) win = { kind: 'nospend', text: `${noSpendDays} days with no spending at all.`, chip: `🧘 ${noSpendDays} no-spend days` };
  else if (bestStreak >= 5) win = { kind: 'streak', text: `${bestStreak} days in a row of logging.`, chip: `🔥 ${bestStreak}-day streak` };
  else win = { kind: 'none', text: 'You showed up and tracked your money. That counts.', chip: '✨ showed up' };

  const era = top[0] ? ERA[top[0].category] ?? `${top[0].name} era` : 'Fresh-start era';
  const title = `${era}, ${ARC[win.kind]}.`;
  const habitsTitle = noSpendDays >= 8 || bestStreak >= 10 ? 'Lowkey disciplined. 👀' : logged.length >= 40 ? 'Busy month, huh? 🫡' : 'Chaotic but trying. 🌀';
  const chips = [
    ...(top[0] ? [`${top[0].emoji} ${top[0].pct}% ${top[0].name.toLowerCase()}`] : []),
    `🧘 ${noSpendDays} no-spend ${noSpendDays === 1 ? 'day' : 'days'}`,
    `🔥 ${bestStreak}-day streak`,
    win.chip,
  ].filter((c, i, a) => a.indexOf(c) === i);
  return {
    month: start,
    monthName: name,
    partial,
    days,
    logged: logged.length,
    enough: logged.length >= MIN_LOGGED,
    top,
    app,
    noSpendDays,
    bestStreak,
    spendiestDay,
    win,
    title,
    habitsTitle,
    opener: `${days} days. ${logged.length} things logged.`,
    chips,
  };
}

/** When to offer the Rewind: the first week of a month (last month's), and the last 3 days (this month so far). */
export function rewindPrompt(s: State): { kind: 'ready' | 'soon'; month: ISODate; monthName: string } | null {
  const day = Number(s.today.slice(8, 10));
  const [mStart, mEnd] = monthRange(s.today);
  const seen = s.settings.rewindSeen ?? '';
  if (day <= 7) {
    const prev = monthRange(prevMonth(s.today))[0];
    if (seen === prev.slice(0, 7)) return null;
    const r = buildRewind(s, prev);
    return r.enough ? { kind: 'ready', month: prev, monthName: r.monthName } : null;
  }
  if (daysBetween(s.today, mEnd) <= 2) {
    if (seen === `${mStart.slice(0, 7)}:soon` || seen === mStart.slice(0, 7)) return null;
    const r = buildRewind(s, mStart);
    return r.enough ? { kind: 'soon', month: mStart, monthName: r.monthName } : null;
  }
  return null;
}
