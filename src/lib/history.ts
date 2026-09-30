import type { CategoryId, ISODate, State } from '../types';
import { categoryName, incomeBetween, investedBetween, savedBetween, spendBetween, spendByCategory } from './finance';
import { endOfMonth } from './format';

// Long-term history: month-by-month and year totals, built from the transactions on this device.

export interface MonthStat {
  /** First day of the month. */
  month: ISODate;
  spent: number;
  income: number;
  saved: number;
  invested: number;
  /** In the future (nothing can have happened yet). */
  future: boolean;
  /** This month, still running. */
  current: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function monthStat(s: State, month: ISODate): MonthStat {
  const start = month.slice(0, 8) + '01';
  const fullEnd = endOfMonth(start);
  const future = start > s.today;
  const current = !future && fullEnd >= s.today;
  const end = current ? s.today : fullEnd;
  if (future) return { month: start, spent: 0, income: 0, saved: 0, invested: 0, future, current };
  return { month: start, spent: spendBetween(s, start, end), income: incomeBetween(s, start, end), saved: savedBetween(s, start, end), invested: investedBetween(s, start, end), future, current };
}

/** Twelve months (Jan to Dec) of a calendar year. */
export function yearMonths(s: State, year: number): MonthStat[] {
  return Array.from({ length: 12 }, (_, i) => monthStat(s, `${year}-${pad(i + 1)}-01`));
}

/** Years that have any transaction, newest first, always including the current year. */
export function activeYears(s: State): number[] {
  const set = new Set<number>([Number(s.today.slice(0, 4))]);
  for (const t of s.transactions) set.add(Number(t.date.slice(0, 4)));
  return [...set].sort((a, b) => b - a);
}

/** Every month from the first transaction to now, newest first. */
export function allMonths(s: State): MonthStat[] {
  const first = s.transactions.reduce<ISODate>((a, t) => (t.date < a ? t.date : a), s.today);
  const out: MonthStat[] = [];
  let y = Number(s.today.slice(0, 4));
  let m = Number(s.today.slice(5, 7));
  const fy = Number(first.slice(0, 4));
  const fm = Number(first.slice(5, 7));
  let guard = 0;
  while ((y > fy || (y === fy && m >= fm)) && guard++ < 240) {
    out.push(monthStat(s, `${y}-${pad(m)}-01`));
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export interface YearSummary {
  year: number;
  months: MonthStat[];
  spent: number;
  income: number;
  saved: number;
  invested: number;
  /** Months that have started (up to and including this one). */
  monthsSoFar: number;
  avgSpent: number;
  highest: MonthStat | null;
  lowest: MonthStat | null;
  categories: { category: CategoryId; name: string; amount: number; share: number }[];
}

export function yearSummary(s: State, year: number): YearSummary {
  const months = yearMonths(s, year);
  const started = months.filter((m) => !m.future);
  const withSpend = started.filter((m) => m.spent > 0);
  const sum = (k: keyof Pick<MonthStat, 'spent' | 'income' | 'saved' | 'invested'>) => started.reduce((a, m) => a + m[k], 0);
  const spent = sum('spent');
  const start = `${year}-01-01`;
  const end = `${year}-12-31` < s.today ? `${year}-12-31` : s.today;
  const cats = start <= s.today ? spendByCategory(s, start, end) : [];
  // Complete months only for "highest/lowest", so a half-finished month doesn't look cheap.
  const complete = withSpend.filter((m) => !m.current);
  const pool = complete.length ? complete : withSpend;
  return {
    year,
    months,
    spent,
    income: sum('income'),
    saved: sum('saved'),
    invested: sum('invested'),
    monthsSoFar: started.length,
    avgSpent: withSpend.length ? Math.round(spent / withSpend.length) : 0,
    highest: pool.length ? pool.reduce((a, m) => (m.spent > a.spent ? m : a)) : null,
    lowest: pool.length > 1 ? pool.reduce((a, m) => (m.spent < a.spent ? m : a)) : null,
    categories: cats.map((c) => ({ category: c.category, name: categoryName(s, c.category), amount: c.amount, share: spent ? c.amount / spent : 0 })),
  };
}
