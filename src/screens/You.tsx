import { useMemo, useState } from 'react';
import { CURRENCIES, currencyOf, scaled } from '../lib/currency';
import { BrandSignature } from '../components/ui/BrandSignature';
import { NetWorthChart } from '../components/NetWorthChart';
import { BUILD_TIME, checkForUpdate, updateReady } from '../lib/update';
import { INSURANCE_ON } from '../lib/features';
import { remindersShort } from './Reminders';
import { cleanVpa, okVpa } from '../lib/upi';
import { playSfx } from '../lib/sfx';
import { useStore } from '../store/store';
import { useUI, type Route } from '../store/ui';
import { debtDue, isEarned, detections, emiParts, holdingAccounts, incomeThisMonth, investedTotal, investmentMonthly, investmentTotals, netWorth, payoffInterest, payoffMonths, recurringTotals, safeToSpend, sipProjection } from '../lib/finance';
import { addMonths, daysBetween, endOfMonth, fmtDate, incomeLabel, ordinal, monthName, parseDate, relDay, rupees, rupeesShort, startOfMonth } from '../lib/format';
import { NavRow, SectionHeader, Segmented, StatusPill, Toggle, TopNavigation, EmptyState, PersonAvatar, CategoryMark, ProgressBar, Field } from '../components/ui/bits';
import { SubscriptionRow, TransactionList } from '../components/money';
import { BackupPanel } from '../components/Forms';
import { Icon } from '../components/ui/Icon';
import { RollingNumber } from '../components/ui/RollingNumber';
import { kindMeta, maturityDate, maturityValue } from '../lib/invest';
import { useInstall } from '../lib/pwa';
import { useAuth } from '../store/auth';
import { PhotoEditor } from '../components/PhotoEditor';
import { okPhoto } from '../lib/photo';

