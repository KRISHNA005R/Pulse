import { useMemo, useState } from 'react';
import { CURRENCIES, currencyOf, scaled, sym } from '../lib/currency';
import { BrandSignature } from '../components/ui/BrandSignature';
import { BUILD_TIME, checkForUpdate, updateReady } from '../lib/update';
import { INSURANCE_ON } from '../lib/features';
import { Submark } from '../components/ui/Submark';
import { useStore } from '../store/store';
import { useUI, type Route } from '../store/ui';
import { detections, incomeThisMonth, insuranceTotals, investedTotal, investmentMonthly, investmentTotals, netWorth, payoffInterest, payoffMonths, recurringTotals, safeToSpend, sipProjection } from '../lib/finance';
import { addMonths, daysBetween, endOfMonth, fmtDate, fmtMonthYear, incomeLabel, ordinal, monthName, parseDate, relDay, rupees, rupeesShort, startOfMonth } from '../lib/format';
import { NavRow, SectionHeader, Segmented, StatusPill, Toggle, TopNavigation, EmptyState, PersonAvatar, CategoryMark, ProgressBar, Field } from '../components/ui/bits';
import { SubscriptionRow, TransactionList } from '../components/money';
import { BackupPanel } from '../components/Forms';
import { Icon } from '../components/ui/Icon';
import { useInstall } from '../lib/pwa';
import { syncSummary } from './Sync';

export function YouScreen() {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const nw = useMemo(() => netWorth(state), [state]);
  const rec = recurringTotals(state);
  const ins = insuranceTotals(state);
  const go = (r: Route) => ui.push(r);
  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <PersonAvatar me size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="display text-[28px] leading-tight">{state.user.fullName}</h1>
          <p className="text-[14px] text-ink3">
            {state.mode === 'demo' ? `Demo data as of ${fmtDate(state.today, true)}` : `${state.user.handle} · your data stays on this device`}
          </p>
        </div>
      </div>

      <button type="button" onClick={() => ui.openSheet({ type: 'recap' })} className="tap mb-8 flex w-full items-center gap-4 rounded-3xl bg-accent p-5 text-left text-on-accent">
        <span className="min-w-0 flex-1">
          <span className="eyebrow block !text-current opacity-75">Monthly recap</span>
          <span className="display mt-1 block text-[24px]">Your {monthName(state.today)}</span>
          <span className="mt-0.5 block text-[14px] opacity-85">Wins, things to notice and one easy change</span>
        </span>
        <Icon name="chevron" size={22} />
      </button>

      <section aria-labelledby="you-money" className="mb-8">
        <SectionHeader id="you-money" title="Money" />
        <NavRow icon="chart" label="Spending history" sub="Yearly report, month by month" onClick={() => go({ name: 'history' })} />
        <NavRow icon="trend" label="Net worth" sub="Everything you own minus what you owe" value={rupeesShort(nw.total)} onClick={() => go({ name: 'networth' })} />
        <NavRow icon="piggy" label="Investments & SIPs" sub={investmentTotals(state).count ? `${investmentTotals(state).count} active · deducted automatically` : 'Add SIPs, RDs, PPF or NPS'} value={investmentTotals(state).monthly ? `${rupees(investmentTotals(state).monthly)}/mo` : undefined} onClick={() => go({ name: 'investments' })} />
        {INSURANCE_ON && <NavRow icon="shield" label="Insurance" sub={ins.count ? `${ins.count} ${ins.count === 1 ? 'policy' : 'policies'}${ins.next ? ` · next due ${fmtDate(ins.next.nextDate)}` : ''}` : 'Health, term life, bike or car premiums'} value={ins.yearly ? `${rupeesShort(ins.yearly)}/yr` : undefined} onClick={() => go({ name: 'insurance' })} />}
        <NavRow icon="repeat" label="Subscriptions & bills" sub={`${rec.count} recurring payments`} value={`${rupees(rec.monthly)}/mo`} onClick={() => go({ name: 'subscriptions' })} />
        <NavRow icon="briefcase" label="Income" sub="Salary, freelance and side income" onClick={() => go({ name: 'income' })} />
        <NavRow icon="card" label="Credit cards" sub={`${state.cards.length} cards`} onClick={() => go({ name: 'cards' })} />
        <NavRow icon="bank" label="Debt" sub="Loans and payoff plans" onClick={() => go({ name: 'debt' })} />
        <NavRow icon="wallet" label="Accounts" sub={state.accounts.map((a) => a.name).slice(0, 3).join(', ')} onClick={() => go({ name: 'accounts' })} />
        <NavRow icon="share" label="Budget out loud" sub="Share a budget card, never your balance" onClick={() => ui.openSheet({ type: 'share-card' })} />
      </section>

      <section aria-labelledby="you-prefs" className="mb-8">
        <SectionHeader id="you-prefs" title="Preferences" />
        <NavRow icon="user" label="Profile" onClick={() => go({ name: 'settings', section: 'profile' })} />
        <NavRow icon="tags" label="Categories" sub={`${state.categories.filter((c) => c.kind === 'expense').length} categories`} onClick={() => go({ name: 'categories' })} />
        <NavRow icon="sliders" label="Budget preferences" sub={`Safety buffer ${rupees(state.settings.buffer)}`} onClick={() => go({ name: 'settings', section: 'budget-prefs' })} />
        <NavRow icon="bell" label="Notifications" onClick={() => go({ name: 'settings', section: 'notifications' })} />
        <NavRow icon="palette" label="Appearance" sub={state.settings.theme === 'system' ? 'Match device' : state.settings.theme === 'dark' ? 'Dark' : 'Light'} onClick={() => go({ name: 'settings', section: 'appearance' })} />
        <NavRow icon="rupee" label="Currency" sub={`${currencyOf(state.settings.currency).name} (${currencyOf(state.settings.currency).symbol})`} onClick={() => go({ name: 'settings', section: 'currency' })} />
      </section>

      <section aria-labelledby="you-learn" className="mb-8">
        <SectionHeader id="you-learn" title="Learn PULSE" />
        {state.mode === 'demo' ? (
          <NavRow emoji="🧭" label="Demo tour" sub="What to try, step by step" onClick={() => go({ name: 'demo-guide' })} />
        ) : (
          <NavRow emoji="🧭" label="Explore demo data" sub="Try every feature with a sample month" onClick={() => go({ name: 'demo-guide' })} />
        )}
      </section>

      <InstallCard />

      <section aria-labelledby="you-privacy" className="mb-8">
        <SectionHeader id="you-privacy" title="Privacy & data" />
        <NavRow icon="lock" label="Security" onClick={() => go({ name: 'settings', section: 'security' })} />
        <NavRow icon="shield" label="Data & privacy" onClick={() => go({ name: 'settings', section: 'privacy' })} />
        <NavRow icon="reset" label="Sync my devices" sub={syncSummary(store.sync, state.mode)} onClick={() => go({ name: 'sync' })} />
        <NavRow icon="download" label="Backup code & export" sub="Copy your data as a code, or as a spreadsheet" onClick={() => go({ name: 'settings', section: 'export' })} />
        <NavRow icon="link" label="Connected accounts" sub="None connected" onClick={() => go({ name: 'settings', section: 'connected' })} />
        <NavRow icon="message" label="Send feedback" sub="Spill the tea: bugs, ideas, vibes" onClick={() => go({ name: 'feedback' })} />
        <a href="/about/" className="row-btn min-h-[56px]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sunk text-ink2" aria-hidden="true">
            <Icon name="help" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">How PULSE works</span>
            <span className="block text-[13px] text-ink3">FAQ, privacy and how safe-to-spend is calculated</span>
          </span>
          <Icon name="chevron" size={18} className="shrink-0 text-ink3" />
        </a>
        <button type="button" onClick={() => ui.openSheet({ type: 'erase' })} className="row-btn min-h-[56px] text-neg">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neg/10" aria-hidden="true">
            <Icon name="trash" size={18} />
          </span>
          <span className="flex-1 text-[15px] font-semibold">Erase all data</span>
        </button>
      </section>

      <BrandSignature />
      <AppVersion />
    </div>
  );
}

