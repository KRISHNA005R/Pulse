import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { INSURANCE_ON } from '../lib/features';
import type { Budget, Group, Insight, Plan, Subscription, Transaction } from '../types';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { budgetState, categoryName, groupSummary, myCost, paydaysBefore, pendingPaydays, planMetrics, safeToSpend, upcoming } from '../lib/finance';
import { addDays, daysBetween, fmtDate, fmtDayHeader, haptic, parseDate, relDay, rupees } from '../lib/format';
import { Icon } from './ui/Icon';
import { burstFrom } from '../lib/celebrate';
import { streak } from '../lib/streak';
import { AvatarStack, CategoryMark, ProgressBar, Ring, StatusPill } from './ui/bits';

// ------------------------------------------------------------------
// SafeToSpendCard — the hero
// ------------------------------------------------------------------
/** Counts a number smoothly to its new value (and up from a little below on first show). */
function useRolling(value: number, ms = 800) {
  const [shown, setShown] = useState(() => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? value : Math.round(value * 0.55)));
  const from = useRef(shown);
  const raf = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(value);
    const a = from.current;
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 4);
      const v = a + (value - a) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms]);
  return shown;
}

/** The logging streak pill next to the greeting. */
export function StreakPill() {
  const { state, toast } = useStore();
  const st = useMemo(() => streak(state), [state]);
  if (st.count < 1) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        haptic(8);
        burstFrom(e.currentTarget, { kind: 'fire', power: 0.5 });
        toast({ text: st.today ? `${st.count}-day logging streak. Best: ${st.best} days.` : `${st.count}-day streak. Log anything today to keep it alive.`, emoji: '🔥' });
      }}
      className={`tap inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13.5px] font-bold ${st.today ? 'bg-accent-soft text-accent-ink' : 'animate-ring bg-sunk text-ink2'}`}
      aria-label={`${st.count}-day logging streak${st.today ? '' : ', log today to keep it'}`}
    >
      <span className="inline-block animate-flicker" aria-hidden="true">
        🔥
      </span>
      <span className="num">{st.count}</span>
    </button>
  );
}

/** Payday check-in: "Did your salary land?" One tap adds it; or a different amount; or not yet. */
export function PaydayCard() {
  const store = useStore();
  const { state } = store;
  const pending = useMemo(() => pendingPaydays(state), [state]);
  const [edit, setEdit] = useState(false);
  const [amt, setAmt] = useState('');
  const [auto, setAuto] = useState(true);
  if (!pending.length) return null;
  const { income: i, date } = pending[0];
  const isToday = date === state.today;
  const what = i.kind === 'salary' ? 'salary' : i.name;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-accent p-5 text-on-accent shadow-soft" aria-labelledby="payday-title">
      <span className="pointer-events-none absolute -right-4 -top-6 select-none text-[96px] leading-none opacity-20" aria-hidden="true">
        💸
      </span>
      <p className="eyebrow !text-current opacity-80">{isToday ? "It's payday" : `Payday was ${relDay(date, state.today).toLowerCase()}`}</p>
      <h2 id="payday-title" className="display mt-1 text-[clamp(20px,6vw,24px)] leading-tight">
        Did your {rupees(i.expected)} {what} land?
      </h2>
      <p className="mt-1 text-[14px] opacity-85">
        {i.name} · {fmtDate(date)}. Add it and safe-to-spend updates for the month ahead.
      </p>
      {edit ? (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseFloat(amt);
            if (n > 0) store.confirmPayday(i.id, date, n, auto);
          }}
        >
          <label htmlFor="payday-amt" className="sr-only">
            Amount that came in
          </label>
          <input id="payday-amt" inputMode="decimal" autoFocus className="num min-w-0 flex-1 rounded-full bg-white/90 px-4 text-[16px] font-semibold text-ink placeholder:text-ink3 focus:outline-none" placeholder={rupees(i.expected)} value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} />
          <button type="submit" disabled={!(parseFloat(amt) > 0)} className="tap min-h-[46px] shrink-0 rounded-full bg-ink px-5 text-[14.5px] font-semibold text-bg disabled:opacity-50">
            Add
          </button>
        </form>
      ) : (
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <button type="button" className="tap min-h-[46px] rounded-full bg-ink px-4 text-[15px] font-semibold text-bg" onClick={() => store.confirmPayday(i.id, date, undefined, auto)}>
            Yes, add {rupees(i.expected)}
          </button>
          <button type="button" className="tap min-h-[46px] rounded-full bg-white/20 px-4 text-[14px] font-semibold" onClick={() => setEdit(true)}>
            Other amount
          </button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <label className="inline-flex cursor-pointer items-center gap-2 font-medium">
          <input type="checkbox" className="h-4 w-4 accent-[#17140F]" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Add it automatically every month
        </label>
        <button type="button" className="font-semibold underline underline-offset-2 opacity-85" onClick={() => store.skipPayday(i.id, date)}>
          Not yet
        </button>
      </div>
    </section>
  );
}

