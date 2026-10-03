import { useMemo, useState } from 'react';
import { RECEIPT_SCAN_ON } from '../lib/features';
import { hasCents, sym } from '../lib/currency';
import type { CategoryId, SplitMode, TxType } from '../types';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { parseEntry } from '../lib/parse';
import { emojiFor } from '../lib/lexicon';
import { addDays, fmtDate, haptic, rupees } from '../lib/format';
import { budgetFor, budgetState, defaultAccount, safeToSpend } from '../lib/finance';
import { Icon } from './ui/Icon';
import { SwipeToConfirm } from './ui/SwipeToConfirm';
import { CategoryMark, MoneyInput, PersonAvatar, Segmented } from './ui/bits';

export interface ComposerPreset {
  amount?: number;
  text?: string;
  type?: TxType;
  category?: CategoryId;
  people?: string[];
  plan?: string;
  date?: string;
  account?: string;
  group?: string;
  /** When splitting an existing transaction, it is replaced by the split. */
  replaceTx?: string;
  openPanel?: 'people';
  /** Transfers: preselect where the money goes (account id or 'pot:<planId>'). */
  toAccount?: string;
}

type Panel = null | 'category' | 'date' | 'plan' | 'people' | 'paidby';

/** Stands in for the cash account when the person has removed theirs. One is made when they save. */
const NEW_CASH = '__new-cash';

export function resolveShares(amount: number, ids: string[], mode: SplitMode, values: Record<string, string>) {
  const num = (id: string) => parseFloat(values[id] ?? '') || 0;
  if (mode === 'equal') return ids.map((p) => ({ person: p, amount: amount / ids.length }));
  if (mode === 'exact') return ids.map((p) => ({ person: p, amount: num(p) }));
  if (mode === 'percent') return ids.map((p) => ({ person: p, amount: (amount * num(p)) / 100 }));
  const total = ids.reduce((a, p) => a + (num(p) || 0), 0) || 1;
  return ids.map((p) => ({ person: p, amount: (amount * num(p)) / total }));
}

export function splitError(amount: number, ids: string[], mode: SplitMode, values: Record<string, string>): string | null {
  const num = (id: string) => parseFloat(values[id] ?? '') || 0;
  if (mode === 'exact') {
    const sum = ids.reduce((a, p) => a + num(p), 0);
    if (Math.abs(sum - amount) > (hasCents() ? 0.005 : 0.5)) return `Amounts add up to ${rupees(sum)}. They need to total ${rupees(amount)}.`;
  }
  if (mode === 'percent') {
    const sum = ids.reduce((a, p) => a + num(p), 0);
    if (Math.abs(sum - 100) > 0.1) return `Percentages add up to ${sum}%. They need to total 100%.`;
  }
  if (mode === 'shares' && ids.every((p) => !num(p))) return 'Give at least one person a share.';
  return null;
}

