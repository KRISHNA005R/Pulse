import type { ISODate } from '../types';
import { currentCurrency, groupDigits, roundMoney, sym } from './currency';

// ---------- Money ----------
// Uses the person's currency (lib/currency.ts): symbol, digit grouping (1,20,000 for rupees,
// 120,000 elsewhere) and short forms (1.2L / 3Cr for lakh currencies, 12K / 1.2M otherwise).
export function rupees(n: number, opts: { sign?: boolean; abs?: boolean } = {}): string {
  const v = roundMoney(opts.abs ? Math.abs(n) : n);
  const s = groupDigits(Math.abs(v));
  if (opts.sign) return `${v < 0 ? '−' : '+'}${sym()}${s}`;
  return `${v < 0 ? '−' : ''}${sym()}${s}`;
}
/** Same as rupees(): named for what it does now that every currency is supported. */
export const money = rupees;

/** Compact form for tight spots: ₹1.2L, ₹48K, $1.2M */
export function rupeesShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const s = sym();
  const f = (x: number, big: boolean) => x.toFixed(big ? 0 : 1).replace(/\.0$/, '');
  if (currentCurrency().lakh) {
    if (a >= 1e7) return `${sign}${s}${f(a / 1e7, a >= 1e8)}Cr`;
    if (a >= 1e5) return `${sign}${s}${f(a / 1e5, a >= 1e6)}L`;
  } else {
    if (a >= 1e9) return `${sign}${s}${f(a / 1e9, a >= 1e10)}B`;
    if (a >= 1e6) return `${sign}${s}${f(a / 1e6, a >= 1e7)}M`;
  }
  if (a >= 1e3) return `${sign}${s}${f(a / 1e3, a >= 1e4)}K`;
  return `${sign}${s}${Math.round(a)}`;
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

// ---------- Dates (all local, date-only) ----------
export function parseDate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function toISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseDate(d);
  x.setDate(x.getDate() + n);
  return toISO(x);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const x = parseDate(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return toISO(x);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: ISODate): ISODate {
  const x = parseDate(d);
  return toISO(new Date(x.getFullYear(), x.getMonth() + 1, 0));
}

/** Monday-start week. */
export function startOfWeek(d: ISODate): ISODate {
  const x = parseDate(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return toISO(x);
}

export function inRange(d: ISODate, start: ISODate, end: ISODate): boolean {
  return d >= start && d <= end;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const monthName = (d: ISODate) => MONTHS[parseDate(d).getMonth()];
export const monthShort = (d: ISODate) => MON[parseDate(d).getMonth()];
/** "Oct 2025" */
export const fmtMonthYear = (d: ISODate) => `${MON[parseDate(d).getMonth()]} ${parseDate(d).getFullYear()}`;

/** Indian style: 27 Sep, 27 Sep 2026 */
export function fmtDate(d: ISODate, withYear = false): string {
  const x = parseDate(d);
  return `${x.getDate()} ${MON[x.getMonth()]}${withYear ? ` ${x.getFullYear()}` : ''}`;
}

export function fmtDayHeader(d: ISODate, today: ISODate): string {
  const diff = daysBetween(d, today);
  const x = parseDate(d);
  const base = `${x.getDate()} ${MONTHS[x.getMonth()]}`;
  if (diff === 0) return `Today · ${base}`;
  if (diff === 1) return `Yesterday · ${base}`;
  return `${DAYS[x.getDay()]} · ${base}`;
}

/** "Tomorrow", "In 3 days", "Mon, 5 Oct" */
export function relDay(d: ISODate, today: ISODate): string {
  const diff = daysBetween(today, d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff <= 6) return `In ${diff} days`;
  const x = parseDate(d);
  return `${DAYS[x.getDay()].slice(0, 3)}, ${x.getDate()} ${MON[x.getMonth()]}`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function isWeekend(d: ISODate): boolean {
  const g = parseDate(d).getDay();
  return g === 0 || g === 6;
}

export const uid = (p = 'id') => `${p}-${Math.random().toString(36).slice(2, 9)}`;

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Light, optional haptic tick. Visual feedback is always handled by CSS. */
export function haptic(ms = 8) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    /* not supported */
  }
}

export function ordinal(n: number): string {
  const v = n % 100;
  const suf = v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suf}`;
}

export function incomeLabel(kind: string): string {
  return { salary: 'Salary', freelance: 'Freelance', 'part-time': 'Part-time', business: 'Business', allowance: 'Allowance', other: 'Other' }[kind] ?? 'Income';
}

/** The real local date, used for personal mode. */
export function realToday(): ISODate {
  return toISO(new Date());
}
