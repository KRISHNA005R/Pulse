import type { Account, Budget, CategoryId, Debt, FundType, IncomeSource, Insurance, Investment, ISODate, Plan, PremiumCycle, State, Subscription, Transaction } from '../types';
import { hasCents, roundMoney } from './currency';
import { INSURANCE_ON } from './features';
import {
  addDays,
  addMonths,
  clamp,
  daysBetween,
  endOfMonth,
  fmtDate,
  inRange,
  monthKey,
  rupees,
  startOfMonth,
  startOfWeek,
} from './format';

// ------------------------------------------------------------------
// Transactions
// ------------------------------------------------------------------

/** What an expense actually cost *me* (group expenses I paid only count my share). */
export function myCost(s: State, tx: Transaction): number {
  if (tx.type !== 'expense') return 0;
  if (tx.splitId) {
    const sp = s.splits.find((x) => x.id === tx.splitId);
    if (sp) return sp.shares.find((sh) => sh.person === 'me')?.amount ?? 0;
  }
  return tx.amount;
}

export function spendBetween(s: State, start: ISODate, end: ISODate, cats?: CategoryId[]): number {
  let sum = 0;
  for (const tx of s.transactions) {
    if (tx.type !== 'expense' || !inRange(tx.date, start, end)) continue;
    if (cats && !cats.includes(tx.category)) continue;
    sum += myCost(s, tx);
  }
  return roundMoney(sum);
}

export function incomeBetween(s: State, start: ISODate, end: ISODate): number {
  return s.transactions
    .filter((t) => t.type === 'income' && inRange(t.date, start, end))
    .reduce((a, t) => a + t.amount, 0);
}

export function savedBetween(s: State, start: ISODate, end: ISODate): number {
  return s.transactions
    .filter((t) => t.type === 'transfer' && t.toAccount?.startsWith('pot:') && inRange(t.date, start, end))
    .reduce((a, t) => a + t.amount, 0);
}

/** Money moved into investments (SIPs and lump sums) in a date range. */
export function investedBetween(s: State, start: ISODate, end: ISODate): number {
  return s.transactions
    .filter((t) => t.type === 'transfer' && t.category === 'investments' && t.direction !== 'in' && inRange(t.date, start, end))
    .reduce((a, t) => a + t.amount, 0);
}

export function spendByCategory(s: State, start: ISODate, end: ISODate): { category: CategoryId; amount: number }[] {
  const m = new Map<CategoryId, number>();
  for (const tx of s.transactions) {
    if (tx.type !== 'expense' || !inRange(tx.date, start, end)) continue;
    m.set(tx.category, (m.get(tx.category) ?? 0) + myCost(s, tx));
  }
  return [...m.entries()].map(([category, amount]) => ({ category, amount: roundMoney(amount) })).sort((a, b) => b.amount - a.amount);
}

export const monthRange = (d: ISODate): [ISODate, ISODate] => [startOfMonth(d), endOfMonth(d)];
export const prevMonth = (d: ISODate): ISODate => addDays(startOfMonth(d), -1);

/** The account new expenses land in by default (first spendable bank, then any spendable). */
export function defaultAccount(s: State): string {
  return (s.accounts.find((a) => a.spendable && a.type === 'bank') ?? s.accounts.find((a) => a.spendable) ?? s.accounts[0])?.id ?? 'cash';
}

export function categoryName(s: State, id: CategoryId): string {
  return s.categories.find((c) => c.id === id)?.name ?? 'Other';
}

// ------------------------------------------------------------------
// Safe to spend
// ------------------------------------------------------------------

export interface UpcomingItem {
  id: string;
  name: string;
  amount: number;
  date: ISODate;
  kind: 'subscription' | 'bill' | 'card' | 'loan' | 'income' | 'investment' | 'insurance';
  /** Recorded by PULSE on the date (SIPs, EMIs, bills, subscriptions, auto-debit premiums). */
  auto?: boolean;
  ref?: string;
}

/**
 * The income the month runs on: the one marked main, otherwise the biggest fixed-date salary.
 * A second job paying mid-month doesn't cut the month short.
 */
export function mainIncome(s: State): IncomeSource | undefined {
  const fixed = s.incomes.filter((i) => i.cycle === 'monthly' && i.nextDate);
  // Marked main wins; otherwise the biggest salary, skipping ones the person said aren't main.
  return fixed.find((i) => i.main === true) ?? [...fixed].sort((a, b) => Number(a.main === false) - Number(b.main === false) || b.expected - a.expected)[0];
}

