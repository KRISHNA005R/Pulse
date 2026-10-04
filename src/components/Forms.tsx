import { useEffect, useMemo, useState } from 'react';
import { roundMoney, sym } from '../lib/currency';
import type { BudgetPeriod, CategoryId, Debt, FundType, IncomeKind, Investment, InvestmentKind, ISODate, Plan, State, Subscription } from '../types';
import { decodeBackup, encodeBackup } from '../lib/backupCode';
import { track } from '../lib/stats';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { EMOJI_GRID, suggestEmoji, typedEmoji } from '../lib/lexicon';
import { addMonths, daysBetween, fmtDate, haptic, rupees, rupeesShort } from '../lib/format';
import { CYCLE_MONTHS, defaultAccount, emiParts, mainIncome, estimateInvested, firstRecorded, FUND_TYPES, investedIn, personBalances, planMetrics, safeToSpend, sipProjection } from '../lib/finance';
import { Icon } from './ui/Icon';
import { Field, MoneyInput, PersonAvatar, Segmented, Toggle } from './ui/bits';

export const PLAN_TEMPLATES: { key: string; name: string; icon: string; target: number; months: number; kind: Plan['kind']; categories: CategoryId[] }[] = [
  { key: 'trip', name: 'Goa trip', icon: '🏝️', target: 20000, months: 4, kind: 'plan', categories: ['travel'] },
  { key: 'concert', name: 'Concert weekend', icon: '🎸', target: 8000, months: 2, kind: 'plan', categories: ['entertainment'] },
  { key: 'laptop', name: 'New laptop', icon: '💻', target: 90000, months: 10, kind: 'plan', categories: ['shopping'] },
  { key: 'emergency', name: 'Emergency fund', icon: '🛟', target: 100000, months: 12, kind: 'goal', categories: [] },
  { key: 'birthday', name: 'Birthday', icon: '🎁', target: 5000, months: 2, kind: 'plan', categories: ['shopping'] },
  { key: 'phone', name: 'New phone', icon: '📱', target: 60000, months: 8, kind: 'plan', categories: ['shopping'] },
  { key: 'moving', name: 'Moving out', icon: '📦', target: 50000, months: 6, kind: 'goal', categories: ['bills'] },
  { key: 'gaming', name: 'Gaming PC', icon: '🎮', target: 120000, months: 12, kind: 'plan', categories: ['shopping'] },
  { key: 'vacation', name: 'Vacation', icon: '✈️', target: 60000, months: 8, kind: 'plan', categories: ['travel'] },
  { key: 'custom', name: '', icon: '✨', target: 0, months: 6, kind: 'plan', categories: [] },
];
const EMOJI = ['🏝️', '🎸', '💻', '🛟', '🎁', '📱', '📦', '🎮', '✈️', '✨', '🏍️', '📚', '🎓', '💍', '🐶', '🏋️', '🎧', '📷', '🏠', '🌱'];

export function PlanForm({ planId, template, onDone }: { planId?: string; template?: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const existing = state.plans.find((p) => p.id === planId);
  const [tpl, setTpl] = useState<string | null>(existing ? 'edit' : template ?? null);
  const t = PLAN_TEMPLATES.find((x) => x.key === tpl);
  const [name, setName] = useState(existing?.name ?? t?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? t?.icon ?? '✨');
  const [target, setTarget] = useState(String(existing?.target ?? t?.target ?? ''));
  const [saved, setSaved] = useState(String(existing?.saved ?? ''));
  const [date, setDate] = useState(existing?.targetDate ?? addMonths(state.today, t?.months ?? 6));
  const [cats, setCats] = useState<CategoryId[]>(existing?.categories ?? t?.categories ?? []);
  const [reserve, setReserve] = useState(String(existing?.cycleReserve ?? ''));
  const [group, setGroup] = useState(existing?.groupId ?? '');

  const pick = (key: string) => {
    const x = PLAN_TEMPLATES.find((y) => y.key === key)!;
    setTpl(key);
    setName(x.name);
    setIcon(x.icon);
    setTarget(x.target ? String(x.target) : '');
    setDate(addMonths(state.today, x.months));
    setCats(x.categories);
  };

  const monthly = useMemo(() => {
    const tg = parseFloat(target) || 0;
    const sv = parseFloat(saved) || 0;
    const months = Math.max(0.5, daysBetween(state.today, date) / 30.44);
    return Math.max(0, Math.ceil((tg - sv) / months / 50) * 50);
  }, [target, saved, date, state.today]);

  if (!tpl)
    return (
      <div>
        <p className="mb-4 text-[15px] text-ink2">What are you saving for? Pick a starting point, you can change everything.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PLAN_TEMPLATES.map((x) => (
            <button key={x.key} type="button" onClick={() => pick(x.key)} className="tap flex min-h-[64px] items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 text-left hover:border-ink3/40">
              <span className="text-[22px]" aria-hidden="true">
                {x.icon}
              </span>
              <span className="text-[14.5px] font-semibold">{x.name || 'Custom plan'}</span>
            </button>
          ))}
        </div>
      </div>
    );

  const valid = name.trim() && parseFloat(target) > 0 && date > state.today;
  const save = () => {
    if (!valid) return;
    const tg = roundMoney(parseFloat(target));
    const sv = roundMoney(parseFloat(saved) || 0);
    const id = store.savePlan({
      id: existing?.id,
      name: name.trim(),
      icon,
      kind: existing?.kind ?? t?.kind ?? 'plan',
      target: tg,
      saved: sv,
      startDate: existing?.startDate ?? state.today,
      targetDate: date,
      status: existing ? (sv >= tg ? 'done' : existing.status === 'done' ? 'active' : existing.status) : sv >= tg ? 'done' : 'active',
      categories: cats,
      cycleReserve: roundMoney(parseFloat(reserve) || 0),
      groupId: group || undefined,
      contributions: existing?.contributions,
    });
    onDone();
    if (!existing) window.setTimeout(() => ui.resetTo('plans', { name: 'plan', id }), 50);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink2">Icon</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
          {EMOJI.map((em) => (
            <button key={em} type="button" role="radio" aria-checked={icon === em} aria-label={em} onClick={() => setIcon(em)} className={`tap grid h-10 w-10 place-items-center rounded-xl text-[20px] ${icon === em ? 'bg-ink' : 'bg-sunk'}`}>
              {em}
            </button>
          ))}
        </div>
      </div>
      <Field label="Name" htmlFor="plan-name">
        <input id="plan-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Goa 2026" />
      </Field>
      <div className="rounded-2xl bg-sunk/60 px-3">
        <MoneyInput value={target} onChange={setTarget} label="Target amount" size="md" id="plan-target" />
        <p className="-mt-1 pb-2 text-center text-[12.5px] text-ink3">Target amount</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Already saved" htmlFor="plan-saved">
          <input id="plan-saved" inputMode="decimal" className="field num" value={saved} onChange={(e) => setSaved(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`${sym()}0`} />
        </Field>
        <Field label="Target date" htmlFor="plan-date">
          <input id="plan-date" type="date" className="field" value={date} min={state.today} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink2">Link categories (optional)</p>
        <div className="flex flex-wrap gap-2">
          {state.categories.filter((c) => c.kind === 'expense').map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={cats.includes(c.id)} onClick={() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])}>
              <span aria-hidden="true">{c.emoji}</span> {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Set aside before payday" htmlFor="plan-reserve" hint="Held back from safe-to-spend.">
          <input id="plan-reserve" inputMode="decimal" className="field num" value={reserve} onChange={(e) => setReserve(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`${sym()}0`} />
        </Field>
        <Field label="Shared with a group" htmlFor="plan-group">
          <select id="plan-group" className="field" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">No group</option>
            {state.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.emoji} {g.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {parseFloat(target) > 0 && (
        <p className="rounded-2xl bg-accent-soft p-3 text-[14.5px]">
          Save <span className="num font-semibold">{rupees(monthly)}/month</span> to reach {icon} {name || 'this'} by {fmtDate(date, true)}.
        </p>
      )}
      <button type="submit" disabled={!valid} className="btn-accent w-full disabled:opacity-40">
        {existing ? 'Save changes' : 'Create plan'}
      </button>
    </form>
  );
}

export function ContributeForm({ planId, onDone }: { planId: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const plan = state.plans.find((p) => p.id === planId)!;
  const m = planMetrics(state, plan);
  const sts = safeToSpend(state);
  const suggest = plan.cycleReserve || m.weekExtra || Math.min(m.remaining, Math.round(m.monthly / 4 / 10) * 10);
  const [amount, setAmount] = useState(String(suggest || ''));
  const [from, setFrom] = useState(defaultAccount(state));
  const n = parseFloat(amount) || 0;
  const freeCost = Math.max(0, n - plan.cycleReserve);
  return (
    <div>
      <MoneyInput value={amount} onChange={setAmount} label={`Amount to add to ${plan.name}`} autoFocus id="contribute-amount" />
      <div className="flex flex-wrap justify-center gap-2">
        {[plan.cycleReserve, 500, 1000, m.weekExtra].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
          <button key={v} type="button" className="chip" aria-pressed={n === v} onClick={() => setAmount(String(v))}>
            {rupees(v)}
            {v === plan.cycleReserve ? ' · planned' : v === m.weekExtra ? ' · catch up' : ''}
          </button>
        ))}
      </div>
      <Field label="From" htmlFor="contribute-from">
        <select id="contribute-from" className="field mt-4" value={from} onChange={(e) => setFrom(e.target.value)}>
          {state.accounts.filter((a) => a.type === 'bank' || a.type === 'cash').map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {rupees(a.balance)}
            </option>
          ))}
        </select>
      </Field>
      <p className="mt-4 text-center text-[14px] text-ink2">
        {n > 0 && (freeCost > 0 ? <>Safe to spend goes from {rupees(sts.safe)} to {rupees(Math.max(0, sts.safe - freeCost))}.</> : <>This was already set aside, so safe to spend stays at {rupees(sts.safe)}.</>)}
      </p>
      <button
        type="button"
        disabled={!n}
        className="btn-accent mt-4 w-full disabled:opacity-40"
        onClick={() => {
          store.contribute(planId, Math.round(n), from);
          onDone();
        }}
      >
        Add {n ? rupees(n) : ''} to {plan.name}
      </button>
    </div>
  );
}

