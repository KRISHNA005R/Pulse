import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../lib/stats';
import { useStore } from '../store/store';
import { useUI, type Route, type SheetSpec } from '../store/ui';
import { askPulse, starterQuestions, type AIAnswer, type AIBlock, type AILink } from '../lib/assistant';
import { defaultAccount, FUND_TYPES, safeToSpend } from '../lib/finance';
import { buildRecap } from '../lib/insights';
import { yearSummary } from '../lib/history';
import { MonthBars } from '../screens/History';
import { burstFrom } from '../lib/celebrate';
import { canIAfford, type AffordResult } from '../lib/afford';
import { addDays, daysBetween, fmtDate, rupees, uid } from '../lib/format';
import { Icon } from './ui/Icon';
import { Bars } from './money';
import { MoneyInput, ProgressBar } from './ui/bits';

// ------------------------------------------------------------------
// Can I afford this?
// ------------------------------------------------------------------
export function AffordCard({ r }: { r: AffordResult }) {
  const tone = r.verdict === 'comfortable' || r.verdict === 'yes' ? 'text-pos' : r.verdict === 'not-now' || r.verdict === 'tight' ? 'text-ink' : 'text-warn';
  const mark = r.verdict === 'comfortable' || r.verdict === 'yes' ? 'check' : 'info';
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className={`display flex items-center gap-2 text-[19px] ${tone}`}>
        <Icon name={mark} size={20} /> {r.headline}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className="text-[12.5px] text-ink3">Safe to spend now</dt>
          <dd className="num text-[20px] font-semibold">{rupees(r.safeBefore)}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-ink3">After this</dt>
          <dd className="num text-[20px] font-semibold">{rupees(r.safeAfter)}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-ink3">Per day until payday</dt>
          <dd className="num text-[15px] font-semibold">
            {rupees(r.dailyBefore)} → {rupees(r.dailyAfter)}
          </dd>
        </div>
        {r.budget && (
          <div>
            <dt className="text-[12.5px] text-ink3">{r.budget.name} budget</dt>
            <dd className="num text-[15px] font-semibold">{r.budget.leftAfter >= 0 ? `${rupees(r.budget.leftAfter)} left` : `Over by ${rupees(-r.budget.leftAfter)}`}</dd>
          </div>
        )}
        {r.planImpacts.map((p) => (
          <div key={p.planId}>
            <dt className="text-[12.5px] text-ink3">
              {p.icon} {p.name}
            </dt>
            <dd className="num text-[15px] font-semibold">
              {p.days} day{p.days === 1 ? '' : 's'} slower
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[14.5px] leading-snug text-ink2">{r.explanation}</p>
    </div>
  );
}

export function AffordView({ initialAmount, initialWhat }: { initialAmount?: number; initialWhat?: string }) {
  const { state } = useStore();
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : '');
  const [what, setWhat] = useState(initialWhat ?? '');
  const n = parseFloat(amount) || 0;
  const r = useMemo(() => (n > 0 ? canIAfford(state, n, what) : null), [state, n, what]);
  return (
    <div>
      <MoneyInput value={amount} onChange={setAmount} label="How much" autoFocus={!initialAmount} id="afford-amount" />
      <label htmlFor="afford-what" className="sr-only">
        What is it for
      </label>
      <input id="afford-what" className="field text-center" placeholder="On what? e.g. shoes, concert, dinner" value={what} onChange={(e) => setWhat(e.target.value)} />
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {[500, 1500, 3000, 6000].map((v) => (
          <button key={v} type="button" className="chip" aria-pressed={n === v} onClick={() => setAmount(String(v))}>
            {rupees(v)}
          </button>
        ))}
      </div>
      <div className="mt-5" aria-live="polite">
        {r ? <AffordCard r={r} /> : <p className="text-center text-[14px] text-ink3">Enter an amount to see what it does to your week and your plans.</p>}
      </div>
      <p className="mt-3 text-center text-[12.5px] text-ink3">Just information, no judgement. You decide.</p>
    </div>
  );
}

// ------------------------------------------------------------------
// PULSE AI
// ------------------------------------------------------------------
function ActionCard({ block, msgId, index }: { block: Extract<AIBlock, { type: 'action' }>; msgId?: string; index: number }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const a = block.action;
  const acct = defaultAccount(state);
  const acctName = state.accounts.find((x) => x.id === acct)?.name ?? 'Account';
  const catLabel = (id: string) => {
    const c = state.categories.find((x) => x.id === id);
    return c ? `${c.emoji} ${c.name}` : id;
  };
  const dayLabel = (d: string) => (d === state.today ? 'Today' : d === addDays(state.today, -1) ? 'Yesterday' : fmtDate(d, true));
  const cycleWord = (c: string) => (c === 'weekly' ? 'week' : c === 'yearly' ? 'year' : 'month');
  const sts = safeToSpend(state);

  const update = (patch: Partial<Extract<AIBlock, { type: 'action' }>>) =>
    msgId &&
    ui.setChat((c) =>
      c.map((m) => (m.id === msgId && m.answer?.blocks ? { ...m, answer: { ...m.answer, blocks: m.answer.blocks.map((b, i) => (i === index ? ({ ...b, ...patch } as AIBlock) : b)) } } : m)),
    );

  let title = '';
  let icon = 'plus';
  let rows: { label: string; value: string }[] = [];
  let cta = 'Add';
  switch (a.kind) {
    case 'expense':
      title = 'New expense';
      icon = 'receipt';
      rows = [
        { label: 'Amount', value: rupees(a.amount) },
        { label: 'For', value: a.merchant },
        { label: 'Category', value: catLabel(a.category) },
        { label: 'Date', value: dayLabel(a.date) },
        { label: 'Paid from', value: acctName },
        ...(a.plan ? [{ label: 'Plan', value: state.plans.find((p) => p.id === a.plan)?.name ?? '' }] : []),
        { label: 'Safe to spend after', value: rupees(Math.max(0, sts.safe - a.amount)) },
      ];
      break;
    case 'income':
      title = 'Money in';
      icon = 'download';
      rows = [
        { label: 'Amount', value: rupees(a.amount) },
        { label: 'What', value: a.merchant },
        { label: 'Category', value: catLabel(a.category) },
        { label: 'Date', value: dayLabel(a.date) },
        { label: 'Into', value: acctName },
      ];
      break;
    case 'split':
      title = 'Split an expense';
      icon = 'split';
      rows = [
        { label: 'Amount', value: rupees(a.amount) },
        { label: 'With', value: a.names.join(', ') },
      ];
      cta = 'Open split';
      break;
    case 'contribute': {
      const p = state.plans.find((x) => x.id === a.planId);
      title = `Add to ${a.planName}`;
      icon = 'target';
      rows = [
        { label: 'Amount', value: rupees(a.amount) },
        { label: 'From', value: acctName },
        ...(p ? [{ label: 'Saved after', value: `${rupees(p.saved + a.amount)} of ${rupees(p.target)}` }] : []),
      ];
      break;
    }
    case 'plan': {
      const months = Math.max(1, Math.round(daysBetween(state.today, a.targetDate) / 30.4));
      title = 'New plan';
      icon = 'target';
      rows = [
        { label: 'Plan', value: `${a.icon} ${a.name}` },
        { label: 'Target', value: rupees(a.target) },
        { label: 'By', value: fmtDate(a.targetDate, true) },
        { label: 'Save each month', value: `about ${rupees(Math.ceil(a.target / months))}` },
      ];
      cta = 'Create plan';
      break;
    }
    case 'bill':
      title = a.subKind === 'bill' ? 'New bill' : 'New subscription';
      icon = 'repeat';
      rows = [
        { label: 'Name', value: a.name },
        { label: 'Amount', value: `${rupees(a.amount)} a ${cycleWord(a.cycle)}` },
        { label: 'Next due', value: fmtDate(a.nextDate, true) },
        { label: 'Paid from', value: acctName },
      ];
      break;
    case 'sip': {
      const ft = FUND_TYPES.find((f) => f.value === a.fundType);
      title = 'New SIP';
      icon = 'trend';
      rows = [
        { label: 'Fund', value: a.name },
        { label: 'Amount', value: `${rupees(a.amount)} a month` },
        { label: 'First debit', value: fmtDate(a.nextDate, true) },
        ...(ft ? [{ label: 'Fund type', value: ft.label }] : []),
        { label: 'Step-up', value: a.stepUp ? `+${a.stepUp}% every year` : 'None' },
        { label: 'Assumed return', value: `${a.rate}% a year` },
      ];
      cta = 'Add SIP';
      break;
    }
    case 'budget':
      title = a.budgetId ? 'Update budget' : 'New budget';
      icon = 'sliders';
      rows = [
        { label: 'Category', value: catLabel(a.category) },
        { label: 'Limit', value: `${rupees(a.amount)} a ${a.period === 'weekly' ? 'week' : 'month'}` },
      ];
      cta = a.budgetId ? 'Update' : 'Set budget';
      break;
    case 'settle':
      title = 'Settle up';
      icon = 'users';
      rows = [
        { label: a.from === 'me' ? 'You paid' : `${a.personName} paid you`, value: rupees(a.amount) },
        { label: a.from === 'me' ? 'To' : 'Into', value: a.from === 'me' ? a.personName : acctName },
      ];
      cta = 'Save';
      break;
  }

  const run = () => {
    switch (a.kind) {
      case 'expense':
      case 'income': {
        const tx = store.addTransaction({ merchant: a.merchant, amount: a.amount, type: a.kind, category: a.category, date: a.date, account: acct, plan: a.plan, recurring: false });
        const after = a.kind === 'expense' ? Math.max(0, sts.safe - a.amount) : null;
        update({ status: 'done', txId: tx.id, note: a.kind === 'expense' ? `Added. Safe to spend is now about ${rupees(after ?? 0)}.` : `Added ${rupees(a.amount)} to ${acctName}.` });
        return;
      }
      case 'split':
        ui.openSheet({ type: 'composer', preset: { text: a.text } });
        update({ status: 'opened', note: 'Opened the split. Check the shares and save.' });
        return;
      case 'contribute':
        store.contribute(a.planId, a.amount, acct);
        update({ status: 'done', note: `Moved ${rupees(a.amount)} to ${a.planName}.` });
        return;
      case 'plan':
        store.savePlan({ name: a.name, icon: a.icon, kind: 'plan', target: a.target, saved: 0, startDate: state.today, targetDate: a.targetDate, status: 'active', categories: [], cycleReserve: 0 });
        update({ status: 'done', note: `${a.name} created. Add money to it any time.` });
        return;
      case 'bill':
        store.saveSubscription({ name: a.name, amount: a.amount, cycle: a.cycle, nextDate: a.nextDate, category: a.category, status: 'active', kind: a.subKind, account: acct });
        update({ status: 'done', note: `${a.name} added. It's now kept aside before it's due.` });
        return;
      case 'sip': {
        const hold = state.accounts.find((x) => x.type === 'investment');
        store.saveInvestment(
          { name: a.name, platform: '', kind: 'sip', amount: a.amount, cycle: 'monthly', nextDate: a.nextDate, status: 'active', fromAccount: acct, toAccount: hold?.id ?? '__new', startDate: state.today, expectedReturn: a.rate, autoDeduct: true, fundType: a.fundType, stepUp: a.stepUp, lastStepUp: a.stepUp ? state.today : undefined },
          a.name,
        );
        update({ status: 'done', note: `SIP added. ${rupees(a.amount)} goes in on ${fmtDate(a.nextDate)}.` });
        return;
      }
      case 'budget':
        store.saveBudget({ id: a.budgetId, category: a.category, amount: a.amount, period: a.period });
        update({ status: 'done', note: 'Budget saved.' });
        return;
      case 'settle':
        store.recordSettlement({ from: a.from, to: a.to, amount: a.amount });
        update({ status: 'done', note: 'Settlement recorded.' });
        return;
    }
  };

  const edit = () => {
    switch (a.kind) {
      case 'expense':
      case 'income':
        return ui.openSheet({ type: 'composer', preset: { amount: a.amount, text: a.merchant, type: a.kind, category: a.category, date: a.date } });
      case 'split':
        return ui.openSheet({ type: 'composer', preset: { text: a.text } });
      case 'contribute':
        return ui.openSheet({ type: 'contribute', planId: a.planId });
      case 'plan':
        return ui.openSheet({ type: 'plan-form' });
      case 'bill':
        return ui.openSheet({ type: 'sub-form', preset: { name: a.name, amount: a.amount, category: a.category } });
      case 'sip':
        return ui.openSheet({ type: 'investment-form' });
      case 'budget':
        return ui.openSheet({ type: 'budget-form', budgetId: a.budgetId, category: a.category });
      case 'settle':
        return ui.openSheet({ type: 'settle', personId: a.personId });
    }
  };

  const done = block.status === 'done' || block.status === 'opened';
  return (
    <div className={`rounded-2xl border bg-surface p-4 ${done ? 'border-pos/40' : block.status === 'cancelled' ? 'border-line opacity-60' : 'border-accent/40'}`}>
      <p className="flex items-center gap-2 text-[14.5px] font-semibold">
        <span className={`grid h-7 w-7 place-items-center rounded-full ${done ? 'bg-pos/15 text-pos' : 'bg-accent-soft text-accent-ink'}`}>
          <Icon key={done ? 'd' : 'i'} name={done ? 'check' : icon} size={15} strokeWidth={done ? 3 : 2} className={done ? 'animate-boing' : ''} />
        </span>
        {title}
      </p>
      <dl className="mt-3 divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-[13.5px] text-ink3">{r.label}</dt>
            <dd className="num text-right text-[14.5px] font-semibold">{r.value}</dd>
          </div>
        ))}
      </dl>
      {done ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[13.5px] font-medium text-pos" role="status">
            {block.note}
          </p>
          {block.txId && (
            <button
              type="button"
              className="shrink-0 text-[13.5px] font-semibold text-accent-ink underline underline-offset-2"
              onClick={() => {
                store.deleteTransaction(block.txId!, { quiet: true });
                update({ status: 'cancelled', txId: undefined, note: 'Undone.' });
              }}
            >
              Undo
            </button>
          )}
        </div>
      ) : block.status === 'cancelled' ? (
        <p className="mt-3 text-[13.5px] text-ink3">{block.note ?? 'Not added.'}</p>
      ) : (
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            className="btn-accent min-h-[44px]"
            onClick={(e) => {
              if (a.kind !== 'split') burstFrom(e.currentTarget, { kind: a.kind === 'income' ? 'coins' : 'mini', power: 0.8 });
              run();
            }}
          >
            {cta}
          </button>
          <button type="button" className="btn-quiet min-h-[44px] px-4" onClick={edit}>
            Change
          </button>
        </div>
      )}
    </div>
  );
}