/** Next main payday after today. Safe-to-spend lasts until then. */
export function nextPayday(s: State): ISODate {
  const m = mainIncome(s);
  if (!m?.nextDate) return addDays(endOfMonth(s.today), 1);
  let d = m.nextDate;
  let guard = 0;
  while (d <= s.today && guard++ < 24) d = addMonths(d, 1);
  return d;
}

/** Other fixed-date income expected before the next main payday (not counted until it lands). */
export function paydaysBefore(s: State, until: ISODate): { income: IncomeSource; date: ISODate }[] {
  const m = mainIncome(s);
  return s.incomes
    .filter((i) => i !== m && i.cycle === 'monthly' && i.nextDate && i.nextDate > s.today && i.nextDate < until)
    .map((i) => ({ income: i, date: i.nextDate! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Every money event from today (inclusive) up to `until` (exclusive). */
export function upcoming(s: State, until: ISODate, includeIncome = false): UpcomingItem[] {
  const out: UpcomingItem[] = [];
  for (const sub of s.subscriptions) {
    if (sub.status === 'paused' || sub.status === 'cancelled') continue;
    if (sub.nextDate >= s.today && sub.nextDate < until)
      out.push({ id: sub.id, name: sub.name, amount: sub.amount, date: sub.nextDate, kind: sub.kind, ref: sub.id, auto: sub.autoDebit !== false });
  }
  for (const c of s.cards) {
    if (c.status === 'due' && c.dueDate >= s.today && c.dueDate < until)
      out.push({ id: c.id, name: `${c.name} card bill`, amount: c.minDue, date: c.dueDate, kind: 'card', ref: c.id });
  }
  for (const d of s.debts) {
    if (d.remaining <= 0) continue; // paid off
    // An EMI that's past due and not marked paid still has to be paid, so it stays on the list.
    const due = debtDue(s, d);
    if (due < until) out.push({ id: d.id, name: emiName(d), amount: emiParts(d).amount, date: due, kind: 'loan', ref: d.id, auto: d.autoDebit !== false });
  }
  for (const inv of s.investments ?? []) {
    if (inv.status !== 'active') continue;
    if (inv.nextDate >= s.today && inv.nextDate < until)
      out.push({ id: inv.id, name: `SIP · ${inv.name}`, amount: inv.amount, date: inv.nextDate, kind: 'investment', ref: inv.id });
  }
  for (const p of INSURANCE_ON ? (s.insurance ?? []) : []) {
    // A premium that's past due and not recorded yet still has to be paid, so it stays on the list.
    if (p.nextDate < until) out.push({ id: p.id, name: `${p.name} premium`, amount: p.premium, date: p.nextDate, kind: 'insurance', ref: p.id, auto: p.autoDebit });
  }
  if (includeIncome) {
    for (const i of s.incomes) {
      if (i.nextDate && i.nextDate >= s.today && i.nextDate < until)
        out.push({ id: i.id, name: i.kind === 'salary' ? 'Salary' : i.name, amount: i.expected, date: i.nextDate, kind: 'income' });
    }
  }
  return out.sort((a, b) => (a.date === b.date ? b.amount - a.amount : a.date.localeCompare(b.date)));
}

/**
 * Move money for one transaction (sign 1) or take it back (sign -1). Everything that changes a
 * balance goes through here, so accounts, cards, plan pots and loans stay consistent.
 */
export function applyMoney(s: State, tx: Transaction, sign: 1 | -1) {
  const acct = s.accounts.find((a) => a.id === tx.account);
  const card = s.cards.find((c) => c.id === tx.account);
  const amt = tx.amount * sign;
  if (tx.type === 'expense') {
    if (card) card.balance += amt;
    else if (acct) acct.balance -= amt;
    // A loan EMI also brings down what's left on the loan, by the part that isn't interest.
    if (tx.debtId && tx.principal) {
      const d = s.debts.find((x) => x.id === tx.debtId);
      if (d) d.remaining = roundMoney(Math.max(0, d.remaining - tx.principal * sign));
    }
  } else if (tx.type === 'income') {
    if (acct) acct.balance += amt;
  } else {
    const out = tx.direction !== 'in';
    if (acct) acct.balance += out ? -amt : amt;
    if (tx.toAccount?.startsWith('pot:')) {
      const plan = s.plans.find((p) => `pot:${p.id}` === tx.toAccount);
      if (plan) plan.saved = Math.max(0, plan.saved + amt);
    } else if (tx.toAccount) {
      const to = s.accounts.find((a) => a.id === tx.toAccount);
      if (to) to.balance += amt;
    }
  }
}

/**
 * One EMI, split the way a lender does: this month's interest first, the rest comes off the loan.
 * With no interest rate, the whole EMI comes off. The last EMI is only what's still owed.
 */
export function emiParts(d: Debt): { amount: number; interest: number; principal: number } {
  const interest = d.rate > 0 ? roundMoney((d.remaining * d.rate) / 1200) : 0;
  const amount = roundMoney(Math.min(d.minPayment, d.remaining + interest));
  const principal = roundMoney(Math.max(0, Math.min(d.remaining, amount - interest)));
  return { amount, interest: roundMoney(amount - principal), principal };
}

/** "Bike loan EMI", without doubling the word when the loan is already called "Phone EMI". */
export const emiName = (d: Debt) => (/\bemi\b/i.test(d.name) ? d.name : `${d.name} EMI`);

/** When a loan's next EMI is due. */
export function debtDue(s: State, d: Debt): ISODate {
  return d.nextDate ?? nextDayOfMonth(s.today, d.dueDay);
}

/** Where invested money sits: investment accounts, plus any account a SIP pays into. */
export function holdingAccounts(s: State): Account[] {
  const targets = new Set((s.investments ?? []).map((i) => i.toAccount));
  return s.accounts.filter((a) => a.type === 'investment' || targets.has(a.id));
}

export function nextDayOfMonth(today: ISODate, day: number): ISODate {
  const d = `${today.slice(0, 8)}${String(day).padStart(2, '0')}`;
  if (d >= today) return d;
  const nm = addDays(endOfMonth(today), 1);
  return `${nm.slice(0, 8)}${String(day).padStart(2, '0')}`;
}

// ------------------------------------------------------------------
// Insurance
// ------------------------------------------------------------------

export const PREMIUM_MONTHS: Record<PremiumCycle, number> = { monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12 };
export const PREMIUM_LABEL: Record<PremiumCycle, string> = { monthly: 'monthly', quarterly: 'every 3 months', 'half-yearly': 'every 6 months', yearly: 'yearly' };

/** Start and length (in days) of the stretch a premium is saved up over. */
function premiumPeriod(p: Insurance): { start: ISODate; days: number } {
  const full = addMonths(p.nextDate, -PREMIUM_MONTHS[p.cycle]);
  const start = p.since && p.since > full && p.since < p.nextDate ? p.since : full;
  return { start, days: Math.max(1, daysBetween(start, p.nextDate)) };
}

/**
 * How much of a big premium should already be kept aside by `by` (the next payday).
 * A yearly ₹12,000 premium grows by about ₹1,000 each pay cycle, so the due date is never a shock.
 * Monthly premiums, and premiums due before payday, are plain bills instead.
 */
export function premiumSetAside(p: Insurance, by: ISODate): number {
  if (!p.spread || p.cycle === 'monthly' || p.nextDate < by) return 0;
  const { start, days } = premiumPeriod(p);
  return roundMoney((p.premium * clamp(daysBetween(start, by), 0, days)) / days);
}

/** Roughly what a premium costs per month. */
export const premiumMonthly = (p: Insurance) => p.premium / PREMIUM_MONTHS[p.cycle];

export function insuranceTotals(s: State) {
  const list = s.insurance ?? [];
  const next = [...list].sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
  return {
    count: list.length,
    yearly: Math.round(list.reduce((a, p) => a + premiumMonthly(p) * 12, 0)),
    monthly: Math.round(list.reduce((a, p) => a + premiumMonthly(p), 0)),
    cover: list.reduce((a, p) => a + (p.cover ?? 0), 0),
    next,
  };
}

export interface SafeToSpend {
  available: number;
  bills: number;
  billItems: UpcomingItem[];
  /** SIPs and other investments debited before payday. */
  invest: number;
  /** Kept aside this cycle for insurance premiums due after payday. */
  setAside: number;
  setAsideItems: { policy: Insurance; amount: number }[];
  investItems: UpcomingItem[];
  goals: number;
  goalItems: { plan: Plan; amount: number }[];
  buffer: number;
  safe: number;
  daily: number;
  daysLeft: number;
  payday: ISODate;
}

export function safeToSpend(s: State): SafeToSpend {
  const available = s.accounts.filter((a) => a.spendable).reduce((a, x) => a + x.balance, 0);
  const payday = nextPayday(s);
  const all = upcoming(s, payday);
  const billItems = all.filter((u) => u.kind !== 'investment');
  const investItems = all.filter((u) => u.kind === 'investment');
  const bills = billItems.reduce((a, b) => a + b.amount, 0);
  const invest = investItems.reduce((a, b) => a + b.amount, 0);
  const goalItems = s.plans.filter((p) => p.status === 'active' && p.cycleReserve > 0).map((plan) => ({ plan, amount: plan.cycleReserve }));
  const goals = goalItems.reduce((a, g) => a + g.amount, 0);
  const setAsideItems = (INSURANCE_ON ? (s.insurance ?? []) : []).map((policy) => ({ policy, amount: premiumSetAside(policy, payday) })).filter((x) => x.amount > 0);
  const setAside = setAsideItems.reduce((a, x) => a + x.amount, 0);
  const buffer = s.settings.buffer;
  const safe = Math.max(0, roundMoney(available - bills - invest - goals - setAside - buffer));
  const daysLeft = Math.max(1, daysBetween(s.today, payday));
  return { available, bills, billItems, invest, investItems, setAside, setAsideItems, goals, goalItems, buffer, safe, daily: hasCents() ? Math.floor((safe / daysLeft) * 100) / 100 : Math.floor(safe / daysLeft), daysLeft, payday };
}

// ------------------------------------------------------------------
// Plans
// ------------------------------------------------------------------

export interface PlanMetrics {
  progress: number;
  remaining: number;
  daysLeft: number;
  expected: number;
  daysAhead: number;
  monthly: number;
  weekExtra: number;
  tone: 'ahead' | 'on-track' | 'behind' | 'done' | 'paused';
  status: string;
  short: string;
  projectedDate: ISODate | null;
  spent: number;
}

export function planMetrics(s: State, p: Plan): PlanMetrics {
  const total = Math.max(1, daysBetween(p.startDate, p.targetDate));
  const elapsed = clamp(daysBetween(p.startDate, s.today), 0, total);
  const daysLeft = Math.max(0, daysBetween(s.today, p.targetDate));
  const progress = clamp(p.saved / p.target, 0, 1);
  const remaining = Math.max(0, p.target - p.saved);
  const expected = (p.target * elapsed) / total;
  const perDay = p.target / total;
  const diff = p.saved - expected;
  const daysAhead = Math.round(diff / perDay);
  const monthsLeft = Math.max(daysLeft / 30.44, 0.5);
  const monthly = remaining === 0 ? 0 : Math.ceil(remaining / monthsLeft / 50) * 50;
  const weekExtra = diff < 0 ? Math.round(-diff / 10) * 10 : 0;
  const pace = elapsed > 0 ? p.saved / elapsed : 0;
  const projectedDate = remaining === 0 ? s.today : pace > 0 ? addDays(s.today, Math.ceil(remaining / pace)) : null;
  const spent = s.transactions.filter((t) => t.plan === p.id && t.type === 'expense').reduce((a, t) => a + myCost(s, t), 0);

  let tone: PlanMetrics['tone'];
  let status: string;
  let short: string;
  if (p.saved >= p.target || p.status === 'done') {
    tone = 'done';
    status = 'Fully funded. Enjoy it.';
    short = 'Funded';
  } else if (p.status === 'paused') {
    tone = 'paused';
    status = 'Paused. Nothing is set aside for this right now.';
    short = 'Paused';
  } else if (daysAhead >= 2) {
    tone = 'ahead';
    status = `You're ${daysAhead} days ahead of schedule.`;
    short = `${daysAhead} days ahead`;
  } else if (daysAhead <= -2) {
    tone = 'behind';
    status =
      weekExtra <= monthly
        ? `You need ${rupees(weekExtra)} extra this week to stay on track.`
        : `Saving ${rupees(monthly)}/month from now still gets you there by ${fmtDate(p.targetDate)}.`;
    short = weekExtra <= monthly ? `${rupees(weekExtra)} to catch up` : `${rupees(monthly)}/mo needed`;
  } else {
    tone = 'on-track';
    status = 'Right on schedule.';
    short = 'On track';
  }
  return { progress, remaining, daysLeft, expected, daysAhead, monthly, weekExtra, tone, status, short, projectedDate, spent: roundMoney(spent) };
}

// ------------------------------------------------------------------
// Budgets
// ------------------------------------------------------------------

export function budgetWindow(b: Budget, today: ISODate): [ISODate, ISODate] {
  if (b.period === 'weekly') {
    const st = startOfWeek(today);
    return [st, addDays(st, 6)];
  }
  if (b.period === 'custom' && b.start && b.end) return [b.start, b.end];
  return monthRange(today);
}

export interface BudgetState {
  spent: number;
  left: number;
  ratio: number;
  elapsed: number;
  status: 'healthy' | 'close' | 'over';
  label: string;
  window: [ISODate, ISODate];
}

export function budgetState(s: State, b: Budget): BudgetState {
  const window = budgetWindow(b, s.today);
  const spent = spendBetween(s, window[0], window[1], [b.category]);
  const ratio = spent / b.amount;
  const len = daysBetween(window[0], window[1]) + 1;
  const elapsed = clamp((daysBetween(window[0], s.today) + 1) / len, 0, 1);
  const status: BudgetState['status'] = ratio > 1 ? 'over' : ratio >= 0.9 || ratio > elapsed + 0.15 ? 'close' : 'healthy';
  const label = status === 'over' ? 'Over budget' : status === 'close' ? 'Getting close' : 'Healthy';
  return { spent, left: b.amount - spent, ratio, elapsed, status, label, window };
}

export function budgetFor(s: State, cat: CategoryId): Budget | undefined {
  return s.budgets.find((b) => b.category === cat);
}

// ------------------------------------------------------------------
// Social money
// ------------------------------------------------------------------

/** Positive = they owe me. Negative = I owe them. Optionally scoped to one group. */
export function personBalances(s: State, groupId?: string): Map<string, number> {
  const net = new Map<string, number>();
  const add = (p: string, v: number) => net.set(p, (net.get(p) ?? 0) + v);
  for (const sp of s.splits) {
    if (groupId && sp.group !== groupId) continue;
    for (const sh of sp.shares) {
      if (sh.person === sp.paidBy) continue;
      if (sp.paidBy === 'me') add(sh.person, sh.amount);
      else if (sh.person === 'me') add(sp.paidBy, -sh.amount);
    }
  }
  for (const st of s.settlements) {
    if (groupId && st.group !== groupId) continue;
    if (st.to === 'me') add(st.from, -st.amount);
    if (st.from === 'me') add(st.to, st.amount);
  }
  for (const [k, v] of net) net.set(k, roundMoney(v));
  return net;
}

/**
 * A group as a whole: what each person is up or down across everyone, not just against me.
 * Positive = the group owes them. Negative = they owe the group. 'me' is included.
 */
export function groupNet(s: State, groupId: string): Map<string, number> {
  const net = new Map<string, number>();
  const add = (p: string, v: number) => net.set(p, (net.get(p) ?? 0) + v);
  for (const sp of s.splits) {
    if (sp.group !== groupId) continue;
    for (const sh of sp.shares) {
      if (sh.person === sp.paidBy) continue;
      add(sp.paidBy, sh.amount);
      add(sh.person, -sh.amount);
    }
  }
  for (const st of s.settlements) {
    if (st.group !== groupId) continue;
    add(st.from, st.amount);
    add(st.to, -st.amount);
  }
  for (const [k, v] of net) net.set(k, roundMoney(v));
  return net;
}

export function groupSummary(s: State, groupId: string) {
  const bal = personBalances(s, groupId);
  let youOwe = 0;
  let owedToYou = 0;
  for (const v of bal.values()) {
    if (v < 0) youOwe += -v;
    else owedToYou += v;
  }
  const expenses = s.splits.filter((x) => x.group === groupId);
  const total = expenses.reduce((a, x) => a + x.amount, 0);
  return { total, youOwe, owedToYou, balances: bal, expenses };
}

export function socialTotals(s: State) {
  const bal = personBalances(s);
  let youOwe = 0;
  let owedToYou = 0;
  for (const v of bal.values()) {
    if (v < 0) youOwe += -v;
    else owedToYou += v;
  }
  return { youOwe, owedToYou, balances: bal };
}

export function personName(s: State, id: string): string {
  if (id === 'me') return 'You';
  return s.people.find((p) => p.id === id)?.short ?? 'Someone';
}

// ------------------------------------------------------------------
// Subscriptions
// ------------------------------------------------------------------

export function monthlyEquivalent(sub: Subscription): number {
  if (sub.cycle === 'yearly') return sub.amount / 12;
  if (sub.cycle === 'weekly') return (sub.amount * 52) / 12;
  return sub.amount;
}

export function recurringTotals(s: State, kind?: Subscription['kind']) {
  const live = s.subscriptions.filter((x) => (x.status === 'active' || x.status === 'unknown') && (!kind || x.kind === kind));
  const monthly = Math.round(live.reduce((a, x) => a + monthlyEquivalent(x), 0));
  return { monthly, yearly: monthly * 12, count: live.length };
}

export interface Detection {
  key: string;
  kind: 'recurring' | 'duplicate';
  merchant: string;
  amount: number;
  text: string;
  dates: ISODate[];
  category: CategoryId;
}

/** Finds likely subscriptions we don't track yet, and same-day duplicate charges. */
export function detections(s: State): Detection[] {
  const out: Detection[] = [];
  const tracked = new Set(s.subscriptions.map((x) => x.name.toLowerCase()));
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of s.transactions) {
    if (t.type !== 'expense') continue;
    const arr = byMerchant.get(t.merchant) ?? [];
    arr.push(t);
    byMerchant.set(t.merchant, arr);
  }
  for (const [merchant, txs] of byMerchant) {
    const months = new Set(txs.map((t) => monthKey(t.date)));
    const amounts = txs.map((t) => t.amount);
    const same = Math.max(...amounts) - Math.min(...amounts) <= Math.max(...amounts) * 0.05;
    const trackedAlready = [...tracked].some((n) => merchant.toLowerCase().includes(n) || n.includes(merchant.toLowerCase().split(' ')[0]));
    const alreadyRecurring = txs.some((t) => t.recurring);
    if (months.size >= 2 && same && !trackedAlready && !alreadyRecurring && txs.length === months.size) {
      const key = `rec:${merchant}`;
      if (!s.dismissedDetections.includes(key))
        out.push({ key, kind: 'recurring', merchant, amount: txs[0].amount, category: txs[0].category, dates: txs.map((t) => t.date), text: `${merchant} charged ${rupees(txs[0].amount)} in ${months.size} months in a row.` });
    }
    // duplicates: same merchant + amount + day
    const seen = new Map<string, Transaction[]>();
    for (const t of txs) {
      const k = `${t.date}|${t.amount}`;
      seen.set(k, [...(seen.get(k) ?? []), t]);
    }
    for (const [k, list] of seen) {
      if (list.length < 2) continue;
      const key = `dup:${merchant}:${k}`;
      if (!s.dismissedDetections.includes(key))
        out.push({ key, kind: 'duplicate', merchant, amount: list[0].amount, category: list[0].category, dates: list.map((t) => t.date), text: `${merchant} charged ${rupees(list[0].amount)} twice on ${fmtDate(list[0].date)}.` });
    }
  }
  return out;
}

// ------------------------------------------------------------------
// Net worth
// ------------------------------------------------------------------

export function netWorth(s: State) {
  const cash = s.accounts.filter((a) => a.type === 'cash' || a.type === 'wallet').reduce((a, x) => a + x.balance, 0);
  const bank = s.accounts.filter((a) => a.type === 'bank').reduce((a, x) => a + x.balance, 0);
  const savings = s.plans.reduce((a, p) => a + p.saved, 0) + s.accounts.filter((a) => a.type === 'savings').reduce((a, x) => a + x.balance, 0);
  const investments = s.accounts.filter((a) => a.type === 'investment').reduce((a, x) => a + x.balance, 0);
  const cards = s.cards.reduce((a, c) => a + c.balance, 0);
  const loans = s.debts.reduce((a, d) => a + d.remaining, 0);
  const assets = cash + bank + savings + investments;
  const liabilities = cards + loans;
  const total = assets - liabilities;
  const history = [...s.netWorthHistory, { month: monthKey(s.today), value: total }];
  return {
    total,
    assets,
    liabilities,
    rows: [
      { key: 'cash', label: 'Cash', value: cash },
      { key: 'bank', label: 'Bank accounts', value: bank },
      { key: 'savings', label: 'Savings & plans', value: savings },
      { key: 'investments', label: 'Investments', value: investments },
      { key: 'cards', label: 'Credit cards', value: -cards },
      { key: 'loans', label: 'Loans', value: -loans },
    ],
    history,
  };
}

// ------------------------------------------------------------------
// Debt payoff
// ------------------------------------------------------------------

export function payoffMonths(balance: number, ratePct: number, payment: number): number | null {
  const r = ratePct / 100 / 12;
  if (payment <= balance * r) return null;
  if (r === 0) return Math.ceil(balance / payment);
  return Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r));
}

export function payoffInterest(balance: number, ratePct: number, payment: number): number {
  const m = payoffMonths(balance, ratePct, payment);
  if (m == null) return Infinity;
  return Math.max(0, Math.round(m * payment - balance));
}

// ------------------------------------------------------------------
// Investments & SIPs
// ------------------------------------------------------------------

export const CYCLE_MONTHS: Record<Investment['cycle'], number> = { monthly: 1, quarterly: 3, yearly: 12 };

export function investmentMonthly(inv: Investment): number {
  return inv.amount / CYCLE_MONTHS[inv.cycle];
}

export function investmentTotals(s: State) {
  const list = s.investments ?? [];
  const active = list.filter((i) => i.status === 'active');
  const monthly = Math.round(active.reduce((a, i) => a + investmentMonthly(i), 0));
  const holdings = holdingAccounts(s).reduce((a, x) => a + x.balance, 0);
  const next = active.slice().sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
  return { monthly, yearly: monthly * 12, holdings, count: active.length, next };
}

/** Total put in so far through instalments PULSE has recorded for one investment. */
export function investedIn(s: State, id: string): number {
  return s.transactions.filter((t) => t.investmentId === id && t.direction !== 'in').reduce((a, t) => a + t.amount, 0);
}

/** Date of the first instalment PULSE recorded for an investment. */
export function firstRecorded(s: State, id: string): ISODate | null {
  let first: ISODate | null = null;
  for (const t of s.transactions) if (t.investmentId === id && (!first || t.date < first)) first = t.date;
  return first;
}

/** Everything put into one investment: older instalments from before PULSE plus recorded ones. */
export function investedTotal(s: State, inv: Investment): number {
  return (inv.priorInvested ?? 0) + investedIn(s, inv.id);
}

/** Mutual fund categories with a sensible long-run return to assume (a guess, not a promise). */
export const FUND_TYPES: { value: FundType; label: string; rate: number }[] = [
  { value: 'large', label: 'Large cap', rate: 11 },
  { value: 'index', label: 'Index (Nifty 50)', rate: 11 },
  { value: 'flexi', label: 'Flexi cap', rate: 12 },
  { value: 'hybrid', label: 'Hybrid', rate: 9 },
  { value: 'mid', label: 'Mid cap', rate: 13 },
  { value: 'small', label: 'Small cap', rate: 14 },
  { value: 'elss', label: 'ELSS (tax saver)', rate: 12 },
  { value: 'debt', label: 'Debt', rate: 7 },
];

/**
 * Instalment dates from `start` up to (not including) `before`, one every cycle.
 * Used to estimate what went in before someone started using PULSE.
 */
export function instalmentDates(start: ISODate, before: ISODate, cycle: Investment['cycle']): ISODate[] {
  const out: ISODate[] = [];
  let d = start;
  let guard = 0;
  while (d < before && guard++ < 600) {
    out.push(d);
    d = addMonths(d, CYCLE_MONTHS[cycle]);
  }
  return out;
}

/**
 * Estimate of the money put in between `start` and `before` for an instalment that is `amount`
 * today. With a step-up, earlier years were smaller: each full year back divides by (1 + step).
 */
export function estimateInvested(amount: number, start: ISODate, before: ISODate, cycle: Investment['cycle'], stepUpPct = 0): { count: number; total: number } {
  const dates = instalmentDates(start, before, cycle);
  if (!dates.length) return { count: 0, total: 0 };
  const lastYear = Math.floor(monthsBetween(start, dates[dates.length - 1]) / 12);
  const total = dates.reduce((a, d) => {
    const yearsBack = lastYear - Math.floor(monthsBetween(start, d) / 12);
    return a + amount / Math.pow(1 + stepUpPct / 100, yearsBack);
  }, 0);
  return { count: dates.length, total: Math.round(total) };
}

function monthsBetween(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am) - (bd < ad ? 1 : 0);
}