export function YouScreen() {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const auth = useAuth();
  const account = state.mode === 'personal' ? auth.session?.account : undefined;
  const nw = useMemo(() => netWorth(state), [state]);
  const rec = recurringTotals(state);
  const debtLeft = state.debts.reduce((a, d) => a + Math.max(0, d.remaining), 0);
  const go = (r: Route) => ui.push(r);
  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        {state.mode === 'personal' ? (
          <button type="button" className="tap relative shrink-0 rounded-full" aria-label={okPhoto(state.user.photo) ? 'Change your photo' : 'Add your photo'} onClick={() => go({ name: 'settings', section: 'profile' })}>
            <PersonAvatar me size={56} />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-ink text-bg ring-2 ring-bg" aria-hidden="true">
              <Icon name={okPhoto(state.user.photo) ? 'pencil' : 'camera'} size={11} />
            </span>
          </button>
        ) : (
          <PersonAvatar me size={56} />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="display text-[28px] leading-tight">{state.user.fullName}</h1>
          <p className="text-[14px] text-ink3">
            {state.mode === 'demo' ? `Demo data as of ${fmtDate(state.today, true)}` : account ? `PULSE member #${account.n} · saved to your account` : `${state.user.handle} · your data stays on this device`}
          </p>
        </div>
      </div>

      {/* Your month: the recap and the shareable Rewind, side by side */}
      <div className="mb-6 grid grid-cols-[1.35fr_1fr] gap-2.5">
        <button type="button" onClick={() => ui.openSheet({ type: 'recap' })} className="tap flex min-h-[92px] flex-col justify-between rounded-3xl bg-accent p-4 text-left text-on-accent">
          <span className="eyebrow block !text-current opacity-75">Monthly recap</span>
          <span className="flex items-end justify-between gap-2">
            <span className="display block text-[19px] leading-tight">Your {monthName(state.today)}</span>
            <Icon name="chevron" size={18} className="shrink-0" />
          </span>
        </button>
        <button type="button" onClick={() => ui.openSheet({ type: 'rewind' })} className="tap flex min-h-[92px] flex-col justify-between rounded-3xl bg-ink p-4 text-left text-bg">
          <span className="eyebrow block !text-current opacity-70">PULSE Rewind</span>
          <span className="flex items-end justify-between gap-2">
            <span className="block text-[14px] font-semibold leading-tight">5 slides to share</span>
            <Icon name="share" size={17} className="shrink-0" />
          </span>
        </button>
      </div>

      <section aria-labelledby="you-money" className="mb-6">
        <SectionHeader id="you-money" title="Money" />
        <div className="grid grid-cols-2 gap-2.5">
          <MoneyTile icon="trend" label="Net worth" value={rupeesShort(nw.total)} onClick={() => go({ name: 'networth' })} />
          <MoneyTile icon="piggy" label="Investments" value={investmentTotals(state).monthly ? `${rupeesShort(investmentTotals(state).monthly)}/mo` : (state.investments ?? []).length ? `${(state.investments ?? []).length} added` : 'Add one'} onClick={() => go({ name: 'investments' })} />
          <MoneyTile icon="repeat" label="Subscriptions & bills" short="Bills & subs" value={`${rupeesShort(rec.monthly)}/mo`} onClick={() => go({ name: 'subscriptions' })} />
          <MoneyTile icon="bank" label="Debt" value={debtLeft > 0 ? `${rupeesShort(debtLeft)} left` : state.debts.length ? 'Paid off' : 'None'} onClick={() => go({ name: 'debt' })} />
        </div>
        <div className={`mt-2.5 grid gap-2.5 ${INSURANCE_ON ? 'grid-cols-5' : 'grid-cols-4'}`}>
          <MiniTile icon="chart" label="Spending history" onClick={() => go({ name: 'history' })} />
          <MiniTile icon="briefcase" label="Income" onClick={() => go({ name: 'income' })} />
          <MiniTile icon="card" label="Credit cards" onClick={() => go({ name: 'cards' })} />
          <MiniTile icon="wallet" label="Accounts" onClick={() => go({ name: 'accounts' })} />
          {INSURANCE_ON && <MiniTile icon="shield" label="Insurance" onClick={() => go({ name: 'insurance' })} />}
        </div>
      </section>

      <section aria-labelledby="you-prefs" className="mb-6">
        <SectionHeader id="you-prefs" title="Preferences" />
        <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          <SetRow icon="user" label="Profile" onClick={() => go({ name: 'settings', section: 'profile' })} />
          <SetRow icon="tags" label="Categories" value={String(state.categories.filter((c) => c.kind === 'expense').length)} onClick={() => go({ name: 'categories' })} />
          <SetRow icon="sliders" label="Budget preferences" value={`${rupees(state.settings.buffer)} buffer`} onClick={() => go({ name: 'settings', section: 'budget-prefs' })} />
          <SetRow icon="bell" label="Reminders" value={remindersShort()} onClick={() => go({ name: 'reminders' })} />
          <SetRow icon="palette" label="Appearance" value={state.settings.theme === 'system' ? 'Match device' : state.settings.theme === 'dark' ? 'Dark' : 'Light'} onClick={() => go({ name: 'settings', section: 'appearance' })} />
          <SetRow icon="rupee" label="Currency" value={`${currencyOf(state.settings.currency).symbol} ${currencyOf(state.settings.currency).code ?? ''}`.trim()} onClick={() => go({ name: 'settings', section: 'currency' })} />
        </div>
      </section>

      <section aria-labelledby="you-privacy" className="mb-8">
        <SectionHeader id="you-privacy" title="Help & data" />
        <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          <SetRow emoji="🧭" label={state.mode === 'demo' ? 'Demo tour' : 'Explore demo data'} onClick={() => go({ name: 'demo-guide' })} />
          <InstallRow />
          <SetRow icon="shield" label="Data & privacy" onClick={() => go({ name: 'settings', section: 'privacy' })} />
          {account ? (
            <SetRow icon="user" label="Your account" value={account.email} onClick={() => go({ name: 'account' })} />
          ) : auth.on && state.mode === 'personal' ? (
            <SetRow icon="user" label="Sign in" value="Use on every device" onClick={() => ui.openSheet({ type: 'auth-nudge' })} />
          ) : (
            <SetRow icon="reset" label="Sync my devices" onClick={() => go({ name: 'sync' })} />
          )}
          <SetRow icon="download" label="Backup code & export" onClick={() => go({ name: 'settings', section: 'export' })} />
          <SetRow icon="message" label="Send feedback" onClick={() => go({ name: 'feedback' })} />
          <a href="/about/" className="tap flex min-h-[50px] w-full items-center gap-3 px-4 text-left hover:bg-sunk/60">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-sunk text-ink2" aria-hidden="true">
              <Icon name="help" size={16} />
            </span>
            <span className="min-w-0 flex-1 text-[14.5px] font-medium">How PULSE works</span>
            <Icon name="chevron" size={16} className="shrink-0 text-ink3" />
          </a>
          <button type="button" onClick={() => ui.openSheet({ type: 'erase' })} className="tap flex min-h-[50px] w-full items-center gap-3 px-4 text-left text-neg hover:bg-neg/5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-neg/10" aria-hidden="true">
              <Icon name="trash" size={16} />
            </span>
            <span className="flex-1 text-[14.5px] font-semibold">Erase all data</span>
          </button>
        </div>
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
        <EmptyState icon="repeat" art="/illustrations/calendar.webp" title="No recurring payments detected yet." body="Add subscriptions and bills so they're set aside before payday." action={{ label: 'Add one', onClick: () => ui.openSheet({ type: 'sub-form' }) }} />
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
  const change = nw.total - h[0].value;
  return (
    <div>
      <TopNavigation title="Net worth" onBack={ui.pop} />
      <section className="rounded-3xl border border-line bg-surface p-5" aria-labelledby="nw-total">
        <p id="nw-total" className="eyebrow">
          Total net worth
        </p>
        <p className="num-hero mt-1 text-[39px] leading-none">
          <RollingNumber text={rupees(nw.total)} />
        </p>
        {h.length < 2 ? (
          <p className="mt-2 text-[14px] text-ink2">Your trend line starts after your first full month. PULSE saves a snapshot each month.</p>
        ) : (
          <p className={`mt-1 text-[14px] ${change >= 0 ? 'text-pos' : 'text-ink2'}`}>
            {change >= 0 ? '▲' : '▼'} {rupees(Math.abs(change))} since {monthName(h[0].month + '-01')}
          </p>
        )}
        {h.length >= 2 && <NetWorthChart history={h} />}
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
  const received = state.transactions.filter((t) => isEarned(t) && t.date >= ms);
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
        {state.incomes.length === 0 && <EmptyState icon="briefcase" art="/illustrations/coins.webp" title="No income sources yet." body="Add one so PULSE knows when your next payday is." action={{ label: 'Add income', onClick: () => ui.openSheet({ type: 'income-form' }) }} />}
        {state.incomes.map((i) => (
          <NavRow key={i.id} icon={i.kind === 'salary' ? 'briefcase' : 'spark'} label={i.name} sub={sourceSub(i)} value={rupees(i.expected)} onClick={() => ui.openSheet({ type: 'income-form', incomeId: i.id })} />
        ))}
        {state.incomes.length > 0 && <p className="mt-1 px-1 text-[12.5px] text-ink3">Tap a source to change it or remove it.</p>}
      </section>
      <section className="mt-8" aria-labelledby="inc-rec">
        <SectionHeader id="inc-rec" title="Received this month" action={{ label: 'Log income', onClick: () => ui.openSheet({ type: 'composer', preset: { type: 'income' } }) }} />
        <ul>
          {received.map((t) => (
            <li key={t.id}>
              <button type="button" className="tap flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-sunk/60" onClick={() => ui.openSheet({ type: 'tx', id: t.id })}>
                <CategoryMark state={state} category={t.category} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{t.merchant}</span>
                  <span className="block text-[13px] text-ink3">{fmtDate(t.date)}</span>
                </span>
                <span className="num text-[15px] font-semibold text-pos">{rupees(t.amount, { sign: true })}</span>
              </button>
            </li>
          ))}
        </ul>
        {received.length > 0 && <p className="mt-1 px-1 text-[12.5px] text-ink3">Friend paid you back or a refund? Tap it and pick “Got it back”, so it isn’t counted as income.</p>}
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
      {state.cards.length === 0 && <EmptyState icon="card" art="/illustrations/card.webp" title="No cards added." body="Add a credit card to track its balance, limit and due date. Only the last 4 digits, never the full number." action={{ label: 'Add a card', onClick: () => ui.openSheet({ type: 'card-form' }) }} />}
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
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const [extra, setExtra] = useState(0);
  const [whatIf, setWhatIf] = useState<string | null>(null);
  return (
    <div>
      <TopNavigation
        title="Debt"
        onBack={ui.pop}
        sub="Only you see this."
        right={
          <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={() => ui.openSheet({ type: 'debt-form' })}>
            <Icon name="plus" size={16} /> Loan
          </button>
        }
      />
      {state.debts.length === 0 && <EmptyState icon="bank" art="/illustrations/debt-free.webp" title="No debts tracked." body="Add a loan to see when you'll be debt-free, and what paying a little extra saves." action={{ label: 'Add a loan', onClick: () => ui.openSheet({ type: 'debt-form' }) }} />}
      {state.debts.map((d) => {
        const open = whatIf === d.id;
        const add = open ? extra : 0;
        const base = payoffMonths(d.remaining, d.rate, d.minPayment);
        const faster = payoffMonths(d.remaining, d.rate, d.minPayment + add);
        const intBase = payoffInterest(d.remaining, d.rate, d.minPayment);
        const intFast = payoffInterest(d.remaining, d.rate, d.minPayment + add);
        const done = faster ? addMonths(state.today, faster) : null;
        const paidOff = d.remaining <= 0;
        const due = debtDue(state, d);
        const manual = d.autoDebit === false;
        const dueNow = due <= state.today;
        const overdue = manual && due < state.today;
        const part = emiParts(d);
        const paid = state.transactions.filter((t) => t.debtId === d.id);
        const paidDown = paid.reduce((a, t) => a + (t.principal ?? 0), 0);
        const pPct = part.amount > 0 ? (part.principal / part.amount) * 100 : 100;
        const personal = state.mode === 'personal';
        const chip = 'num inline-flex items-center gap-1.5 rounded-full bg-sunk px-3 py-1.5 text-[13px] font-semibold';
        return (
          <article key={d.id} className="mb-4 rounded-3xl border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[15px] font-semibold text-ink2">
                {d.name} · {d.lender}
              </p>
              <button type="button" className="tap -mr-2 -mt-2 grid h-9 w-9 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label={`Edit ${d.name}`} onClick={() => ui.openSheet({ type: 'debt-form', debtId: d.id })}>
                <Icon name="pencil" size={16} />
              </button>
            </div>
            {paidOff && <img src="/illustrations/loan-paid-off.webp" alt="" aria-hidden="true" width={700} height={695} decoding="async" data-testid="loan-art" className="mx-auto mt-1 h-[180px] w-auto" />}
            <p className="num-hero mt-1 text-[36px] leading-none">
              <RollingNumber text={rupees(d.remaining)} testId="debt-left" />
            </p>
            <p className="mt-1 text-[13px] text-ink3">
              {paidOff ? 'Paid off. Nothing left to pay.' : 'left to pay'}
              {!paidOff && paidDown > 0 && <span className="font-semibold text-pos"> · {rupees(paidDown)} paid off</span>}
            </p>

            {!paidOff && (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={chip} data-testid="chip-emi">
                  <span className="font-normal text-ink3">EMI</span> {rupees(d.minPayment)}
                </span>
                <span className={`${chip} ${overdue ? 'bg-warn/15 text-warn' : ''}`} data-testid="chip-next">
                  <Icon name="calendar" size={14} className={overdue ? '' : 'text-ink3'} />
                  {overdue ? 'Was due ' : ''}
                  {personal ? fmtDate(due) : `${ordinal(d.dueDay)} monthly`}
                </span>
                <span className={chip} data-testid="chip-rate">
                  {d.rate}% <span className="font-normal text-ink3">a year</span>
                </span>
              </div>
            )}

            {!paidOff && personal && (
              <>
                <div className="mt-5" data-testid="emi-split">
                  <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`Next EMI ${rupees(part.amount)}: ${rupees(part.principal)} off the loan, ${rupees(part.interest)} interest`}>
                    <span className="h-full origin-left animate-grow-x rounded-l-full bg-accent" style={{ width: `${pPct}%` }} />
                    {part.interest > 0 && <span className="h-full flex-1 origin-left animate-grow-x rounded-r-full bg-ink/20" style={{ animationDelay: '.15s' }} />}
                  </div>
                  <div className="mt-2 flex justify-between gap-3 text-[12.5px]">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                      <span className="text-ink2">Off the loan</span> <span className="num font-semibold">{rupees(part.principal)}</span>
                    </span>
                    {part.interest > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-ink/20" aria-hidden="true" />
                        <span className="text-ink2">Interest</span> <span className="num font-semibold">{rupees(part.interest)}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className={`mt-4 grid gap-2 ${manual ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {manual && (
                    <button type="button" className={`${dueNow ? 'btn-accent' : 'btn-quiet'} min-h-[42px] px-3 text-[14px]`} onClick={() => store.payDebt(d.id)}>
                      Mark as paid
                    </button>
                  )}
                  <button type="button" className="btn-quiet min-h-[42px] px-3 text-[14px]" onClick={() => ui.openSheet({ type: 'debt-early', debtId: d.id })}>
                    Paid early / extra
                  </button>
                </div>
              </>
            )}

            {!paidOff && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink" aria-hidden="true">
                    <Icon name="target" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-ink3">Debt-free by</span>
                    <span className="block text-[17px] font-semibold" data-testid="debt-free-date">
                      {done ? `${monthName(done)} ${done.slice(0, 4)}` : 'EMI is below the interest'}
                    </span>
                  </span>
                  {faster != null && <span className="num shrink-0 rounded-full bg-sunk px-2.5 py-1 text-[12.5px] font-semibold">{faster} months</span>}
                </div>
                {open ? (
                  <div className="mt-4 rounded-2xl bg-sunk/70 p-4">
                    <label htmlFor={`extra-${d.id}`} className="flex justify-between text-[13.5px] text-ink2">
                      <span>Extra each month</span>
                      <span className="num font-semibold text-ink">+{rupees(extra)}</span>
                    </label>
                    <input id={`extra-${d.id}`} type="range" min={0} max={5000} step={250} value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="mt-2 w-full accent-[rgb(var(--accent))]" />
                    <p className={`mt-2 text-[14px] font-semibold ${extra > 0 && base && faster ? 'text-pos' : 'text-ink3'}`}>
                      {extra > 0 && base && faster ? `${base - faster} months sooner · ${rupees(intBase - intFast)} less interest` : 'Slide to see what changes.'}
                    </p>
                  </div>
                ) : (
                  <button type="button" className="mt-3 flex items-center gap-1 text-[13.5px] font-semibold text-accent-ink" onClick={() => { setExtra(1000); setWhatIf(d.id); }}>
                    What if I pay extra? <Icon name="chevron" size={15} />
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
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
  const signedIn = !!useAuth().session && state.mode === 'personal';
  const [buffer, setBuffer] = useState(String(s.buffer));
  const [nm, setNm] = useState(state.user.fullName);
  const [myUpi, setMyUpi] = useState(state.user.upi ?? '');

  const titles: Record<typeof section, string> = {
    notifications: 'Money moments',
    security: 'Hide balances',
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
          <Toggle label="Money moments" sub="A small win shown in the app after you log something. Never more than one a day." checked={s.notifications.moments} onChange={(v) => updateSettings({ notifications: { ...s.notifications, moments: v } })} />
        </div>
      )}
      {section === 'security' && (
        <div className="divide-y divide-line">
          <Toggle label="Hide balances" sub="Blur the safe-to-spend number until you tap it" checked={s.hideBalances} onChange={(v) => updateSettings({ hideBalances: v })} />
        </div>
      )}
      {section === 'privacy' && (
        <div className="flex flex-col gap-4 text-[15px] text-ink2">
          {signedIn ? (
            <p>
              PULSE never asks for bank passwords or card numbers. Your money data is saved on PULSE's server under your account, so it's there on any device you sign in on. It isn't sold or shown to anyone else. The details are in the{' '}
              <a href="/privacy/" className="font-semibold text-ink underline underline-offset-2">
                Privacy Policy
              </a>
              .
            </p>
          ) : (
            <p>PULSE never asks for bank passwords or card numbers. Your money data stays on your device. If you turn on sync, it's locked before upload so only your devices can open it.</p>
          )}
          <p>Shared budget cards only show the amount and line you type. Balances are never included.</p>
          <p>What you split with friends on PULSE is shared with those friends only, and nothing else of yours is.</p>
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
          {signedIn ? (
            <div className="mt-4 border-t border-line pt-5">
              <p className="text-[15px] font-semibold text-ink">Sign out or delete your account</p>
              <p className="mt-1 text-[14px]">Both are in Your account. Deleting removes your data from PULSE's server too.</p>
              <button type="button" className="btn-quiet mt-3" onClick={() => ui.push({ name: 'account' })}>
                <Icon name="user" size={16} /> Your account
              </button>
            </div>
          ) : (
            <div className="mt-4 border-t border-line pt-5">
              <p className="text-[15px] font-semibold text-ink">Erase all data</p>
              <p className="mt-1 text-[14px]">Delete everything saved on this device and start again from the welcome screen.</p>
              <button type="button" className="btn mt-3 bg-neg/10 text-neg" onClick={() => ui.openSheet({ type: 'erase' })}>
                <Icon name="trash" size={16} /> Erase all data
              </button>
            </div>
          )}
        </div>
      )}
      {section === 'appearance' && (
        <div className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Theme" className="flex flex-col gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={s.theme === t} onClick={() => updateSettings({ theme: t })} className={`tap flex min-h-[56px] items-center gap-3 rounded-2xl border px-4 text-left ${s.theme === t ? 'border-ink' : 'border-line'} bg-surface`}>
              <Icon name={t === 'system' ? 'monitor' : t === 'light' ? 'sun' : 'moon'} size={18} />
              <span className="flex-1 text-[15px] font-medium">{t === 'system' ? 'Match device' : t === 'light' ? 'Light' : 'Dark'}</span>
              {s.theme === t && <Icon name="check" size={18} className="text-accent-ink" />}
            </button>
          ))}
        </div>
        <Toggle
          checked={!!s.sounds}
          onChange={(on) => {
            updateSettings({ sounds: on, soundsAsked: true });
            if (on) playSfx('income', true);
          }}
          label="Sounds"
          sub="A little sound when you log money out, money in or a move. Your phone's silent mode may mute it."
        />
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
          {state.mode === 'personal' && <PhotoEditor />}
          <Field label="Name" htmlFor="profile-name">
            <input id="profile-name" className="field" value={nm} onChange={(e) => setNm(e.target.value)} onBlur={() => nm.trim() && store.updateUser({ fullName: nm.trim(), name: nm.trim().split(' ')[0] })} />
          </Field>
          <p className="text-[13.5px] text-ink3">Your first name is used in the greeting.</p>
          {state.mode === 'personal' && (
            <Field label="Your UPI ID" htmlFor="profile-upi" hint="Friends connected on PULSE and people in your shared groups get it, so they can pay you in one tap from Settle up. Leave it empty to keep it to yourself.">
              <input
                id="profile-upi"
                className="field"
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="yourname@okaxis"
                value={myUpi}
                onChange={(e) => setMyUpi(e.target.value)}
                onBlur={() => {
                  const v = cleanVpa(myUpi);
                  if (v && !okVpa(v)) return store.toast({ text: 'That doesn’t look like a UPI ID. It looks like name@bank.' });
                  setMyUpi(v);
                  if (v !== (state.user.upi ?? '')) {
                    store.updateUser({ upi: v || undefined });
                    store.toast({ text: v ? 'Saved. Your friends on PULSE can now pay you in one tap.' : 'UPI ID removed.', tone: 'good' });
                  }
                }}
              />
            </Field>
          )}
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
  const holdings = holdingAccounts(state);
  const activeList = list.filter((i) => i.status === 'active');
  const monthlyList = activeList.filter((i) => kindMeta(i.kind).recurring);
  const putIn = list.reduce((a, i) => a + investedTotal(state, i), 0);
  const gain = t.holdings - putIn;
  const recent = state.transactions.filter((x) => x.category === 'investments');
  const total = holdings.reduce((a, h) => a + h.balance, 0);
  const shares = holdings.map((h, i) => ({ h, pct: total > 0 ? h.balance / total : 0, color: SPLIT_COLORS[i % SPLIT_COLORS.length] }));
  const in10 = growthProjection(state, 10, defaultRate(state), true).value;
  const cycleLabel = (c: string) => (c === 'monthly' ? 'monthly' : c === 'quarterly' ? 'every 3 months' : 'yearly');

  return (
    <div>
      <TopNavigation
        title="Investments"
        onBack={ui.pop}
        sub="SIP, RD, FD, PPF and more."
        right={
          <button type="button" aria-label="Add investment" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={() => ui.openSheet({ type: 'investment-form' })}>
            <Icon name="plus" size={16} /> Add
          </button>
        }
      />

      {list.length === 0 && holdings.length === 0 ? (
        <EmptyState icon="trend" art="/illustrations/plant.webp" title="No investments yet." body="Add a SIP, RD, FD or PPF. PULSE records each debit on its date, keeps it aside before payday, and shows what it grows to." action={{ label: 'Add an investment', onClick: () => ui.openSheet({ type: 'investment-form' }) }} />
      ) : (
        <div className="flex flex-col gap-4">
          {/* 1. What it's worth, and how it's split */}
          <section className="rounded-3xl border border-line bg-surface p-5" aria-labelledby="inv-hold">
            <div className="flex items-center justify-between gap-3">
              <p id="inv-hold" className="eyebrow">
                Your portfolio
              </p>
              <button type="button" className="tap -mr-1 text-[13.5px] font-semibold text-accent-ink" onClick={() => ui.openSheet({ type: 'account-form', holding: true })}>
                Add holding
              </button>
            </div>
            <p className="num-hero mt-1 text-[38px] leading-none">
              <RollingNumber text={rupees(t.holdings)} testId="portfolio-value" />
            </p>
            {putIn > 0 && (
              <p className={`mt-1.5 text-[14px] ${gain >= 0 ? 'text-pos' : 'text-ink2'}`}>
                {gain >= 0 ? '▲' : '▼'} {rupees(Math.abs(gain))} on {rupees(putIn)} put in
              </p>
            )}
            {total > 0 && (
              <div className="mt-4 flex h-2.5 gap-1 overflow-hidden rounded-full" role="img" aria-label={shares.map((x) => `${x.h.name} ${Math.round(x.pct * 100)}%`).join(', ')}>
                {shares.map((x) => (
                  <span key={x.h.id} className="h-full rounded-full" style={{ width: `${x.pct * 100}%`, background: x.color }} />
                ))}
              </div>
            )}
            <ul className="mt-2">
              {shares.map((x) => (
                <li key={x.h.id}>
                  <button type="button" className="tap -mx-2 flex min-h-[44px] w-[calc(100%+16px)] items-center gap-2.5 rounded-xl px-2 text-left text-[14px] hover:bg-sunk" onClick={() => ui.openSheet({ type: 'account-form', accountId: x.h.id, holding: true })}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {x.h.name}
                      {x.h.institution && <span className="text-ink3"> · {x.h.institution}</span>}
                    </span>
                    <span className="num font-semibold">{rupees(x.h.balance)}</span>
                    <span className="w-9 text-right text-[12.5px] text-ink3">{Math.round(x.pct * 100)}%</span>
                  </button>
                </li>
              ))}
            </ul>
            <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-4">
              <div>
                <dt className="text-[12.5px] text-ink3">Total put in</dt>
                <dd className="num text-[17px] font-semibold">{rupeesShort(putIn)}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink3">Current value</dt>
                <dd className="num text-[17px] font-semibold">{rupeesShort(t.holdings)}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink3">Per year now</dt>
                <dd className="num text-[17px] font-semibold">{rupeesShort(t.yearly)}</dd>
              </div>
            </dl>
          </section>

          {/* 2. The monthly habit */}
          {monthlyList.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div data-testid="tile-monthly" className="rounded-2xl bg-sunk p-4">
                <p className="text-[12.5px] text-ink3">Every month</p>
                <p className="num mt-0.5 text-[20px] font-bold">{rupees(t.monthly)}</p>
                <p className="text-[12.5px] text-ink3">
                  {monthlyList.length} running
                </p>
              </div>
              <div data-testid="tile-next" className="rounded-2xl bg-accent-soft p-4">
                <p className="text-[12.5px] text-accent-ink">Next debit</p>
                <p className="num mt-0.5 text-[20px] font-bold text-accent-ink">{t.next ? rupees(t.next.amount) : '—'}</p>
                <p className="truncate text-[12.5px] text-accent-ink">{t.next ? `${fmtDate(t.next.nextDate)} · ${t.next.name}` : ''}</p>
              </div>
            </div>
          )}

          {/* 3. Every investment */}
          {list.length === 0 && <EmptyState icon="trend" art="/illustrations/plant.webp" title="No investments yet." body="Add a SIP, RD, FD or PPF and PULSE records it on its date and shows what it could grow to." action={{ label: 'Add an investment', onClick: () => ui.openSheet({ type: 'investment-form' }) }} />}
          {list.length > 0 && (
            <section aria-labelledby="inv-list">
              <p id="inv-list" className="eyebrow mb-1 px-1">
                Your investments
              </p>
              <ul className="divide-y divide-line rounded-3xl border border-line bg-surface px-2">
                {list.map((inv) => {
                  const m = kindMeta(inv.kind);
                  const ends = maturityDate(inv);
                  const matured = !!ends && ends <= state.today;
                  const worth = maturityValue(inv);
                  const sub = m.recurring
                    ? [inv.platform, `${ordinal(parseDate(inv.nextDate).getDate())} ${cycleLabel(inv.cycle)}`, inv.stepUp ? `step-up ${inv.stepUp}%/yr` : null, ends && inv.kind !== 'ppf' ? `till ${fmtDate(ends, true)}` : null]
                    : [`${inv.expectedReturn}%`, ends ? `${matured ? 'Matured' : 'Matures'} ${monthName(ends).slice(0, 3)} ${ends.slice(0, 4)}` : null, inv.platform];
                  return (
                    <li key={inv.id}>
                      <button type="button" className={`row-btn min-h-[64px] ${inv.status === 'stopped' ? 'opacity-60' : ''}`} onClick={() => ui.openSheet({ type: 'investment-form', investmentId: inv.id })}>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-sunk text-[19px]" aria-hidden="true">
                          {m.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold">{inv.name}</span>
                            <span className="shrink-0 rounded-md bg-sunk px-1.5 py-px text-[11px] font-bold text-ink2">{m.short === 'Investment' ? 'Other' : m.short}</span>
                            {inv.status !== 'active' && <StatusPill status="neutral">{matured || (inv.kind === 'rd' && inv.status === 'stopped' && ends && ends <= state.today) ? 'Done' : inv.status === 'paused' ? 'Paused' : 'Stopped'}</StatusPill>}
                          </span>
                          <span className="block truncate text-[13px] text-ink3">{sub.filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="num block text-[15px] font-semibold">{rupees(inv.amount)}</span>
                          <span className="block text-[12px] text-ink3">{!m.recurring ? (worth ? `→ ${rupeesShort(worth)}` : '') : inv.status === 'active' ? relDay(inv.nextDate, state.today) : '—'}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 px-1 text-[12.5px] text-ink3">Debits due before payday are kept out of safe-to-spend.</p>
            </section>
          )}

          {/* 4. Inside: the growth calculator and the recent debits */}
          {activeList.length > 0 && (
            <button type="button" className="tap flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 text-left" onClick={() => ui.openSheet({ type: 'inv-growth' })}>
              <img src="/illustrations/plant.webp" alt="" aria-hidden="true" width={412} height={420} decoding="async" className="h-[64px] w-[64px] shrink-0 object-contain" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ink3">Keep going 10 years and it could be</span>
                <span className="num block text-[22px] font-bold text-accent-ink">{rupeesShort(in10)}</span>
                <span className="block text-[13px] font-semibold text-ink2">Try other years and returns</span>
              </span>
              <Icon name="chevron" size={18} className="shrink-0 text-ink3" />
            </button>
          )}
          {recent.length > 0 && <NavRow icon="receipt" label="Recent debits" sub={`${recent.length} recorded · last on ${fmtDate(recent[0].date)}`} onClick={() => ui.openSheet({ type: 'inv-debits' })} />}
          {holdings.length > 0 && (
            <button type="button" className="btn-quiet w-full" onClick={() => ui.openSheet({ type: 'composer', preset: { type: 'transfer', toAccount: holdings[0].id } })}>
              <Icon name="plus" size={16} /> Invest a lump sum
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const SPLIT_COLORS = ['rgb(var(--accent))', 'rgb(var(--ink) / .72)', '#E9A23B', 'rgb(var(--pos))', 'rgb(var(--ink3))'];

/** The return PULSE assumes to start with: the SIPs' own expected returns, weighted by amount. */
function defaultRate(state: ReturnType<typeof useStore>['state']) {
  const t = investmentTotals(state);
  const act = (state.investments ?? []).filter((i) => i.status === 'active');
  const w = t.monthly > 0 ? act.reduce((a, i) => a + i.expectedReturn * investmentMonthly(i), 0) / t.monthly : 12;
  return Math.round(w * 10) / 10;
}

/** What the active SIPs (each with its own step-up), plus what's already held, could grow to. */
function growthProjection(state: ReturnType<typeof useStore>['state'], years: number, rate: number, withHoldings: boolean) {
  const t = investmentTotals(state);
  const h = sipProjection(0, years, rate, withHoldings ? t.holdings : 0);
  return (state.investments ?? [])
    .filter((i) => i.status === 'active')
    .reduce(
      (acc, i) => {
        const p = sipProjection(investmentMonthly(i), years, rate, 0, i.stepUp ?? 0);
        return { invested: acc.invested + p.invested, value: acc.value + p.value, gain: acc.gain + p.gain };
      },
      { invested: h.invested, value: h.value, gain: h.gain },
    );
}

/** Sheet: "What this could grow to", with the years and return sliders. */
export function InvestGrowth() {
  const { state } = useStore();
  const t = investmentTotals(state);
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState(() => defaultRate(state));
  const [withHoldings, setWithHoldings] = useState(true);
  const proj = growthProjection(state, years, rate, withHoldings);
  const investedPct = proj.value > 0 ? proj.invested / proj.value : 1;
  return (
    <div>
      <div className="flex flex-col gap-3">
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
        {t.holdings > 0 && (
          <label className="flex items-center gap-2.5 text-[14px]">
            <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={withHoldings} onChange={(e) => setWithHoldings(e.target.checked)} />
            Include the {rupeesShort(t.holdings)} you already hold
          </label>
        )}
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
    </div>
  );
}

/** Sheet: every SIP debit and lump sum PULSE has recorded. */
export function InvestDebits() {
  const { state } = useStore();
  return <TransactionList txs={state.transactions.filter((x) => x.category === 'investments')} emptyText="No investment debits yet." />;
}

// ------------------------------------------------------------------
// Install as an app (PWA)
// ------------------------------------------------------------------
/** A money tile on the You tab: what it is and its number. */
function MoneyTile({ icon, label, short, value, onClick }: { icon: string; label: string; short?: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${label}, ${value}`} className="tap flex min-h-[84px] flex-col justify-between rounded-2xl border border-line bg-surface p-3.5 text-left hover:border-ink3/40">
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-ink2">{short ?? label}</span>
        <Icon name={icon} size={16} className="shrink-0 text-ink3" />
      </span>
      <span className="num block truncate text-[19px] font-bold">{value}</span>
    </button>
  );
}

/** A small square shortcut: icon over a short label. */
function MiniTile({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tap flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-sunk/70 px-1 text-center hover:bg-sunk">
      <Icon name={icon} size={19} className="text-ink2" />
      <span className="text-[11.5px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

/** One short settings row inside a card: icon, label, the current value. */
function SetRow({ icon, emoji, label, value, onClick }: { icon?: string; emoji?: string; label: string; value?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tap flex min-h-[50px] w-full items-center gap-3 px-4 text-left hover:bg-sunk/60">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-sunk text-ink2" aria-hidden="true">
        {emoji ? <span className="text-[15px]">{emoji}</span> : <Icon name={icon!} size={16} />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{label}</span>
      {value && <span className="max-w-[46%] shrink-0 truncate text-[13px] text-ink3">{value}</span>}
      <Icon name="chevron" size={16} className="shrink-0 text-ink3" />
    </button>
  );
}

/** Install PULSE as one row: installs straight away where the browser allows, otherwise shows how. */
function InstallRow() {
  const inst = useInstall();
  const { toast } = useStore();
  const ui = useUI();
  if (inst.installed) return <SetRow icon="check" label="PULSE is installed" value="Help a friend" onClick={() => ui.push({ name: 'install' })} />;
  return (
    <SetRow
      icon="download"
      label="Install PULSE"
      value="Works offline"
      onClick={async () => {
        if (inst.canPrompt) {
          const r = await inst.prompt();
          if (r === 'accepted') toast({ text: 'PULSE is on your home screen.', tone: 'good' });
        } else ui.push({ name: 'install' });
      }}
    />
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
