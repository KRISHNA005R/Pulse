import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { safeToSpend } from '../src/lib/finance';
import { addDays } from '../src/lib/format';
import { fuelReserve, rideCost, tanki, vehicleFills, type Vehicle } from '../src/lib/tanki';
import type { State, Transaction } from '../src/types';

// Tanki: fuel planned like a bill. Everything is worked out from the fills each time (nothing learned is
// stored), so edits, deletes and sync can never leave it stale.

const D0 = '2026-10-01';
const day = (n: number) => addDays(D0, n);
let n = 0;
const fill = (d: number, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `f${++n}`, merchant: 'Petrol', amount, type: 'expense', category: 'fuel', date: day(d), account: 'hdfc', recurring: false, status: 'completed', ...extra,
});
const activa: Vehicle = { id: 'v1', name: 'Activa', kind: 'scooter', fuel: 'petrol', createdAt: D0, price: 102.12 };

/** A clean world: one bank account, payday on `payday` (day number), these fills, today = `today` (day number). */
function world(fills: Transaction[], today: number, opts: { payday?: number; vehicles?: Vehicle[]; balance?: number } = {}): State {
  const s = createSeed();
  s.mode = 'personal';
  s.today = day(today);
  s.accounts = [{ id: 'hdfc', name: 'HDFC', institution: 'Bank', type: 'bank', balance: opts.balance ?? 20000, spendable: true }];
  s.cards = []; s.debts = []; s.plans = []; s.subscriptions = []; s.investments = []; s.insurance = []; s.splits = []; s.settlements = [];
  s.incomes = [{ id: 'sal', name: 'Salary', expected: 40000, cycle: 'monthly', nextDate: day(opts.payday ?? 30), main: true } as State['incomes'][number]];
  s.transactions = fills;
  s.vehicles = opts.vehicles ?? [activa];
  return s;
}
/** ₹200 every 5 days: exactly ₹40 a day. */
const steady = (count: number, start = 0) => Array.from({ length: count }, (_, i) => fill(start + i * 5, 200));

describe('learning the rhythm', () => {
  it('needs 3 fills over at least 10 days before it says anything', () => {
    expect(tanki(world(steady(2), 6), activa).learning).toEqual({ fillsNeeded: 1 });
    expect(tanki(world([fill(0, 200), fill(3, 200), fill(6, 200)], 7), activa).learning).toEqual({ fillsNeeded: 0, daysNeeded: 4 });
    expect(tanki(world(steady(3), 11), activa).learning).toBeNull();
  });

  it('random amounts: ₹200, ₹500, ₹150 then ₹300 two days later → (200 + 500) ÷ 14 days = ₹50 a day', () => {
    // The ₹150 was a top-up just 2 days before the next fill, so its fuel isn't used up yet and it waits for the
    // next fill. Counting it as used would say (200 + 500 + 150) ÷ 16 = ₹53.13, too fast.
    const t = tanki(world([fill(0, 200), fill(3, 500), fill(14, 150), fill(16, 300)], 17), activa);
    expect(t.perDay).toBeCloseTo(50, 1);
  });

  it('an early top-up does not make the rhythm look faster (fuel still in the tank is not "used")', () => {
    const t = tanki(world([...steady(4), fill(17, 200)], 17), activa);
    expect(t.perDay).toBeCloseTo(40, 1);
  });

  it('a forgotten fill (a gap far too slow) is left out and asked about, so the rhythm stays ₹40 a day', () => {
    const fs = [fill(0, 200), fill(5, 200), fill(10, 200), fill(15, 200), fill(30, 200), fill(35, 200), fill(40, 200)]; // 15→30: one fill missed
    const t = tanki(world(fs, 41), activa);
    expect(t.perDay).toBeCloseTo(40, 5);
    expect(t.oddGaps).toEqual([{ from: day(15), to: day(30) }]);
  });

  it('two fills on the same day count as one fill', () => {
    const fs = [fill(0, 200), fill(5, 100), fill(5, 100), fill(10, 200), fill(15, 200)];
    expect(vehicleFills(world(fs, 16), activa).map((f) => f.amount)).toEqual([200, 200, 200, 200]);
    expect(tanki(world(fs, 16), activa).perDay).toBeCloseTo(40, 5);
  });

  it('the same amount twice on the same day is flagged as a possible duplicate', () => {
    const a = fill(5, 200), b = fill(5, 200);
    const t = tanki(world([fill(0, 200), a, b, fill(10, 200), fill(15, 200)], 16), activa);
    expect(t.duplicates).toEqual([[a.id, b.id]]);
  });

  it('a typo like ₹20,000 among ₹200 fills is flagged and kept out of the rhythm', () => {
    const typo = fill(10, 20000);
    const t = tanki(world([...steady(2), typo, fill(15, 200), fill(20, 200), fill(25, 200)], 26), activa);
    expect(t.suspicious).toEqual([typo.id]);
    expect(t.perDay).toBeLessThan(60);
  });

  it('ignores refunds, transfers, pending and future entries, and other categories', () => {
    const noise = [
      fill(7, 50, { type: 'income', back: true }),
      fill(8, 999, { type: 'transfer' }),
      fill(9, 999, { status: 'pending' }),
      fill(40, 999),
      fill(11, 999, { category: 'food' }),
    ];
    expect(tanki(world([...steady(4), ...noise], 16), activa).perDay).toBeCloseTo(40, 5);
  });

  it('editing or deleting a fill changes the numbers straight away (nothing is cached)', () => {
    const fs = steady(4);
    const s = world(fs, 16);
    const before = tanki(s, activa).perDay!;
    s.transactions = s.transactions.map((t, i) => (i === 1 ? { ...t, amount: 400 } : t));
    expect(tanki(s, activa).perDay!).toBeGreaterThan(before);
    s.transactions = s.transactions.filter((_, i) => i !== 1);
    expect(tanki(s, activa).perDay).toBeCloseTo(400 / 15, 5); // ₹200 + ₹200 used over days 0–15
    // Same answer as a fresh state built from the same entries: nothing was remembered from before.
    expect(tanki(s, activa)).toEqual(tanki(world(s.transactions.map((t) => ({ ...t })), 16), activa));
  });
});

