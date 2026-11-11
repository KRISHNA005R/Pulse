import type { ID, ISODate, State, Transaction, Vehicle, VehicleKind, FuelKind } from '../types';
import { roundMoney } from './currency';
import { nextPayday } from './finance';
import { addDays, daysBetween } from './format';

export type { Vehicle };

/**
 * Tanki: fuel planned like a bill, and rides with a fair price.
 *
 * Everything here is worked out from the person's fuel entries every time it's asked. Nothing learned is
 * stored, so editing or deleting a fill, or syncing two phones, can never leave a number out of date.
 * Works in rupees (no outside price data needed). Tested against simulated riders in tests/tanki.test.ts.
 */

/** Typical real-world mileage, km per litre (per kg for CNG). Shown as "about" until meter readings exist. */
export const TYPICAL_KMPL: Record<VehicleKind, Partial<Record<FuelKind, number>>> = {
  scooter: { petrol: 45 },
  bike: { petrol: 50 },
  car: { petrol: 15, diesel: 18, cng: 22 },
};

/** One fill: all fuel for a vehicle on one day, added together. */
export interface Fill {
  date: ISODate;
  amount: number;
  ids: ID[];
  meterKm?: number;
}

interface Gap {
  from: ISODate;
  to: ISODate;
  /** Rupees bought at the start of the gap. */
  amount: number;
  days: number;
}

export interface TankiStatus {
  vehicle: Vehicle;
  /** Not enough history yet: what's still needed. Null once it knows the rhythm. */
  learning: { fillsNeeded: number; daysNeeded?: number } | null;
  /** Rupees of fuel used per day. */
  perDay: number | null;
  /** Usual days between fills. */
  usualGap: number | null;
  /** Rupees of fuel still in the tank today (estimate, never below 0). */
  left: number;
  nextFill: ISODate | null;
  /** When fills vary a lot: the earliest and latest likely day. */
  nextRange: [ISODate, ISODate] | null;
  /** The predicted fill is 3 or more days late: ask "Filled up recently?". */
  askFilled: boolean;
  /** Not filled for a long time: keep nothing aside, suggest pausing. */
  inactive: boolean;
  /** Money kept aside in safe-to-spend for this vehicle until payday. */
  reserve: number;
  mode: 'regular' | 'blend' | 'occasional' | null;
  perKm: { value: number; exact: boolean } | null;
  /** Gaps far slower than usual (a fill probably wasn't logged); left out of the rhythm. */
  oddGaps: { from: ISODate; to: ISODate }[];
  /** Same amount twice on the same day: maybe logged twice. */
  duplicates: [ID, ID][];
  /** Fills far bigger than usual (a typo like ₹20,000): left out of the rhythm until confirmed. */
  suspicious: ID[];
  /** Fuel entries in the last 60 days that aren't tagged to a vehicle (only when there's more than one). */
  untagged: number;
  fills: Fill[];
}

const isFuel = (t: Transaction) => t.type === 'expense' && t.category === 'fuel' && !t.back && t.status === 'completed' && t.amount > 0;
const activeVehicles = (s: State) => (s.vehicles ?? []).filter((v) => !v.paused);
const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Does this fuel entry belong to the vehicle? Tagged ones by tag; untagged ones only when it's the only vehicle. */
function belongs(s: State, t: Transaction, v: Vehicle): boolean {
  if (t.vehicle) return t.vehicle === v.id;
  const active = activeVehicles(s);
  return active.length === 1 && active[0].id === v.id;
}