export function BudgetForm({ budgetId, category, onDone }: { budgetId?: string; category?: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const existing = state.budgets.find((b) => b.id === budgetId);
  const taken = new Set(state.budgets.filter((b) => b.id !== budgetId).map((b) => b.category));
  const [cat, setCat] = useState<string>(existing?.category ?? category ?? state.categories.find((c) => c.kind === 'expense' && !taken.has(c.id))?.id ?? 'other');
  const [amount, setAmount] = useState(String(existing?.amount ?? ''));
  const [period, setPeriod] = useState<BudgetPeriod>(existing?.period ?? 'monthly');
  const [start, setStart] = useState(existing?.start ?? state.today);
  const [end, setEnd] = useState(existing?.end ?? addMonths(state.today, 1));
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Category" htmlFor="budget-cat">
        <select id="budget-cat" className="field" value={cat} onChange={(e) => setCat(e.target.value)} disabled={!!existing}>
          {state.categories.filter((c) => c.kind === 'expense' && (!taken.has(c.id) || c.id === cat)).map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji ? `${c.emoji} ` : ''}{c.name}
            </option>
          ))}
        </select>
      </Field>
      <Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'weekly', label: 'Weekly' }, { value: 'custom', label: 'Custom' }]} />
      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="budget-start">
            <input id="budget-start" type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="budget-end">
            <input id="budget-end" type="date" className="field" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="rounded-2xl bg-sunk/60">
        <MoneyInput value={amount} onChange={setAmount} label="Budget amount" size="md" id="budget-amount" />
      </div>
      <p className="text-[13.5px] text-ink3">Budgets are optional guides. Going over never blocks anything, and PULSE keeps the language calm.</p>
      <button
        type="button"
        disabled={!(parseFloat(amount) > 0)}
        className="btn-accent w-full disabled:opacity-40"
        onClick={() => {
          store.saveBudget({ id: existing?.id, category: cat, amount: roundMoney(parseFloat(amount)), period, start: period === 'custom' ? start : undefined, end: period === 'custom' ? end : undefined });
          onDone();
        }}
      >
        {existing ? 'Save budget' : 'Create budget'}
      </button>
      {existing &&
        (confirm ? (
          <div className="flex items-center gap-2 rounded-2xl bg-sunk p-2 pl-4" role="alert">
            <span className="flex-1 text-[14px]">Remove this budget?</span>
            <button type="button" className="btn-ghost min-h-[40px] px-3" onClick={() => setConfirm(false)}>
              Keep
            </button>
            <button type="button" className="btn min-h-[40px] bg-neg px-4 text-white" onClick={() => { store.deleteBudget(existing.id); onDone(); }}>
              Remove
            </button>
          </div>
        ) : (
          <button type="button" className="btn-ghost text-neg" onClick={() => setConfirm(true)}>
            Remove budget
          </button>
        ))}
    </div>
  );
}

export function SubscriptionForm({ subId, preset, onDone }: { subId?: string; preset?: { name: string; amount: number; category: string }; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ex = state.subscriptions.find((s) => s.id === subId);
  const [name, setName] = useState(ex?.name ?? preset?.name ?? '');
  const [amount, setAmount] = useState(String(ex?.amount ?? preset?.amount ?? ''));
  const [cycle, setCycle] = useState<Subscription['cycle']>(ex?.cycle ?? 'monthly');
  const [next, setNext] = useState(ex?.nextDate ?? addMonths(state.today, 1));
  const [kind, setKind] = useState<Subscription['kind']>(ex?.kind ?? 'subscription');
  const [status, setStatus] = useState<Subscription['status']>(ex?.status ?? 'active');
  const [account, setAccount] = useState(ex?.account ?? defaultAccount(state));
  const [auto, setAuto] = useState(ex?.autoDebit !== false);
  const [confirm, setConfirm] = useState(false);
  const valid = name.trim() && parseFloat(amount) > 0;
  return (
    <div className="flex flex-col gap-4">
      <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: 'subscription', label: 'Subscription' }, { value: 'bill', label: 'Bill' }]} />
      <Field label="Name" htmlFor="sub-name">
        <input id="sub-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Spotify, rent, gym…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="sub-amount">
          <input id="sub-amount" inputMode="decimal" className="field num" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder={sym().trim()} />
        </Field>
        <Field label="Repeats" htmlFor="sub-cycle">
          <select id="sub-cycle" className="field" value={cycle} onChange={(e) => setCycle(e.target.value as Subscription['cycle'])}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="weekly">Weekly</option>
          </select>
        </Field>
      </div>
      <Field label="Next payment" htmlFor="sub-next">
        <input id="sub-next" type="date" className="field" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Paid from" htmlFor="sub-from">
        <select id="sub-from" className="field" value={account} onChange={(e) => setAccount(e.target.value)}>
          {state.accounts.filter((a) => a.type === 'bank' || a.type === 'cash' || a.id === account).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          {state.cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} card ··{c.last4}
            </option>
          ))}
        </select>
      </Field>
      <Toggle checked={auto} onChange={setAuto} label="Deduct automatically" sub={auto ? 'On the date PULSE records the payment and takes it from this account' : 'Off: PULSE only reminds you, and you log the payment yourself'} />
      {ex && (
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink2">Status</p>
          <Segmented label="Status" size="sm" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'unknown', label: 'Unsure' }]} />
        </div>
      )}
      <button
        type="button"
        disabled={!valid}
        className="btn-accent w-full disabled:opacity-40"
        onClick={() => {
          store.saveSubscription({ id: ex?.id, name: name.trim(), amount: roundMoney(parseFloat(amount)), cycle, nextDate: next, category: ex?.category ?? preset?.category ?? (kind === 'bill' ? 'bills' : 'subscriptions'), status, kind, account, autoDebit: auto });
          onDone();
        }}
      >
        {ex ? 'Save' : 'Add recurring payment'}
      </button>
      {ex &&
        (confirm ? (
          <div className="flex items-center gap-2 rounded-2xl bg-sunk p-2 pl-4" role="alert">
            <span className="flex-1 text-[14px]">Stop tracking {ex.name}?</span>
            <button type="button" className="btn-ghost min-h-[40px] px-3" onClick={() => setConfirm(false)}>
              Keep
            </button>
            <button type="button" className="btn min-h-[40px] bg-neg px-4 text-white" onClick={() => { store.deleteSubscription(ex.id); onDone(); }}>
              Remove
            </button>
          </div>
        ) : (
          <button type="button" className="btn-ghost text-neg" onClick={() => setConfirm(true)}>
            Stop tracking
          </button>
        ))}
    </div>
  );
}