export function SafeToSpendCard({ greeting }: { greeting: string }) {
  const { state } = useStore();
  const ui = useUI();
  const sts = useMemo(() => safeToSpend(state), [state]);
  const shown = useRolling(sts.safe);
  const shownDaily = useRolling(sts.daily, 900);
  // A floating "−₹450" chip whenever safe-to-spend moves.
  const last = useRef({ v: sts.safe, who: `${state.mode}:${state.user.fullName}` });
  const [delta, setDelta] = useState<{ id: number; v: number } | null>(null);
  useEffect(() => {
    const who = `${state.mode}:${state.user.fullName}`;
    const d = sts.safe - last.current.v;
    const sameData = who === last.current.who;
    last.current = { v: sts.safe, who };
    // Only a change you made shows the floating chip, not switching between demo and your own data.
    if (sameData && Math.abs(d) >= 1) setDelta({ id: Date.now(), v: d });
    else if (!sameData) setDelta(null);
  }, [sts.safe, state.mode, state.user.fullName]);
  const hide = state.settings.hideBalances;
  const days = Array.from({ length: sts.daysLeft }, (_, i) => addDays(state.today, i));
  const billDays = new Set(upcoming(state, sts.payday).map((b) => b.date));
  const W = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const amount = rupees(Math.round(shown));
  const soon = sts.daysLeft <= 1;
  const paydayIn = sts.daysLeft <= 1 ? 'tomorrow' : `in ${sts.daysLeft} days`;
  // A second salary before the main payday isn't counted yet; mention it so the month makes sense.
  const extra = paydaysBefore(state, sts.payday)[0];

  return (
    <section aria-labelledby="sts-label" className="hero-card rounded-3xl border border-line bg-surface p-5 shadow-soft md:p-7">
      {/* 1. Greeting and streak */}
      <div className="flex min-h-[32px] items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[15px] text-ink2">
          {greeting} <span className="inline-block origin-[70%_70%] animate-[wiggle_.5s_ease-in-out_2_.6s]">👋</span>
        </p>
        <StreakPill />
      </div>

      {/* 2. The number, sized to always fit on one line */}
      <div className="relative mt-3">
        <p
          key={`n${delta?.id ?? 0}`}
          className={`hero-amt num-hero ${delta ? 'animate-squash' : ''} ${hide ? 'blur-md select-none' : ''}`}
          style={{ ['--len' as string]: Math.max(4, rupees(sts.safe).length) }}
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="sr-only">{rupees(sts.safe)}</span>
          <span aria-hidden="true">{amount}</span>
        </p>
        {delta && !hide && (
          <span key={`d${delta.id}`} className={`num pointer-events-none absolute -top-5 left-1 animate-floatup rounded-full px-2 py-0.5 text-[13px] font-bold ${delta.v < 0 ? 'bg-accent text-on-accent' : 'bg-pos text-white'}`} aria-hidden="true">
            {delta.v < 0 ? '−' : '+'}
            {rupees(Math.abs(delta.v))}
          </span>
        )}
        <h2 id="sts-label" className="eyebrow mt-2.5 text-ink2">
          Safe to spend
        </h2>
      </div>

      {/* 3. Per day and payday, side by side (stacked on very narrow phones) */}
      <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-2">
        <div className="min-w-0 rounded-2xl bg-sunk/70 px-3.5 py-3">
          <dt className="text-[12px] font-medium text-ink3">{soon ? 'Left for today' : 'Per day'}</dt>
          <dd className={`mt-0.5 truncate ${hide ? 'blur-sm' : ''}`}>
            <span className="stat-amt num font-semibold" style={{ ['--len' as string]: rupees(sts.daily).length + (soon ? 0 : 3) }}>
              {rupees(Math.round(shownDaily))}
            </span>
            {!soon && <span className="text-[13px] font-medium text-ink3">/day</span>}
          </dd>
          <dd className="mt-0.5 truncate text-[12px] text-ink3">{soon ? 'until payday' : `for ${sts.daysLeft} days`}</dd>
        </div>
        <div className="min-w-0 rounded-2xl bg-accent-soft px-3.5 py-3">
          <dt className="text-[12px] font-medium text-accent-ink/80">Payday</dt>
          <dd className="stat-amt num mt-0.5 truncate font-semibold text-accent-ink" style={{ ['--len' as string]: 7 }}>
            {fmtDate(sts.payday)}
          </dd>
          <dd className="mt-0.5 truncate text-[12px] text-accent-ink/80">{extra ? `+${rupees(extra.income.expected)} on ${fmtDate(extra.date)}` : paydayIn}</dd>
        </div>
      </dl>

      {/* 4. Runway to payday: one tick per day (a single track for long stretches) */}
      {sts.daysLeft >= 2 && (
        <div className="mt-4" role="img" aria-label={`${sts.daysLeft} days until payday on ${fmtDate(sts.payday)}. ${billDays.size} of those days have a bill.`}>
          {sts.daysLeft <= 14 ? (
            <div className="flex gap-1">
              {days.map((d, i) => (
                <div key={d} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <span className={`h-1.5 w-full rounded-full ${i === 0 ? 'animate-pulse bg-accent' : 'bg-sunk'}`} />
                  {sts.daysLeft <= 10 && <span className={`text-[11px] font-semibold leading-none ${i === 0 ? 'text-ink' : 'text-ink3'}`}>{W[parseDate(d).getDay()]}</span>}
                  <span className={`h-1 w-1 rounded-full ${billDays.has(d) ? 'bg-ink2' : 'bg-transparent'}`} />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div className="relative h-1.5 rounded-full bg-sunk">
                <span className="absolute left-0 top-0 h-1.5 w-3 animate-pulse rounded-full bg-accent" />
                {[...billDays].map((d) => (
                  <span key={d} className="absolute -bottom-2.5 h-1 w-1 -translate-x-1/2 rounded-full bg-ink2" style={{ left: `${(daysBetween(state.today, d) / sts.daysLeft) * 100}%` }} />
                ))}
              </div>
              <div className="mt-3.5 flex items-center justify-between text-[11.5px] font-semibold text-ink3">
                <span className="text-ink">Today</span>
                <span>{fmtDate(sts.payday)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Two equal actions, always on one row */}
      <div className="hero-actions mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => ui.openSheet({ type: 'safe' })} className="tap inline-flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-full bg-sunk px-2.5 text-[13.5px] font-semibold text-ink2 hover:text-ink">
          <Icon name="help" size={16} className="shrink-0" /> <span className="truncate">How it works</span>
        </button>
        <button type="button" onClick={() => ui.openSheet({ type: 'afford' })} className="tap inline-flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-full bg-accent-soft px-2.5 text-[13.5px] font-semibold text-accent-ink">
          <Icon name="spark" size={16} className="shrink-0" /> <span className="truncate">Can I afford?</span>
        </button>
      </div>
    </section>
  );
}

export function SafeBreakdown() {
  const { state } = useStore();
  const sts = safeToSpend(state);
  const Row = ({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) => (
    <div className={`flex items-baseline justify-between gap-3 py-3 ${strong ? '' : 'border-b border-line'}`}>
      <div>
        <p className={strong ? 'text-[16px] font-semibold' : 'text-[15px]'}>{label}</p>
        {sub && <p className="text-[13px] text-ink3">{sub}</p>}
      </div>
      <p className={`num shrink-0 ${strong ? 'text-[24px] font-semibold text-accent-ink' : 'text-[17px]'}`}>{value}</p>
    </div>
  );
  return (
    <div>
      <p className="mb-2 text-[14.5px] text-ink2">What's actually free until payday on {fmtDate(sts.payday)}, after everything already spoken for.</p>
      <Row label="Available now" value={rupees(sts.available)} sub={state.accounts.filter((a) => a.spendable).map((a) => a.name).join()} />
      <Row label="Upcoming bills" value={`−${rupees(sts.bills)}`} sub={sts.billItems.map((b) => b.name).join(', ') || 'Nothing before payday'} />
      <Row label="SIPs & investments" value={`−${rupees(sts.invest)}`} sub={sts.investItems.length ? sts.investItems.map((b) => b.name.replace('SIP · ', '')).join(', ') : (() => { const n = (state.investments ?? []).filter((i) => i.status === 'active').sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0]; return n ? `None before payday. Next is ${n.name} on ${fmtDate(n.nextDate)}.` : 'No SIPs set up'; })()} />
      {INSURANCE_ON && (state.insurance ?? []).length > 0 && (
        <Row
          label="Insurance kept aside"
          value={`−${rupees(sts.setAside)}`}
          sub={sts.setAsideItems.length ? sts.setAsideItems.map((x) => `${x.policy.name} ${rupees(x.amount)}`).join(' · ') : 'Premiums due before payday are in bills above'}
        />
      )}
      <Row label="Plans" value={`−${rupees(sts.goals)}`} sub={sts.goalItems.map((g) => `${g.plan.name} ${rupees(g.amount)}`).join(' · ') || 'Nothing planned this cycle'} />
      <Row label="Safety buffer" value={`−${rupees(sts.buffer)}`} sub="A cushion for surprises. Change it in You → Budget preferences." />
      <Row label="Safe to spend" value={rupees(sts.safe)} strong />
      <p className="text-[13.5px] text-ink3">
        That's {rupees(sts.daily)} a day for {sts.daysLeft} days. Credit card spending shows up when the card bill is due.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------
// TransactionRow with swipe actions
// ------------------------------------------------------------------
const ACTIONS_W = 166; // two 74px pills, the gap and the edge padding
const FULL_SWIPE = 0.62; // share of the row width that turns a swipe into delete

export function TransactionRow({ tx, compact }: { tx: Transaction; compact?: boolean }) {
  const { state, deleteTransaction } = useStore();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const rowRef = useRef<HTMLButtonElement>(null);
  const liRef = useRef<HTMLLIElement>(null);
  const splitRef = useRef<HTMLButtonElement>(null);
  const delRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; base: number; active: boolean; t: number; lastX: number; lastT: number; v: number; armed: boolean } | null>(null);
  const moved = useRef(false);
  const plan = tx.plan ? state.plans.find((p) => p.id === tx.plan) : undefined;
  const people = (tx.people ?? []).map((id) => state.people.find((p) => p.id === id)?.short).filter(Boolean) as string[];
  const isIn = tx.type === 'income' || (tx.type === 'transfer' && tx.direction === 'in');
  const isPot = tx.type === 'transfer' && tx.toAccount?.startsWith('pot:');
  const share = tx.splitId ? myCost(state, tx) : null;
  const cat = categoryName(state, tx.category);
  const card = state.cards.find((c) => c.id === tx.account);

  // Paint a drag position straight onto the DOM: no React render per frame, so it tracks the finger.
  const paint = (x: number, animate: boolean) => {
    const row = rowRef.current;
    const sp = splitRef.current;
    const del = delRef.current;
    const li = liRef.current;
    if (!row || !sp || !del || !li) return;
    const w = li.clientWidth;
    const ease = 'cubic-bezier(.2,.9,.25,1.12)';
    const t = animate ? `transform .42s ${ease}` : 'none';
    row.style.transition = t;
    row.style.transform = x ? `translate3d(${x}px,0,0)` : '';
    const reveal = Math.min(1, -x / ACTIONS_W);
    const full = -x > w * FULL_SWIPE;
    // Past the full-swipe point, delete stretches across the whole row.
    const a = Math.min(1, Math.max(0, (reveal - 0.05) / 0.5));
    const b = Math.min(1, Math.max(0, (reveal - 0.3) / 0.55));
    const tr = animate ? `transform .42s ${ease}, opacity .25s ease, width .28s ${ease}` : 'width .22s cubic-bezier(.2,.9,.25,1), transform .12s linear, opacity .12s linear';
    sp.style.transition = tr;
    del.style.transition = tr;
    // Delete sits at the edge so it shows first; split follows it in.
    del.style.opacity = String(full ? 1 : a);
    del.style.transform = `scale(${full ? 1 : 0.55 + a * 0.45})`;
    sp.style.opacity = full ? '0' : String(b);
    sp.style.transform = `scale(${0.55 + b * 0.45}) translateX(${(1 - b) * 30}px)`;
    del.style.width = full ? `${Math.max(74, -x - 8)}px` : '74px';
    li.dataset.full = full ? '1' : '';
  };

  useEffect(() => {
    // Only one row open at a time, and a tap anywhere else closes it.
    if (!open) return;
    const onOther = (e: Event) => (e as CustomEvent).detail !== tx.id && close();
    const onDownAway = (e: PointerEvent) => !liRef.current?.contains(e.target as Node) && close();
    window.addEventListener('pulse-swipe-open', onOther);
    window.addEventListener('pointerdown', onDownAway, true);
    return () => {
      window.removeEventListener('pulse-swipe-open', onOther);
      window.removeEventListener('pointerdown', onDownAway, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    paint(0, true);
  };
  const openRow = () => {
    setOpen(true);
    paint(-ACTIONS_W, true);
    window.dispatchEvent(new CustomEvent('pulse-swipe-open', { detail: tx.id }));
  };
  const remove = () => {
    const li = liRef.current;
    const row = rowRef.current;
    haptic(18);
    setLeaving(true);
    if (!li || !row || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return deleteTransaction(tx.id);
    // Slide the row off, then fold the gap shut, then delete (the toast offers Undo).
    row.style.transition = 'transform .26s cubic-bezier(.5,0,.75,0)';
    row.style.transform = `translate3d(${-li.clientWidth - 40}px,0,0)`;
    li.style.height = `${li.offsetHeight}px`;
    window.setTimeout(() => {
      li.style.transition = 'height .26s cubic-bezier(.4,0,.2,1), opacity .26s ease, margin .26s ease';
      li.style.height = '0px';
      li.style.opacity = '0';
    }, 200);
    window.setTimeout(() => deleteTransaction(tx.id), 470);
  };

  const onClickRow = () => {
    if (moved.current) return;
    if (open) return close();
    ui.setSelectedTx(tx.id);
    if (window.matchMedia('(min-width: 1280px)').matches) return; // desktop: detail shows in side panel
    ui.openSheet({ type: 'tx', id: tx.id });
  };

  const onDown = (e: RPE) => {
    if (e.pointerType === 'mouse' || leaving) return;
    const base = open ? -ACTIONS_W : 0;
    drag.current = { x: e.clientX, y: e.clientY, base, active: false, t: performance.now(), lastX: e.clientX, lastT: performance.now(), v: 0, armed: false };
    moved.current = false;
  };
  const onMove = (e: RPE) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (drag.current = null); // it's a scroll
      if (Math.abs(dx) < 8) return;
      d.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    moved.current = true;
    const now = performance.now();
    d.v = (e.clientX - d.lastX) / Math.max(1, now - d.lastT);
    d.lastX = e.clientX;
    d.lastT = now;
    let x = d.base + dx;
    const w = liRef.current?.clientWidth ?? 360;
    if (x > 0) x = x * 0.25; // rubber band to the right
    if (x < -w) x = -w + (x + w) * 0.2;
    paint(x, false);
    const full = -x > w * FULL_SWIPE;
    if (full !== d.armed) {
      d.armed = full;
      haptic(full ? 14 : 6); // a tick when full-swipe delete arms or disarms
    } else if (!open && -x > 60 && -x < 64) haptic(4);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    window.setTimeout(() => (moved.current = false), 60);
    if (!d || !d.active) return;
    const row = rowRef.current;
    const x = row ? new DOMMatrixReadOnly(getComputedStyle(row).transform).m41 : 0;
    if (d.armed) return remove();
    if (d.v < -0.45 || (d.v <= 0.3 && -x > ACTIONS_W * 0.42)) openRow();
    else close();
  };
  const sub = [cat, card ? `${card.name} card` : null].filter(Boolean).join(' · ');

  return (
    <li ref={liRef} className="group/row relative overflow-hidden rounded-xl">
      {/* swipe actions (touch): revealed as the row slides left */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end gap-1.5 py-1 pr-1.5" aria-hidden={!open}>
        <button
          ref={splitRef}
          type="button"
          tabIndex={open ? 0 : -1}
          style={{ opacity: 0, transform: 'scale(.55)' }}
          className="flex h-full w-[74px] origin-right flex-col items-center justify-center gap-0.5 rounded-2xl bg-ink text-[12.5px] font-semibold text-bg active:scale-95"
          onClick={() => {
            close();
            ui.openSheet({ type: 'group-expense', personId: tx.people?.[0] });
          }}
        >
          <Icon name="split" size={18} /> Split
        </button>
        <button
          ref={delRef}
          type="button"
          tabIndex={open ? 0 : -1}
          style={{ opacity: 0, transform: 'scale(.55)', width: 74 }}
          className="flex h-full origin-right flex-col items-center justify-center gap-0.5 rounded-2xl bg-neg text-[12.5px] font-semibold text-white active:scale-95"
          onClick={remove}
        >
          <Icon name="trash" size={18} className="group-data-[full='1']/row:animate-wiggle" /> Delete
        </button>
      </div>
      <button
        ref={rowRef}
        type="button"
        onClick={onClickRow}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ touchAction: 'pan-y' }}
        className={`relative flex w-full items-center gap-3 rounded-xl bg-bg px-1 text-left will-change-transform hover:bg-sunk/60 ${compact ? 'py-2' : 'py-2.5'} ${ui.selectedTx === tx.id ? 'xl:bg-sunk' : ''}`}
      >
        <CategoryMark state={state} category={isPot ? 'transfer' : tx.category} emoji={isPot ? plan?.icon : undefined} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{tx.merchant}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink3">
            <span className="truncate">{sub}</span>
            {plan && !isPot && (
              <span className="shrink-0 rounded-md bg-accent-soft px-1.5 text-[11.5px] font-semibold text-accent-ink">
                {plan.icon} {plan.name}
              </span>
            )}
            {people.length > 0 && <span className="shrink-0 truncate">· with {people.join(', ')}</span>}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`num block text-[15.5px] font-semibold ${isIn ? 'text-pos' : ''}`}>{isIn ? rupees(tx.amount, { sign: true }) : `−${rupees(tx.amount)}`}</span>
          {share != null && <span className="block text-[12px] text-ink3">your share {rupees(share)}</span>}
          {tx.recurring && share == null && (
            <span className="inline-flex items-center gap-0.5 text-[12px] text-ink3">
              <Icon name="repeat" size={11} /> Recurring
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function TransactionList({ txs, emptyText }: { txs: Transaction[]; emptyText?: string }) {
  const { state } = useStore();
  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    txs.forEach((t) => m.set(t.date, [...(m.get(t.date) ?? []), t]));
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [txs]);
  if (!txs.length) return <p className="px-1 py-8 text-center text-[14.5px] text-ink3">{emptyText ?? 'Nothing here yet.'}</p>;
  return (
    <div className="stagger flex flex-col gap-5">
      {groups.map(([date, list]) => (
        <DateGroup key={date} date={date} today={state.today} txs={list} />
      ))}
    </div>
  );
}

export function DateGroup({ date, today, txs }: { date: string; today: string; txs: Transaction[] }) {
  const { state } = useStore();
  const out = txs.filter((t) => t.type === 'expense').reduce((a, t) => a + myCost(state, t), 0);
  return (
    <section aria-label={fmtDayHeader(date, today)}>
      <div className="mb-1 flex items-baseline justify-between px-1">
        <h3 className="eyebrow">{fmtDayHeader(date, today)}</h3>
        {out > 0 && <span className="num text-[12.5px] text-ink3">spent {rupees(out)}</span>}
      </div>
      <ul className="flex flex-col">
        {txs.map((t) => (
          <TransactionRow key={t.id} tx={t} />
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------
// Plans
// ------------------------------------------------------------------
export function PlanProgress({ plan, onClick }: { plan: Plan; onClick: () => void }) {
  const { state } = useStore();
  const m = planMetrics(state, plan);
  return (
    <button type="button" onClick={onClick} className="row-btn min-h-[60px] flex-col items-stretch gap-2 py-3">
      <span className="flex items-center gap-2.5">
        <span className="text-[20px]" aria-hidden="true">
          {plan.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{plan.name}</span>
          <span className={`block text-[13px] ${m.tone === 'behind' ? 'text-warn' : m.tone === 'ahead' || m.tone === 'done' ? 'text-pos' : 'text-ink3'}`}>{m.short}</span>
        </span>
        <span className="num text-[20px] font-semibold">{Math.round(m.progress * 100)}%</span>
      </span>
      <ProgressBar value={m.progress} label={`${plan.name} ${Math.round(m.progress * 100)}% funded`} height={6} tone={m.tone === 'paused' ? 'ink' : 'accent'} />
    </button>
  );
}

export function PlanCard({ plan, onOpen }: { plan: Plan; onOpen: () => void }) {
  const { state } = useStore();
  const m = planMetrics(state, plan);
  const expectedFrac = plan.target ? m.expected / plan.target : 0;
  const pill =
    m.tone === 'ahead' ? <StatusPill status="good">{m.short}</StatusPill> : m.tone === 'behind' ? <StatusPill status="close">Behind</StatusPill> : m.tone === 'done' ? <StatusPill status="accent">Funded</StatusPill> : m.tone === 'paused' ? <StatusPill status="neutral">Paused</StatusPill> : <StatusPill status="good">On track</StatusPill>;
  return (
    <button type="button" onClick={onOpen} className={`tap w-full rounded-2xl border border-line bg-surface p-4 text-left hover:border-ink3/40 ${plan.status === 'paused' ? 'opacity-80' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sunk text-[22px]" aria-hidden="true">
          {plan.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="display truncate text-[17px]">{plan.name}</p>
          <p className="num text-[14px] text-ink2">
            {rupees(plan.saved)} <span className="text-ink3">/ {rupees(plan.target)}</span>
          </p>
        </div>
        <p className="num-hero text-[25px] leading-none">{Math.round(m.progress * 100)}%</p>
      </div>
      <div className="mt-4">
        <ProgressBar value={m.progress} marker={m.tone === 'done' || m.tone === 'paused' ? undefined : expectedFrac} label={`${plan.name} progress`} tone={m.tone === 'paused' ? 'ink' : 'accent'} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink3">
        {pill}
        <span>Target {fmtDate(plan.targetDate)}</span>
        {m.monthly > 0 && plan.status === 'active' && <span>Save {rupees(m.monthly)}/month</span>}
      </div>
      {plan.status === 'active' && m.tone !== 'done' && <p className="mt-2 text-[14px] text-ink2">{m.status}</p>}
    </button>
  );
}

export function GoalCard({ plan, onOpen }: { plan: Plan; onOpen: () => void }) {
  const { state } = useStore();
  const m = planMetrics(state, plan);
  return (
    <button type="button" onClick={onOpen} className="tap flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-left">
      <Ring value={m.progress} label={`${Math.round(m.progress * 100)}% saved`}>
        <span className="text-[20px]" aria-hidden="true">
          {plan.icon}
        </span>
      </Ring>
      <div className="min-w-0 flex-1">
        <p className="display text-[17px]">{plan.name}</p>
        <p className="num text-[14px] text-ink2">
          {rupees(plan.saved)} of {rupees(plan.target)} · {rupees(m.remaining)} to go
        </p>
        <p className="text-[13px] text-ink3">
          {m.tone === 'done' ? 'Complete' : `${rupees(m.monthly)}/month to finish by ${fmtDate(plan.targetDate, true)}`}
        </p>
      </div>
    </button>
  );
}

// ------------------------------------------------------------------
// Insight
// ------------------------------------------------------------------
export function InsightCard({ insight }: { insight: Insight }) {
  const ui = useUI();
  return (
    <button type="button" onClick={() => ui.openSheet({ type: 'insight', insight })} className="tap flex w-full items-start gap-3 rounded-2xl bg-accent-soft/70 p-4 text-left hover:bg-accent-soft">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-accent-ink" aria-hidden="true">
        <Icon name="spark" size={16} />
      </span>
      <span className="min-w-0 flex-1 text-[15.5px] font-medium leading-snug">{insight.text}</span>
      <Icon name="chevron" size={18} className="mt-1 shrink-0 text-ink3" />
    </button>
  );
}

export function InsightDetailView({ insight }: { insight: Insight }) {
  const d = insight.detail;
  return (
    <div>
      <p className="mb-4 text-[16px] font-medium">{insight.text}</p>
      <h3 className="eyebrow mb-3">{d.title}</h3>
      {d.kind === 'bars' ? <Bars rows={d.rows} /> : (
        <ul className="divide-y divide-line">
          {d.rows.map((r) => (
            <li key={r.label} className="flex items-baseline justify-between gap-3 py-2.5">
              <span>
                <span className="block text-[15px]">{r.label}</span>
                {r.sub && <span className="block text-[13px] text-ink3">{r.sub}</span>}
              </span>
              <span className="num shrink-0 text-[15px] font-semibold">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
      {d.note && <p className="mt-4 text-[14px] text-ink2">{d.note}</p>}
    </div>
  );
}

/** Horizontal bars with the values written out, so the chart never relies on colour or shape alone. */
export function Bars({ rows }: { rows: { label: string; value: number; highlight?: boolean }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(76px,34%)_1fr] items-center gap-3">
          <span className={`truncate text-[13.5px] ${r.highlight ? 'font-semibold text-ink' : 'text-ink2'}`}>{r.label}</span>
          <span className="flex items-center gap-2">
            <span className={`h-6 rounded-md ${r.highlight ? 'bg-accent' : 'bg-ink/15'}`} style={{ width: `${Math.max(2, (r.value / max) * 72)}%` }} />
            <span className={`num shrink-0 text-[13.5px] ${r.highlight ? 'font-semibold' : 'text-ink2'}`}>{rupees(r.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------
// Budgets
// ------------------------------------------------------------------
export function BudgetProgress({ budget, onClick }: { budget: Budget; onClick?: () => void }) {
  const { state } = useStore();
  const st = budgetState(state, budget);
  const name = categoryName(state, budget.category);
  const pill = st.status === 'over' ? 'over' : st.status === 'close' ? 'close' : 'good';
  const period = budget.period === 'weekly' ? 'this week' : budget.period === 'monthly' ? 'this month' : `until ${fmtDate(st.window[1])}`;
  return (
    <button type="button" onClick={onClick} className="row-btn flex-col items-stretch gap-2.5 py-3.5">
      <span className="flex items-center gap-3">
        <CategoryMark state={state} category={budget.category} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{name}</span>
          <span className="num block text-[13px] text-ink3">
            {rupees(st.spent)} of {rupees(budget.amount)} {period}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <StatusPill status={pill}>{st.label}</StatusPill>
          <span className="num text-[13px] text-ink2">{st.left >= 0 ? `${rupees(st.left)} left` : `${rupees(-st.left)} over`}</span>
        </span>
      </span>
      <ProgressBar value={st.ratio} marker={budget.period !== 'custom' ? st.elapsed : undefined} label={`${name} budget ${Math.round(st.ratio * 100)}% used`} tone={st.status === 'over' ? 'warn' : 'ink'} height={6} />
    </button>
  );
}

// ------------------------------------------------------------------
// Social
// ------------------------------------------------------------------
export function SplitCard({ group, onOpen }: { group: Group; onOpen: () => void }) {
  const { state } = useStore();
  const g = groupSummary(state, group.id);
  const net = g.owedToYou - g.youOwe;
  return (
    <button type="button" onClick={onOpen} className="tap flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sunk text-[22px]" aria-hidden="true">
        {group.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="display block truncate text-[16.5px]">{group.name}</span>
        <span className="mt-1 flex items-center gap-2">
          <AvatarStack ids={group.members} size={22} />
          <span className="text-[13px] text-ink3">{rupees(g.total)} spent</span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        {g.youOwe === 0 && g.owedToYou === 0 ? (
          <span className="text-[13.5px] font-semibold text-ink3">All settled</span>
        ) : (
          <>
            <span className={`num block text-[16px] font-semibold ${net >= 0 ? 'text-pos' : 'text-ink'}`}>{rupees(Math.abs(net))}</span>
            <span className="block text-[12.5px] text-ink3">{net >= 0 ? 'owed to you' : 'you owe'}</span>
          </>
        )}
      </span>
    </button>
  );
}

// ------------------------------------------------------------------
// Subscriptions
// ------------------------------------------------------------------
export function SubscriptionRow({ sub, onClick }: { sub: Subscription; onClick: () => void }) {
  const { state } = useStore();
  const st = { active: null, paused: <StatusPill status="neutral">Paused</StatusPill>, cancelled: <StatusPill status="neutral">Cancelled</StatusPill>, unknown: <StatusPill status="close">Still using?</StatusPill> }[sub.status];
  return (
    <button type="button" onClick={onClick} className={`row-btn min-h-[60px] ${sub.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <CategoryMark state={state} category={sub.kind === 'bill' ? 'bills' : sub.category} size={38} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{sub.name}</span>
          {st}
        </span>
        <span className="block text-[13px] text-ink3">{sub.status === 'active' || sub.status === 'unknown' ? `Renews ${relDay(sub.nextDate, state.today)}` : sub.cycle === 'yearly' ? 'Yearly' : 'Monthly'}</span>
      </span>
      <span className="num shrink-0 text-[15px] font-semibold">
        {rupees(sub.amount)}
        <span className="text-[12px] font-medium text-ink3">/{sub.cycle === 'yearly' ? 'yr' : sub.cycle === 'weekly' ? 'wk' : 'mo'}</span>
      </span>
    </button>
  );
}

// ------------------------------------------------------------------
// Toasts ("money moments")
// ------------------------------------------------------------------
export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-6 md:items-end" style={{ bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }} aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex w-full max-w-[420px] animate-toast items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-bg shadow-lift">
          {t.emoji ? (
            <span className="grid h-7 w-7 shrink-0 animate-boing place-items-center text-[22px] leading-none" aria-hidden="true">
              <span className={t.emoji === '🔥' ? 'animate-flicker' : ''}>{t.emoji}</span>
            </span>
          ) : (
            <span className="grid h-6 w-6 shrink-0 animate-spinin place-items-center rounded-full bg-bg/15" aria-hidden="true">
              <Icon name={t.tone === 'heads-up' ? 'info' : 'check'} size={14} strokeWidth={2.6} />
            </span>
          )}
          <p className="min-w-0 flex-1 text-[14.5px] font-medium leading-snug">{t.text}</p>
          {t.action && (
            <button type="button" onClick={() => { t.action!.run(); dismissToast(t.id); }} className="tap shrink-0 rounded-full px-3 py-1.5 text-[14px] font-bold underline-offset-2 hover:underline">
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