function ReportCard({ month }: { month: string }) {
  const { state } = useStore();
  const ui = useUI();
  const r = useMemo(() => buildRecap(state, month), [state, month]);
  const left = r.income - r.spent - r.saved - r.invested;
  const tiles = [
    { label: 'Came in', value: r.income, tone: 'text-pos' },
    { label: 'Spent', value: r.spent, tone: '' },
    { label: 'Into plans', value: r.saved, tone: '' },
    { label: 'Invested', value: r.invested, tone: '' },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="bg-ink px-4 py-3.5 text-bg">
        <p className="eyebrow !text-current opacity-70">Monthly report</p>
        <p className="display mt-0.5 text-[20px]">
          {r.monthLabel} {month.slice(0, 4)}
          {r.partial ? <span className="block font-sans text-[13px] font-medium opacity-70">So far, through {r.throughDate}</span> : null}
        </p>
      </div>
      <div className="p-4">
        <dl className="grid grid-cols-2 gap-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl bg-sunk/70 p-3">
              <dt className="text-[12px] text-ink3">{t.label}</dt>
              <dd className={`num mt-0.5 text-[17px] font-semibold ${t.tone}`}>{rupees(t.value)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-[13.5px]">
          <span className="text-ink2">{left >= 0 ? 'Left over' : 'More than came in'}</span>
          <span className={`num font-semibold ${left >= 0 ? 'text-pos' : 'text-warn'}`}>{rupees(Math.abs(left))}</span>
        </p>
        {r.vsLast !== 0 && (
          <p className="mt-2 text-[13px] text-ink3">
            Spending is {Math.abs(Math.round(r.vsLast * 100))}% {r.vsLast > 0 ? 'higher' : 'lower'} than the month before.
          </p>
        )}

        {r.categories.length > 0 && (
          <div className="mt-4">
            <p className="eyebrow mb-2.5">Where it went</p>
            <Bars rows={r.categories.map((c, i) => ({ label: c.name, value: c.amount, highlight: i === 0 }))} />
          </div>
        )}

        {r.biggest && (
          <p className="mt-4 rounded-xl bg-sunk/70 p-3 text-[13.5px]">
            <span className="text-ink3">Biggest single spend: </span>
            <span className="font-semibold">{r.biggest.merchant}</span> · <span className="num font-semibold">{rupees(r.biggest.amount)}</span> <span className="text-ink3">on {r.biggest.date}</span>
          </p>
        )}

        {r.planProgress.length > 0 && (
          <div className="mt-4">
            <p className="eyebrow mb-2">Plans that moved</p>
            <ul className="flex flex-col gap-1.5 text-[14px]">
              {r.planProgress.slice(0, 3).map((p) => (
                <li key={p.name} className="flex justify-between">
                  <span>
                    {p.icon} {p.name}
                  </span>
                  <span className="num font-semibold text-pos">+{Math.round(p.delta * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 grid gap-3">
          {r.wins.length > 0 && (
            <div>
              <p className="eyebrow mb-1.5">What went well</p>
              <ul className="flex flex-col gap-1.5">
                {r.wins.map((w) => (
                  <li key={w} className="flex gap-2 text-[13.5px] leading-snug">
                    <Icon name="check" size={15} className="mt-0.5 shrink-0 text-pos" strokeWidth={2.6} />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.notice.length > 0 && (
            <div>
              <p className="eyebrow mb-1.5">Worth noticing</p>
              <ul className="flex flex-col gap-1.5">
                {r.notice.map((w) => (
                  <li key={w} className="flex gap-2 text-[13.5px] leading-snug">
                    <Icon name="info" size={15} className="mt-0.5 shrink-0 text-warn" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="rounded-xl bg-accent-soft p-3 text-[13.5px] leading-snug">
            <span className="font-semibold">Next month: </span>
            {r.adjustment}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn-quiet min-h-[44px] text-[14px]" onClick={() => ui.openSheet({ type: 'recap', month })}>
            Full recap
          </button>
          <button
            type="button"
            className="btn-quiet min-h-[44px] text-[14px]"
            onClick={() => {
              ui.closeAllSheets();
              ui.resetTo('you', { name: 'history', year: Number(month.slice(0, 4)) });
            }}
          >
            Spending history
          </button>
        </div>
      </div>
    </div>
  );
}

function YearCard({ year }: { year: number }) {
  const { state } = useStore();
  const y = useMemo(() => yearSummary(state, year), [state, year]);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] font-semibold">{year}</p>
        <p className="num text-[17px] font-semibold">{rupees(y.spent)}</p>
      </div>
      <div className="mt-3">
        <MonthBars months={y.months} selected={year === Number(state.today.slice(0, 4)) ? state.today.slice(0, 8) + '01' : undefined} avg={y.avgSpent} />
      </div>
      {y.categories.length > 0 && (
        <div className="mt-4">
          <Bars rows={y.categories.slice(0, 5).map((c, i) => ({ label: c.name, value: c.amount, highlight: i === 0 }))} />
        </div>
      )}
    </div>
  );
}

function LinkButton({ label, to }: { label: string; to: AILink }) {
  const ui = useUI();
  return (
    <button
      type="button"
      className="btn-quiet w-full justify-between"
      onClick={() => {
        if (to.kind === 'sheet') {
          ui.openSheet(to.sheet as SheetSpec);
          return;
        }
        ui.closeAllSheets();
        ui.resetTo(to.tab, to.route as Route | undefined);
      }}
    >
      {label} <Icon name="chevron" size={16} />
    </button>
  );
}

export function AIInsight({ block, msgId, index = 0 }: { block: AIBlock; msgId?: string; index?: number }) {
  if (block.type === 'afford') return <AffordCard r={block.result} />;
  if (block.type === 'action') return <ActionCard block={block} msgId={msgId} index={index} />;
  if (block.type === 'report') return <ReportCard month={block.month} />;
  if (block.type === 'year') return <YearCard year={block.year} />;
  if (block.type === 'link') return <LinkButton label={block.label} to={block.to} />;
  if (block.type === 'compare') {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4">
        <Bars rows={block.rows} />
        {block.delta != null && Number.isFinite(block.delta) && (
          <p className={`num mt-3 text-[14px] font-semibold ${block.delta > 0 ? 'text-warn' : 'text-pos'}`}>
            {block.delta > 0 ? '+' : '−'}
            {Math.abs(block.delta * 100).toFixed(1)}% {block.delta > 0 ? 'more' : 'less'}
          </p>
        )}
      </div>
    );
  }
  if (block.type === 'progress') {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-2 flex justify-between text-[14.5px] font-semibold">
          <span>{block.label}</span>
          <span className="num">{Math.round(block.value * 100)}%</span>
        </div>
        <ProgressBar value={block.value} label={`${block.label} ${Math.round(block.value * 100)}%`} />
        <p className="num mt-2 text-[13px] text-ink3">{block.sub}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
      {block.rows.map((r, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 py-2.5">
          <span className="min-w-0">
            <span className="block truncate text-[14.5px]">{r.label}</span>
            {r.sub && <span className="block text-[12.5px] text-ink3">{r.sub}</span>}
          </span>
          <span className="num shrink-0 text-[14.5px] font-semibold">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function AIMessage({ id, role, text, answer, onFollow, typing }: { id?: string; role: 'user' | 'ai'; text: string; answer?: AIAnswer; onFollow: (q: string) => void; typing?: boolean }) {
  if (role === 'user')
    return (
      <div className="flex animate-toast justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-bg">{text}</p>
      </div>
    );
  if (typing)
    return (
      <div className="flex items-center gap-2.5" aria-label="PULSE AI is typing">
        <span className="grid h-7 w-7 shrink-0 animate-pulse place-items-center rounded-full bg-accent text-on-accent" aria-hidden="true">
          <Icon name="spark" size={14} />
        </span>
        <span className="flex gap-1 rounded-2xl rounded-bl-md bg-surface px-3.5 py-3 shadow-soft" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 animate-dot rounded-full bg-ink3" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </span>
      </div>
    );
  return (
    <div className="flex animate-rise gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-on-accent" aria-hidden="true">
        <Icon name="spark" size={14} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-[15.5px] leading-snug">{text}</p>
        {answer?.blocks?.map((b, i) => <AIInsight key={i} block={b} msgId={id} index={i} />)}
        {answer?.followups && (
          <div className="flex flex-wrap gap-2">
            {answer.followups.map((f) => (
              <button key={f} type="button" className="chip text-[13px]" onClick={() => onFollow(f)}>
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AIChat({ compact }: { compact?: boolean }) {
  const { state } = useStore();
  const ui = useUI();
  const [q, setQ] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    if (/weekend budget card|share.*budget/i.test(text)) {
      ui.openSheet({ type: 'share-card', preset: 'weekend' });
      return;
    }
    if (state.mode === 'personal') track('ai');
    const answer = askPulse(state, text);
    const aiId = uid('m');
    ui.setChat((c) => [...c, { id: uid('m'), role: 'user', text }, { id: aiId, role: 'ai', text: '', typing: true }]);
    setQ('');
    // A short "typing" beat before the answer lands, so it reads like a reply.
    const wait = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.min(900, 380 + answer.text.length * 2);
    window.setTimeout(() => ui.setChat((c) => c.map((m) => (m.id === aiId ? { ...m, text: answer.text, answer, typing: false } : m))), wait);
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [ui.chat]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ui.chat.length === 0 ? (
          <div className={compact ? 'pt-1' : 'pt-2'}>
            <p className="text-[15px] text-ink2">Ask about your money. Answers come from your own transactions, plans and bills.</p>
            <div className="mt-4 flex flex-col gap-2">
              {starterQuestions(state).slice(0, compact ? 5 : 8).map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} className="tap flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-[14.5px] hover:border-ink3/40">
                  <Icon name="spark" size={15} className="shrink-0 text-accent-ink" /> {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5 pb-2" aria-live="polite">
            {ui.chat.map((m) => (
              <AIMessage key={m.id} id={m.id} typing={m.typing} role={m.role} text={m.text} answer={m.answer} onFollow={ask} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <form
        className="mt-3 flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface p-1.5 pl-4 focus-within:border-accent"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <label htmlFor={compact ? 'ai-input-panel' : 'ai-input'} className="sr-only">
          Ask PULSE AI
        </label>
        <input id={compact ? 'ai-input-panel' : 'ai-input'} className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-ink3 focus:outline-none" placeholder="Ask about your money…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <button type="submit" className="tap grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent disabled:opacity-40" disabled={!q.trim()} aria-label="Ask">
          <Icon name="send" size={17} />
        </button>
      </form>
    </div>
  );
}