describe('which fills belong to which vehicle', () => {
  const car: Vehicle = { id: 'v2', name: 'Swift', kind: 'car', fuel: 'petrol', createdAt: D0, price: 102.12 };
  it('with one vehicle, untagged fuel counts as its fill; "not my vehicle" never does', () => {
    const fs = [...steady(4), fill(17, 900, { vehicle: 'none' })];
    expect(vehicleFills(world(fs, 18), activa)).toHaveLength(4);
  });
  it('with two vehicles, only tagged fills count, each to its own vehicle', () => {
    const fs = [...steady(4).map((f) => ({ ...f, vehicle: 'v1' })), fill(2, 1500, { vehicle: 'v2' }), fill(9, 999)];
    const s = world(fs, 18, { vehicles: [activa, car] });
    expect(vehicleFills(s, activa)).toHaveLength(4);
    expect(vehicleFills(s, car)).toHaveLength(1);
    expect(tanki(s, activa).untagged).toBe(1);
  });
  it('a paused vehicle keeps nothing aside', () => {
    const s = world(steady(4), 16, { vehicles: [{ ...activa, paused: true }] });
    expect(fuelReserve(s).total).toBe(0);
  });
});

describe('fuel left and the next fill', () => {
  it('next fill = today + fuel left ÷ rupees a day', () => {
    const t = tanki(world(steady(4), 17), activa); // last fill day 15 (₹200 = 5 days), today day 17
    expect(t.left).toBeCloseTo(120, 5);
    expect(t.nextFill).toBe(day(20));
  });
  it('an early fill keeps the fuel still in the tank (₹120 left + ₹200 = ₹320)', () => {
    const t = tanki(world([...steady(4), fill(17, 200)], 17), activa);
    expect(t.left).toBeCloseTo(320, 5);
    expect(t.nextFill).toBe(day(25));
  });
  it('fuel left can never be more than 2× the biggest fill (a tank only holds so much)', () => {
    const t = tanki(world([...steady(4), fill(16, 200), fill(17, 200)], 17), activa);
    expect(t.left).toBeLessThanOrEqual(400);
  });
  it('overdue by 3 days → asks "Filled up recently?"', () => {
    expect(tanki(world(steady(4), 22), activa).askFilled).toBe(false);
    expect(tanki(world(steady(4), 23), activa).askFilled).toBe(true);
  });
  it('not filled for a long time → inactive, nothing kept aside, suggests pausing', () => {
    const t = tanki(world(steady(4), 80), activa);
    expect(t.inactive).toBe(true);
    expect(t.reserve).toBe(0);
  });
});