/**
 * Future value of a monthly SIP (paid at the start of each month) plus what's already held.
 * With a step-up, the monthly amount rises by that % every 12 months.
 * Returns are an assumption for illustration, never a promise.
 */
export function sipProjection(monthly: number, years: number, ratePct: number, current = 0, stepUpPct = 0) {
  const n = Math.round(years * 12);
  const i = ratePct / 100 / 12;
  let value = current;
  let invested = current;
  let m = monthly;
  for (let k = 0; k < n; k++) {
    if (k > 0 && k % 12 === 0) m *= 1 + stepUpPct / 100;
    value = (value + m) * (1 + i);
    invested += m;
  }
  return { invested: Math.round(invested), value: Math.round(value), gain: Math.round(value - invested) };
}

// ------------------------------------------------------------------
// Paydays: has the salary landed?
// ------------------------------------------------------------------
export const incomeCategory = (kind: string): CategoryId => (kind === 'salary' ? 'salary' : kind === 'freelance' ? 'freelance' : 'income-other');

/**
 * Fixed-date income whose payday has come (in the last few days) but nothing matching has been
 * recorded yet. PULSE asks "did it land?" instead of assuming, unless the person turned on auto-add.
 */
export function pendingPaydays(s: State): { income: IncomeSource; date: ISODate }[] {
  const out: { income: IncomeSource; date: ISODate }[] = [];
  if (s.mode !== 'personal') return out;
  for (const i of s.incomes) {
    if (i.cycle !== 'monthly' || !i.nextDate || !(i.expected > 0) || i.autoCredit) continue;
    const date = i.nextDate <= s.today ? i.nextDate : addMonths(i.nextDate, -1);
    if (date > s.today || daysBetween(date, s.today) > 6) continue;
    if (s.dismissedDetections.includes(`payday:${i.id}:${date}`)) continue;
    const cat = incomeCategory(i.kind);
    const landed = s.transactions.some(
      (t) => t.type === 'income' && t.date >= addDays(date, -4) && (t.incomeId === i.id || (!t.incomeId && t.category === cat && Math.abs(t.amount - i.expected) <= i.expected * 0.35)),
    );
    if (!landed) out.push({ income: i, date });
  }
  return out;
}

