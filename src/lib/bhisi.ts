import type { Bhisi, ISODate, State } from '../types';
import { roundMoney } from './currency';

// Bhisi (also called BC or committee): a group puts in the same amount every month, and each month
// one person, picked by lucky chit, takes the whole pot. Everyone wins exactly once.
// PULSE only keeps track: who paid, who won. It never holds or moves real money.

export const pot = (b: Bhisi) => roundMoney(b.amount * b.members.length);

/** The round that hasn't been drawn yet (undefined when everyone has won). */
export function currentRound(b: Bhisi): number | undefined {
  const i = b.rounds.findIndex((r) => !r.winner);
  return i < 0 ? undefined : i;
}

/** People whose chit is still in the matka. */
export const inBowl = (b: Bhisi) => b.members.filter((m) => !b.rounds.some((r) => r.winner === m));

export const isDone = (b: Bhisi) => currentRound(b) === undefined;

/** Fair pick: the browser's crypto random, never Math.random. */
export function pickWinner(names: string[]): string {
  // Rejection sampling: no name is even slightly more likely than another.
  const n = names.length;
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a);
  while (a[0] >= limit);
  return names[a[0] % n];
}

// ---- Luck, not a fix ----------------------------------------------------------------------
// Same rule as PULSE's server (netlify/lib/bhisi.ts): not paid 4 tickets, paid before the draw 5,
// paid 3+ days before the draw date 6. The most anyone gets is 1.5× someone who hasn't paid.
export const TICKETS = { unpaid: 4, paid: 5, early: 6 };
export const EARLY_DAYS = 3;
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const dayGap = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
export function tickets(paidAt: string | undefined, roundDate: string): number {
  if (!paidAt) return TICKETS.unpaid;
  return dayGap(istDay(paidAt), roundDate) >= EARLY_DAYS ? TICKETS.early : TICKETS.paid;
}
export const ticketLabel = (t: number) => (t >= TICKETS.early ? 'Early bird 🐦' : t >= TICKETS.paid ? 'Paid ✓' : 'Not paid yet');

/** Everyone's chance in one round: who's still in the matka and how many tickets they hold. */
export function chances(b: Bhisi, round: number): { id: string; tickets: number; pct: number }[] {
  const r = b.rounds[round];
  if (!r) return [];
  const won = new Set(b.rounds.slice(0, round).map((x) => x.winner));
  const pool = b.members.filter((m) => !won.has(m));
  const list = pool.map((id) => ({ id, tickets: r.odds?.[id] ?? (r.winner ? TICKETS.unpaid : tickets(r.paidAt?.[id] ?? (r.paid.includes(id) ? r.date + 'T00:00:00+05:30' : undefined), r.date)) }));
  const total = list.reduce((a, x) => a + x.tickets, 0) || 1;
  return list.map((x) => ({ ...x, pct: Math.round((x.tickets / total) * 100) }));
}

/** Weighted pick for a bhisi that isn't shared (the demo): crypto randomness over every ticket. */
export function pickWeighted(items: { id: string; w: number }[]): string {
  const total = items.reduce((a, x) => a + x.w, 0);
  const idx = Array.from({ length: total }, (_, i) => String(i));
  const n = Number(pickWinner(idx));
  let acc = 0;
  for (const x of items) {
    acc += x.w;
    if (n < acc) return x.id;
  }
  return items[items.length - 1].id;
}

/** What the bhisi means for me, in one friendly line. */
export function myStanding(b: Bhisi): { paid: number; got: number; line: string } {
  const paid = roundMoney(b.rounds.filter((r) => r.paid.includes('me')).length * b.amount);
  const wonAt = b.rounds.findIndex((r) => r.winner === 'me');
  const got = wonAt >= 0 ? pot(b) : 0;
  const total = pot(b);
  let line: string;
  if (wonAt < 0) line = `Still in the matka. When your chit comes out, you get ${fmt(total)} in one go.`;
  else if (wonAt < b.members.length / 2) line = `You won early: like an interest-free loan of ${fmt(total - paid)}. Keep paying your ${fmt(b.amount)} each month.`;
  else line = `You won late: ${fmt(total)} of forced savings, paid out in one go. Big W.`;
  return { paid, got, line };
}
const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Bhisi rounds due before a date that I haven't paid yet (for safe-to-spend). */
export function bhisiDues(s: State, until: ISODate) {
  const out: { b: Bhisi; date: ISODate }[] = [];
  for (const b of s.bhisis ?? []) {
    const i = currentRound(b);
    if (i === undefined || !b.members.includes('me')) continue;
    const r = b.rounds[i];
    if (!r.paid.includes('me') && r.date < until) out.push({ b, date: r.date });
  }
  return out;
}

// ---- replay links: anyone in the group opens the link and watches the same chit come out ----
export interface DrawReplay {
  n: string; // bhisi name
  e: string; // emoji
  r: number; // round number (1-based)
  p: number; // pot
  w: string; // winner's name
  c: string[]; // names that were in the matka
}

export function replayUrl(d: DrawReplay): string {
  const json = JSON.stringify(d);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}/#draw=${b64}`;
}

export function takeReplay(): DrawReplay | null {
  const m = location.hash.match(/^#draw=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  history.replaceState(history.state, '', location.pathname + location.search);
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as DrawReplay;
    if (!d || typeof d.w !== 'string' || !Array.isArray(d.c)) return null;
    return { n: String(d.n).slice(0, 40), e: String(d.e).slice(0, 8), r: Number(d.r) || 1, p: Number(d.p) || 0, w: d.w.slice(0, 40), c: d.c.slice(0, 30).map((x) => String(x).slice(0, 40)) };
  } catch {
    return null;
  }
}