/** Which build this is, and a way to pull the newest one on an installed app. */
function AppVersion() {
  const store = useStore();
  const [checking, setChecking] = useState(false);
  const built = BUILD_TIME ? new Date(BUILD_TIME).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 text-center text-[12px] text-ink3">
      {built && <span>Version of {built}</span>}
      <button
        type="button"
        className="font-semibold text-accent underline-offset-2 hover:underline disabled:opacity-50"
        disabled={checking}
        onClick={async () => {
          setChecking(true);
          const found = await checkForUpdate(true);
          setChecking(false);
          if (found) store.toast({ text: 'Getting the new version…', emoji: '✨' });
          else if (!updateReady()) store.toast({ text: "You're on the latest version." });
        }}
      >
        {checking ? 'Checking…' : 'Check for updates'}
      </button>
    </p>
  );
}

// ------------------------------------------------------------------
// Subscriptions & bills
// ------------------------------------------------------------------
export function SubscriptionsScreen() {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const subs = state.subscriptions.filter((s) => s.kind === 'subscription');
  const bills = state.subscriptions.filter((s) => s.kind === 'bill');
  const subT = recurringTotals(state, 'subscription');
  const allT = recurringTotals(state);
  const dets = detections(state);
  const week = state.subscriptions.filter((s) => (s.status === 'active' || s.status === 'unknown') && daysBetween(state.today, s.nextDate) >= 0 && daysBetween(state.today, s.nextDate) <= 7);

  return (
    <div>
      <TopNavigation
        title="Subscriptions & bills"
        onBack={ui.pop}
        right={
          <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={() => ui.openSheet({ type: 'sub-form' })}>
            <Icon name="plus" size={16} /> Add
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface p-4">
        <div>
          <p className="eyebrow">Monthly recurring</p>
          <p className="num-hero mt-1 text-[28px] leading-none">{rupees(allT.monthly)}</p>
          <p className="mt-1 text-[13px] text-ink3">Subscriptions alone: {rupees(subT.monthly)}</p>
        </div>
        <div>
          <p className="eyebrow">Per year</p>
          <p className="num-hero mt-1 text-[28px] leading-none">{rupeesShort(allT.yearly)}</p>
          <p className="mt-1 text-[13px] text-ink3">{week.length} due this week</p>
        </div>
      </div>

      {dets.length > 0 && (
        <section className="mt-6 flex flex-col gap-2" aria-label="Detected">
          {dets.map((d) => (
            <div key={d.key} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5">
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${d.kind === 'duplicate' ? 'bg-warn/15 text-warn' : 'bg-accent-soft text-accent-ink'}`}>
                <Icon name={d.kind === 'duplicate' ? 'info' : 'repeat'} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold">{d.kind === 'duplicate' ? 'Possible duplicate charge' : 'Looks recurring'}</p>
                <p className="text-[13.5px] text-ink2">{d.text}</p>
                <div className="mt-2 flex gap-2">
                  {d.kind === 'recurring' ? (
                    <button type="button" className="btn-quiet min-h-[34px] px-3 text-[13px]" onClick={() => { ui.openSheet({ type: 'sub-form', preset: { name: d.merchant, amount: d.amount, category: d.category } }); store.dismissDetection(d.key); }}>
                      Track it
                    </button>
                  ) : (
                    <button type="button" className="btn-quiet min-h-[34px] px-3 text-[13px]" onClick={() => { ui.setActivityFilter({ chip: 'all', query: d.merchant, range: 'all', account: 'all' }); ui.resetTo('activity'); }}>
                      Review
                    </button>
                  )}
                  <button type="button" className="btn-ghost min-h-[34px] px-3 text-[13px]" onClick={() => store.dismissDetection(d.key)}>
                    {d.kind === 'duplicate' ? "It's fine" : 'Not recurring'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="mt-6">
        <Segmented label="View" size="sm" value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]} />
      </div>

      {view === 'calendar' ? (
        <RenewalCalendar />
      ) : state.subscriptions.length === 0 ? (
        <EmptyState icon="repeat" title="No recurring payments detected yet." body="Add subscriptions and bills so they're set aside before payday." action={{ label: 'Add one', onClick: () => ui.openSheet({ type: 'sub-form' }) }} />
      ) : (
        <>
          <section className="mt-6" aria-labelledby="subs-h">
            <SectionHeader id="subs-h" title={`Subscriptions · ${rupees(subT.monthly)}/month`} />
            {subs.sort((a, b) => b.amount - a.amount).map((s) => (
              <SubscriptionRow key={s.id} sub={s} onClick={() => ui.openSheet({ type: 'sub-form', subId: s.id })} />
            ))}
          </section>
          <section className="mt-6" aria-labelledby="bills-h">
            <SectionHeader id="bills-h" title="Bills" />
            {bills.sort((a, b) => a.nextDate.localeCompare(b.nextDate)).map((s) => (
              <SubscriptionRow key={s.id} sub={s} onClick={() => ui.openSheet({ type: 'sub-form', subId: s.id })} />
            ))}
          </section>
          <p className="mt-4 px-1 text-[13px] text-ink3">Tap any payment to mark it active, paused, cancelled or unsure.</p>
        </>
      )}
    </div>
  );
}

function RenewalCalendar() {
  const { state } = useStore();
  const ui = useUI();
  const [offset, setOffset] = useState(0);
  const month = addMonths(startOfMonth(state.today), offset);
  const first = parseDate(month);
  const lead = (first.getDay() + 6) % 7;
  const days = parseDate(endOfMonth(month)).getDate();
  const live = state.subscriptions.filter((s) => s.status === 'active' || s.status === 'unknown');
  // project each monthly payment into the visible month
  const byDay = new Map<number, typeof live>();
  live.forEach((s) => {
    let d = s.nextDate;
    while (d < month) d = addMonths(d, s.cycle === 'yearly' ? 12 : 1);
    if (d.slice(0, 7) === month.slice(0, 7)) {
      const day = parseDate(d).getDate();
      byDay.set(day, [...(byDay.get(day) ?? []), s]);
    }
  });
  const [sel, setSel] = useState<number | null>(null);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const todayDay = state.today.slice(0, 7) === month.slice(0, 7) ? parseDate(state.today).getDate() : -1;
  const selList = sel ? byDay.get(sel) ?? [] : [];
  const monthTotal = [...byDay.values()].flat().reduce((a, s) => a + s.amount, 0);
  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="tap grid h-10 w-10 place-items-center rounded-full hover:bg-sunk" onClick={() => { setOffset(offset - 1); setSel(null); }} aria-label="Previous month" disabled={offset <= 0}>
          <Icon name="back" size={20} />
        </button>
        <p className="text-[15px] font-semibold">
          {monthName(month)} · <span className="num text-ink2">{rupees(monthTotal)}</span>
        </p>
        <button type="button" className="tap grid h-10 w-10 place-items-center rounded-full hover:bg-sunk" onClick={() => { setOffset(offset + 1); setSel(null); }} aria-label="Next month">
          <Icon name="chevron" size={20} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`Renewals in ${monthName(month)}`}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="pb-1 text-[11.5px] font-semibold text-ink3" aria-hidden="true">
            {d}
          </span>
        ))}
        {cells.map((d, i) =>
          d == null ? (
            <span key={`e${i}`} />
          ) : (
            <button
              key={d}
              type="button"
              onClick={() => setSel(d)}
              aria-label={`${d} ${monthName(month)}${byDay.get(d) ? `: ${byDay.get(d)!.map((s) => `${s.name} ${rupees(s.amount)}`).join(', ')}` : ''}`}
              aria-pressed={sel === d}
              className={`tap flex aspect-square flex-col items-center justify-center rounded-xl text-[14px] ${sel === d ? 'bg-ink text-bg' : d === todayDay ? 'bg-accent-soft font-semibold text-accent-ink' : 'hover:bg-sunk'}`}
            >
              <span className="num">{d}</span>
              <span className="mt-0.5 flex h-1.5 gap-0.5">
                {(byDay.get(d) ?? []).slice(0, 3).map((s) => (
                  <span key={s.id} className={`h-1.5 w-1.5 rounded-full ${sel === d ? 'bg-bg' : s.kind === 'bill' ? 'bg-ink2' : 'bg-accent'}`} />
                ))}
              </span>
            </button>
          ),
        )}
      </div>
      <p className="mt-2 flex gap-4 text-[12px] text-ink3">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Subscription
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-ink2" /> Bill
        </span>
      </p>
      {sel && (
        <div className="mt-4 animate-rise">
          {selList.length ? (
            selList.map((s) => <SubscriptionRow key={s.id} sub={s} onClick={() => ui.openSheet({ type: 'sub-form', subId: s.id })} />)
          ) : (
            <p className="px-1 text-[14px] text-ink3">Nothing renews on {sel} {monthName(month)}.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Net worth
// ------------------------------------------------------------------
export function NetWorthScreen() {
  const { state } = useStore();
  const ui = useUI();
  const nw = useMemo(() => netWorth(state), [state]);
  const h = nw.history;
  const W = 320,
    H = 120,
    P = 8;
  const min = Math.min(...h.map((x) => x.value), 0);
  const max = Math.max(...h.map((x) => x.value), 0);
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, h.length - 1);
  const y = (v: number) => P + ((max - v) * (H - 2 * P)) / Math.max(1, max - min);
  const path = h.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(h.length - 1)},${H - P} L${x(0)},${H - P} Z`;
  const change = nw.total - h[0].value;
  return (
    <div>
      <TopNavigation title="Net worth" onBack={ui.pop} />
      <section className="rounded-3xl border border-line bg-surface p-5" aria-labelledby="nw-total">
        <p id="nw-total" className="eyebrow">
          Total net worth
        </p>
        <p className="num-hero mt-1 text-[39px] leading-none">{rupees(nw.total)}</p>
        {h.length < 2 ? (
          <p className="mt-2 text-[14px] text-ink2">Your trend line starts after your first full month. PULSE saves a snapshot each month.</p>
        ) : (
          <p className={`mt-1 text-[14px] ${change >= 0 ? 'text-pos' : 'text-ink2'}`}>
            {change >= 0 ? '▲' : '▼'} {rupees(Math.abs(change))} since {monthName(h[0].month + '-01')}
          </p>
        )}
        {h.length >= 2 && <figure className="mt-5">
          <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label={`Net worth by month: ${h.map((p) => `${monthName(p.month + '-01')} ${rupees(p.value)}`).join(', ')}`}>
            <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="rgb(var(--line))" strokeDasharray="3 3" />
            <path d={area} fill="rgb(var(--accent) / 0.1)" />
            <path d={path} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {h.map((p, i) => (
              <g key={p.month}>
                {i === h.length - 1 && <circle cx={x(i)} cy={y(p.value)} r="4.5" fill="rgb(var(--accent))" stroke="rgb(var(--surface))" strokeWidth="2" />}
                <text x={x(i)} y={H + 14} textAnchor={i === 0 ? 'start' : i === h.length - 1 ? 'end' : 'middle'} fontSize="10.5" fill="rgb(var(--ink3))">
                  {monthName(p.month + '-01').slice(0, 3)}
                </text>
              </g>
            ))}
            <text x={W - P} y={y(0) - 4} textAnchor="end" fontSize="10" fill="rgb(var(--ink3))">
              {sym()}0
            </text>
          </svg>
          <figcaption className="sr-only">Net worth by month, from {monthName(h[0].month + '-01')} to now.</figcaption>
        </figure>}
      </section>
      <section className="mt-8" aria-labelledby="nw-break">
        <SectionHeader id="nw-break" title="Breakdown" />
        <ul className="divide-y divide-line">
          {nw.rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between py-3">
              <span className="text-[15px]">{r.label}</span>
              <span className={`num text-[15.5px] font-semibold ${r.value < 0 ? 'text-ink2' : ''}`}>{rupees(r.value)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between py-3">
            <span className="text-[15px] font-semibold">Assets − liabilities</span>
            <span className="num text-[15.5px] font-semibold">
              {rupees(nw.assets)} − {rupees(nw.liabilities)}
            </span>
          </li>
        </ul>
        <p className="mt-3 text-[13px] text-ink3">Plan savings count as savings. Investments use the last value you entered.</p>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------
// Income
// ------------------------------------------------------------------
export function IncomeScreen() {
  const { state } = useStore();
  const ui = useUI();
  const ms = startOfMonth(state.today);
  const received = state.transactions.filter((t) => t.type === 'income' && t.date >= ms);
  const m = incomeThisMonth(state);
  const byId = new Map(m.sources.map((x) => [x.income.id, x]));
  const sts = safeToSpend(state);
  const summary =
    m.expected === 0 ? `${rupees(m.total)} received this month.` : m.pending > 0 ? `${rupees(m.pending)} still expected this month.` : 'All expected income received this month.';
  const sourceSub = (i: (typeof state.incomes)[number]) => {
    if (i.cycle !== 'monthly') return `${incomeLabel(i.kind)} · irregular, counted when it lands`;
    const x = byId.get(i.id);
    if (!x) return `${incomeLabel(i.kind)} · monthly, next ${relDay(i.nextDate!, state.today).toLowerCase()}`;
    if (x.received > 0) return `Received ✓ · next ${fmtDate(x.next)}`;
    if (x.date < state.today) return `Due ${fmtDate(x.date)} · not logged yet`;
    return x.date === state.today ? 'Due today' : `Next ${fmtDate(x.date)}${daysBetween(state.today, x.date) <= 6 ? ` · ${relDay(x.date, state.today).toLowerCase()}` : ''}`;
  };
  return (
    <div>
      <TopNavigation title="Income" onBack={ui.pop} right={<button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={() => ui.openSheet({ type: 'income-form' })}><Icon name="plus" size={16} /> Source</button>} />
      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-line bg-surface p-4">
        <div>
          <p className="text-[12.5px] text-ink3">Expected</p>
          <p className="num text-[20px] font-semibold">{rupeesShort(m.expected)}</p>
        </div>
        <div>
          <p className="text-[12.5px] text-ink3">Received</p>
          <p className="num text-[20px] font-semibold text-pos">{rupeesShort(m.total)}</p>
        </div>
        <div>
          <p className="text-[12.5px] text-ink3">Next payday</p>
          <p className="text-[20px] font-semibold">{fmtDate(sts.payday)}</p>
        </div>
      </div>
      <div className="mt-3 px-1">
        {m.expected > 0 && <ProgressBar value={m.fixedReceived / m.expected} label={`${Math.round((m.fixedReceived / m.expected) * 100)}% of expected income received`} tone="pos" height={6} />}
        <p className="mt-1.5 text-[13px] text-ink3">{summary}</p>
      </div>
      <section className="mt-8" aria-labelledby="inc-src">
        <SectionHeader id="inc-src" title="Sources" />
        {state.incomes.length === 0 && <p className="px-1 py-3 text-[14px] text-ink3">No income sources. Add one so PULSE knows when your next payday is.</p>}
        {state.incomes.map((i) => (
          <NavRow key={i.id} icon={i.kind === 'salary' ? 'briefcase' : 'spark'} label={i.name} sub={sourceSub(i)} value={rupees(i.expected)} onClick={() => ui.openSheet({ type: 'income-form', incomeId: i.id })} />
        ))}
        {state.incomes.length > 0 && <p className="mt-1 px-1 text-[12.5px] text-ink3">Tap a source to change it or remove it.</p>}
      </section>
      <section className="mt-8" aria-labelledby="inc-rec">
        <SectionHeader id="inc-rec" title="Received this month" action={{ label: 'Log income', onClick: () => ui.openSheet({ type: 'composer', preset: { type: 'income' } }) }} />
        <ul>
          {received.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-2 py-2.5">
              <CategoryMark state={state} category={t.category} size={38} />
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">{t.merchant}</span>
                <span className="block text-[13px] text-ink3">{fmtDate(t.date)}</span>
              </span>
              <span className="num text-[15px] font-semibold text-pos">{rupees(t.amount, { sign: true })}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------
// Credit cards
// ------------------------------------------------------------------
export function CardsScreen() {
  const { state } = useStore();
  const ui = useUI();
  return (
    <div>
      <TopNavigation
        title="Credit cards"
        onBack={ui.pop}
        sub="A tracker, not a bank. Update balances any time."
        right={
          <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={() => ui.openSheet({ type: 'card-form' })}>
            <Icon name="plus" size={16} /> Card
          </button>
        }
      />
      {state.cards.length === 0 && <EmptyState icon="card" title="No cards added." body="Add a credit card to track its balance, limit and due date. Only the last 4 digits, never the full number." action={{ label: 'Add a card', onClick: () => ui.openSheet({ type: 'card-form' }) }} />}
      <div className="flex flex-col gap-4">
        {state.cards.map((c) => {
          const util = c.limit > 0 ? c.balance / c.limit : 0;
          const band = util < 0.3 ? { s: 'good' as const, t: 'Low use' } : util < 0.6 ? { s: 'close' as const, t: 'Moderate' } : { s: 'over' as const, t: 'High use' };
          return (
            <article key={c.id} className="rounded-3xl border border-line bg-surface p-5" aria-label={`${c.issuer} ${c.name}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="display text-[18px]">
                    {c.issuer} {c.name}
                  </p>
                  <p className="num text-[13px] text-ink3">•••• {c.last4}</p>
                </div>
                <span className="flex items-center gap-1">
                  {c.status === 'due' ? <StatusPill status="close">Payment due {fmtDate(c.dueDate)}</StatusPill> : c.status === 'paid' ? <StatusPill status="good">Paid</StatusPill> : <StatusPill status="neutral">Statement on the {ordinal(c.statementDay)}</StatusPill>}
                  <button type="button" className="tap grid h-9 w-9 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label={`Edit ${c.name}`} onClick={() => ui.openSheet({ type: 'card-form', cardId: c.id })}>
                    <Icon name="pencil" size={16} />
                  </button>
                </span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[12.5px] text-ink3">Current balance</p>
                  <p className="num-hero text-[28px] leading-none">{rupees(c.balance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[12.5px] text-ink3">Available</p>
                  <p className="num text-[17px] font-semibold">{rupees(c.limit - c.balance)}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-[12.5px]">
                  <span className="text-ink3">Using {Math.round(util * 100)}% of {rupeesShort(c.limit)} limit</span>
                  <StatusPill status={band.s}>{band.t}</StatusPill>
                </div>
                <ProgressBar value={util} label={`Credit utilisation ${Math.round(util * 100)}%`} tone={band.s === 'good' ? 'ink' : 'warn'} height={6} marker={0.3} />
                <p className="mt-1.5 text-[12px] text-ink3">Keeping use under 30% (the tick) is gentler on your credit score.</p>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-[13px]">
                <div>
                  <dt className="text-ink3">Statement</dt>
                  <dd className="font-semibold">Every {ordinal(c.statementDay)}</dd>
                </div>
                <div>
                  <dt className="text-ink3">Due</dt>
                  <dd className="font-semibold">{fmtDate(c.dueDate)}</dd>
                </div>
                <div>
                  <dt className="text-ink3">Minimum</dt>
                  <dd className="num font-semibold">{c.minDue ? rupees(c.minDue) : '—'}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Debt
// ------------------------------------------------------------------
export function DebtScreen() {
  const { state } = useStore();
  const ui = useUI();
  const [extra, setExtra] = useState(0);
  return (
    <div>
      <TopNavigation
        title="Debt"
        onBack={ui.pop}
        sub="Optional. Only you see this."
        right={
          <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={() => ui.openSheet({ type: 'debt-form' })}>
            <Icon name="plus" size={16} /> Loan
          </button>
        }
      />
      {state.debts.length === 0 && <EmptyState icon="bank" title="No debts tracked." body="Add a loan to see when you'll be debt-free, and what paying a little extra saves." action={{ label: 'Add a loan', onClick: () => ui.openSheet({ type: 'debt-form' }) }} />}
      {state.debts.map((d) => {
        const base = payoffMonths(d.remaining, d.rate, d.minPayment);
        const faster = payoffMonths(d.remaining, d.rate, d.minPayment + extra);
        const intBase = payoffInterest(d.remaining, d.rate, d.minPayment);
        const intFast = payoffInterest(d.remaining, d.rate, d.minPayment + extra);
        const done = faster ? addMonths(state.today, faster) : null;
        return (
          <article key={d.id} className="mb-4 rounded-3xl border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="display text-[18px]">
                {d.name} · {d.lender}
              </p>
              <button type="button" className="tap -mr-2 -mt-1 grid h-9 w-9 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label={`Edit ${d.name}`} onClick={() => ui.openSheet({ type: 'debt-form', debtId: d.id })}>
                <Icon name="pencil" size={16} />
              </button>
            </div>
            <p className="num-hero mt-3 text-[33px] leading-none">{rupees(d.remaining)}</p>
            <p className="text-[13px] text-ink3">remaining</p>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
              <div>
                <dt className="text-ink3">EMI</dt>
                <dd className="num text-[15px] font-semibold">{rupees(d.minPayment)}</dd>
              </div>
              <div>
                <dt className="text-ink3">Due</dt>
                <dd className="text-[15px] font-semibold">{ordinal(d.dueDay)} monthly</dd>
              </div>
              <div>
                <dt className="text-ink3">Interest</dt>
                <dd className="num text-[15px] font-semibold">{d.rate}% p.a.</dd>
              </div>
            </dl>
            <div className="mt-5 rounded-2xl bg-sunk/70 p-4">
              <p className="text-[14px] font-semibold">Payoff projection</p>
              <label htmlFor={`extra-${d.id}`} className="mt-3 flex justify-between text-[13.5px] text-ink2">
                <span>Extra each month</span>
                <span className="num font-semibold text-ink">+{rupees(extra)}</span>
              </label>
              <input id={`extra-${d.id}`} type="range" min={0} max={5000} step={250} value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="mt-2 w-full accent-[rgb(var(--accent))]" />
              {faster ? (
                <p className="mt-3 text-[15px]">
                  Debt-free in <span className="num font-semibold">{faster} months</span>
                  {done && <> ({monthName(done)} {done.slice(0, 4)})</>}.
                </p>
              ) : (
                <p className="mt-3 text-[15px]">At this payment the interest grows faster than you pay it off. Try a bigger amount.</p>
              )}
              {extra > 0 && base && faster && (
                <p className="mt-1 text-[14px] text-pos">
                  {base - faster} months sooner and about {rupees(intBase - intFast)} less interest.
                </p>
              )}
              <p className="mt-1 text-[12.5px] text-ink3">Estimate assumes a fixed rate and on-time payments.</p>
            </div>
          </article>
        );
      })}
      <p className="mt-6 px-1 text-[13.5px] text-ink3">
        {state.cards.length > 0 ? `Card balances (${rupees(state.cards.reduce((a, c) => a + c.balance, 0))}) are tracked under Credit cards.` : 'Credit cards are tracked separately under Credit cards.'}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------
// Accounts & categories
// ------------------------------------------------------------------
export function AccountsScreen() {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const [editing, setEditing] = useState<string | null>(null);
  const [val, setVal] = useState('');
  return (
    <div>
      <TopNavigation
        title="Accounts"
        onBack={ui.pop}
        sub="Balances are entered by you. No bank logins, ever."
        right={
          <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={() => ui.openSheet({ type: 'account-form' })}>
            <Icon name="plus" size={16} /> Account
          </button>
        }
      />
      <ul className="divide-y divide-line">
        {state.accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunk text-ink2">
              <Icon name={a.type === 'investment' ? 'trend' : a.type === 'cash' ? 'wallet' : 'bank'} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <button type="button" className="block text-left text-[15px] font-semibold hover:underline" onClick={() => ui.openSheet({ type: 'account-form', accountId: a.id })}>
                {a.name}
              </button>
              <span className="block text-[13px] text-ink3">
                {a.institution}
                {a.spendable ? ' · counts toward safe-to-spend' : ''}
              </span>
            </span>
            {editing === a.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = parseFloat(val);
                  if (!Number.isNaN(n)) {
                    setAccountBalance(store, a.id, Math.round(n));
                  }
                  setEditing(null);
                }}
              >
                <label htmlFor={`bal-${a.id}`} className="sr-only">
                  Balance for {a.name}
                </label>
                <input id={`bal-${a.id}`} autoFocus inputMode="decimal" className="field num w-[110px] py-1.5 text-right" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ''))} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
              </form>
            ) : (
              <button type="button" className="num tap rounded-lg px-2 py-1 text-[15.5px] font-semibold hover:bg-sunk" onClick={() => { setEditing(a.id); setVal(String(a.balance)); }} aria-label={`${a.name} balance ${rupees(a.balance)}. Edit`}>
                {rupees(a.balance)}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 px-1 text-[13px] text-ink3">Tap a balance to correct it, or a name to edit the account. Safe-to-spend updates straight away.</p>
    </div>
  );
}

function setAccountBalance(store: ReturnType<typeof useStore>, id: string, balance: number) {
  const a = store.state.accounts.find((x) => x.id === id);
  if (!a) return;
  const diff = balance - a.balance;
  if (!diff) return;
  store.addTransaction({ merchant: 'Balance correction', amount: Math.abs(diff), type: 'transfer', direction: diff > 0 ? 'in' : 'out', category: 'transfer', date: store.state.today, account: id, recurring: false, notes: 'Manual balance update' }, { quiet: true });
  store.toast({ text: `${a.name} set to ${rupees(balance)}.` });
}

export function CategoriesScreen() {
  const { state } = useStore();
  const ui = useUI();
  const count = (id: string) => state.transactions.filter((t) => t.category === id).length;
  const Section = ({ title, kind }: { title: string; kind: 'expense' | 'income' }) => {
    const list = state.categories.filter((c) => c.kind === kind);
    return (
      <section className="mt-6" aria-label={title}>
        <SectionHeader title={title} action={{ label: 'New', onClick: () => ui.openSheet({ type: 'category-form', kind }) }} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {list.map((c) => (
            <button key={c.id} type="button" onClick={() => ui.openSheet({ type: 'category-form', categoryId: c.id })} className="tap relative flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] border-line bg-surface px-2 py-3 text-center hover:border-ink/40">
              {c.custom && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" title="Your category" />}
              <span className="text-[28px] leading-none" aria-hidden="true">
                {c.emoji ?? '✨'}
              </span>
              <span className="text-[12.5px] font-semibold leading-tight">{c.name}</span>
              <span className="text-[11px] text-ink3">{count(c.id) ? `${count(c.id)} logged` : 'Unused'}</span>
            </button>
          ))}
          <button type="button" onClick={() => ui.openSheet({ type: 'category-form', kind })} className="tap flex flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-ink/30 px-2 py-3 text-ink2 hover:border-ink">
            <Icon name="plus" size={24} />
            <span className="text-[12.5px] font-semibold">New</span>
          </button>
        </div>
      </section>
    );
  };
  return (
    <div>
      <TopNavigation title="Categories" onBack={ui.pop} sub="Tap one to rename it or change its emoji. Make your own for anything you spend on." />
      <Section title="Money out" kind="expense" />
      <Section title="Money in" kind="income" />
      <p className="mt-4 px-1 text-[13px] text-ink3">An orange dot marks the categories you made. Removing one moves its transactions to Other.</p>
    </div>
  );
}

// ------------------------------------------------------------------
// Settings sections
// ------------------------------------------------------------------
export function SettingsScreen({ section }: { section: Extract<Route, { name: 'settings' }>['section'] }) {
  const store = useStore();
  const { state, updateSettings } = store;
  const ui = useUI();
  const s = state.settings;
  const [buffer, setBuffer] = useState(String(s.buffer));
  const [nm, setNm] = useState(state.user.fullName);

  const titles: Record<typeof section, string> = {
    notifications: 'Notifications',
    security: 'Security',
    privacy: 'Data & privacy',
    appearance: 'Appearance',
    currency: 'Currency',
    'budget-prefs': 'Budget preferences',
    profile: 'Profile',
    export: 'Backup code & export',
    connected: 'Connected accounts',
  };

  const csv = () => {
    const rows = [['Date', 'Merchant', 'Type', 'Category', 'Amount (INR)', 'Account', 'Plan', 'Notes']];
    state.transactions.forEach((t) => rows.push([t.date, t.merchant, t.type, state.categories.find((c) => c.id === t.category)?.name ?? t.category, String(t.amount), t.account, t.plan ?? '', t.notes ?? '']));
    return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
  };

  return (
    <div>
      <TopNavigation title={titles[section]} onBack={ui.pop} />
      {section === 'notifications' && (
        <div className="divide-y divide-line">
          <Toggle label="Bills and renewals" sub="A heads-up the day before something is due" checked={s.notifications.bills} onChange={(v) => updateSettings({ notifications: { ...s.notifications, bills: v } })} />
          <Toggle label="Money moments" sub="Small wins after you log something. Never more than one a day." checked={s.notifications.moments} onChange={(v) => updateSettings({ notifications: { ...s.notifications, moments: v } })} />
          <Toggle label="Weekly check-in" sub="Sunday evening summary" checked={s.notifications.weekly} onChange={(v) => updateSettings({ notifications: { ...s.notifications, weekly: v } })} />
          <Toggle label="Splits and settle-ups" sub="When friends add or settle expenses" checked={s.notifications.splits} onChange={(v) => updateSettings({ notifications: { ...s.notifications, splits: v } })} />
        </div>
      )}
      {section === 'security' && (
        <div className="divide-y divide-line">
          <Toggle label="App lock" sub="Ask for your device PIN or biometrics on open" checked={s.appLock} onChange={(v) => updateSettings({ appLock: v })} />
          <Toggle label="Hide balances" sub="Blur the safe-to-spend number until you tap it" checked={s.hideBalances} onChange={(v) => updateSettings({ hideBalances: v })} />
        </div>
      )}
      {section === 'privacy' && (
        <div className="flex flex-col gap-4 text-[15px] text-ink2">
          <p>PULSE never asks for bank passwords or card numbers. Your money data stays on your device. If you turn on sync, it's locked before upload so only your devices can open it.</p>
          <p>Shared budget cards only show the amount and line you type. Balances are never included.</p>
          <p>Everyone who opens PULSE on their own phone or laptop gets their own private copy. Nothing is shared between people.</p>
          {state.mode === 'demo' ? (
            <>
              <button type="button" className="btn-accent self-start" onClick={store.hasStash ? store.backToMine : store.replayOnboarding}>
                {store.hasStash ? 'Back to my money' : 'Start with my own money'}
              </button>
              <button type="button" className="btn-quiet self-start" onClick={() => ui.openSheet({ type: 'confirm', title: 'Reset demo data?', body: 'This restores the original sample transactions, plans and groups. Anything you added will be removed.', confirm: 'Reset', run: store.resetDemo })}>
                <Icon name="reset" size={16} /> Reset demo data
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-quiet self-start" onClick={() => ui.push({ name: 'settings', section: 'export' })}>
                <Icon name="copy" size={16} /> Back up my data
              </button>
            </>
          )}
          <div className="mt-4 border-t border-line pt-5">
            <p className="text-[15px] font-semibold text-ink">Erase all data</p>
            <p className="mt-1 text-[14px]">Delete everything saved on this device and start again from the welcome screen.</p>
            <button type="button" className="btn mt-3 bg-neg/10 text-neg" onClick={() => ui.openSheet({ type: 'erase' })}>
              <Icon name="trash" size={16} /> Erase all data
            </button>
          </div>
        </div>
      )}
      {section === 'appearance' && (
        <div role="radiogroup" aria-label="Theme" className="flex flex-col gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={s.theme === t} onClick={() => updateSettings({ theme: t })} className={`tap flex min-h-[56px] items-center gap-3 rounded-2xl border px-4 text-left ${s.theme === t ? 'border-ink' : 'border-line'} bg-surface`}>
              <Icon name={t === 'system' ? 'monitor' : t === 'light' ? 'sun' : 'moon'} size={18} />
              <span className="flex-1 text-[15px] font-medium">{t === 'system' ? 'Match device' : t === 'light' ? 'Light' : 'Dark'}</span>
              {s.theme === t && <Icon name="check" size={18} className="text-accent-ink" />}
            </button>
          ))}
        </div>
      )}
      {section === 'currency' && <CurrencyPicker />}
      {section === 'budget-prefs' && (
        <div className="flex flex-col gap-4">
          <Field label="Safety buffer" htmlFor="buffer" hint="Kept out of safe-to-spend for surprises like a cab home or a pharmacy run.">
            <div className="flex gap-2">
              <input id="buffer" inputMode="decimal" className="field num" value={buffer} onChange={(e) => setBuffer(e.target.value.replace(/[^\d]/g, ''))} />
              <button type="button" className="btn-primary shrink-0" onClick={() => { updateSettings({ buffer: Number(buffer) || 0 }); store.toast({ text: `Buffer set to ${rupees(Number(buffer) || 0)}. Safe to spend: ${rupees(safeToSpend({ ...state, settings: { ...s, buffer: Number(buffer) || 0 } }).safe)}.` }); }}>
                Save
              </button>
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            {[500, 980, 2000, 5000].map((v) => scaled(v)).map((v) => (
              <button key={v} type="button" className="chip" aria-pressed={Number(buffer) === v} onClick={() => setBuffer(String(v))}>
                {rupees(v)}
              </button>
            ))}
          </div>
          <NavRow icon="sliders" label="Manage budgets" onClick={() => { ui.setPlansSegment('budgets'); ui.resetTo('plans'); }} />
        </div>
      )}
      {section === 'profile' && (
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="profile-name">
            <input id="profile-name" className="field" value={nm} onChange={(e) => setNm(e.target.value)} onBlur={() => nm.trim() && store.updateUser({ fullName: nm.trim(), name: nm.trim().split(' ')[0] })} />
          </Field>
          <p className="text-[13.5px] text-ink3">Your first name is used in the greeting.</p>
        </div>
      )}
      {section === 'export' && (
        <div className="flex flex-col gap-3">
          <BackupPanel />
          <hr className="my-4 border-line" />
          <p className="text-[13px] font-semibold text-ink2">Spreadsheet export</p>
          <p className="text-[15px] text-ink2">Copy every transaction as CSV and paste it into Google Sheets or Excel.</p>
          <pre className="max-h-[220px] overflow-auto rounded-xl bg-sunk p-3 text-[12px] leading-relaxed text-ink2">{csv().split('\n').slice(0, 8).join('\n')}{'\n'}…</pre>
          <button
            type="button"
            className="btn-primary self-start"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(csv());
                store.toast({ text: `${state.transactions.length} transactions copied as CSV.`, tone: 'good' });
              } catch {
                store.toast({ text: 'Copy is blocked here. Select the preview text instead.' });
              }
            }}
          >
            <Icon name="copy" size={16} /> Copy CSV
          </button>
        </div>
      )}
      {section === 'connected' && (
        <EmptyState icon="link" title="Nothing connected." body="Bank sync is not part of this prototype. Everything is entered by you or scanned from receipts." />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Investments & SIPs
// ------------------------------------------------------------------
export function InvestmentsScreen() {
  const { state } = useStore();
  const ui = useUI();
  const t = investmentTotals(state);
  const list = state.investments ?? [];
  const holdings = state.accounts.filter((a) => a.type === 'investment');
  const weighted = t.monthly > 0 ? list.filter((i) => i.status === 'active').reduce((a, i) => a + i.expectedReturn * investmentMonthly(i), 0) / t.monthly : 12;
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState(Math.round(weighted * 10) / 10);
  const [withHoldings, setWithHoldings] = useState(true);
  const activeList = list.filter((i) => i.status === 'active');
  // Each SIP grows with its own step-up; holdings are counted once.
  const proj = activeList.reduce(
    (acc, i) => {
      const p = sipProjection(investmentMonthly(i), years, rate, 0, i.stepUp ?? 0);
      return { invested: acc.invested + p.invested, value: acc.value + p.value, gain: acc.gain + p.gain };
    },
    (() => {
      const h = sipProjection(0, years, rate, withHoldings ? t.holdings : 0);
      return { invested: h.invested, value: h.value, gain: h.gain };
    })(),
  );
  const putIn = list.reduce((a, i) => a + investedTotal(state, i), 0);
  const earliest = list.reduce<string | null>((a, i) => (!a || i.startDate < a ? i.startDate : a), null);
  const recent = state.transactions.filter((x) => x.category === 'investments').slice(0, 8);
  const cycleLabel = (c: string) => (c === 'monthly' ? 'monthly' : c === 'quarterly' ? 'every 3 months' : 'yearly');
  const investedPct = proj.value > 0 ? proj.invested / proj.value : 1;

  return (
    <div>
      <TopNavigation
        title="Investments"
        onBack={ui.pop}
        sub="SIPs and other money you put away every month."
        right={
          <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={() => ui.openSheet({ type: 'investment-form' })}>
            <Icon name="plus" size={16} /> SIP
          </button>
        }
      />

      {list.length === 0 ? (
        <EmptyState icon="trend" title="No SIPs yet." body="Add a SIP and PULSE deducts it on its date every month, keeps it aside before payday, and shows what it could grow to." action={{ label: 'Add a SIP', onClick: () => ui.openSheet({ type: 'investment-form' }) }} />
      ) : (
        <>
          <section className="rounded-3xl border border-line bg-surface p-5" aria-labelledby="inv-total">
            <p id="inv-total" className="eyebrow">
              Going into investments
            </p>
            <p className="num-hero mt-1 text-[36px] leading-none">
              {rupees(t.monthly)}
              <span className="text-[18px] font-medium text-ink3">/month</span>
            </p>
            {t.next && (
              <p className="mt-2 text-[14px] text-ink2">
                Next: {rupees(t.next.amount)} for {t.next.name} on {fmtDate(t.next.nextDate)}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
              <div>
                <dt className="text-[12.5px] text-ink3">Total put in</dt>
                <dd className="num text-[18px] font-semibold">{rupeesShort(putIn)}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink3">Current value</dt>
                <dd className="num text-[18px] font-semibold">{rupeesShort(t.holdings)}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink3">Per year now</dt>
                <dd className="num text-[18px] font-semibold">{rupeesShort(t.yearly)}</dd>
              </div>
            </dl>
            {earliest && putIn > 0 && (
              <p className="mt-3 text-[13px] text-ink3">
                Total put in since {fmtMonthYear(earliest)}, including instalments from before you used PULSE. Current value is what your holdings below are worth; update it from your app now and then.
              </p>
            )}
          </section>

          <section className="mt-8" aria-labelledby="inv-list">
            <SectionHeader id="inv-list" title="Your SIPs" />
            {list.map((inv) => {
              const put = investedTotal(state, inv);
              return (
                <button key={inv.id} type="button" className={`row-btn min-h-[64px] ${inv.status === 'stopped' ? 'opacity-60' : ''}`} onClick={() => ui.openSheet({ type: 'investment-form', investmentId: inv.id })}>
                  <CategoryMark state={state} category="investments" size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{inv.name}</span>
                      {inv.status !== 'active' && <StatusPill status="neutral">{inv.status === 'paused' ? 'Paused' : 'Stopped'}</StatusPill>}
                    </span>
                    <span className="block truncate text-[13px] text-ink3">
                      {[inv.platform, `${ordinal(parseDate(inv.nextDate).getDate())} ${cycleLabel(inv.cycle)}`, inv.stepUp ? `step-up ${inv.stepUp}%/yr` : null].filter(Boolean).join(' · ')}
                    </span>
                    {put > 0 && (
                      <span className="block truncate text-[13px] font-medium text-ink2">
                        {rupees(put)} put in since {fmtMonthYear(inv.startDate)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-[15px] font-semibold">{rupees(inv.amount)}</span>
                    <span className="block text-[12px] text-ink3">{inv.status === 'active' ? relDay(inv.nextDate, state.today) : '—'}</span>
                  </span>
                </button>
              );
            })}
            <p className="mt-2 px-1 text-[13px] text-ink3">SIPs due before payday are already kept out of safe-to-spend, and each one is recorded automatically on its date.</p>
          </section>

          <section className="mt-8 rounded-3xl border border-line bg-surface p-5" aria-labelledby="inv-proj">
            <h2 id="inv-proj" className="display text-[18px]">
              What this could grow to
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              <label htmlFor="proj-years" className="flex justify-between text-[14px] text-ink2">
                <span>Keep going for</span>
                <span className="num font-semibold text-ink">{years} years</span>
              </label>
              <input id="proj-years" type="range" min={1} max={30} value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
              <label htmlFor="proj-rate" className="flex justify-between text-[14px] text-ink2">
                <span>Assumed return</span>
                <span className="num font-semibold text-ink">{rate}% a year</span>
              </label>
              <input id="proj-rate" type="range" min={4} max={16} step={0.5} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
              <label className="flex items-center gap-2.5 text-[14px]">
                <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={withHoldings} onChange={(e) => setWithHoldings(e.target.checked)} />
                Include the {rupeesShort(t.holdings)} you already hold
              </label>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div>
                <p className="text-[12.5px] text-ink3">You put in</p>
                <p className="num text-[18px] font-semibold">{rupeesShort(proj.invested)}</p>
              </div>
              <div>
                <p className="text-[12.5px] text-ink3">Growth</p>
                <p className="num text-[18px] font-semibold text-pos">+{rupeesShort(proj.gain)}</p>
              </div>
              <div>
                <p className="text-[12.5px] text-ink3">Could be worth</p>
                <p className="num text-[18px] font-semibold text-accent-ink">{rupeesShort(proj.value)}</p>
              </div>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-sunk" role="img" aria-label={`${Math.round(investedPct * 100)}% of the final value is money you put in, ${100 - Math.round(investedPct * 100)}% is growth`}>
              <span className="h-full bg-ink/70" style={{ width: `${investedPct * 100}%` }} />
              <span className="h-full bg-accent" style={{ width: `${(1 - investedPct) * 100}%` }} />
            </div>
            <p className="mt-2 flex gap-4 text-[12px] text-ink3">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-ink/70" /> Put in
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent" /> Growth
              </span>
            </p>
            <p className="mt-3 text-[12.5px] text-ink3">An estimate using the return you choose. Real returns go up and down and aren't guaranteed. PULSE isn't a financial advisor.</p>
          </section>
        </>
      )}

      <section className="mt-8" aria-labelledby="inv-hold">
        <SectionHeader id="inv-hold" title="Holdings" action={{ label: 'Add holding', onClick: () => ui.openSheet({ type: 'account-form' }) }} />
        {holdings.length ? (
          holdings.map((a) => (
            <NavRow key={a.id} icon="trend" label={a.name} sub={a.institution} value={rupees(a.balance)} onClick={() => ui.openSheet({ type: 'account-form', accountId: a.id })} />
          ))
        ) : (
          <p className="px-1 text-[14px] text-ink3">No holdings yet. Adding a SIP creates one for you.</p>
        )}
        <p className="mt-2 px-1 text-[13px] text-ink3">SIP debits add to these automatically. Tap one to update its current value from your app.</p>
        {holdings.length > 0 && (
          <button type="button" className="btn-quiet mt-3 w-full" onClick={() => ui.openSheet({ type: 'composer', preset: { type: 'transfer', toAccount: holdings[0].id } })}>
            <Icon name="plus" size={16} /> Invest a lump sum
          </button>
        )}
      </section>

      {recent.length > 0 && (
        <section className="mt-8" aria-labelledby="inv-recent">
          <SectionHeader id="inv-recent" title="Recent debits" />
          <TransactionList txs={recent} />
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Install as an app (PWA)
// ------------------------------------------------------------------
function InstallCard() {
  const inst = useInstall();
  const { toast } = useStore();
  const ui = useUI();
  // Always shown. Once PULSE runs from the home screen it switches to an "installed" state
  // and offers the guide for helping a friend, instead of disappearing.
  const installed = inst.installed;
  return (
    <section aria-labelledby="install-h" className="mb-8 rounded-3xl border border-line bg-surface p-5">
      <div className="flex items-center gap-4">
        <Submark size={56} className="shrink-0 rounded-[30%] ring-1 ring-line" />
        <div className="min-w-0 flex-1">
          <h2 id="install-h" className="display flex items-center gap-2 text-[18px]">
            {installed ? 'PULSE is installed' : 'Install PULSE'}
            {installed && (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-pos text-bg" aria-hidden="true">
                <Icon name="check" size={13} />
              </span>
            )}
          </h2>
          <p className="text-[13.5px] text-ink2">{installed ? 'You are using the app from your home screen. It works offline.' : 'Opens full screen from your home screen and works offline.'}</p>
        </div>
      </div>
      {installed ? (
        <button type="button" className="btn-quiet mt-4 w-full" onClick={() => ui.push({ name: 'install' })}>
          <Icon name="share" size={17} /> Help a friend install
        </button>
      ) : (
        <>
          <button
            type="button"
            className="btn-primary mt-4 w-full"
            onClick={async () => {
              if (inst.canPrompt) {
                const r = await inst.prompt();
                if (r === 'accepted') toast({ text: 'PULSE is on your home screen.', tone: 'good' });
              } else ui.push({ name: 'install' });
            }}
          >
            <Icon name="download" size={17} /> {inst.canPrompt ? 'Install app' : 'How to install'}
          </button>
          {inst.canPrompt && (
            <button type="button" className="mt-2.5 w-full text-center text-[13px] font-semibold text-accent-ink" onClick={() => ui.push({ name: 'install' })}>
              Steps for iPhone and Android
            </button>
          )}
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------
// Currency
// ------------------------------------------------------------------
function CurrencyPicker() {
  const { state, updateSettings, toast } = useStore();
  const [q, setQ] = useState('');
  const chosen = state.settings.currency ?? 'INR';
  const demo = state.mode === 'demo';
  const list = CURRENCIES.filter((c) => !q || `${c.name} ${c.code} ${c.symbol}`.toLowerCase().includes(q.toLowerCase()));
  const sample = (c: (typeof CURRENCIES)[number]) => {
    let n = '1,20,000';
    try {
      n = new Intl.NumberFormat(c.locale, { maximumFractionDigits: 0 }).format(120000);
    } catch {
      /* keep default */
    }
    return `${/[A-Za-z]$/.test(c.symbol) ? `${c.symbol} ` : c.symbol}${n}`;
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-ink2">Pick the currency you get paid and spend in. Amounts are shown in it, never converted.</p>
      {demo && <p className="rounded-2xl bg-sunk p-3 text-[13.5px] text-ink2">The demo is a month in Bengaluru, so it stays in rupees. Your own data will use the currency you pick here.</p>}
      <label htmlFor="cur-q" className="sr-only">Search currencies</label>
      <input id="cur-q" className="field" placeholder="Search: dollar, AED, euro…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div role="radiogroup" aria-label="Currency" className="flex flex-col gap-2">
        {list.map((c) => {
          const on = c.code === chosen;
          return (
            <button
              key={c.code}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                if (on) return;
                updateSettings({ currency: c.code });
                toast({ text: `PULSE now shows amounts in ${c.name}.`, tone: 'good' });
              }}
              className={`tap flex min-h-[60px] items-center gap-3 rounded-2xl border px-4 text-left ${on ? 'border-ink' : 'border-line'} bg-surface`}
            >
              <span className="text-[22px]" aria-hidden="true">{c.flag}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{c.name} <span className="font-normal text-ink3">· {c.code}</span></span>
                <span className="num block text-[13px] text-ink3">{sample(c)}{c.lakh ? ' · lakh grouping' : ''}</span>
              </span>
              {on && <Icon name="check" size={18} className="shrink-0 text-accent-ink" />}
            </button>
          );
        })}
        {!list.length && <p className="p-3 text-[14px] text-ink3">No currency matches “{q}”.</p>}
      </div>
    </div>
  );
}