describe('money kept aside: regular fillers (bikes, scooters)', () => {
  it('= ₹ a day × days to payday − fuel left + one average fill when a fill is due before payday', () => {
    // today day 17, payday day 30 → 13 days; ₹40 × 13 − ₹120 + ₹200 = ₹600
    expect(tanki(world(steady(4), 17), activa).reserve).toBe(600);
  });
  it('no extra fill when the tank lasts past payday', () => {
    // ₹500 on day 17 on top of ₹120 left = ₹620, lasts 15 days; payday in 8 days needs ₹320 → nothing to keep
    expect(tanki(world([...steady(4), fill(17, 500)], 17, { payday: 25 }), activa).reserve).toBe(0);
  });
  it("doesn't creep: the same amount every day between fills", () => {
    const r = [16, 17, 18, 19].map((t) => tanki(world(steady(4), t), activa).reserve);
    expect(new Set(r).size).toBe(1);
  });
  it('a fill that fits what was kept aside leaves the daily number where it was (empty tank or early fill)', () => {
    for (const [today, amount] of [[20, 200], [17, 200]]) {
      const before = world(steady(4), today, { balance: 20000 });
      const after = world([...steady(4), fill(today, amount)], today, { balance: 20000 - amount });
      expect(safeToSpend(after).daily, `day ${today}`).toBe(safeToSpend(before).daily);
    }
  });
  it('a bigger-than-usual fill moves the daily number only by what Tanki learned from it, not by the fill', () => {
    // ₹300 on day 18 (12 days to payday). Without Tanki it would drop the daily number by ₹25.
    const before = world(steady(4), 18, { balance: 20000 });
    const after = world([...steady(4), fill(18, 300)], 18, { balance: 19700 });
    const change = Math.abs(safeToSpend(after).daily - safeToSpend(before).daily);
    expect(change).toBeLessThanOrEqual(2);
    expect(300 / 12).toBe(25);
  });
  it('safe-to-spend counts the fuel line once, with one item per vehicle', () => {
    const s = world(steady(4), 17);
    const sts = safeToSpend(s);
    expect(sts.fuel).toBe(600);
    expect(sts.fuelItems).toEqual([{ vehicle: activa, amount: 600 }]);
    const off = world(steady(4), 17, { vehicles: [{ ...activa, keepAside: false }] });
    expect(safeToSpend(off).safe - sts.safe).toBe(600);
  });
});

describe('money kept aside: occasional fillers (weekend car)', () => {
  const swift: Vehicle = { id: 'v1', name: 'Swift', kind: 'car', fuel: 'petrol', createdAt: D0, price: 116.15 };
  // ₹3,000 every 50 days → ₹60 a day, usual gap 50
  const car = [fill(-150, 3000), fill(-100, 3000), fill(-50, 3000), fill(0, 3000)];
  it('spreads the next fill over the paydays before it, the way premiums are kept aside', () => {
    // last fill day 0, next fill day 50, payday day 30 → 30/50 of ₹3,000 = ₹1,800 by this payday
    const t = tanki(world(car, 10, { vehicles: [swift] }), swift);
    expect(t.mode).toBe('occasional');
    expect(t.reserve).toBe(1800);
  });
  it('is the same every day of the pay cycle (no daily creep)', () => {
    const r = [5, 12, 20, 29].map((d) => tanki(world(car, d, { vehicles: [swift] }), swift).reserve);
    expect(new Set(r).size).toBe(1);
  });
  it('once the fill is due before payday: all of it, plus the start of saving for the one after', () => {
    // fill due day 50 (₹3,000) + the next one, due day 100: 5 of its 50 days fall before payday 55 → ₹300
    const t = tanki(world(car, 10, { vehicles: [swift], payday: 55 }), swift);
    expect(t.reserve).toBe(3300);
  });
  it('blends smoothly between 12 and 16 days, so a vehicle near 14 days never jumps between modes', () => {
    const every = (g: number) => Array.from({ length: 6 }, (_, i) => fill(i * g - 5 * g, 600));
    const at = (g: number) => tanki(world(every(g), 1, { vehicles: [swift] }), swift);
    expect(at(10).mode).toBe('regular');
    expect(at(14).mode).toBe('blend');
    expect(at(20).mode).toBe('occasional');
  });
});