export function ExpenseComposer({ preset, onDone }: { preset?: ComposerPreset; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const [type, setType] = useState<TxType>(preset?.type ?? 'expense');
  const [amount, setAmount] = useState(preset?.amount ? String(preset.amount) : '');
  const [text, setText] = useState(preset?.text ?? '');
  const [panel, setPanel] = useState<Panel>(preset?.openPanel ?? null);
  const [cat, setCat] = useState<CategoryId | null>(preset?.category ?? null);
  const [date, setDate] = useState(preset?.date ?? state.today);
  const [picked, setAccount] = useState(preset?.account ?? defaultAccount(state));
  const [toAccount, setToAccount] = useState(() => {
    if (preset?.toAccount) return preset.toAccount;
    const p = state.plans.find((x) => x.status === 'active');
    return p ? `pot:${p.id}` : state.accounts.find((a) => a.id !== (preset?.account ?? defaultAccount(state)))?.id ?? '';
  });
  const [plan, setPlan] = useState<string | null | undefined>(preset?.plan);
  const [people, setPeople] = useState<string[] | null>(preset?.people ?? null);
  const [newName, setNewName] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [mode, setMode] = useState<SplitMode>('equal');
  const [values, setValues] = useState<Record<string, string>>({});
  const [paidBy, setPaidBy] = useState('me');
  const [saved, setSaved] = useState(false);

  const parsed = useMemo(() => parseEntry(text, { people: state.people, plans: state.plans, today: state.today, categories: state.categories }), [text, state.people, state.plans, state.today, state.categories]);

  // Inference fills anything the user hasn't set by hand.
  const effAmount = parseFloat(amount) || (parsed.amount ?? 0);
  const effType: TxType = type !== 'expense' ? type : parsed.type === 'income' ? 'income' : 'expense';
  // Only a spend can go on a credit card. Switching to Got or Moved falls back to the main account.
  const account = effType !== 'expense' && state.cards.some((c) => c.id === picked) ? defaultAccount(state) : picked;
  const effCat: CategoryId = cat ?? (effType === 'income' ? (parsed.type === 'income' && /freelance|client/i.test(text) ? 'freelance' : /salary/i.test(text) ? 'salary' : 'income-other') : parsed.category ?? 'other');
  const effPlan = plan === undefined ? parsed.plan : plan;
  const effDate = preset?.date || date !== state.today ? date : parsed.date ?? date;
  const effPeople = people ?? parsed.people;
  const pendingNew = people ? [] : parsed.newPeople;
  const participants = ['me', ...effPeople];
  const hasSplit = effType === 'expense' && (effPeople.length > 0 || pendingNew.length > 0);

  const label = parsed.label || parsed.merchant || (effType === 'income' ? 'Money in' : categoryLabel(state.categories.find((c) => c.id === effCat)?.name));
  const merchant = parsed.merchant && !parsed.label.toLowerCase().includes(parsed.merchant.toLowerCase()) ? `${parsed.merchant} · ${parsed.label}` : label;

  const allIds = [...participants, ...pendingNew.map((n) => `new:${n}`)];
  const shares = hasSplit ? resolveShares(effAmount, allIds, mode, values) : [];
  const err = hasSplit ? splitError(effAmount, allIds, mode, values) : null;
  const myShare = hasSplit ? shares.find((s) => s.person === 'me')?.amount ?? 0 : effAmount;

  // Live preview of what this does to the week
  const sts = safeToSpend(state);
  const spendable = account === NEW_CASH || (state.accounts.find((a) => a.id === account)?.spendable ?? false);
  const impact = effType === 'expense' && spendable && paidBy === 'me' ? effAmount : 0;
  const budget = effType === 'expense' ? budgetFor(state, effCat) : undefined;
  const bLeft = budget ? budgetState(state, budget).left - myShare : null;

  const inferredBits = [
    parsed.amount && !amount ? rupees(parsed.amount) : null,
    parsed.category && !cat ? state.categories.find((c) => c.id === parsed.category)?.name : null,
    parsed.people.length || parsed.newPeople.length ? `with ${[...parsed.people.map((id) => state.people.find((p) => p.id === id)?.short), ...parsed.newPeople].join(', ')}` : null,
    parsed.people.length || parsed.newPeople.length ? `split ${Math.round(100 / (1 + parsed.people.length + parsed.newPeople.length))}/${Math.round(100 - 100 / (1 + parsed.people.length + parsed.newPeople.length))}` : null,
    parsed.plan && plan === undefined ? state.plans.find((p) => p.id === parsed.plan)?.name : null,
    parsed.date && parsed.date !== state.today ? 'yesterday' : null,
  ].filter(Boolean);

  const togglePanel = (p: Panel) => {
    haptic(6);
    setPanel((cur) => (cur === p ? null : p));
  };

  const save = () => {
    if (!effAmount || err) return;
    // Create any new people typed in the description
    const created = pendingNew.map((n) => store.addPerson(n).id);
    const ids = [...effPeople, ...created];
    const from = account === NEW_CASH ? store.ensureCashAccount() : account;
    if (effType === 'transfer') {
      const toInvest = state.accounts.find((a) => a.id === toAccount)?.type === 'investment';
      const tx = { merchant: toAccount.startsWith('pot:') ? `Moved to ${state.plans.find((p) => `pot:${p.id}` === toAccount)?.name}` : toInvest ? `Invested · ${state.accounts.find((a) => a.id === toAccount)?.name}` : `Transfer to ${state.accounts.find((a) => a.id === toAccount)?.name}`, amount: effAmount, type: 'transfer' as const, direction: 'out' as const, toAccount, category: toInvest ? 'investments' : 'transfer', date: effDate, account: from, recurring, notes: text || undefined, plan: toAccount.startsWith('pot:') ? toAccount.slice(4) : undefined };
      if (toAccount.startsWith('pot:')) store.contribute(toAccount.slice(4), effAmount, from);
      else store.addTransaction(tx);
    } else if (hasSplit) {
      const finalShares = shares.map((s) => (s.person.startsWith('new:') ? { ...s, person: created[pendingNew.indexOf(s.person.slice(4))] } : s));
      store.addSplit({ group: preset?.group, description: merchant, amount: effAmount, paidBy, date: effDate, mode, shares: finalShares, category: effCat, plan: effPlan ?? undefined, account: from, notes: undefined });
      void ids;
    } else {
      store.addTransaction({ merchant, amount: effAmount, type: effType, category: effCat, date: effDate, account: from, plan: effPlan ?? undefined, recurring, people: ids.length ? ids : undefined });
    }
    if (preset?.replaceTx) store.deleteTransaction(preset.replaceTx, { quiet: true });
    setSaved(true);
    window.setTimeout(onDone, 650);
  };

  // Where the money comes from (or lands): bank accounts, cash, wallets, and cards for spends.
  const banks = state.accounts.filter((a) => a.type === 'bank');
  const cashAcct = state.accounts.find((a) => a.type === 'cash');
  const sources: { id: string; label: string; emoji: string; sub: string; balance?: number; cash?: boolean }[] = [
    ...banks.map((a) => ({ id: a.id, label: banks.length === 1 ? 'Bank' : a.name, emoji: '🏦', sub: rupees(a.balance), balance: a.balance })),
    ...state.accounts.filter((a) => a.type === 'wallet' && a.spendable).map((a) => ({ id: a.id, label: a.name, emoji: '👛', sub: rupees(a.balance), balance: a.balance })),
    ...(effType === 'expense' ? state.cards.map((c) => ({ id: c.id, label: c.name, emoji: '💳', sub: `Card ··${c.last4}` })) : []),
  ];
  // Cash sits second, right after the main bank, so both are on screen without scrolling.
  sources.splice(Math.min(1, banks.length), 0, { id: cashAcct?.id ?? NEW_CASH, label: 'Cash', emoji: '💵', sub: rupees(cashAcct?.balance ?? 0), balance: cashAcct?.balance ?? 0, cash: true });
  // Opened with some other account already chosen (say, from an old entry): keep it selectable.
  const other = state.accounts.find((a) => a.id === account);
  if (other && !sources.some((o) => o.id === account)) sources.push({ id: other.id, label: other.name, emoji: '🏦', sub: rupees(other.balance), balance: other.balance });
  const source = sources.find((o) => o.id === account);
  // The account isn't touched when a friend paid for a split.
  const showSource = effType !== 'transfer' && !(hasSplit && paidBy !== 'me');
  const short = showSource && effType === 'expense' && source?.balance != null && effAmount > source.balance;
  const dateLabel = effDate === state.today ? 'Today' : effDate === addDays(state.today, -1) ? 'Yesterday' : fmtDate(effDate);
  const catName = state.categories.find((c) => c.id === effCat)?.name ?? 'Other';

  const picks = quickPicks(state, effType);
  const catObj = state.categories.find((c) => c.id === effCat);
  const liveEmoji = text.trim() ? emojiFor(text, state.categories, catObj?.emoji ?? '🧾') : catObj?.emoji ?? (effType === 'income' ? '🤑' : '✨');
  const TYPES: { value: TxType; label: string; emoji: string }[] = [
    { value: 'expense', label: 'Spent', emoji: '💸' },
    { value: 'income', label: 'Got', emoji: '🤑' },
    { value: 'transfer', label: 'Moved', emoji: '🔁' },
  ];
  const afterSafe = Math.max(0, sts.safe - impact);

  return (
    <div className="flex flex-col">
      <p className="eyebrow mt-2 pr-12">{effType === 'income' ? 'Money in' : effType === 'transfer' ? 'Move money' : 'New spend'} · {dateLabel}</p>

      {/* Type: the chosen one is a filled pill, like the tab bar */}
      <div className="mt-3 flex items-center gap-1.5">
        <div className="flex flex-1 items-center gap-1.5" role="radiogroup" aria-label="Type">
          {TYPES.map((t) => {
            const on = effType === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  haptic(6);
                  setType(t.value);
                  setCat(null);
                }}
                className={`tap flex h-11 items-center justify-center gap-1.5 rounded-full border-[1.5px] text-[14px] font-semibold transition-colors ${on ? 'flex-[1.3] border-transparent bg-pill text-pill-fg' : 'flex-1 border-line text-ink2 hover:border-ink/50'}`}
              >
                <span aria-hidden="true">{t.emoji}</span> {t.label}
              </button>
            );
          })}
        </div>
        {RECEIPT_SCAN_ON && (
          <button type="button" onClick={() => ui.replaceSheet({ type: 'receipt' })} className="tap grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-line text-ink hover:border-ink/50" aria-label="Scan a receipt">
            <Icon name="scan" size={19} />
          </button>
        )}
      </div>

      {/* Amount */}
      <div className={`mt-2 ${saved ? 'animate-pop' : ''}`}>
        <MoneyInput value={amount || (parsed.amount && !amount ? String(parsed.amount) : '')} onChange={setAmount} label="Amount in rupees" autoFocus={!preset?.text} id="composer-amount" />
      </div>
      {effType === 'expense' && (
        <p className="mx-auto -mt-1 inline-flex items-center gap-1.5 self-center rounded-full bg-accent-soft px-3 py-1 text-[12.5px] font-semibold text-accent-ink" aria-live="polite">
          {impact > 0 ? (
            <>
              Safe to spend after: <span className="num">{rupees(afterSafe)}</span>
            </>
          ) : (
            <>
              Safe to spend: <span className="num">{rupees(sts.safe)}</span>
            </>
          )}
        </p>
      )}

      {/* Quick picks: your usual places, then every category, then make your own */}
      {picks.length > 0 && (
        <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Quick picks">
          {picks.map((q) => {
            const on = q.kind === 'category' && effCat === q.category && (cat !== null || !!text.trim());
            return (
              <button
                key={`${q.kind}-${q.label}`}
                type="button"
                aria-pressed={q.kind === 'category' ? on : undefined}
                onClick={() => {
                  haptic(6);
                  if (q.kind === 'merchant') setText(q.label);
                  setCat(q.category);
                }}
                className={`tap flex min-w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl border-[1.5px] px-3 py-2 transition-colors ${on ? 'border-transparent bg-pill text-pill-fg' : 'border-line bg-bg text-ink2 hover:border-ink/40'}`}
              >
                <span className="text-[22px] leading-none" aria-hidden="true">
                  {q.emoji}
                </span>
                <span className="whitespace-nowrap text-[12px] font-semibold">{q.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => ui.openSheet({ type: 'category-form', kind: effType === 'income' ? 'income' : 'expense', name: text && !parsed.category ? parsed.label : undefined, onSaved: (id) => setCat(id) })}
            className="tap flex min-w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl border-[1.5px] border-dashed border-ink/40 px-3 py-2 text-ink2 hover:border-ink"
          >
            <span className="grid h-[22px] place-items-center" aria-hidden="true">
              <Icon name="plus" size={20} />
            </span>
            <span className="whitespace-nowrap text-[12px] font-semibold">New</span>
          </button>
        </div>
      )}

      {/* What for */}
      <div className="mt-3 flex items-center gap-2 rounded-full border-[1.5px] border-line bg-surface py-1.5 pl-1.5 pr-4 focus-within:border-accent">
        <span key={liveEmoji} className="grid h-9 w-9 shrink-0 animate-pop place-items-center rounded-full bg-sunk text-[18px]" aria-hidden="true">
          {effType === 'transfer' ? '🔁' : liveEmoji}
        </span>
        <label htmlFor="composer-text" className="sr-only">
          What was it for
        </label>
        <input
          id="composer-text"
          className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-ink3 focus:outline-none"
          placeholder={effType === 'income' ? 'salary, freelance, refund…' : effType === 'transfer' ? 'note (optional)' : 'what for? try “dinner w/ Rahul”'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          autoComplete="off"
        />
        {text && (
          <button type="button" onClick={() => { setText(''); setCat(null); }} className="tap -mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label="Clear">
            <Icon name="x" size={15} />
          </button>
        )}
      </div>

      {inferredBits.length > 0 && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[13px] font-medium text-accent-ink" aria-live="polite">
          <Icon name="spark" size={14} /> Got it: {inferredBits.join(' · ')}
        </p>
      )}

      {/* Bank or cash: always visible, because it decides which balance moves */}
      {showSource && (
        <div className="mt-4">
          <p id="composer-source" className="text-[12.5px] font-semibold text-ink3">
            {effType === 'income' ? 'Received in' : 'Paid from'}
          </p>
          <div role="radiogroup" aria-labelledby="composer-source" className={sources.length <= 2 ? 'mt-1.5 grid grid-cols-2 gap-2' : 'no-scrollbar -mx-5 mt-1.5 flex gap-2 overflow-x-auto px-5 pb-1'}>
            {sources.map((o) => {
              const on = account === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    haptic(6);
                    setAccount(o.id);
                  }}
                  className={`tap flex items-center gap-2.5 rounded-2xl border-[1.5px] px-3 py-2 text-left transition-colors ${sources.length <= 2 ? 'min-w-0' : 'min-w-[132px] max-w-[180px] shrink-0'} ${on ? 'border-transparent bg-pill text-pill-fg' : 'border-line bg-bg text-ink2 hover:border-ink/40'}`}
                >
                  <span className="text-[20px] leading-none" aria-hidden="true">
                    {o.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold leading-tight">{o.label}</span>
                    <span className={`num mt-0.5 block truncate text-[12.5px] leading-tight ${on ? 'opacity-80' : 'text-ink3'}`}>{o.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {short && source && (
            <p className="mt-2 text-[12.5px] leading-snug text-ink2" role="status">
              {source.cash
                ? `PULSE shows ${rupees(Math.max(0, source.balance ?? 0))} in cash. Took cash out of the bank? Log that with Moved.`
                : `That's more than the ${rupees(Math.max(0, source.balance ?? 0))} PULSE shows in ${source.label === 'Bank' ? 'your bank' : source.label}.`}
            </p>
          )}
        </div>
      )}

      {/* Details, one swipeable row */}
      {effType !== 'transfer' ? (
        <div className="no-scrollbar -mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 pb-1">
          <button type="button" className="chip shrink-0 rounded-full" aria-expanded={panel === 'category'} onClick={() => togglePanel('category')}>
            <span aria-hidden="true">{catObj?.emoji ?? '✨'}</span> {catName}
          </button>
          <button type="button" className="chip shrink-0" aria-expanded={panel === 'date'} onClick={() => togglePanel('date')}>
            <Icon name="calendar" size={15} /> {dateLabel}
          </button>
          {effType === 'expense' && (
            <>
              <button type="button" className="chip shrink-0" aria-expanded={panel === 'people'} onClick={() => togglePanel('people')}>
                <Icon name="users" size={15} /> {effPeople.length + pendingNew.length ? `${effPeople.length + pendingNew.length + 1} people` : 'Split'}
              </button>
              <button type="button" className="chip shrink-0" aria-expanded={panel === 'plan'} onClick={() => togglePanel('plan')}>
                <Icon name="target" size={15} /> {effPlan ? state.plans.find((p) => p.id === effPlan)?.name : 'Plan'}
              </button>
            </>
          )}
          <button type="button" className="chip shrink-0" aria-pressed={recurring} onClick={() => { haptic(6); setRecurring(!recurring); }}>
            <Icon name="repeat" size={15} /> Monthly
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
            From
            <select className="field rounded-2xl" value={account} onChange={(e) => setAccount(e.target.value)}>
              {state.accounts.filter((a) => a.type === 'bank' || a.type === 'cash').map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
            To
            <select className="field rounded-2xl" value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
              <optgroup label="Plans">
                {state.plans.filter((p) => p.status === 'active').map((p) => (
                  <option key={p.id} value={`pot:${p.id}`}>
                    {p.icon} {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Accounts">
                {state.accounts.filter((a) => a.id !== account).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        </div>
      )}

      {/* Inline pickers */}
      {panel === 'category' && (
        <div className="mt-4 grid animate-rise grid-cols-4 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Category">
          {state.categories.filter((c) => c.kind === (effType === 'income' ? 'income' : 'expense')).map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={c.id === effCat} onClick={() => { setCat(c.id); setPanel(null); }} className={`tap flex flex-col items-center gap-1 rounded-2xl p-2 text-center text-[11.5px] font-semibold leading-tight ${c.id === effCat ? 'bg-pill text-pill-fg' : 'hover:bg-sunk'}`}>
              <span className="text-[22px]" aria-hidden="true">{c.emoji ?? '✨'}</span> {c.name}
            </button>
          ))}
          <button type="button" onClick={() => ui.openSheet({ type: 'category-form', kind: effType === 'income' ? 'income' : 'expense', onSaved: (id) => { setCat(id); setPanel(null); } })} className="tap flex flex-col items-center gap-1 rounded-2xl border-[1.5px] border-dashed border-ink/30 p-2 text-[11.5px] font-semibold text-ink2">
            <Icon name="plus" size={22} /> New
          </button>
        </div>
      )}
      {panel === 'date' && (
        <div className="mt-4 flex animate-rise flex-wrap items-center justify-center gap-2">
          {[0, 1, 2].map((d) => {
            const v = addDays(state.today, -d);
            return (
              <button key={d} type="button" className="chip" aria-pressed={effDate === v} onClick={() => { setDate(v); setPanel(null); }}>
                {d === 0 ? 'Today' : d === 1 ? 'Yesterday' : fmtDate(v)}
              </button>
            );
          })}
          <label className="sr-only" htmlFor="composer-date">
            Pick a date
          </label>
          <input id="composer-date" type="date" className="field w-auto py-2" value={effDate} max={state.today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
      )}
      {panel === 'plan' && (
        <div className="mt-4 flex animate-rise flex-wrap justify-center gap-2">
          <button type="button" className="chip" aria-pressed={!effPlan} onClick={() => { setPlan(null); setPanel(null); }}>
            No plan
          </button>
          {state.plans.filter((p) => p.status !== 'paused').map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={effPlan === p.id} onClick={() => { setPlan(p.id); setPanel(null); }}>
              {p.icon} {p.name}
            </button>
          ))}
        </div>
      )}
      {panel === 'people' && (
        <div className="mt-4 animate-rise">
          <div className="flex flex-wrap justify-center gap-2">
            {state.people.map((p) => {
              const on = effPeople.includes(p.id);
              return (
                <button key={p.id} type="button" className="chip pl-1" aria-pressed={on} onClick={() => setPeople(on ? effPeople.filter((x) => x !== p.id) : [...effPeople, p.id])}>
                  <PersonAvatar person={p} size={26} /> {p.short}
                </button>
              );
            })}
          </div>
          <form
            className="mx-auto mt-3 flex max-w-[320px] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              const p = store.addPerson(newName);
              setPeople([...effPeople, p.id]);
              setNewName('');
            }}
          >
            <label htmlFor="composer-new-person" className="sr-only">
              Add a friend
            </label>
            <input id="composer-new-person" className="field py-2" placeholder="Add a friend" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" className="btn-quiet min-h-[42px] px-4">
              Add
            </button>
          </form>
        </div>
      )}

      {/* Split details */}
      {hasSplit && (
        <div className="mt-5 rounded-2xl bg-sunk/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[14px] font-semibold">Split {allIds.length} ways</p>
            <button type="button" className="text-[13.5px] font-semibold text-accent-ink" onClick={() => togglePanel('paidby')}>
              Paid by {paidBy === 'me' ? 'you' : state.people.find((p) => p.id === paidBy)?.short}
            </button>
          </div>
          {panel === 'paidby' && (
            <div className="mb-3 flex flex-wrap gap-2">
              {['me', ...effPeople].map((id) => (
                <button key={id} type="button" className="chip" aria-pressed={paidBy === id} onClick={() => { setPaidBy(id); setPanel(null); }}>
                  {id === 'me' ? 'You' : state.people.find((p) => p.id === id)?.short}
                </button>
              ))}
            </div>
          )}
          <Segmented label="Split method" size="sm" value={mode} onChange={setMode} options={[{ value: 'equal', label: 'Equally' }, { value: 'exact', label: `${sym().trim()} Exact` }, { value: 'percent', label: '%' }, { value: 'shares', label: 'Shares' }]} />
          <ul className="mt-3 flex flex-col gap-2">
            {allIds.map((id, i) => {
              const person = id.startsWith('new:') ? undefined : state.people.find((p) => p.id === id);
              const name = id === 'me' ? 'You' : person?.short ?? id.slice(4);
              return (
                <li key={id} className="flex items-center gap-3">
                  {id === 'me' ? <PersonAvatar me size={28} /> : <PersonAvatar person={person ?? { id, name, short: name, hue: 90 }} size={28} />}
                  <span className="flex-1 text-[14.5px]">{name}</span>
                  {mode !== 'equal' && (
                    <>
                      <label htmlFor={`split-${i}`} className="sr-only">
                        {name} {mode === 'exact' ? 'amount' : mode === 'percent' ? 'percent' : 'shares'}
                      </label>
                      <input id={`split-${i}`} inputMode="decimal" className="field num w-[84px] py-1.5 text-right" placeholder={mode === 'percent' ? '%' : mode === 'shares' ? '1' : sym().trim()} value={values[id] ?? ''} onChange={(e) => setValues({ ...values, [id]: e.target.value.replace(/[^\d.]/g, '') })} />
                    </>
                  )}
                  <span className="num w-[72px] text-right text-[14.5px] font-semibold">{rupees(shares[i]?.amount ?? 0)}</span>
                </li>
              );
            })}
          </ul>
          {err && (
            <p className="mt-3 text-[13px] font-medium text-warn" role="alert">
              {err}
            </p>
          )}
        </div>
      )}

      {bLeft != null && effAmount > 0 && (
        <p className="mt-4 text-center text-[13px] text-ink2">
          {bLeft >= 0 ? <>{catName} budget: {rupees(bLeft)} left after this.</> : <>{catName} would be {rupees(-bLeft)} over budget.</>}
        </p>
      )}

      {/* Save: swipe the orange knob across (or tap it) */}
      <div className="mt-5">
        <SwipeToConfirm
          key={effType}
          disabled={!effAmount || !!err}
          disabledLabel={err ? 'Fix the split first' : 'Enter an amount'}
          done={saved}
          doneLabel="Logged. Nice."
          label={effType === 'income' ? `Swipe to add ${rupees(effAmount)}` : effType === 'transfer' ? `Swipe to move ${rupees(effAmount)}` : hasSplit ? `Swipe to split · you ${rupees(myShare)}` : `Swipe to log ${rupees(effAmount)}`}
          onConfirm={save}
        />
      </div>
    </div>
  );
}

type Pick = { kind: 'merchant' | 'category'; label: string; emoji: string; category: CategoryId };

/** Your most frequent recent places first, then every category (including your own). */
function quickPicks(state: ReturnType<typeof useStore>['state'], type: TxType): Pick[] {
  if (type === 'transfer') return [];
  const kind = type === 'income' ? 'income' : 'expense';
  const cats: Pick[] = state.categories.filter((c) => c.kind === kind).map((c) => ({ kind: 'category', label: c.name, emoji: c.emoji ?? '✨', category: c.id }));
  if (type === 'income') return cats;
  const since = addDays(state.today, -60);
  const counts = new Map<string, { n: number; category: CategoryId }>();
  for (const t of state.transactions) {
    if (t.type !== 'expense' || t.recurring || t.splitId || t.date < since) continue;
    const key = t.merchant.split(' · ')[0];
    if (key.length > 16) continue;
    const c = counts.get(key) ?? { n: 0, category: t.category };
    c.n++;
    counts.set(key, c);
  }
  const mine: Pick[] = [...counts.entries()]
    .filter(([, v]) => v.n >= 2)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 5)
    .map(([label, v]) => ({ kind: 'merchant', label, category: v.category, emoji: emojiFor(label, state.categories, state.categories.find((c) => c.id === v.category)?.emoji ?? '✨') }));
  return [...mine, ...cats];
}

function categoryLabel(n?: string) {
  return n ?? 'Expense';
}

export { CategoryMark };