export interface SourceMonth {
  income: IncomeSource;
  /** This calendar month's payday for the source. */
  date: ISODate;
  received: number;
  /** Still to come this month: the full amount until anything from this source lands. */
  pending: number;
  /** The payday to show next: next month's once this month's has landed. */
  next: ISODate;
}

/**
 * Income for the current calendar month, source by source. Money that lands from a fixed source
 * settles that source only; anything else (freelance, a gift, a refund) is "extra" and never
 * eats into what's still expected from a salary.
 */
export function incomeThisMonth(s: State): { sources: SourceMonth[]; expected: number; fixedReceived: number; pending: number; extra: number; total: number } {
  const ms = startOfMonth(s.today);
  const me = endOfMonth(s.today);
  const txs = s.transactions.filter((t) => t.type === 'income' && t.date >= ms && t.date <= me);
  const used = new Set<string>();
  const fixed = s.incomes.filter((i) => i.cycle === 'monthly' && i.nextDate && i.expected > 0);
  // Tagged payments first, so a guess never steals another source's money.
  const tagged = new Map(fixed.map((i) => [i.id, txs.filter((t) => t.incomeId === i.id)]));
  tagged.forEach((list) => list.forEach((t) => used.add(t.id)));
  const sources = fixed.map((i): SourceMonth => {
    const cat = incomeCategory(i.kind);
    const mine = [...tagged.get(i.id)!];
    if (!mine.length) {
      const guess = txs.find((t) => !used.has(t.id) && !t.incomeId && t.category === cat && Math.abs(t.amount - i.expected) <= i.expected * 0.35);
      if (guess) {
        used.add(guess.id);
        mine.push(guess);
      }
    }
    let date = i.nextDate!;
    for (let g = 0; date > me && g < 24; g++) date = addMonths(date, -1);
    for (let g = 0; date < ms && g < 24; g++) date = addMonths(date, 1);
    const received = mine.reduce((a, t) => a + t.amount, 0);
    return { income: i, date, received, pending: received > 0 ? 0 : i.expected, next: received > 0 ? addMonths(date, 1) : date };
  });
  const total = txs.reduce((a, t) => a + t.amount, 0);
  const fixedReceived = sources.reduce((a, x) => a + x.received, 0);
  return {
    sources,
    expected: sources.reduce((a, x) => a + x.income.expected, 0),
    fixedReceived,
    pending: sources.reduce((a, x) => a + x.pending, 0),
    extra: Math.max(0, total - fixedReceived),
    total,
  };
}
