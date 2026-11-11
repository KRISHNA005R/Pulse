import { useMemo, useState } from 'react';
import type { FuelKind, Vehicle, VehicleKind } from '../types';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { safeToSpend } from '../lib/finance';
import { roundMoney, sym } from '../lib/currency';
import { daysBetween, fmtDate, relDay, rupees } from '../lib/format';
import { rideCost, tanki, TYPICAL_KMPL, type TankiStatus } from '../lib/tanki';
import { EmptyState, Field, SectionHeader, TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';
import { TransactionRow } from '../components/money';

export const VEHICLE_KINDS: { id: VehicleKind; label: string; emoji: string; hint: string }[] = [
  { id: 'scooter', label: 'Scooter', emoji: '🛵', hint: 'Activa, Jupiter…' },
  { id: 'bike', label: 'Bike', emoji: '🏍️', hint: 'Splendor, Pulsar…' },
  { id: 'car', label: 'Car', emoji: '🚗', hint: 'Swift, Nexon…' },
];
const FUELS: { id: FuelKind; label: string; unit: string }[] = [
  { id: 'petrol', label: 'Petrol', unit: 'litre' },
  { id: 'diesel', label: 'Diesel', unit: 'litre' },
  { id: 'cng', label: 'CNG', unit: 'kg' },
];
export const vehicleEmoji = (v: Vehicle) => VEHICLE_KINDS.find((k) => k.id === v.kind)?.emoji ?? '⛽';
const unitOf = (v: Pick<Vehicle, 'fuel'>) => FUELS.find((f) => f.id === v.fuel)?.unit ?? 'litre';
const per = (n: number) => `${sym()}${n.toFixed(2)}`;

/** One line about the next fill, the way a friend would say it. */
export function nextFillLine(t: TankiStatus, today: string): string {
  if (t.learning) return t.learning.fillsNeeded ? `Learning your rhythm: ${t.learning.fillsNeeded} more fill${t.learning.fillsNeeded > 1 ? 's' : ''}` : `Learning your rhythm: ${t.learning.daysNeeded} more days`;
  if (t.inactive) return `No fill since ${fmtDate(t.fills[t.fills.length - 1].date)}`;
  if (t.askFilled) return 'Filled up recently?';
  if (!t.nextFill) return '';
  if (t.nextRange) return `Next fill between ${when(t.nextRange[0], today)} and ${when(t.nextRange[1], today)}`;
  const d = daysBetween(today, t.nextFill);
  if (d <= 0) return 'Next fill due now';
  return d <= 6 ? `Next fill ${when(t.nextFill, today)}` : `Next fill around ${when(t.nextFill, today)}`;
}
/** "today", "tomorrow", "in 3 days", or "Thu, 13 Nov". */
function when(d: string, today: string): string {
  const r = relDay(d, today);
  return /^(Today|Tomorrow|In )/.test(r) ? r.charAt(0).toLowerCase() + r.slice(1) : r;
}

// ------------------------------------------------------------------
// Screen
// ------------------------------------------------------------------
export function TankiScreen() {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const vehicles = state.vehicles ?? [];
  const add = () => ui.openSheet({ type: 'vehicle-form' });

  return (
    <div>
      <TopNavigation
        title="Tanki"
        onBack={ui.pop}
        sub="Fuel planned like a bill, and rides with a fair price."
        right={
          <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={add}>
            <Icon name="plus" size={16} /> Vehicle
          </button>
        }
      />
      {vehicles.length === 0 ? (
        <EmptyState
          icon="car"
          title="No vehicle yet."
          body="Add your scooter, bike or car. Tanki learns its rhythm from the fuel you already log, keeps money ready for the next fill, and tells you what a ride costs."
          action={{ label: 'Add a vehicle', onClick: add }}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} v={v} />
          ))}
          <RideSplits />
          <p className="px-1 text-[12.5px] text-ink3">
            Tanki works only from the fuel you log in PULSE. No GPS, no SMS, nothing leaves your phone except your normal sync.
          </p>
        </div>
      )}
    </div>
  );
}