describe('₹ per km and mileage', () => {
  it('without meter readings: about, from the price and typical mileage for the vehicle type', () => {
    const k = tanki(world(steady(4), 17), activa).perKm!;
    expect(k.exact).toBe(false);
    expect(k.value).toBeCloseTo(102.12 / 45, 5);
  });
  it('your own mileage, if you set it, beats the typical one', () => {
    const k = tanki(world(steady(4), 17, { vehicles: [{ ...activa, kmpl: 51 }] }), { ...activa, kmpl: 51 }).perKm!;
    expect(k.value).toBeCloseTo(102.12 / 51, 5);
  });
  it('with meter readings: rupees of the fills after the first reading ÷ km between first and last', () => {
    const fs = [fill(0, 200, { meterKm: 1000 }), fill(5, 200, { meterKm: 1088 }), fill(10, 200, { meterKm: 1176 }), fill(15, 200, { meterKm: 1264 })];
    const k = tanki(world(fs, 16), activa).perKm!;
    expect(k.exact).toBe(true);
    expect(k.value).toBeCloseTo(600 / 264, 5);
  });
  it('stays "about" until 3 fills and 150 km (two-wheeler)', () => {
    const fs = [fill(0, 200, { meterKm: 1000 }), fill(5, 200, { meterKm: 1088 }), fill(10, 200), fill(15, 200)];
    expect(tanki(world(fs, 16), activa).perKm!.exact).toBe(false);
  });
  it('a reading that goes backwards (a typo) is ignored', () => {
    const fs = [fill(0, 200, { meterKm: 1000 }), fill(5, 200, { meterKm: 108 }), fill(10, 200, { meterKm: 1176 }), fill(15, 200, { meterKm: 1264 })];
    const k = tanki(world(fs, 16), activa).perKm!;
    expect(k.value).toBeCloseTo(600 / 264, 5);
  });
  it('a missed fill between readings makes it "about" again (the litres would be wrong)', () => {
    const fs = [fill(0, 200, { meterKm: 1000 }), fill(5, 200, { meterKm: 1088 }), fill(10, 200, { meterKm: 1176 }), fill(30, 200, { meterKm: 1616 }), fill(35, 200), fill(40, 200)];
    expect(tanki(world(fs, 41), activa).perKm!.exact).toBe(false);
  });
  it('no price and no readings: no ₹ per km (never a made-up number)', () => {
    const v = { ...activa, price: undefined };
    expect(tanki(world(steady(4), 17, { vehicles: [v] }), v).perKm).toBeNull();
  });
});

describe('ride cost', () => {
  it('shared trip: Lonavala and back, 170 km × ₹6.52, 4 people → ₹1,108, ₹277 each', () => {
    expect(rideCost({ km: 170, perKm: 6.52, people: 4, kind: 'shared' })).toEqual({ total: 1108, shares: [277, 277, 277, 277] });
  });
  it('shares always add up to the total, whole rupees', () => {
    const r = rideCost({ km: 44, perKm: 2.27, people: 3, kind: 'shared' })!; // 99.88 → ₹100 → 34 + 33 + 33
    expect(r.total).toBe(100);
    expect(r.shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(Math.max(...r.shares) - Math.min(...r.shares)).toBeLessThanOrEqual(1);
  });
  it('a lift on your way: only the extra km, all paid by the passenger', () => {
    expect(rideCost({ km: 6, perKm: 2.27, people: 2, kind: 'detour' })).toEqual({ total: 14, shares: [14] });
  });
  it('nonsense input gives nothing, not a wrong number', () => {
    for (const bad of [{ km: 0 }, { km: -5 }, { km: NaN }, { people: 0 }, { perKm: 0 }])
      expect(rideCost({ km: 10, perKm: 2, people: 2, kind: 'shared' as const, ...bad })).toBeNull();
  });
});

describe('simulation: 120 scooter riders with random fill amounts, checked against what they actually paid', () => {
  // Seeded, so the test is the same every run.
  function rng(seed: number) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
  it('the money kept aside is within one fill of what was really paid, and not biased', () => {
    const off: number[] = [], bias: number[] = [], fillSizes: number[] = [];
    for (let seed = 1; seed <= 120; seed++) {
      const R = rng(seed);
      const cap = 5.3, price = 102.12;
      let tank = cap / 2;
      const all: Transaction[] = [];
      for (let d = 0; d < 240; d++) {
        const km = d % 7 < 5 ? 36 + (R() - 0.5) * 20 : [0, 10, 25, 60][Math.floor(R() * 4)];
        const lit = km / 45;
        if (tank - lit < cap * (0.08 + R() * 0.22)) {
          const want = [100, 200, 200, 300, 500][Math.floor(R() * 5)];
          const amt = Math.min(want, Math.round(((cap - tank) * price) / 10) * 10);
          if (amt > 0) { tank += amt / price; all.push(fill(d - 90, amt)); fillSizes.push(amt); }
        }
        tank -= lit;
      }
      for (let now = 0; now < 110; now += 7) {
        const s = world(all.filter((t) => t.date <= day(now)), now, { payday: now + 30 });
        const t = tanki(s, activa);
        if (t.learning) continue;
        const paid = all.filter((t) => t.date > day(now) && t.date <= day(now + 30)).reduce((a, t) => a + t.amount, 0);
        off.push(Math.abs(t.reserve - paid));
        bias.push(t.reserve - paid);
      }
    }
    const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const avgFill = fillSizes.reduce((a, b) => a + b, 0) / fillSizes.length;
    expect(median(off)).toBeLessThan(0.85 * avgFill); // measured: ₹193 with fills averaging ₹238
    expect(Math.abs(bias.reduce((a, b) => a + b, 0) / bias.length)).toBeLessThan(0.2 * avgFill); // measured: ₹34 low
  });
});