export function GroupForm({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🍜');
  const [members, setMembers] = useState<string[]>([]);
  const [friend, setFriend] = useState('');
  const [plan, setPlan] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Group icon">
        {['🍜', '🏝️', '🏠', '🎉', '⚽', '🎬', '🚗', '☕', '🎂', '🏕️'].map((e) => (
          <button key={e} type="button" role="radio" aria-checked={emoji === e} aria-label={e} onClick={() => setEmoji(e)} className={`tap grid h-10 w-10 place-items-center rounded-xl text-[20px] ${emoji === e ? 'bg-ink' : 'bg-sunk'}`}>
            {e}
          </button>
        ))}
      </div>
      <Field label="Group name" htmlFor="group-name">
        <input id="group-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lonavala weekend" />
      </Field>
      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink2">Who's in?</p>
        <div className="flex flex-wrap gap-2">
          {state.people.map((p) => (
            <button key={p.id} type="button" className="chip pl-1" aria-pressed={members.includes(p.id)} onClick={() => setMembers(members.includes(p.id) ? members.filter((x) => x !== p.id) : [...members, p.id])}>
              <PersonAvatar person={p} size={24} /> {p.short}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!friend.trim()) return;
            const p = store.addPerson(friend);
            setMembers([...members, p.id]);
            setFriend('');
          }}
        >
          <label htmlFor="group-friend" className="sr-only">
            Add a friend by name
          </label>
          <input id="group-friend" className="field py-2" placeholder="Add a friend by name" value={friend} onChange={(e) => setFriend(e.target.value)} />
          <button type="submit" className="btn-quiet min-h-[42px] px-4">
            <Icon name="user-plus" size={16} /> Add
          </button>
        </form>
      </div>
      <Field label="Link to a plan (optional)" htmlFor="group-plan" hint="Group expenses will count toward this plan automatically.">
        <select id="group-plan" className="field" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">No plan</option>
          {state.plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>
      </Field>
      <button
        type="button"
        disabled={!name.trim() || !members.length}
        className="btn-accent w-full disabled:opacity-40"
        onClick={() => {
          const id = store.addGroup({ name: name.trim(), emoji, members: ['me', ...members], plan: plan || undefined });
          onDone();
          window.setTimeout(() => ui.resetTo('plans', { name: 'group', id }), 30);
        }}
      >
        Create group
      </button>
    </div>
  );
}

export function SettleForm({ personId, groupId, onDone }: { personId: string; groupId?: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const person = state.people.find((p) => p.id === personId)!;
  const bal = personBalances(state, groupId).get(personId) ?? 0;
  const [amount, setAmount] = useState(String(Math.abs(bal)));
  const iPay = bal < 0;
  const n = parseFloat(amount) || 0;
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-3 py-2">
        {iPay ? <PersonAvatar me size={44} /> : <PersonAvatar person={person} size={44} />}
        <Icon name="chevron" size={20} className="text-ink3" />
        {iPay ? <PersonAvatar person={person} size={44} /> : <PersonAvatar me size={44} />}
      </div>
      <p className="mt-2 text-[15px] text-ink2">{bal === 0 ? `You and ${person.short} are square.` : iPay ? `You owe ${person.short} ${rupees(-bal)}` : `${person.short} owes you ${rupees(bal)}`}</p>
      <MoneyInput value={amount} onChange={setAmount} label="Settlement amount" autoFocus id="settle-amount" />
      <p className="text-[13px] text-ink3">Record a payment made outside PULSE, like a UPI transfer or cash.</p>
      <button
        type="button"
        disabled={!n}
        className="btn-accent mt-5 w-full disabled:opacity-40"
        onClick={() => {
          store.recordSettlement({ group: groupId, from: iPay ? 'me' : personId, to: iPay ? personId : 'me', amount: roundMoney(n) });
          onDone();
        }}
      >
        {iPay ? `I paid ${person.short} ${n ? rupees(n) : ''}` : `${person.short} paid me ${n ? rupees(n) : ''}`}
      </button>
    </div>
  );
}

export function IncomeForm({ incomeId, onDone }: { incomeId?: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ex = state.incomes.find((i) => i.id === incomeId);
  const [name, setName] = useState(ex?.name ?? '');
  const [kind, setKind] = useState<IncomeKind>(ex?.kind ?? 'freelance');
  const [expected, setExpected] = useState(String(ex?.expected ?? ''));
  const [cycle, setCycle] = useState<'monthly' | 'irregular'>(ex?.cycle ?? 'irregular');
  const [next, setNext] = useState(ex?.nextDate ?? addMonths(state.today, 1));
  const [auto, setAuto] = useState(ex?.autoCredit ?? false);
  const currentMain = mainIncome(state);
  const [main, setMain] = useState(ex ? currentMain?.id === ex.id : !currentMain);
  const [removing, setRemoving] = useState(false);
  const valid = name.trim() && parseFloat(expected) > 0;
  // A compact switch row: label left, switch right, one short hint line.
  const Switch = ({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint: string }) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="tap flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium leading-snug">{label}</span>
        <span className="block truncate text-[12px] text-ink3">{hint}</span>
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
  const otherMain = currentMain && currentMain.id !== ex?.id ? currentMain : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1.4fr_1fr] gap-2.5">
        <Field label="Source" htmlFor="inc-name">
          <input id="inc-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Company, client…" />
        </Field>
        <Field label="Kind" htmlFor="inc-kind">
          <select id="inc-kind" className="field px-2.5" value={kind} onChange={(e) => setKind(e.target.value as IncomeKind)}>
            {(['salary', 'freelance', 'part-time', 'business', 'allowance', 'other'] as IncomeKind[]).map((k) => (
              <option key={k} value={k}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Segmented label="Pattern" size="sm" value={cycle} onChange={setCycle} options={[{ value: 'monthly', label: 'Fixed date' }, { value: 'irregular', label: 'Irregular' }]} />
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={cycle === 'monthly' ? 'Amount' : 'Typical month'} htmlFor="inc-exp">
          <input id="inc-exp" inputMode="decimal" className="field num" value={expected} onChange={(e) => setExpected(e.target.value.replace(/[^\d.]/g, ''))} placeholder={sym().trim()} />
        </Field>
        {cycle === 'monthly' ? (
          <Field label="Next payday" htmlFor="inc-next">
            <input id="inc-next" type="date" className="field px-2.5" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
        ) : (
          <p className="self-end pb-2 text-[12.5px] leading-snug text-ink3">Counted when it lands, never in advance.</p>
        )}
      </div>
      {cycle === 'monthly' && (
        <div className="divide-y divide-line overflow-hidden rounded-2xl bg-sunk/60">
          <Switch on={auto} set={setAuto} label="Add automatically on payday" hint={auto ? 'Recorded on its date, no tap needed' : 'Off: asks “did it land?” on payday'} />
          <Switch on={main} set={setMain} label="This is my main payday" hint={main ? 'Safe-to-spend lasts until this one' : otherMain ? `Month runs on ${otherMain.name}; this adds when it lands` : 'Your month runs on this salary'} />
        </div>
      )}
      {removing && ex ? (
        <div className="flex min-h-[48px] items-center gap-2 rounded-2xl bg-sunk py-1 pl-4 pr-1" role="alert">
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[14px] font-semibold">Remove {ex.name}?</span>
            <span className="block truncate text-[12px] text-ink3">Past payments stay</span>
          </span>
          <button type="button" className="btn-ghost min-h-[40px] px-3" onClick={() => setRemoving(false)}>
            Keep
          </button>
          <button
            type="button"
            className="btn min-h-[40px] bg-neg px-4 text-white"
            onClick={() => {
              store.deleteIncome(ex.id);
              onDone();
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className={`grid gap-2 ${ex ? 'grid-cols-[auto_1fr]' : 'grid-cols-1'}`}>
          {ex && (
            <button type="button" className="btn-quiet min-h-[48px] px-4 text-neg" onClick={() => setRemoving(true)} aria-label="Remove this income source">
              <Icon name="trash" size={18} />
            </button>
          )}
          <button
            type="button"
            disabled={!valid}
            className="btn-accent min-h-[48px] w-full disabled:opacity-40"
            onClick={() => {
              store.saveIncome({ id: ex?.id, name: name.trim(), kind, expected: roundMoney(parseFloat(expected)), cycle, nextDate: cycle === 'monthly' ? next : undefined, autoCredit: cycle === 'monthly' ? auto : undefined, main: cycle === 'monthly' ? main : undefined });
              onDone();
            }}
          >
            {ex ? 'Save changes' : 'Save income source'}
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Accounts, credit cards and loans (all entered by hand)
// ------------------------------------------------------------------
function DeleteRow({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div className="flex items-center gap-2 rounded-2xl bg-sunk p-2 pl-4" role="alert">
      <span className="flex-1 text-[14px]">{label}?</span>
      <button type="button" className="btn-ghost min-h-[40px] px-3" onClick={() => setConfirm(false)}>
        Keep
      </button>
      <button type="button" className="btn min-h-[40px] bg-neg px-4 text-white" onClick={onDelete}>
        Remove
      </button>
    </div>
  ) : (
    <button type="button" className="btn-ghost text-neg" onClick={() => setConfirm(true)}>
      {label}
    </button>
  );
}

export function AccountForm({ accountId, onDone }: { accountId?: string; onDone: () => void }) {
  const store = useStore();
  const ex = store.state.accounts.find((a) => a.id === accountId);
  const [name, setName] = useState(ex?.name ?? '');
  const [institution, setInstitution] = useState(ex?.institution ?? '');
  const [type, setType] = useState(ex?.type ?? 'bank');
  const [balance, setBalance] = useState(ex ? String(ex.balance) : '');
  const [spendable, setSpendable] = useState(ex?.spendable ?? true);
  // In use = money has moved through it, or something is set to pay from it or into it.
  const st = store.state;
  const used = ex
    ? st.transactions.some((t) => t.account === ex.id || t.toAccount === ex.id) ||
      (st.investments ?? []).some((i) => i.fromAccount === ex.id || i.toAccount === ex.id) ||
      st.subscriptions.some((x) => x.account === ex.id) ||
      st.debts.some((d) => d.account === ex.id) ||
      (st.insurance ?? []).some((p) => p.account === ex.id)
    : false;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Name" htmlFor="acct-name">
        <input id="acct-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="SBI Savings, Paytm wallet…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="acct-type">
          <select
            id="acct-type"
            className="field"
            value={type}
            onChange={(e) => {
              const t = e.target.value as typeof type;
              setType(t);
              setSpendable(t === 'bank' || t === 'cash' || t === 'wallet');
            }}
          >
            <option value="bank">Bank account</option>
            <option value="wallet">Wallet</option>
            <option value="cash">Cash</option>
            <option value="savings">Savings / FD</option>
            <option value="investment">Investments</option>
          </select>
        </Field>
        <Field label="Balance" htmlFor="acct-bal">
          <input id="acct-bal" inputMode="decimal" className="field num" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^\d.]/g, ''))} placeholder={sym().trim()} />
        </Field>
      </div>
      <Field label="Bank or app (optional)" htmlFor="acct-inst">
        <input id="acct-inst" className="field" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="HDFC, Groww, Zerodha…" />
      </Field>
      <label className="flex items-center gap-3 text-[14.5px]">
        <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={spendable} onChange={(e) => setSpendable(e.target.checked)} />
        Count this toward safe-to-spend
      </label>
      <button
        type="button"
        disabled={!name.trim()}
        className="btn-accent w-full disabled:opacity-40"
        onClick={() => {
          store.saveAccount({ id: ex?.id, name: name.trim(), institution: institution.trim() || (type === 'cash' ? 'Wallet' : 'Added by you'), type, balance: roundMoney(parseFloat(balance) || 0), spendable });
          onDone();
        }}
      >
        {ex ? 'Save account' : 'Add account'}
      </button>
      {ex && !used && store.state.accounts.length > 1 && (
        <DeleteRow
          label="Remove account"
          onDelete={() => {
            store.deleteAccount(ex.id);
            onDone();
          }}
        />
      )}
      {ex && used && <p className="text-[12.5px] text-ink3">This account has transactions, or a SIP, bill or EMI uses it, so it can't be removed. You can stop counting it toward safe-to-spend.</p>}
    </div>
  );
}

export function CardForm({ cardId, onDone }: { cardId?: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ex = state.cards.find((c) => c.id === cardId);
  const [name, setName] = useState(ex?.name ?? '');
  const [issuer, setIssuer] = useState(ex?.issuer ?? '');
  const [last4, setLast4] = useState(ex?.last4 ?? '');
  const [limit, setLimit] = useState(ex ? String(ex.limit) : '');
  const [balance, setBalance] = useState(ex ? String(ex.balance) : '');
  const [statementDay, setStatementDay] = useState(String(ex?.statementDay ?? 1));
  const [due, setDue] = useState(ex?.dueDate ?? addMonths(state.today, 1));
  const [minDue, setMinDue] = useState(ex ? String(ex.minDue) : '');
  const [status, setStatus] = useState<'paid' | 'due' | 'not-generated'>(ex?.status ?? 'not-generated');
  const num = (v: string) => roundMoney(parseFloat(v) || 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Card name" htmlFor="card-name">
          <input id="card-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Millennia" />
        </Field>
        <Field label="Bank" htmlFor="card-issuer">
          <input id="card-issuer" className="field" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="HDFC Bank" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Last 4" htmlFor="card-last4" hint="Never the full number.">
          <input id="card-last4" inputMode="numeric" maxLength={4} className="field num" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" />
        </Field>
        <Field label="Limit" htmlFor="card-limit">
          <input id="card-limit" inputMode="decimal" className="field num" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))} placeholder={sym().trim()} />
        </Field>
        <Field label="Balance" htmlFor="card-bal">
          <input id="card-bal" inputMode="decimal" className="field num" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^\d.]/g, ''))} placeholder={sym().trim()} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Statement day" htmlFor="card-stmt">
          <input id="card-stmt" inputMode="numeric" className="field num" value={statementDay} onChange={(e) => setStatementDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </Field>
        <Field label="Payment due" htmlFor="card-due">
          <input id="card-due" type="date" className="field px-2" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Minimum due" htmlFor="card-min">
          <input id="card-min" inputMode="decimal" className="field num" value={minDue} onChange={(e) => setMinDue(e.target.value.replace(/[^\d.]/g, ''))} placeholder={sym().trim()} />
        </Field>
      </div>
      <Segmented label="Payment status" size="sm" value={status} onChange={setStatus} options={[{ value: 'not-generated', label: 'No bill yet' }, { value: 'due', label: 'Due' }, { value: 'paid', label: 'Paid' }]} />
      <p className="text-[12.5px] text-ink3">When a bill is due before payday, the minimum due is set aside in safe-to-spend.</p>
      <button
        type="button"
        disabled={!name.trim() || !(num(limit) > 0)}
        className="btn-accent w-full disabled:opacity-40"
        onClick={() => {
          store.saveCard({ id: ex?.id, name: name.trim(), issuer: issuer.trim() || 'Card', last4: last4 || '0000', limit: num(limit), balance: num(balance), statementDay: Math.min(31, Math.max(1, num(statementDay) || 1)), dueDate: due, minDue: num(minDue), status });
          onDone();
        }}
      >
        {ex ? 'Save card' : 'Add card'}
      </button>
      {ex && (
        <DeleteRow
          label="Remove card"
          onDelete={() => {
            store.deleteCard(ex.id);
            onDone();
          }}
        />
      )}
    </div>
  );
}