function VehicleCard({ v }: { v: Vehicle }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const t = useMemo(() => tanki(state, v), [state, v]);
  const sts = safeToSpend(state);
  const recent = state.transactions.filter((x) => t.fills.slice(-5).some((f) => f.ids.includes(x.id))).slice(0, 5);
  const kmpl = t.perKm && v.price ? v.price / t.perKm.value : null;
  const logFill = () => ui.openSheet({ type: 'composer', preset: { type: 'expense', category: 'fuel', text: 'Petrol', vehicle: v.id } });
  const gap = t.oddGaps[t.oddGaps.length - 1];
  const gapKey = gap ? `tanki-gap:${v.id}:${gap.from}` : '';
  const showGap = gap && !state.dismissedDetections.includes(gapKey);

  return (
    <section aria-labelledby={`veh-${v.id}`}>
      <div className="rounded-3xl border border-line bg-surface p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sunk text-[22px]" aria-hidden="true">
            {vehicleEmoji(v)}
          </span>
          <span className="min-w-0 flex-1">
            <span id={`veh-${v.id}`} className="block truncate text-[16px] font-semibold">
              {v.name}
            </span>
            <span className="block truncate text-[13px] text-ink3">
              {VEHICLE_KINDS.find((k) => k.id === v.kind)?.label} · {FUELS.find((f) => f.id === v.fuel)?.label}
              {v.paused ? ' · paused' : ''}
            </span>
          </span>
          <button type="button" className="btn-quiet min-h-[40px] px-3 text-[14px]" onClick={() => ui.openSheet({ type: 'vehicle-form', vehicleId: v.id })}>
            Edit
          </button>
        </div>

        <p className="display mt-5 text-[22px] leading-tight" data-testid="tanki-next">
          {v.paused ? 'Paused' : nextFillLine(t, state.today)}
        </p>
        {!v.paused && (
          <p className="mt-1 text-[14px] text-ink2" data-testid="tanki-kept">
            {t.learning
              ? 'Nothing kept aside until Tanki knows your rhythm. Past fuel entries count.'
              : t.inactive
                ? `Not using the ${v.name} now? Pause it, so nothing is kept aside.`
                : v.keepAside === false
                  ? 'Keeping money aside is off for this vehicle.'
                  : t.reserve > 0
                    ? t.mode === 'occasional'
                      ? `${rupees(t.reserve)} kept aside so far toward the next fill, a little more each payday.`
                      : `${rupees(t.reserve)} kept aside for fuel until payday on ${fmtDate(sts.payday)}.`
                    : `Nothing to keep aside: the tank should last until payday on ${fmtDate(sts.payday)}.`}
          </p>
        )}
        {(t.askFilled || t.inactive) && !v.paused && (
          <div className="mt-3 flex gap-2">
            {t.askFilled && (
              <button type="button" className="btn-accent min-h-[40px] px-4 text-[14px]" onClick={logFill}>
                Log a fill
              </button>
            )}
            {t.inactive && (
              <button type="button" className="btn-quiet min-h-[40px] px-4 text-[14px]" onClick={() => store.saveVehicle({ ...v, paused: true })}>
                Pause {v.name}
              </button>
            )}
          </div>
        )}

        <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4">
          <div>
            <dt className="text-[12.5px] text-ink3">{t.perKm && !t.perKm.exact ? 'About ₹/km' : '₹ per km'}</dt>
            <dd className="num text-[18px] font-semibold">{t.perKm ? per(t.perKm.value) : '—'}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-ink3">{t.perKm?.exact ? `km/${unitOf(v) === 'kg' ? 'kg' : 'litre'}` : `About km/${unitOf(v) === 'kg' ? 'kg' : 'L'}`}</dt>
            <dd className="num text-[18px] font-semibold">{kmpl ? Math.round(kmpl) : '—'}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-ink3">Fuel a day</dt>
            <dd className="num text-[18px] font-semibold">{t.perDay ? rupees(roundMoney(t.perDay)) : '—'}</dd>
          </div>
        </dl>
        {t.perKm && !t.perKm.exact && (
          <p className="mt-2 text-[12.5px] text-ink3">Make it exact: add the meter reading when you fill up, 3 times.</p>
        )}
        {!t.perKm && <p className="mt-2 text-[12.5px] text-ink3">Add today's fuel price in Edit to see what a kilometre costs.</p>}

        <button type="button" className="btn-quiet mt-4 min-h-[44px] w-full text-[14.5px]" onClick={() => ui.openSheet({ type: 'ride-cost', vehicleId: v.id })} disabled={!t.perKm}>
          <Icon name="split" size={16} /> Split a ride
        </button>
      </div>

      {(showGap || t.duplicates.length > 0 || t.suspicious.length > 0 || t.untagged > 0) && (
        <ul className="mt-3 flex flex-col gap-2" aria-label="Things to check">
          {showGap && (
            <li className="flex items-center gap-2 rounded-2xl bg-sunk px-4 py-3 text-[14px]">
              <span className="min-w-0 flex-1">Filled up between {fmtDate(gap.from)} and {fmtDate(gap.to)}? That gap is left out of the rhythm.</span>
              <button type="button" className="btn-quiet min-h-[36px] px-3 text-[13.5px]" onClick={() => ui.openSheet({ type: 'composer', preset: { type: 'expense', category: 'fuel', text: 'Petrol', vehicle: v.id, date: gap.from } })}>
                Log it
              </button>
              <button type="button" className="btn-ghost min-h-[36px] px-2 text-[13.5px]" onClick={() => store.dismissDetection(gapKey)}>
                No
              </button>
            </li>
          )}
          {t.duplicates.slice(0, 1).map(([, b]) => {
            const tx = state.transactions.find((x) => x.id === b);
            return tx ? (
              <li key={b} className="flex items-center gap-2 rounded-2xl bg-sunk px-4 py-3 text-[14px]">
                <span className="min-w-0 flex-1">
                  {rupees(tx.amount)} twice on {fmtDate(tx.date)}. Logged twice?
                </span>
                <button type="button" className="btn-quiet min-h-[36px] px-3 text-[13.5px]" onClick={() => ui.openSheet({ type: 'tx', id: b })}>
                  Check
                </button>
              </li>
            ) : null;
          })}
          {t.suspicious.slice(0, 1).map((id) => {
            const tx = state.transactions.find((x) => x.id === id);
            return tx ? (
              <li key={id} className="flex items-center gap-2 rounded-2xl bg-sunk px-4 py-3 text-[14px]">
                <span className="min-w-0 flex-1">
                  {rupees(tx.amount)} on {fmtDate(tx.date)} is much bigger than your usual fill, so it's left out. A typo?
                </span>
                <button type="button" className="btn-quiet min-h-[36px] px-3 text-[13.5px]" onClick={() => ui.openSheet({ type: 'tx', id })}>
                  Check
                </button>
              </li>
            ) : null;
          })}
          {t.untagged > 0 && (
            <li className="rounded-2xl bg-sunk px-4 py-3 text-[14px]">
              {t.untagged} fuel {t.untagged === 1 ? 'entry isn’t' : 'entries aren’t'} tagged to a vehicle, so {t.untagged === 1 ? 'it isn’t' : 'they aren’t'} counted. Open {t.untagged === 1 ? 'it' : 'one'} in Activity to pick the vehicle.
            </li>
          )}
        </ul>
      )}

      {recent.length > 0 && (
        <div className="mt-6">
          <SectionHeader title={`${v.name} fills`} />
          <ul className="flex flex-col">
            {recent.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </ul>
        </div>
      )}
      {v.price && (
        <p className="mt-3 px-1 text-[12.5px] text-ink3">
          Price used: {per(v.price)} a {unitOf(v)}
          {v.priceDate ? `, set ${fmtDate(v.priceDate)}` : ''}.{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => ui.openSheet({ type: 'vehicle-form', vehicleId: v.id })}>
            Change
          </button>
        </p>
      )}
    </section>
  );
}

/** Rides split from Tanki. They aren't spends (the fuel was logged at the pump), so they're removed here. */
function RideSplits() {
  const store = useStore();
  const { state } = store;
  const rides = state.splits.filter((s) => s.ride && !s.remote).slice(0, 8);
  if (!rides.length) return null;
  return (
    <section aria-labelledby="ride-list">
      <SectionHeader id="ride-list" title="Rides split" />
      <ul className="flex flex-col">
        {rides.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-2 py-2 text-[14.5px]">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.description}</span>
              <span className="block text-[13px] text-ink3">
                {fmtDate(s.date)} · {s.ride!.km} km × {per(s.ride!.perKm)} · {s.shares.filter((x) => x.person !== 'me').map((x) => state.people.find((p) => p.id === x.person)?.short).filter(Boolean).join(', ')} owe{s.shares.filter((x) => x.person !== 'me').length === 1 ? 's' : ''} you
              </span>
            </span>
            <span className="num shrink-0">{rupees(s.shares.filter((x) => x.person !== 'me').reduce((a, x) => a + x.amount, 0))}</span>
            <button type="button" className="tap grid h-9 w-9 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label={`Remove ${s.description}`} onClick={() => store.deleteSplit(s.id)}>
              <Icon name="trash" size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------
// Vehicle form
// ------------------------------------------------------------------
export function VehicleForm({ vehicleId, onDone }: { vehicleId?: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ex = (state.vehicles ?? []).find((v) => v.id === vehicleId);
  const [kind, setKind] = useState<VehicleKind>(ex?.kind ?? 'scooter');
  const [fuel, setFuel] = useState<FuelKind>(ex?.fuel ?? 'petrol');
  const [name, setName] = useState(ex?.name ?? '');
  const [price, setPrice] = useState(ex?.price ? String(ex.price) : '');
  const [kmpl, setKmpl] = useState(ex?.kmpl ? String(ex.kmpl) : '');
  const [keep, setKeep] = useState(ex?.keepAside !== false);
  const [paused, setPaused] = useState(!!ex?.paused);
  const [removing, setRemoving] = useState(false);
  const fuels = kind === 'car' ? FUELS : FUELS.filter((f) => f.id === 'petrol');
  const fuelNow = fuels.some((f) => f.id === fuel) ? fuel : 'petrol';
  const typical = TYPICAL_KMPL[kind][fuelNow];
  const p = parseFloat(price);
  const k = parseFloat(kmpl);
  const priceOk = !price || (p >= 20 && p <= 300);
  const kmplOk = !kmpl || (k >= 3 && k <= 120);
  const valid = name.trim().length > 0 && priceOk && kmplOk;
  const unit = unitOf({ fuel: fuelNow });

  const Switch = ({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint: string }) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="tap flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium leading-snug">{label}</span>
        <span className="block text-[12px] text-ink3">{hint}</span>
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );

  const save = () => {
    store.saveVehicle({
      id: ex?.id,
      name: name.trim(),
      kind,
      fuel: fuelNow,
      price: p > 0 ? roundTo2(p) : undefined,
      priceDate: p > 0 ? (ex?.price === roundTo2(p) ? ex.priceDate : state.today) : undefined,
      kmpl: k > 0 ? roundTo2(k) : undefined,
      keepAside: keep ? undefined : false,
      paused: paused || undefined,
    });
    onDone();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2" role="radiogroup" aria-label="Type of vehicle">
        {VEHICLE_KINDS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={kind === x.id}
            onClick={() => setKind(x.id)}
            className={`tap flex flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] px-3 py-2 text-[14px] font-semibold ${kind === x.id ? 'border-ink bg-ink text-bg' : 'border-line text-ink2'}`}
          >
            <span aria-hidden="true">{x.emoji}</span> {x.label}
          </button>
        ))}
      </div>
      {fuels.length > 1 && (
        <div className="flex gap-2" role="radiogroup" aria-label="Fuel">
          {fuels.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={fuelNow === f.id}
              onClick={() => setFuel(f.id)}
              className={`tap flex-1 rounded-full border-[1.5px] px-3 py-2 text-[14px] font-semibold ${fuelNow === f.id ? 'border-ink bg-ink text-bg' : 'border-line text-ink2'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <Field label="Name" htmlFor="veh-name">
        <input id="veh-name" className="field" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder={VEHICLE_KINDS.find((x) => x.id === kind)?.hint} />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={`Price per ${unit} (optional)`} htmlFor="veh-price" hint={priceOk ? 'Today’s price at your pump' : `Between ${sym()}20 and ${sym()}300`}>
          <input id="veh-price" inputMode="decimal" className="field num" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder={sym().trim()} />
        </Field>
        <Field label={`km per ${unit} (optional)`} htmlFor="veh-kmpl" hint={kmplOk ? (typical ? `Empty = about ${typical}` : '') : 'Between 3 and 120'}>
          <input id="veh-kmpl" inputMode="decimal" className="field num" value={kmpl} onChange={(e) => setKmpl(e.target.value.replace(/[^\d.]/g, ''))} placeholder={typical ? String(typical) : ''} />
        </Field>
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-sunk/60">
        <Switch on={keep} set={setKeep} label="Keep money aside for fuel" hint={keep ? 'Safe to spend counts the next fills, so filling up doesn’t dent it' : 'Off: fills come straight out of your daily number'} />
        {ex && <Switch on={paused} set={setPaused} label="Paused" hint={paused ? 'Not using it now: nothing kept aside' : 'Pause when it’s sold or not used for a while'} />}
      </div>
      {removing && ex ? (
        <div className="flex min-h-[48px] items-center gap-2 rounded-2xl bg-sunk py-1 pl-4 pr-1" role="alert">
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[14px] font-semibold">Remove {ex.name}?</span>
            <span className="block truncate text-[12px] text-ink3">Its fuel entries stay</span>
          </span>
          <button type="button" className="btn-ghost min-h-[40px] px-3" onClick={() => setRemoving(false)}>
            Keep
          </button>
          <button
            type="button"
            className="btn min-h-[40px] bg-neg px-4 text-white"
            onClick={() => {
              store.deleteVehicle(ex.id);
              onDone();
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className={`grid gap-2 ${ex ? 'grid-cols-[auto_1fr]' : 'grid-cols-1'}`}>
          {ex && (
            <button type="button" className="btn-quiet min-h-[48px] px-4 text-neg" onClick={() => setRemoving(true)} aria-label="Remove this vehicle">
              <Icon name="trash" size={18} />
            </button>
          )}
          <button type="button" disabled={!valid} className="btn-accent min-h-[48px] w-full disabled:opacity-40" onClick={save}>
            {ex ? 'Save changes' : 'Add vehicle'}
          </button>
        </div>
      )}
    </div>
  );
}
const roundTo2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------
// Ride cost
// ------------------------------------------------------------------
export function RideCostForm({ vehicleId, onDone }: { vehicleId?: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const vehicles = (state.vehicles ?? []).filter((v) => !v.paused);
  const [vid, setVid] = useState(vehicleId ?? vehicles[0]?.id ?? '');
  const v = vehicles.find((x) => x.id === vid);
  const t = useMemo(() => (v ? tanki(state, v) : null), [state, v]);
  const [km, setKm] = useState('');
  const [round, setRound] = useState(false);
  const [kind, setKind] = useState<'shared' | 'detour'>('shared');
  const [who, setWho] = useState<string[]>([]);
  const [what, setWhat] = useState('');
  const dist = (parseFloat(km) || 0) * (round && kind === 'shared' ? 2 : 1);
  // Rounded to the paise shown on screen, so "170 km × ₹6.81" adds up to exactly the total shown.
  const perKm = roundTo2(t?.perKm?.value ?? 0);
  const people = kind === 'shared' ? who.length + 1 : 1;
  const r = rideCost({ km: dist, perKm, people, kind });
  const friends = [...state.people].sort((a, b) => a.name.localeCompare(b.name));
  const pick = (id: string) => setWho((cur) => (kind === 'detour' ? [id] : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const valid = !!r && who.length > 0 && r.total > 0;

  const save = () => {
    if (!r || !v) return;
    // Me first: if the total doesn't split evenly, the extra rupee is mine, not a friend's.
    const shares =
      kind === 'shared'
        ? [{ person: 'me', amount: r.shares[0] }, ...who.map((id, i) => ({ person: id, amount: r.shares[i + 1] }))]
        : [{ person: who[0], amount: r.total }];
    store.addRideSplit({
      description: `${what.trim() || (kind === 'shared' ? 'Ride' : 'Lift')} · fuel`,
      amount: kind === 'shared' ? r.total : r.total,
      shares,
      ride: { vehicleId: v.id, km: roundTo2(dist), perKm: roundTo2(perKm), kind },
    });
    onDone();
  };

  if (!v || !t?.perKm)
    return (
      <p className="text-[14.5px] text-ink2">
        Add today's fuel price to your vehicle first (Tanki → Edit). Then a ride's fuel cost is worked out from it.
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      {vehicles.length > 1 && (
        <div className="flex gap-2" role="radiogroup" aria-label="Vehicle">
          {vehicles.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={vid === x.id} onClick={() => setVid(x.id)} className={`tap flex-1 rounded-full border-[1.5px] px-3 py-2 text-[14px] font-semibold ${vid === x.id ? 'border-ink bg-ink text-bg' : 'border-line text-ink2'}`}>
              {vehicleEmoji(x)} {x.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2" role="radiogroup" aria-label="Kind of ride">
        {(
          [
            ['shared', 'Going together'],
            ['detour', 'A lift on my way'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={kind === id}
            onClick={() => {
              setKind(id);
              setWho((c) => (id === 'detour' ? c.slice(0, 1) : c));
            }}
            className={`tap flex-1 rounded-full border-[1.5px] px-3 py-2 text-[14px] font-semibold ${kind === id ? 'border-ink bg-ink text-bg' : 'border-line text-ink2'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="-mt-1 text-[12.5px] text-ink3">{kind === 'shared' ? 'Fuel for the whole trip, split between everyone in the vehicle, you included.' : 'Only the extra km you drove for them, paid by them.'}</p>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2.5">
        <Field label={kind === 'shared' ? 'Distance (km)' : 'Extra km'} htmlFor="ride-km">
          <input id="ride-km" inputMode="decimal" className="field num" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" />
        </Field>
        {kind === 'shared' && (
          <button type="button" role="switch" aria-checked={round} onClick={() => setRound(!round)} className={`tap min-h-[48px] rounded-2xl border-[1.5px] px-3.5 text-[14px] font-semibold ${round ? 'border-ink bg-ink text-bg' : 'border-line text-ink2'}`}>
            Round trip
          </button>
        )}
      </div>
      <Field label="What for (optional)" htmlFor="ride-what">
        <input id="ride-what" className="field" value={what} maxLength={40} onChange={(e) => setWhat(e.target.value)} placeholder="Lonavala trip" />
      </Field>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-ink2">{kind === 'shared' ? 'Who rode with you' : 'Who got the lift'}</p>
        {friends.length === 0 ? (
          <p className="text-[13.5px] text-ink3">Add friends in People first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {friends.map((p) => (
              <button key={p.id} type="button" aria-pressed={who.includes(p.id)} onClick={() => pick(p.id)} className={`tap rounded-full border-[1.5px] px-3.5 py-1.5 text-[14px] font-semibold ${who.includes(p.id) ? 'border-ink bg-ink text-bg' : 'border-line text-ink2'}`}>
                {p.short ?? p.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-2xl bg-sunk p-4" aria-live="polite" data-testid="ride-result">
        {r ? (
          <>
            <p className="text-[13.5px] text-ink3">
              {roundTo2(dist)} km × {per(perKm)}
              {t.perKm.exact ? '' : ' (about)'}
            </p>
            <p className="num-hero mt-0.5 text-[30px] leading-none">{rupees(r.total)}</p>
            {kind === 'shared' && who.length > 0 && <p className="mt-1 text-[14px] text-ink2">{Math.min(...r.shares) === Math.max(...r.shares) ? `${rupees(r.shares[0])} each` : `${rupees(Math.min(...r.shares))} to ${rupees(Math.max(...r.shares))} each`} for {people} people</p>}
            <p className="mt-2 text-[12.5px] text-ink3">Fuel only. Add tolls or parking as their own split.</p>
          </>
        ) : (
          <p className="text-[14px] text-ink3">Type the distance to see the fuel cost.</p>
        )}
      </div>
      <button type="button" disabled={!valid} className="btn-accent min-h-[48px] w-full disabled:opacity-40" onClick={save}>
        {valid && r ? `Split ${rupees(kind === 'shared' ? r.total - r.shares[0] : r.total)} with ${who.map((id) => state.people.find((p) => p.id === id)?.short).join(', ')}` : 'Split it'}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// Home card: only when a fill is near, or a fill seems to be missing
// ------------------------------------------------------------------
export function TankiHomeCard() {
  const { state, dismissDetection } = useStore();
  const ui = useUI();
  const items = (state.vehicles ?? [])
    .filter((v) => !v.paused)
    .map((v) => ({ v, t: tanki(state, v) }))
    .filter(({ v, t }) => !t.learning && !t.inactive && t.nextFill && (t.askFilled || daysBetween(state.today, t.nextFill) <= 2) && !state.dismissedDetections.includes(`tanki-home:${v.id}:${t.nextFill}`));
  if (!items.length) return null;
  const { v, t } = items[0];
  return (
    <section className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4" aria-label="Next fill" data-testid="tanki-home">
      <button type="button" className="tap flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => ui.push({ name: 'tanki' })}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sunk text-[20px]" aria-hidden="true">
          ⛽
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-snug">{nextFillLine(t, state.today)}</span>
          <span className="block text-[13px] leading-snug text-ink3">
            {v.name}
            {t.reserve > 0 ? ` · ${rupees(t.reserve)} kept aside` : ''}
          </span>
        </span>
      </button>
      <button type="button" className="btn-quiet min-h-[40px] shrink-0 px-3 text-[14px]" onClick={() => ui.openSheet({ type: 'composer', preset: { type: 'expense', category: 'fuel', text: 'Petrol', vehicle: v.id } })}>
        Filled up
      </button>
      <button type="button" className="tap -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink3" aria-label="Hide for now" onClick={() => dismissDetection(`tanki-home:${v.id}:${t.nextFill}`)}>
        <Icon name="x" size={16} />
      </button>
    </section>
  );
}