/** The vehicle's fills up to today, one per day, oldest first. */
export function vehicleFills(s: State, v: Vehicle): Fill[] {
  const byDay = new Map<ISODate, Fill>();
  for (const t of s.transactions) {
    if (!isFuel(t) || t.date > s.today || !belongs(s, t, v)) continue;
    const f = byDay.get(t.date) ?? { date: t.date, amount: 0, ids: [] };
    f.amount += t.amount;
    f.ids.push(t.id);
    if (typeof t.meterKm === 'number' && t.meterKm > 0) f.meterKm = Math.max(f.meterKm ?? 0, t.meterKm);
    byDay.set(t.date, f);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Fills that are wildly bigger than the rest (more than 5× the usual fill), among the last 180 days. */
function findSuspicious(fills: Fill[]): Set<Fill> {
  const out = new Set<Fill>();
  if (fills.length < 4) return out;
  const from = addDays(fills[fills.length - 1].date, -180);
  const recent = fills.filter((f) => f.date >= from);
  if (recent.length < 4) return out;
  const usual = median(recent.map((f) => f.amount));
  for (const f of recent) if (f.amount > 5 * usual) out.add(f);
  return out;
}

/** Fills that count: the last 60 days before the latest fill, or the last 6 within 180 days for occasional drivers. */
function windowOf(fills: Fill[]): Fill[] {
  if (!fills.length) return [];
  const last = fills[fills.length - 1].date;
  const d60 = addDays(last, -60);
  const recent = fills.filter((f) => f.date >= d60);
  if (recent.length >= 6) return recent;
  const d180 = addDays(last, -180);
  return fills.filter((f) => f.date >= d180).slice(-6);
}

/** Tank level in rupees after each fill, carrying what was left over: left = max(0, left − used) + fill. */
function walk(fills: Fill[], perDay: number) {
  const cap = 2 * Math.max(...fills.map((f) => f.amount));
  let left = 0;
  let before = 0;
  for (let i = 0; i < fills.length; i++) {
    if (i > 0) left -= perDay * daysBetween(fills[i - 1].date, fills[i].date);
    before = Math.max(0, left);
    left = Math.min(cap, before + fills[i].amount);
  }
  return { afterLast: left, beforeLast: before };
}

interface Rhythm {
  perDay: number;
  usualGap: number;
  gaps: Gap[];
  odd: Gap[];
  fills: Fill[];
  /** Spread of the per-gap rates (25th and 75th percentile), for a date range. */
  slow: number;
  fast: number;
}

/**
 * Fuel used per day. Each gap between two fills is one measurement (what was bought at its start lasted
 * until its end), pooled over time, so a ₹500 fill that lasts 11 days counts as 11 days. Gaps far slower
 * than usual (a fill not logged) are left out, and so is a last-minute top-up whose fuel isn't used yet.
 */
function rhythmOf(win: Fill[]): Rhythm {
  const gaps: Gap[] = [];
  for (let i = 0; i + 1 < win.length; i++) gaps.push({ from: win[i].date, to: win[i + 1].date, amount: win[i].amount, days: daysBetween(win[i].date, win[i + 1].date) });
  const rates = gaps.map((g) => g.amount / g.days);
  let kept = gaps;
  let odd: Gap[] = [];
  if (gaps.length >= 3) {
    const m = median(rates);
    const k = gaps.filter((g) => g.amount / g.days >= 0.4 * m);
    if (k.length >= 2) {
      odd = gaps.filter((g) => !k.includes(g));
      kept = k;
    }
  }
  // The latest fill came while fuel from the one before was still in the tank (a top-up): that last gap would
  // make the rhythm look faster than it is. If, at the pace of the other gaps, more than a quarter of the
  // earlier fill was still unused, leave the gap out until the next fill.
  const lastGap = gaps[gaps.length - 1];
  const others = kept.filter((g) => g !== lastGap);
  if (others.length >= 2 && kept.includes(lastGap)) {
    const pace = others.reduce((a, g) => a + g.amount, 0) / others.reduce((a, g) => a + g.days, 0);
    if (lastGap.amount - pace * lastGap.days > 0.25 * lastGap.amount) kept = others;
  }
  const perDay = kept.reduce((a, g) => a + g.amount, 0) / kept.reduce((a, g) => a + g.days, 0);
  const sorted = kept.map((g) => g.amount / g.days).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  return { perDay, usualGap: median(kept.map((g) => g.days)), gaps, odd, fills: win, slow: q(0.25), fast: q(0.75) };
}

/** ₹ per km: from meter readings when there are enough, otherwise "about" from price ÷ mileage. */
function perKmOf(v: Vehicle, fills: Fill[], odd: Gap[]): { value: number; exact: boolean } | null {
  // Readings must go up; a lower one is a typo and is skipped.
  const read: Fill[] = [];
  for (const f of fills) if (f.meterKm && (!read.length || f.meterKm > read[read.length - 1].meterKm!)) read.push(f);
  const minKm = v.kind === 'car' ? 500 : 150;
  let best: { value: number; km: number } | null = null;
  for (let a = 0; a < read.length; a++) {
    for (let b = read.length - 1; b > a; b--) {
      const span = fills.filter((f) => f.date > read[a].date && f.date <= read[b].date);
      const km = read[b].meterKm! - read[a].meterKm!;
      const broken = odd.some((g) => g.from >= read[a].date && g.to <= read[b].date);
      if (span.length < 3 || km < minKm || broken) continue;
      const value = span.reduce((x, f) => x + f.amount, 0) / km;
      if (value < 0.5 || value > 40) continue; // not a real vehicle: a typo somewhere
      if (!best || km > best.km) best = { value, km };
      break;
    }
  }
  if (best) return { value: best.value, exact: true };
  const kmpl = v.kmpl && v.kmpl > 0 ? v.kmpl : TYPICAL_KMPL[v.kind]?.[v.fuel];
  if (!v.price || v.price <= 0 || !kmpl) return null;
  return { value: v.price / kmpl, exact: false };
}

/** Same amount on the same day, in the last 90 days: maybe logged twice. One pass, so it stays fast with years of history. */
function findDuplicates(s: State, v: Vehicle): [ID, ID][] {
  const out: [ID, ID][] = [];
  const since = addDays(s.today, -90);
  const seen = new Map<string, ID>();
  for (const t of s.transactions) {
    if (t.date < since || t.date > s.today || !isFuel(t) || !belongs(s, t, v)) continue;
    const key = `${t.date}|${t.amount}`;
    const first = seen.get(key);
    if (first) out.push([first, t.id]);
    else seen.set(key, t.id);
  }
  return out;
}

/** Everything Tanki knows about one vehicle today. */
export function tanki(s: State, v: Vehicle): TankiStatus {
  const all = vehicleFills(s, v);
  const sus = findSuspicious(all);
  const fills = all.filter((f) => !sus.has(f));
  const d60 = addDays(s.today, -60);
  const untagged = activeVehicles(s).length > 1 ? s.transactions.filter((t) => isFuel(t) && !t.vehicle && t.date <= s.today && t.date >= d60).length : 0;
  const base: TankiStatus = {
    vehicle: v, learning: null, perDay: null, usualGap: null, left: 0, nextFill: null, nextRange: null, askFilled: false, inactive: false,
    reserve: 0, mode: null, perKm: null, oddGaps: [], duplicates: findDuplicates(s, v), suspicious: [...sus].flatMap((f) => f.ids), untagged, fills,
  };
  const win = windowOf(fills);
  const span = win.length ? daysBetween(win[0].date, win[win.length - 1].date) : 0;
  if (win.length < 3) return { ...base, learning: { fillsNeeded: 3 - win.length }, perKm: perKmOf(v, fills, []) };
  if (span < 10) return { ...base, learning: { fillsNeeded: 0, daysNeeded: 10 - span }, perKm: perKmOf(v, fills, []) };

  const r = rhythmOf(win);
  const last = win[win.length - 1];
  const since = daysBetween(last.date, s.today);
  // Below 0 = fuel used since the tank ran out that hasn't been paid for yet (a fill not logged, or riding on reserve).
  const leftNow = walk(win, r.perDay).afterLast - r.perDay * since;
  const nextFill = leftNow > 0 ? addDays(s.today, Math.floor(leftNow / r.perDay + 1e-9)) : s.today;
  const lateBy = leftNow > 0 ? 0 : Math.floor(-leftNow / r.perDay + 1e-9);
  const inactive = lateBy > Math.max(3 * r.usualGap, 30);
  const nextRange: [ISODate, ISODate] | null =
    leftNow > 0 && r.slow > 0 ? [addDays(s.today, Math.floor(Math.max(0, leftNow) / r.fast)), addDays(s.today, Math.floor(Math.max(0, leftNow) / r.slow))] : null;

  const payday = nextPayday(s);
  const daysToPayday = Math.max(1, daysBetween(s.today, payday));
  const usualFill = win.reduce((x, f) => x + f.amount, 0) / win.length;

  // A. Regular fillers: fuel needed till payday − fuel in the tank + one average fill when a fill is due before payday
  // (the last fill before payday is usually bigger than what's used before it).
  const regular = Math.max(0, r.perDay * daysToPayday - leftNow + (nextFill < payday ? usualFill : 0));

  // B. Occasional fillers: save each coming fill from the fill before it, pro rata by payday (like insurance
  // premiums). Depends only on the fill dates and payday, so it's the same every day of the pay cycle.
  let occasional = 0;
  // Saving starts at the last fill, or the day the vehicle was added if later (no catch-up for days before it).
  let start = last.date > v.createdAt ? last.date : v.createdAt;
  let due = nextFill;
  for (let k = 0; k < 24 && start < payday; k++) {
    occasional += usualFill * Math.min(1, Math.max(0, daysBetween(start, payday)) / Math.max(1, daysBetween(start, due)));
    start = due;
    due = addDays(due, Math.max(1, Math.round(r.usualGap)));
  }

  // Between 12 and 16 days the two blend, so a vehicle near the edge never jumps between them.
  const w = Math.min(1, Math.max(0, (r.usualGap - 12) / 4));
  const mode = w === 0 ? 'regular' : w === 1 ? 'occasional' : 'blend';
  const keep = !v.paused && v.keepAside !== false && !inactive;
  const reserve = keep ? roundMoney((1 - w) * regular + w * occasional) : 0;

  return {
    ...base,
    perDay: r.perDay,
    usualGap: r.usualGap,
    left: Math.max(0, leftNow),
    nextFill,
    nextRange: nextRange && daysBetween(nextRange[0], nextRange[1]) >= 3 ? nextRange : null,
    askFilled: lateBy >= 3 && !inactive,
    inactive,
    reserve,
    mode,
    perKm: perKmOf(v, fills, r.odd),
    oddGaps: r.odd.map((g) => ({ from: g.from, to: g.to })),
  };
}

/** Fuel money kept aside in safe-to-spend, per vehicle. */
export function fuelReserve(s: State): { total: number; items: { vehicle: Vehicle; amount: number }[] } {
  const items = activeVehicles(s)
    .map((vehicle) => ({ vehicle, amount: tanki(s, vehicle).reserve }))
    .filter((x) => x.amount > 0);
  return { total: items.reduce((a, x) => a + x.amount, 0), items };
}

/**
 * What a ride costs in fuel. Shared trip: km × ₹/km split between everyone in the vehicle, driver included.
 * Detour (a lift on your way): only the extra km, all paid by the passenger. Rounded only at the end, and the
 * shares always add up to the total.
 */
export function rideCost(o: { km: number; perKm: number; people: number; kind: 'shared' | 'detour' }): { total: number; shares: number[] } | null {
  if (!(o.km > 0) || !(o.perKm > 0) || !Number.isFinite(o.km) || !Number.isFinite(o.perKm)) return null;
  const total = Math.round(o.km * o.perKm);
  if (o.kind === 'detour') return { total, shares: [total] };
  const people = Math.floor(o.people);
  if (!(people >= 1)) return null;
  const base = Math.floor(total / people);
  const extra = total - base * people;
  return { total, shares: Array.from({ length: people }, (_, i) => base + (i < extra ? 1 : 0)) };
}