export function DebtForm({ debtId, onDone }: { debtId?: string; onDone: () => void }) {
  const store = useStore();
  const ex = store.state.debts.find((d) => d.id === debtId);
  const [name, setName] = useState(ex?.name ?? '');
  const [lender, setLender] = useState(ex?.lender ?? '');
  const [kind, setKind] = useState(ex?.kind ?? 'student-loan');
  const [remaining, setRemaining] = useState(ex ? String(ex.remaining) : '');
  const [emi, setEmi] = useState(ex ? String(ex.minPayment) : '');
  const [dueDay, setDueDay] = useState(String(ex?.dueDay ?? 5));
  const [rate, setRate] = useState(ex ? String(ex.rate) : '');
  const [account, setAccount] = useState(ex?.account ?? defaultAccount(store.state));
  const [auto, setAuto] = useState(ex?.autoDebit !== false);
  const num = (v: string) => parseFloat(v) || 0;
  const day = Math.min(28, Math.max(1, Math.round(num(dueDay)) || 1));
  const part = emiParts({ remaining: num(remaining), minPayment: num(emi), rate: num(rate) } as Debt);
  // Saving a new loan (or a changed due day) on its due day records today's EMI straight away.
  const dueToday = store.state.mode === 'personal' && auto && num(emi) > 0 && num(remaining) > 0 && (!ex || ex.dueDay !== day || !ex.nextDate ? Number(store.state.today.slice(8)) === day : ex.nextDate <= store.state.today);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" htmlFor="debt-name">
          <input id="debt-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Education loan" />
        </Field>
        <Field label="Lender" htmlFor="debt-lender">
          <input id="debt-lender" className="field" value={lender} onChange={(e) => setLender(e.target.value)} placeholder="SBI" />
        </Field>
      </div>
      <Field label="Type" htmlFor="debt-kind">
        <select id="debt-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="student-loan">Student loan</option>
          <option value="personal-loan">Personal loan</option>
          <option value="credit-card">Credit card</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount left" htmlFor="debt-rem">
          <input id="debt-rem" inputMode="decimal" className="field num" value={remaining} onChange={(e) => setRemaining(e.target.value.replace(/[^\d.]/g, ''))} placeholder={sym().trim()} />
        </Field>
        <Field label="EMI / minimum" htmlFor="debt-emi">
          <input id="debt-emi" inputMode="decimal" className="field num" value={emi} onChange={(e) => setEmi(e.target.value.replace(/[^\d.]/g, ''))} placeholder={sym().trim()} />
        </Field>
        <Field label="Due day of month" htmlFor="debt-day">
          <input id="debt-day" inputMode="numeric" className="field num" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </Field>
        <Field label="Interest % a year" htmlFor="debt-rate">
          <input id="debt-rate" inputMode="decimal" className="field num" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} placeholder="9.5" />
        </Field>
      </div>
      <Field label="EMI is paid from" htmlFor="debt-from">
        <select id="debt-from" className="field" value={account} onChange={(e) => setAccount(e.target.value)}>
          {store.state.accounts.filter((a) => a.type === 'bank' || a.type === 'cash' || a.id === account).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {rupees(a.balance)}
            </option>
          ))}
        </select>
      </Field>
      <Toggle checked={auto} onChange={setAuto} label="Deduct automatically" sub={auto ? 'On the due day PULSE records the EMI, takes it from this account and reduces the loan' : 'Off: the EMI stays due until you tap “Mark as paid”'} />
      {num(emi) > 0 && num(remaining) > 0 && (
        <p className="rounded-2xl bg-sunk p-3 text-[13.5px] text-ink2">
          {part.principal <= 0
            ? `At ${num(rate)}% this EMI only covers interest, so the loan would not go down. Check the EMI or the rate.`
            : part.interest > 0
              ? `Each EMI: ${rupees(part.interest)} is this month's interest and ${rupees(part.principal)} comes off the loan. The interest part gets smaller every month.`
              : 'No interest entered, so the full EMI comes off the loan each month.'}
          {dueToday && <span className="mt-1 block font-semibold text-ink">The EMI is due today, so it will be recorded when you save.</span>}
        </p>
      )}
      <p className="text-[12.5px] text-ink3">An EMI due before payday is set aside in safe-to-spend. Change “Amount left” here any time to match your lender's statement.</p>
      <button
        type="button"
        disabled={!name.trim() || !(num(remaining) > 0) || !(num(emi) > 0)}
        className="btn-accent w-full disabled:opacity-40"
        onClick={() => {
          store.saveDebt({ id: ex?.id, name: name.trim(), lender: lender.trim() || 'Lender', kind, remaining: Math.round(num(remaining)), minPayment: Math.round(num(emi)), dueDay: day, rate: num(rate), account, autoDebit: auto });
          onDone();
        }}
      >
        {ex ? 'Save loan' : 'Add loan'}
      </button>
      {ex && (
        <DeleteRow
          label="Remove loan"
          onDelete={() => {
            store.deleteDebt(ex.id);
            onDone();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Backup & restore (data lives in this browser, so let people move it)
// ------------------------------------------------------------------
export function BackupPanel() {
  const store = useStore();
  const ui = useUI();
  const mine = store.personalState();
  const [code, setCode] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [check, setCheck] = useState<{ ok: true; state: State; savedAt?: string } | { ok: false; error: string } | null>(null);

  // Build the code ahead of time, so tapping Copy can write it straight away (Safari needs that).
  useEffect(() => {
    let live = true;
    if (!mine) return setCode(null);
    const t = window.setTimeout(() => void encodeBackup(mine).then((c) => live && setCode(c)), 150);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.state]);

  // Check a pasted code as soon as it's pasted, before anything is replaced.
  useEffect(() => {
    let live = true;
    if (!paste.trim()) return setCheck(null);
    void decodeBackup(paste).then((r) => live && setCheck(r));
    return () => {
      live = false;
    };
  }, [paste]);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      track('backup');
      haptic(10);
      store.toast({ text: 'Backup code copied. Paste it somewhere safe, like a note or a chat with yourself.', tone: 'good', emoji: '📋' });
    } catch {
      setPaste('');
      store.toast({ text: "Copy is blocked here. Use Share or Save as file instead." });
    }
  };
  const share = async () => {
    if (!code) return;
    try {
      await navigator.share({ title: 'My PULSE backup', text: code });
    } catch {
      /* cancelled */
    }
  };
  const save = () => {
    if (!code) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
    a.download = `pulse-backup-${store.state.today}.txt`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const size = code ? (code.length / 1024).toFixed(code.length > 10240 ? 0 : 1) : null;
  const count = (st: State) => st.transactions.length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-ink2">Your data lives only on this device. A backup code is all of it packed into one line of text. Keep it somewhere safe, or paste it on another phone or browser to move everything there.</p>

      {mine ? (
        <div className="rounded-3xl border border-line bg-surface p-4">
          <p className="eyebrow">Your backup code</p>
          <p className="mt-2 break-all rounded-xl bg-sunk px-3 py-2.5 font-mono text-[12.5px] text-ink2" aria-live="polite">
            {code ? `${code.slice(0, 22)}…${code.slice(-9)}` : 'Packing your data…'}
          </p>
          <p className="mt-1.5 text-[12px] text-ink3">
            {mine.user.name} · {count(mine)} entries{size ? ` · ${size} KB` : ''}. Different for everyone, and it changes as your data changes.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" disabled={!code} onClick={copy} className="btn-primary min-h-[44px] px-2 text-[14px] disabled:opacity-40">
              <Icon name="copy" size={16} /> Copy
            </button>
            <button type="button" disabled={!code || typeof navigator.share !== 'function'} onClick={share} className="btn-quiet min-h-[44px] px-2 text-[14px] disabled:opacity-40">
              <Icon name="share" size={16} /> Share
            </button>
            <button type="button" disabled={!code} onClick={save} className="btn-quiet min-h-[44px] px-2 text-[14px] disabled:opacity-40">
              <Icon name="download" size={16} /> File
            </button>
          </div>
          <p className="mt-2 text-[12px] text-ink3">Anyone with this code can open your data, so share it only with yourself.</p>
        </div>
      ) : (
        <p className="rounded-2xl bg-sunk p-3 text-[14px] text-ink2">Nothing to back up yet. Start with your own money first.</p>
      )}

      <div className="rounded-3xl border border-line bg-surface p-4">
        <label htmlFor="backup-code" className="eyebrow block">
          Restore from a backup
        </label>
        <textarea
          id="backup-code"
          rows={3}
          className="field mt-2 font-mono text-[12px]"
          placeholder="Paste a code starting with PULSE1-"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-accent-ink">
          <Icon name="download" size={15} className="rotate-180" /> Open a backup file
          <input type="file" accept=".txt,text/plain,application/json" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPaste(await f.text()); e.target.value = ''; }} />
        </label>
        {check && !check.ok && (
          <p className="mt-2 text-[13px] font-medium text-warn" role="alert">
            {check.error}
          </p>
        )}
        {check && check.ok && (
          <div className="mt-3 animate-toast rounded-2xl bg-pos/10 p-3 text-[13.5px]" role="status">
            <p className="font-semibold text-pos">✓ Backup looks good</p>
            <p className="mt-0.5 text-ink2">
              {check.state.user.fullName || check.state.user.name} · {count(check.state)} entries{check.savedAt ? ` · saved ${fmtDate(check.savedAt.slice(0, 10), true)}` : ''}
            </p>
          </div>
        )}
        <button
          type="button"
          disabled={!check || !check.ok}
          className="btn-accent mt-3 w-full disabled:opacity-40"
          onClick={() => {
            if (!check || !check.ok) return;
            const st = check.state;
            ui.openSheet({
              type: 'confirm',
              title: 'Restore this backup?',
              body: mine ? `This replaces what's on this device (${count(mine)} entries) with the backup (${count(st)} entries).` : `This loads ${st.user.name}'s data (${count(st)} entries) onto this device.`,
              confirm: 'Restore',
              run: () => {
                store.restoreState(st);
                setPaste('');
                ui.resetTo('home');
              },
            });
          }}
        >
          Restore
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// SIPs and other recurring investments
// ------------------------------------------------------------------
const INV_KINDS: { value: InvestmentKind; label: string; rate: number }[] = [
  { value: 'sip', label: 'Mutual fund SIP', rate: 11 },
  { value: 'rd', label: 'Recurring deposit (RD)', rate: 7 },
  { value: 'ppf', label: 'PPF', rate: 7.1 },
  { value: 'nps', label: 'NPS', rate: 10 },
  { value: 'other', label: 'Other', rate: 8 },
];

/**
 * Most people have no idea what "expected return" to type. Offer sensible presets for the
 * kind of investment, say where to find the real number, and keep it clearly a guess.
 */
const RETURN_GUIDE: Record<InvestmentKind, { presets: { label: string; rate: number }[]; how: string }> = {
  sip: {
    presets: [
      { label: 'Debt fund', rate: 7 },
      { label: 'Hybrid', rate: 9 },
      { label: 'Index or large cap', rate: 11 },
      { label: 'Mid or small cap', rate: 13 },
    ],
    how: 'Pick your fund type above for a fair long-run guess. For your exact fund, open it in your app (Groww, Zerodha Coin, Kuvera, your bank) and look for its 5-year annualised return, then use a little less, because past returns rarely repeat.',
  },
  rd: {
    presets: [
      { label: 'Post office / PSU bank', rate: 6.7 },
      { label: 'Private bank', rate: 7 },
      { label: 'Small finance bank', rate: 7.5 },
    ],
    how: 'An RD has a fixed rate. It is printed on your RD receipt and shown in your bank app next to the deposit.',
  },
  ppf: {
    presets: [{ label: 'Current PPF rate', rate: 7.1 }],
    how: 'The government sets the PPF rate every quarter. It is 7.1% for July to September 2026, and has stayed there since 2020.',
  },
  nps: {
    presets: [
      { label: 'Mostly bonds', rate: 8 },
      { label: 'Balanced (auto choice)', rate: 10 },
      { label: 'Up to 75% equity', rate: 11 },
    ],
    how: 'It depends on how much of your NPS is in equity. Your NPS app (CRA, Protean or KFintech) shows the scheme return for each fund manager.',
  },
  other: {
    presets: [
      { label: 'Safe', rate: 6 },
      { label: 'Middle', rate: 8 },
      { label: 'Growth', rate: 10 },
    ],
    how: 'Use the rate the provider shows you. If it moves with the market, pick a cautious number.',
  },
};

function ReturnField({ kind, rate, setRate, fundType, setFundType }: { kind: InvestmentKind; rate: string; setRate: (v: string) => void; fundType?: FundType; setFundType: (f: FundType | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const guide = RETURN_GUIDE[kind];
  const current = parseFloat(rate);
  const chips: { key: string; label: string; rate: number; on: boolean; pick: () => void }[] =
    kind === 'sip'
      ? FUND_TYPES.map((f) => ({ key: f.value, label: f.label, rate: f.rate, on: fundType === f.value, pick: () => { setFundType(f.value); setRate(String(f.rate)); } }))
      : guide.presets.map((p) => ({ key: p.label, label: p.label, rate: p.rate, on: current === p.rate, pick: () => setRate(String(p.rate)) }));
  return (
    <div className="flex flex-col gap-2">
      {kind === 'sip' && (
        <p id="inv-fund-label" className="text-[13px] font-semibold text-ink2">
          Fund type
        </p>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={kind === 'sip' ? 'inv-fund-label' : undefined} aria-label={kind === 'sip' ? undefined : 'Typical returns'}>
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={c.on}
            onClick={c.pick}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors ${c.on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink2 hover:border-ink3'}`}
          >
            {c.label} <span className="num font-semibold">{c.rate}%</span>
          </button>
        ))}
      </div>
      <label htmlFor="inv-rate" className="mt-1 text-[13px] font-semibold text-ink2">
        Expected return, % a year
      </label>
      <div className="relative">
        <input id="inv-rate" inputMode="decimal" className="field num pr-10" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} aria-describedby="inv-rate-help" />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-ink3" aria-hidden="true">%</span>
      </div>
      <div id="inv-rate-help" className="text-[12.5px] leading-relaxed text-ink3">
        <button type="button" className="font-semibold text-accent-ink underline decoration-accent/40 underline-offset-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          How do I know my number?
        </button>
        {open ? <p className="mt-1.5 rounded-xl bg-sunk p-3 text-[13px] text-ink2">{guide.how}</p> : null}
        <p className="mt-1">Only used to estimate growth. Returns are never guaranteed.</p>
      </div>
    </div>
  );
}

const STEP_UPS = [0, 5, 10, 15];
const minDate = (a: ISODate, b: ISODate) => (a < b ? a : b);

/** The anniversary of `start` most recently reached on or before `today`. */
function lastAnniversary(start: ISODate, today: ISODate): ISODate {
  let base = start;
  let g = 0;
  while (addMonths(base, 12) <= today && g++ < 60) base = addMonths(base, 12);
  return base;
}

export function InvestmentForm({ investmentId, onDone }: { investmentId?: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ex = state.investments.find((i) => i.id === investmentId);
  const investAccts = state.accounts.filter((a) => a.type === 'investment' || a.type === 'savings');
  const [kind, setKind] = useState<InvestmentKind>(ex?.kind ?? 'sip');
  const [name, setName] = useState(ex?.name ?? '');
  const [platform, setPlatform] = useState(ex?.platform ?? '');
  const [amount, setAmount] = useState(ex ? String(ex.amount) : '');
  const [cycle, setCycle] = useState<Investment['cycle']>(ex?.cycle ?? 'monthly');
  const [next, setNext] = useState(ex?.nextDate ?? addMonths(state.today, 1).slice(0, 8) + '05');
  const [from, setFrom] = useState(ex?.fromAccount ?? defaultAccount(state));
  const [to, setTo] = useState(ex?.toAccount ?? investAccts[0]?.id ?? '__new');
  const [rate, setRate] = useState(String(ex?.expectedReturn ?? 11));
  const [auto, setAuto] = useState(ex?.autoDeduct ?? true);
  const [status, setStatus] = useState<Investment['status']>(ex?.status ?? 'active');
  const [fundType, setFundType] = useState<FundType | undefined>(ex?.fundType ?? (ex ? undefined : 'index'));
  const [stepUp, setStepUp] = useState(String(ex?.stepUp ?? 0));
  const [started, setStarted] = useState(ex?.startDate ?? state.today);
  const [priorEdited, setPriorEdited] = useState(ex?.priorInvested != null);
  const [prior, setPrior] = useState(ex?.priorInvested != null ? String(ex.priorInvested) : '');
  const [value, setValue] = useState('');
  const n = roundMoney(parseFloat(amount) || 0);
  const step = Math.max(0, parseFloat(stepUp) || 0);
  const proj = sipProjection(n / CYCLE_MONTHS[cycle], 10, parseFloat(rate) || 0, 0, step);
  // Instalments from the start date up to the first one PULSE records (or today, whichever is first).
  const priorUntil = ex ? (ex.startDate < state.today ? minDate(state.today, firstRecorded(state, ex.id) ?? state.today) : state.today) : minDate(state.today, next);
  const est = estimateInvested(n, started, priorUntil, cycle, step);
  const priorAmount = priorEdited ? roundMoney(parseFloat(prior) || 0) : est.total;
  const isPast = started < state.today;
  const recorded = ex ? investedIn(state, ex.id) : 0;
  const valid = name.trim() && n > 0;
  const dueNow = auto && next <= state.today && status === 'active';

  return (
    <div className="flex flex-col gap-4">
      <Field label="Type" htmlFor="inv-kind">
        <select
          id="inv-kind"
          className="field"
          value={kind}
          onChange={(e) => {
            const k = e.target.value as InvestmentKind;
            setKind(k);
            if (!ex) setRate(String(k === 'sip' && fundType ? FUND_TYPES.find((f) => f.value === fundType)!.rate : INV_KINDS.find((x) => x.value === k)!.rate));
          }}
        >
          {INV_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={kind === 'sip' ? 'Fund name' : 'Name'} htmlFor="inv-name">
          <input id="inv-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'sip' ? 'Nifty 50 Index Fund' : kind === 'rd' ? 'SBI RD' : 'PPF account'} />
        </Field>
        <Field label="App or bank" htmlFor="inv-platform">
          <input id="inv-platform" className="field" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Groww, Zerodha, SBI…" />
        </Field>
      </div>
      <div className="rounded-2xl bg-sunk/60">
        <MoneyInput value={amount} onChange={setAmount} label="Instalment amount" size="md" id="inv-amount" />
        <p className="-mt-1 pb-2 text-center text-[12.5px] text-ink3">Amount each {cycle === 'monthly' ? 'month' : cycle === 'quarterly' ? 'quarter' : 'year'}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Repeats" htmlFor="inv-cycle">
          <select id="inv-cycle" className="field" value={cycle} onChange={(e) => setCycle(e.target.value as Investment['cycle'])}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </Field>
        <Field label="Next debit date" htmlFor="inv-next">
          <input id="inv-next" type="date" className="field px-2" value={next} onChange={(e) => e.target.value && setNext(e.target.value)} />
        </Field>
        <Field label="Deducted from" htmlFor="inv-from">
          <select id="inv-from" className="field" value={from} onChange={(e) => setFrom(e.target.value)}>
            {state.accounts.filter((a) => a.spendable).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Invested into" htmlFor="inv-to">
          <select id="inv-to" className="field" value={to} onChange={(e) => setTo(e.target.value)}>
            {investAccts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="__new">New holding{platform ? `: ${platform}` : ''}</option>
          </select>
        </Field>
      </div>
      <ReturnField kind={kind} rate={rate} setRate={setRate} fundType={fundType} setFundType={setFundType} />

      <div className="flex flex-col gap-2">
        <p id="inv-step-label" className="text-[13px] font-semibold text-ink2">
          Step-up every year
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="inv-step-label">
          {STEP_UPS.map((v) => (
            <button key={v} type="button" aria-pressed={step === v} onClick={() => setStepUp(String(v))} className={`inline-flex min-h-[36px] items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${step === v ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink2 hover:border-ink3'}`}>
              {v === 0 ? 'No step-up' : `+${v}%`}
            </button>
          ))}
          <label className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-2 text-[13px] text-ink2">
            <span className="sr-only">Custom step-up percent</span>
            <input inputMode="decimal" className="num w-10 bg-transparent text-right font-semibold text-ink focus:outline-none" value={STEP_UPS.includes(step) ? '' : stepUp} placeholder="Other" onChange={(e) => setStepUp(e.target.value.replace(/[^\d.]/g, '') || '0')} />%
          </label>
        </div>
        <p className="text-[12.5px] text-ink3">
          {step > 0 && n > 0
            ? `Your instalment rises to ${rupees(roundMoney(n * (1 + step / 100)))} after a year, then ${rupees(roundMoney(n * Math.pow(1 + step / 100, 2)))}. PULSE raises it on each anniversary of the start date.`
            : 'Raise your SIP a little every year as your income grows. Most fund apps call this a top-up or step-up.'}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
        <Field label="Started on" htmlFor="inv-started">
          <input id="inv-started" type="date" className="field px-2" value={started} max={state.today} onChange={(e) => e.target.value && setStarted(e.target.value)} />
        </Field>
        {isPast ? (
          <>
            <Field label="Put in before PULSE" htmlFor="inv-prior">
              <input
                id="inv-prior"
                inputMode="decimal"
                className="field num"
                value={priorEdited ? prior : est.total ? String(est.total) : ''}
                placeholder={`${sym()}0`}
                onChange={(e) => {
                  setPriorEdited(true);
                  setPrior(e.target.value.replace(/[^\d.]/g, ''));
                }}
              />
            </Field>
            <p className="-mt-1 text-[12.5px] text-ink3">
              {priorEdited ? (
                <>
                  Using your number.{' '}
                  <button type="button" className="font-semibold text-accent-ink underline underline-offset-2" onClick={() => setPriorEdited(false)}>
                    Estimate it for me
                  </button>
                </>
              ) : est.count ? (
                `Worked out as ${est.count} instalment${est.count === 1 ? '' : 's'} since ${fmtDate(started, true)}${step ? ', with smaller amounts before each step-up' : ''}. Your app's "invested amount" is exact, so type it in if you have it.`
              ) : (
                'No instalments before PULSE yet.'
              )}
            </p>
            {(!ex && to === '__new') && (
              <Field label="Current value in your app (optional)" htmlFor="inv-value">
                <input id="inv-value" inputMode="decimal" className="field num" value={value} placeholder={priorAmount ? rupees(priorAmount) : `${sym()}0`} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} />
              </Field>
            )}
          </>
        ) : (
          <p className="text-[12.5px] text-ink3">Started earlier? Pick the real start date and PULSE adds what you've already put in to your total.</p>
        )}
        {(ex || isPast) && (priorAmount > 0 || recorded > 0) && (
          <p className="rounded-xl bg-sunk p-3 text-[13.5px]">
            Total put in so far: <span className="num font-semibold">{rupees(priorAmount + recorded)}</span>
            {recorded > 0 && priorAmount > 0 ? <span className="text-ink3"> ({rupees(priorAmount)} before PULSE + {rupees(recorded)} recorded here)</span> : null}
          </p>
        )}
      </div>
      <Toggle checked={auto} onChange={setAuto} label="Deduct automatically" sub="Records the debit on its date and moves the money into your holding" />
      {ex && <Segmented label="Status" size="sm" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'stopped', label: 'Stopped' }]} />}
      {n > 0 && (
        <p className="rounded-2xl bg-accent-soft p-3 text-[14px]">
          {rupees(n)} {cycle === 'monthly' ? 'a month' : cycle === 'quarterly' ? 'a quarter' : 'a year'} for 10 years at {parseFloat(rate) || 0}% could grow to about <span className="num font-semibold">{rupeesShort(proj.value)}</span> from {rupeesShort(proj.invested)} put in.
          {dueNow && <span className="mt-1 block font-semibold">The first debit is due today, so it will be recorded when you save.</span>}
        </p>
      )}
      <button
        type="button"
        disabled={!valid}
        className="btn-accent w-full disabled:opacity-40"
        onClick={() => {
          const startChanged = !ex || ex.startDate !== started || (ex.stepUp ?? 0) !== step;
          store.saveInvestment(
            {
              id: ex?.id,
              name: name.trim(),
              platform: platform.trim(),
              kind,
              amount: n,
              cycle,
              nextDate: next,
              status,
              fromAccount: from,
              toAccount: to,
              startDate: started,
              expectedReturn: parseFloat(rate) || 0,
              autoDeduct: auto,
              fundType: kind === 'sip' ? fundType : undefined,
              stepUp: step || undefined,
              // The amount typed is today's instalment, so step-ups already behind it are not applied again.
              lastStepUp: step ? (startChanged ? lastAnniversary(started, state.today) : ex?.lastStepUp) : undefined,
              priorInvested: isPast && priorAmount > 0 ? priorAmount : undefined,
            },
            platform || name,
            !ex && to === '__new' && isPast ? roundMoney(parseFloat(value) || 0) || priorAmount : undefined,
          );
          onDone();
        }}
      >
        {ex ? 'Save' : kind === 'sip' ? 'Add SIP' : 'Add investment'}
      </button>
      {ex && (
        <DeleteRow
          label="Remove this investment"
          onDelete={() => {
            store.deleteInvestment(ex.id);
            onDone();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Erase all data
// ------------------------------------------------------------------
export function EraseForm({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const ui = useUI();
  const [sure, setSure] = useState(false);
  const [copied, setCopied] = useState(false);
  const { state } = store;
  const counts = [
    [state.transactions.length, 'transactions'],
    [state.plans.length, 'plans'],
    [state.investments?.length ?? 0, 'SIPs'],
    [state.groups.length, 'groups'],
  ].filter(([n]) => (n as number) > 0);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-ink2">
        This deletes everything PULSE has saved on this device{counts.length ? `: ${counts.map(([n, l]) => `${n} ${l}`).join(', ')}` : ''}, plus your name, accounts and settings. You'll go back to the welcome screen.
      </p>
      {state.mode === 'personal' && (
        <button
          type="button"
          className="btn-quiet self-start"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(store.exportBackup());
              setCopied(true);
            } catch {
              ui.push({ name: 'settings', section: 'export' });
              onDone();
            }
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Backup copied' : 'Copy a backup first'}
        </button>
      )}
      <label className="flex items-start gap-3 rounded-2xl bg-sunk p-3.5 text-[14.5px]">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--neg))]" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        I understand this can't be undone.
      </label>
      <button
        type="button"
        disabled={!sure}
        className="btn w-full bg-neg text-white disabled:opacity-40"
        onClick={() => {
          ui.closeAllSheets();
          ui.setChat([]);
          ui.setSelectedTx(null);
          ui.resetTo('home');
          store.eraseAll();
        }}
      >
        <Icon name="trash" size={17} /> Erase all data
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// Create or edit a category, with an emoji that fits the name
// ------------------------------------------------------------------
export function CategoryForm({ categoryId, kind: kind0 = 'expense', name: name0, onSaved, onDone }: { categoryId?: string; kind?: 'expense' | 'income'; name?: string; onSaved?: (id: string) => void; onDone: () => void }) {
  const store = useStore();
  const ex = store.state.categories.find((c) => c.id === categoryId);
  const [name, setName] = useState(ex?.name ?? name0 ?? '');
  const [kind, setKind] = useState<'expense' | 'income'>((ex?.kind as 'expense' | 'income') ?? kind0);
  const [picked, setPicked] = useState<string | null>(ex?.emoji ?? null);
  const [own, setOwn] = useState('');
  const suggested = suggestEmoji(name || 'new');
  const emoji = picked ?? suggested;
  const clash = store.state.categories.some((c) => c.id !== ex?.id && c.name.trim().toLowerCase() === name.trim().toLowerCase());
  const valid = name.trim().length > 0 && !clash;
  const used = ex ? store.state.transactions.filter((t) => t.category === ex.id).length : 0;
  const [confirm, setConfirm] = useState(false);

  const save = () => {
    if (!valid) return;
    const id = ex?.id ?? `c-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom'}-${Math.random().toString(36).slice(2, 5)}`;
    store.saveCategory({ id, name: name.trim(), emoji, icon: ex?.icon ?? 'dots', kind: ex?.kind ?? kind, custom: ex ? ex.custom : true });
    store.toast({ text: ex ? `${emoji} ${name.trim()} updated.` : `${emoji} ${name.trim()} added. It's in your quick picks now.`, tone: 'good' });
    onSaved?.(id);
    onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span key={emoji} className="grid h-20 w-20 shrink-0 animate-pop place-items-center rounded-3xl bg-accent-soft text-[44px]" aria-label={`Emoji ${emoji}`} role="img">
          {emoji}
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor="cat-name" className="text-[13px] font-semibold text-ink2">
            Name
          </label>
          <input
            id="cat-name"
            data-autofocus
            className="field mt-1.5"
            maxLength={24}
            placeholder="Gym, Pets, Chai with Riya…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          {!picked && name.trim() && <p className="mt-1.5 text-[12.5px] text-ink3">Suggested from the name. Tap any emoji below to change it.</p>}
          {clash && (
            <p className="mt-1.5 text-[12.5px] font-medium text-warn" role="alert">
              You already have a category called that.
            </p>
          )}
        </div>
      </div>

      {!ex && <Segmented label="Kind" size="sm" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Money out' }, { value: 'income', label: 'Money in' }]} />}

      <div className="flex flex-col gap-3">
        {EMOJI_GRID.map((g) => (
          <div key={g.label}>
            <p className="eyebrow mb-1.5">{g.label}</p>
            <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label={g.label}>
              {g.list.map((em) => (
                <button key={em} type="button" role="radio" aria-checked={emoji === em} aria-label={em} onClick={() => setPicked(em)} className={`tap grid aspect-square place-items-center rounded-xl text-[22px] ${emoji === em ? 'bg-pill ring-2 ring-accent' : 'hover:bg-sunk'}`}>
                  {em}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <label htmlFor="cat-own" className="text-[13px] font-semibold text-ink2">
            Or use any emoji
          </label>
          <input
            id="cat-own"
            className="field w-[88px] py-2 text-center text-[20px]"
            placeholder="🙂"
            value={own}
            onChange={(e) => {
              setOwn(e.target.value);
              const t = typedEmoji(e.target.value);
              if (t) setPicked(t);
            }}
          />
          {picked && (
            <button type="button" className="btn-ghost min-h-[40px] px-3 text-[13px]" onClick={() => { setPicked(null); setOwn(''); }}>
              Use suggestion
            </button>
          )}
        </div>
      </div>

      <button type="button" disabled={!valid} onClick={save} className="btn-accent w-full disabled:opacity-40">
        {ex ? 'Save category' : `Add ${emoji} ${name.trim() || 'category'}`}
      </button>
      {ex?.custom &&
        (confirm ? (
          <div className="flex items-center gap-2 rounded-2xl bg-sunk p-2 pl-4" role="alert">
            <span className="flex-1 text-[14px]">Remove {ex.name}?{used ? ` ${used} transactions move to Other.` : ''}</span>
            <button type="button" className="btn-ghost min-h-[40px] px-3" onClick={() => setConfirm(false)}>
              Keep
            </button>
            <button
              type="button"
              className="btn min-h-[40px] bg-neg px-4 text-white"
              onClick={() => {
                store.deleteCategory(ex.id);
                onDone();
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <button type="button" className="btn-ghost text-neg" onClick={() => setConfirm(true)}>
            Remove category
          </button>
        ))}
    </div>
  );
}
