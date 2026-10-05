import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  Account,
  Budget,
  Category,
  CreditCard,
  Debt,
  Door,
  FriendLink,
  Group,
  GroupShare,
  Person,
  Plan,
  Settings,
  Settlement,
  SplitExpense,
  State,
  Subscription,
  Transaction,
  IncomeSource,
  Insurance,
  ISODate,
  Investment,
} from '../types';
import { CATEGORIES, createSeed } from '../data/seed';
import { roundMoney, setCurrency } from '../lib/currency';
import { burst } from '../lib/celebrate';
import { INSURANCE_ON } from '../lib/features';
import { streak } from '../lib/streak';
import { markDemo, startStats, track } from '../lib/stats';
import { loadBase, loadSync, merge3, newSyncCode, normalizeCode, pull, push, removeRemote, sameData, saveBase, saveSync, SyncUnavailable } from '../lib/sync';
import { suggestEmoji } from '../lib/lexicon';
import { acceptKnock, applyBox, applyGroup, closeDoor, inGroupOnPulse, deleteGroupChannel, removeGroup, leaveChannel, leaveGroupChannel, mergePeople as mergePeopleIn, newDoor, newShare, unshareGroup as unshareGroupIn, type Box, type BoxItem, type GroupNews, type GroupView } from '../lib/friends';
import { addDays, addMonths, daysBetween, fmtDate, haptic, monthKey, realToday, rupees, uid } from '../lib/format';
import { applyMoney, budgetFor, budgetState, categoryName, CYCLE_MONTHS, PREMIUM_MONTHS, debtDue, defaultAccount, emiName, emiParts, incomeCategory, investedTotal, netWorth, nextDayOfMonth, planMetrics, prevMonth, safeToSpend } from '../lib/finance';

// Pure state transitions. Every mutation that moves money goes through applyMoney()
// (lib/finance.ts) so balances, cards, plan pots and loans stay consistent.

/** The demo month is frozen, so nothing is recorded by the calendar there. */
const personal = (s: State) => s.mode === 'personal';

type Draft = (s: State) => void;
function produce(state: State, fn: Draft): State {
  const next = structuredClone(state);
  fn(next);
  return next;
}

export type NewTx = Omit<Transaction, 'id' | 'status'> & { status?: Transaction['status'] };

export interface NewSplit {
  group?: string;
  description: string;
  amount: number;
  paidBy: string;
  date: string;
  mode: SplitExpense['mode'];
  shares: SplitExpense['shares'];
  category: string;
  plan?: string;
  account?: string;
  notes?: string;
}

export interface SyncStatus {
  enabled: boolean;
  code: string | null;
  status: 'idle' | 'syncing' | 'synced' | 'offline' | 'no-server' | 'error';
  lastSync: string | null;
}

export interface Toast {
  id: string;
  text: string;
  tone?: 'good' | 'neutral' | 'heads-up';
  action?: { label: string; run: () => void };
  /** A big emoji shown instead of the check, with a little bounce (🔥, 🎉, 💸). */
  emoji?: string;
}

// ------------------------------------------------------------------

const KEY = 'pulse-state-v1';
/** While someone with their own data explores the demo, their data waits here untouched. */
const STASH = 'pulse-personal-stash-v1';

function readStash(): State | null {
  try {
    const raw = localStorage.getItem(STASH);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function writeStash(s: State | null) {
  try {
    if (s) localStorage.setItem(STASH, JSON.stringify(s));
    else localStorage.removeItem(STASH);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Record every SIP instalment that has fallen due (on or before today) as a transfer
 * from the paying account into the investment account, then move to the next date.
 */
export function processDueInvestments(s: State): Transaction[] {
  const made: Transaction[] = [];
  for (const inv of s.investments ?? []) {
    if (inv.status !== 'active' || !inv.autoDeduct) continue;
    let guard = 0;
    while (inv.nextDate <= s.today && guard++ < 24) {
      // Yearly step-up: on each anniversary of the start date, the instalment grows by stepUp %.
      if (inv.stepUp && inv.stepUp > 0) {
        let base = inv.lastStepUp ?? inv.startDate;
        let g = 0;
        while (addMonths(base, 12) <= inv.nextDate && g++ < 50) {
          base = addMonths(base, 12);
          inv.amount = roundMoney(inv.amount * (1 + inv.stepUp / 100));
        }
        inv.lastStepUp = base;
      }
      const tx: Transaction = {
        // Same id on every device, so two synced phones recording the same debit don't double it.
        id: `sip-${inv.id}-${inv.nextDate}`,
        merchant: `SIP · ${inv.name}`,
        amount: inv.amount,
        type: 'transfer',
        direction: 'out',
        toAccount: inv.toAccount,
        category: 'investments',
        date: inv.nextDate,
        account: inv.fromAccount,
        recurring: true,
        status: 'completed',
        investmentId: inv.id,
        notes: inv.platform ? `Auto-debit · ${inv.platform}` : 'Auto-debit',
      };
      s.transactions.unshift(tx);
      applyMoney(s, tx, 1);
      made.push(tx);
      inv.nextDate = addMonths(inv.nextDate, CYCLE_MONTHS[inv.cycle]);
    }
  }
  return made;
}

/** One EMI as a transaction: the whole EMI leaves the account, and `principal` comes off the loan. */
function emiTx(s: State, d: Debt, date: ISODate, how: string): Transaction {
  const part = emiParts(d);
  const account = d.account && (s.accounts.some((a) => a.id === d.account) || s.cards.some((c) => c.id === d.account)) ? d.account : defaultAccount(s);
  return {
    // Same id on every synced device, so an EMI is never recorded twice.
    id: `emi-${d.id}-${debtDue(s, d)}`,
    merchant: emiName(d),
    amount: part.amount,
    type: 'expense',
    category: 'bills',
    date,
    account,
    recurring: true,
    status: 'completed',
    debtId: d.id,
    principal: part.principal,
    notes: part.interest > 0 ? `${how} · ${rupees(part.principal)} off the loan, ${rupees(part.interest)} interest` : how,
  };
}

/** Record one EMI and move the loan to its next date. Returns nothing if this EMI is already recorded. */
function payEmi(s: State, d: Debt, date: ISODate, how: string): Transaction | null {
  const tx = emiTx(s, d, date, how);
  const fresh = !s.transactions.some((t) => t.id === tx.id);
  if (fresh) {
    s.transactions.unshift(tx);
    applyMoney(s, tx, 1);
  }
  d.nextDate = addMonths(debtDue(s, d), 1);
  return fresh ? tx : null;
}

/**
 * Record every loan EMI that has fallen due: the EMI leaves the account it's paid from and the
 * loan goes down by the EMI minus that month's interest. A loan from before this existed starts
 * from its next EMI date, so nothing is back-dated. Loans paid by hand stay due until marked paid.
 */
export function processDueDebts(s: State): Transaction[] {
  const made: Transaction[] = [];
  for (const d of s.debts ?? []) {
    if (!d.nextDate) d.nextDate = nextDayOfMonth(s.today, d.dueDay);
    if (d.autoDebit === false) continue;
    let guard = 0;
    while (d.remaining > 0 && d.nextDate <= s.today && guard++ < 60) {
      const tx = payEmi(s, d, d.nextDate, 'Auto-debit');
      if (tx) made.push(tx);
    }
  }
  return made;
}

/**
 * Bills and subscriptions: on the due date, record the payment from its account and move to the
 * next date. Skipped when the person already logged it themselves around that date, or switched
 * auto-debit off for it (then the date just moves on, as it always did).
 */
export function processDueSubscriptions(s: State): Transaction[] {
  const made: Transaction[] = [];
  for (const sub of s.subscriptions) {
    const next = (d: ISODate) => (sub.cycle === 'weekly' ? addDays(d, 7) : addMonths(d, sub.cycle === 'yearly' ? 12 : 1));
    const live = sub.status === 'active' || sub.status === 'unknown';
    const auto = live && sub.autoDebit !== false;
    let guard = 0;
    // Without auto-debit a payment due today stays on the list for the day; with it, it's recorded today.
    while ((auto ? sub.nextDate <= s.today : sub.nextDate < s.today) && guard++ < 400) {
      const due = sub.nextDate;
      const id = `due-${sub.id}-${due}`;
      const name = sub.name.trim().toLowerCase();
      const logged = s.transactions.some(
        (t) => t.id === id || (t.type === 'expense' && !t.subscriptionId && Math.abs(daysBetween(t.date, due)) <= 3 && t.merchant.toLowerCase().includes(name)),
      );
      if (auto && !logged && sub.amount > 0) {
        const tx: Transaction = {
          id,
          merchant: sub.name,
          amount: sub.amount,
          type: 'expense',
          category: sub.category,
          date: due,
          account: s.accounts.some((a) => a.id === sub.account) || s.cards.some((c) => c.id === sub.account) ? sub.account : defaultAccount(s),
          recurring: true,
          status: 'completed',
          subscriptionId: sub.id,
          notes: 'Recorded automatically on the due date',
        };
        s.transactions.unshift(tx);
        applyMoney(s, tx, 1);
        made.push(tx);
      }
      sub.nextDate = next(due);
    }
  }
  return made;
}

/**
 * A SIP must pay into a holding that exists. If its holding was removed, the instalments had
 * nowhere to land and the Investments screen showed nothing held. Bring the holding back with
 * everything put in through those SIPs.
 */
export function repairHoldings(s: State) {
  for (const inv of s.investments ?? []) {
    if (!inv.toAccount || inv.toAccount.startsWith('pot:') || inv.toAccount === '__new') continue;
    if (s.accounts.some((a) => a.id === inv.toAccount)) continue;
    const balance = (s.investments ?? []).filter((i) => i.toAccount === inv.toAccount).reduce((a, i) => a + investedTotal(s, i), 0);
    s.accounts.push({ id: inv.toAccount, name: inv.platform?.trim() || 'Investments', institution: inv.platform?.trim() || 'Investments', type: 'investment', balance: roundMoney(balance), spendable: false });
  }
}

/** What PULSE recorded by itself the last time it caught up with the calendar, for a note on screen. */
let autoMade: Transaction[] = [];
export function takeAutoMade(): Transaction[] {
  const made = autoMade;
  autoMade = [];
  return made;
}

/**
 * Record every auto-debit insurance premium that has fallen due as an expense, then move the
 * policy to its next due date. Policies paid by hand stay due until the person marks them paid.
 */
export function processDueInsurance(s: State): Transaction[] {
  const made: Transaction[] = [];
  if (!INSURANCE_ON) return made;
  for (const p of s.insurance ?? []) {
    if (!p.autoDebit) continue;
    let guard = 0;
    while (p.nextDate <= s.today && guard++ < 60) {
      const tx = premiumTx(s, p, p.nextDate, 'Premium · auto-debit');
      // Same id on every synced device, so the premium is never recorded twice.
      if (!s.transactions.some((t) => t.id === tx.id)) {
        s.transactions.unshift(tx);
        applyMoney(s, tx, 1);
        made.push(tx);
      }
      p.nextDate = addMonths(p.nextDate, PREMIUM_MONTHS[p.cycle]);
    }
  }
  return made;
}

function premiumTx(s: State, p: Insurance, date: ISODate, notes: string, amount = p.premium): Transaction {
  return {
    id: `ins-${p.id}-${p.nextDate}`,
    merchant: p.name,
    amount,
    type: 'expense',
    category: 'insurance',
    date,
    account: s.accounts.some((a) => a.id === p.account) || s.cards.some((c) => c.id === p.account) ? p.account : defaultAccount(s),
    recurring: true,
    status: 'completed',
    insuranceId: p.id,
    notes,
  };
}

function isState(x: unknown): x is State {
  const s = x as State;
  return !!s && typeof s.today === 'string' && Array.isArray(s.transactions) && Array.isArray(s.accounts) && Array.isArray(s.plans);
}

/**
 * Personal mode follows the real calendar: move "today" forward, roll paydays and
 * renewals that have passed to their next date, and keep a monthly net-worth point.
 */
export function refresh(input: State): State {
  const s = structuredClone(input);
  s.mode = s.mode ?? 'demo';
  // Older saves: add anything newer versions expect.
  s.investments = s.investments ?? [];
  s.insurance = s.insurance ?? [];
  // These two no longer have a switch in You. Money moments are always on; balances are always shown,
  // so nobody is left stuck with a setting they can't change. The code behind both is kept.
  s.settings.notifications = { ...s.settings.notifications, moments: true };
  s.settings.hideBalances = false;
  s.settings.currency = s.settings.currency ?? 'INR';
  for (const c of CATEGORIES) if (!s.categories.some((x) => x.id === c.id)) s.categories.push(structuredClone(c));
  for (const c of s.categories) if (!c.emoji) c.emoji = CATEGORIES.find((d) => d.id === c.id)?.emoji ?? suggestEmoji(c.name);
  repairHoldings(s);
  if (s.mode !== 'personal') return s;
  const today = realToday();
  if (today <= s.today && s.today === today) return s;
  const lastMonth = monthKey(prevMonth(today));
  if (monthKey(s.today) < monthKey(today) && !s.netWorthHistory.some((h) => h.month === lastMonth)) {
    s.netWorthHistory.push({ month: lastMonth, value: netWorth(s).total });
  }
  s.today = today;
  for (const i of s.incomes) {
    if (i.cycle === 'monthly' && i.nextDate) {
      let guard = 0;
      while (i.nextDate <= today && guard++ < 60) {
        // Auto-add: record the payday as money in (same id on every synced device).
        const id = `pay-${i.id}-${i.nextDate}`;
        if (i.autoCredit && i.expected > 0 && !s.transactions.some((t) => t.id === id)) {
          const tx: Transaction = { id, merchant: i.kind === 'salary' && !/^salary$/i.test(i.name.trim()) ? `Salary · ${i.name}` : i.name, amount: i.expected, type: 'income', category: incomeCategory(i.kind), date: i.nextDate, account: defaultAccount(s), recurring: true, status: 'completed', incomeId: i.id, notes: 'Added automatically on payday' };
          s.transactions.unshift(tx);
          applyMoney(s, tx, 1);
        }
        i.nextDate = addMonths(i.nextDate, 1);
      }
    }
  }
  processDueInvestments(s);
  processDueInsurance(s);
  autoMade = [...processDueDebts(s), ...processDueSubscriptions(s)];
  return s;
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isState(parsed)) return refresh(parsed);
    }
  } catch {
    /* storage unavailable */
  }
  // First visit: demo data sits behind the welcome screen until the person chooses.
  return createSeed();
}

function save(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function useStoreImpl() {
  const [state, setState] = useState<State>(load);
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => startStats(() => ref.current), []);
  // Every amount on screen formats in this currency. The demo is a month in Bengaluru, so it stays in rupees.
  setCurrency(state.mode === 'demo' ? 'INR' : state.settings.currency);
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** True while the person's own data is parked and the demo is showing. */
  const [hasStash, setHasStash] = useState(() => readStash() !== null);

  useEffect(() => save(state), [state]);

  const commit = useCallback((fn: Draft) => {
    const next = produce(ref.current, fn);
    ref.current = next;
    setState(next);
    return next;
  }, []);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid('toast');
    setToasts((xs) => [...xs.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.action ? 6000 : 4200);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((xs) => xs.filter((x) => x.id !== id)), []);

  // Say what PULSE recorded while the person was away, so a changed balance is never a mystery.
  useEffect(() => {
    const made = takeAutoMade();
    if (!made.length) return;
    const total = made.reduce((a, t) => a + t.amount, 0);
    const text = made.length === 1 ? `${made[0].merchant} was due: ${rupees(made[0].amount)} is recorded.` : `${made.length} payments were due: ${rupees(total)} is recorded. See Activity.`;
    const t = window.setTimeout(() => toast({ text, emoji: '🧾' }), 3800);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ---------- money moments ----------
  const momentAfterExpense = useCallback(
    (next: State, tx: Transaction) => {
      if (!next.settings.notifications.moments) {
        toast({ text: `Added ${tx.merchant}.` });
        return;
      }
      const sts = safeToSpend(next);
      const b = budgetFor(next, tx.category);
      if (tx.type === 'income') {
        toast({ text: `${tx.category === 'salary' ? 'Your salary landed.' : 'Money in.'} Safe to spend is now ${rupees(sts.safe)}.`, tone: 'good' });
        return;
      }
      if (tx.type === 'transfer') {
        toast({ text: 'Transfer recorded.' });
        return;
      }
      if (tx.plan) {
        const p = next.plans.find((x) => x.id === tx.plan);
        if (p) {
          toast({ text: `Added to ${p.name}. Safe to spend is now ${rupees(sts.safe)}.` });
          return;
        }
      }
      if (b) {
        const st = budgetState(next, b);
        const cat = categoryName(next, b.category).toLowerCase();
        const per = b.period === 'weekly' ? 'weekly' : 'monthly';
        if (st.left >= 0) toast({ text: `Nice. You're still ${rupees(st.left)} under your ${per} ${cat} budget.`, tone: 'good' });
        else toast({ text: `That puts ${cat} ${rupees(-st.left)} over its ${per} budget. Safe to spend: ${rupees(sts.safe)}.`, tone: 'heads-up' });
        return;
      }
      // Paid in cash: say what's left in the wallet, so it's clear which balance moved.
      const from = next.accounts.find((a) => a.id === tx.account);
      toast({ text: from?.type === 'cash' ? `Paid in cash. ${rupees(from.balance)} cash left. Safe to spend is now ${rupees(sts.safe)}.` : `Added. Safe to spend is now ${rupees(sts.safe)}.` });
    },
    [toast],
  );

  // ---------- transactions ----------
  const addTransaction = useCallback(
    (input: NewTx, opts: { quiet?: boolean } = {}) => {
      const tx: Transaction = { status: 'completed', ...input, id: uid('t') } as Transaction;
      const before = streak(ref.current);
      if (ref.current.mode === 'personal' && !opts.quiet) track(tx.type === 'income' ? 'income' : 'expense');
      const next = commit((s) => {
        s.transactions.unshift(tx);
        applyMoney(s, tx, 1);
        if (tx.recurring && tx.type === 'expense' && !s.subscriptions.some((x) => x.name.toLowerCase() === tx.merchant.toLowerCase())) {
          s.subscriptions.push({ id: uid('sub'), name: tx.merchant, amount: tx.amount, cycle: 'monthly', nextDate: addMonths(tx.date, 1), category: tx.category, status: 'active', kind: tx.category === 'bills' ? 'bill' : 'subscription', account: tx.account });
        }
      });
      haptic(12);
      if (!opts.quiet) {
        momentAfterExpense(next, tx);
        if (tx.type === 'income') burst({ kind: 'coins', power: tx.category === 'salary' ? 1.6 : 1 });
        // First thing logged today keeps the streak alive: make it a moment.
        const after = streak(next);
        if (after.today && !before.today && tx.date === next.today && after.count >= 2) {
          window.setTimeout(() => {
            haptic(20);
            burst({ kind: 'fire', power: Math.min(1.8, 0.8 + after.count / 10) });
            toast({ text: after.count >= after.best && after.count > 2 ? `${after.count}-day streak. Your best ever!` : `${after.count}-day streak. Keep it going!`, tone: 'good', emoji: '🔥' });
          }, 650);
        }
      }
      return tx;
    },
    [commit, momentAfterExpense],
  );

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Transaction>) => {
      commit((s) => {
        const tx = s.transactions.find((t) => t.id === id);
        if (!tx) return;
        applyMoney(s, tx, -1);
        Object.assign(tx, patch);
        applyMoney(s, tx, 1);
        if (patch.recurring && !s.subscriptions.some((x) => x.name.toLowerCase() === tx.merchant.toLowerCase())) {
          s.subscriptions.push({ id: uid('sub'), name: tx.merchant, amount: tx.amount, cycle: 'monthly', nextDate: addMonths(tx.date, 1), category: tx.category, status: 'active', kind: tx.category === 'bills' ? 'bill' : 'subscription', account: tx.account });
        }
        if (tx.splitId) {
          const sp = s.splits.find((x) => x.id === tx.splitId);
          if (sp) {
            sp.category = tx.category;
            sp.plan = tx.plan;
          }
        }
      });
    },
    [commit],
  );

  const deleteTransaction = useCallback(
    (id: string, opts: { quiet?: boolean } = {}) => {
      const before = ref.current;
      const tx = before.transactions.find((t) => t.id === id);
      if (!tx) return;
      commit((s) => {
        const i = s.transactions.findIndex((t) => t.id === id);
        applyMoney(s, s.transactions[i], -1);
        s.transactions.splice(i, 1);
        if (tx.splitId) s.splits = s.splits.filter((x) => x.id !== tx.splitId);
      });
      if (opts.quiet) return;
      toast({
        text: `Deleted ${tx.merchant}.`,
        action: {
          label: 'Undo',
          run: () => {
            ref.current = before;
            setState(before);
          },
        },
      });
    },
    [commit, toast],
  );

  // ---------- plans ----------
  const savePlan = useCallback(
    (plan: Omit<Plan, 'id' | 'contributions'> & { id?: string; contributions?: Plan['contributions'] }) => {
      let id = plan.id;
      if (!id && ref.current.mode === 'personal') track('plan');
      commit((s) => {
        if (id) {
          const p = s.plans.find((x) => x.id === id);
          if (p) Object.assign(p, plan);
        } else {
          id = uid('plan');
          s.plans.unshift({ ...plan, id, contributions: plan.contributions ?? (plan.saved ? [{ date: s.today, amount: plan.saved }] : []) } as Plan);
        }
      });
      if (!plan.id) burst({ kind: 'mini', power: 1.1 });
      toast({ text: plan.id ? 'Plan updated.' : `${plan.name} created. Nice.`, tone: 'good', emoji: plan.id ? undefined : plan.icon });
      return id!;
    },
    [commit, toast],
  );

  const deletePlan = useCallback(
    (id: string) => {
      const p = ref.current.plans.find((x) => x.id === id);
      commit((s) => {
        s.plans = s.plans.filter((x) => x.id !== id);
        s.transactions.forEach((t) => {
          if (t.plan === id && t.type !== 'transfer') delete t.plan;
        });
        s.groups.forEach((g) => {
          if (g.plan === id) delete g.plan;
        });
      });
      toast({ text: `${p?.name ?? 'Plan'} deleted.` });
    },
    [commit, toast],
  );

  const contribute = useCallback(
    (planId: string, amount: number, from: string) => {
      const plan = ref.current.plans.find((p) => p.id === planId);
      if (!plan) return;
      const before = planMetrics(ref.current, plan);
      const next = commit((s) => {
        const p = s.plans.find((x) => x.id === planId)!;
        const tx: Transaction = { id: uid('t'), merchant: `Moved to ${p.name}`, amount, type: 'transfer', direction: 'out', toAccount: `pot:${p.id}`, category: 'transfer', date: s.today, account: from, plan: p.id, recurring: false, status: 'completed' };
        s.transactions.unshift(tx);
        applyMoney(s, tx, 1);
        p.contributions.push({ date: s.today, amount });
        p.cycleReserve = Math.max(0, p.cycleReserve - amount);
        if (p.saved >= p.target) p.status = 'done';
      });
      haptic(14);
      const p2 = next.plans.find((x) => x.id === planId)!;
      const m = planMetrics(next, p2);
      burst({ kind: m.tone === 'done' ? 'confetti' : 'mini', power: m.tone === 'done' ? 1.7 : 0.9 });
      if (m.tone === 'done') toast({ text: `Your ${p2.name} plan is fully funded!`, tone: 'good', emoji: '🎉' });
      else if (m.tone === 'ahead') toast({ text: `${rupees(amount)} added. You're ${m.daysAhead} days ahead on ${p2.name}.`, tone: 'good' });
      else if (m.daysAhead > before.daysAhead) toast({ text: `${rupees(amount)} added. ${p2.name} is ${Math.round(m.progress * 100)}% funded.`, tone: 'good' });
      else toast({ text: `${rupees(amount)} added to ${p2.name}.`, tone: 'good' });
    },
    [commit, toast],
  );

  // ---------- budgets ----------
  const saveBudget = useCallback(
    (b: Omit<Budget, 'id'> & { id?: string }) => {
      if (!b.id && ref.current.mode === 'personal') track('budget');
      commit((s) => {
        if (b.id) Object.assign(s.budgets.find((x) => x.id === b.id)!, b);
        else s.budgets.push({ ...b, id: uid('b') } as Budget);
      });
      toast({ text: b.id ? 'Budget updated.' : 'Budget created.' });
    },
    [commit, toast],
  );
  const deleteBudget = useCallback((id: string) => commit((s) => void (s.budgets = s.budgets.filter((x) => x.id !== id))), [commit]);

  // ---------- subscriptions ----------
  const saveSubscription = useCallback(
    (sub: Omit<Subscription, 'id'> & { id?: string }) => {
      let made: Transaction[] = [];
      let id = sub.id;
      commit((s) => {
        // A date in the past means "it was due then": start from the next time it comes round, never back-date.
        const data = { ...sub };
        let guard = 0;
        while (data.nextDate < s.today && guard++ < 400) data.nextDate = data.cycle === 'weekly' ? addDays(data.nextDate, 7) : addMonths(data.nextDate, data.cycle === 'yearly' ? 12 : 1);
        if (data.id) Object.assign(s.subscriptions.find((x) => x.id === data.id)!, data);
        else {
          id = uid('sub');
          s.subscriptions.push({ ...data, id } as Subscription);
        }
        made = personal(s) ? processDueSubscriptions(s) : [];
      });
      const paid = made.find((t) => t.subscriptionId === id);
      toast({ text: paid ? `${sub.name} saved. Today's ${rupees(paid.amount)} is recorded.` : sub.id ? 'Saved.' : `${sub.name} added. It's now counted in safe-to-spend.` });
    },
    [commit, toast],
  );
  const setSubStatus = useCallback(
    (id: string, status: Subscription['status']) => {
      commit((s) => {
        const x = s.subscriptions.find((y) => y.id === id);
        if (x) x.status = status;
      });
    },
    [commit],
  );
  const deleteSubscription = useCallback((id: string) => commit((s) => void (s.subscriptions = s.subscriptions.filter((x) => x.id !== id))), [commit]);

  // ---------- social ----------
  const addPerson = useCallback(
    (name: string): Person => {
      const clean = name.trim();
      const p: Person = { id: uid('p'), name: clean, short: clean.split(' ')[0], hue: Math.floor(Math.random() * 360) };
      commit((s) => void s.people.push(p));
      return p;
    },
    [commit],
  );

  // ---------- friends on PULSE (lib/friends.ts) ----------
  /** Connect a person to a shared channel. With no id, a new person is made with that name. */
  const linkPerson = useCallback(
    (personId: string | null, name: string, link: FriendLink): string => {
      let id = personId ?? '';
      commit((s) => {
        let p = s.people.find((x) => x.id === personId);
        if (!p) {
          const clean = name.trim() || 'Friend';
          p = { id: uid('p'), name: clean, short: clean.split(' ')[0], hue: Math.floor(Math.random() * 360) };
          s.people.push(p);
        }
        p.link = link;
        id = p.id;
      });
      return id;
    },
    [commit],
  );
  /** Make the data match what a connected friend has published. Returns what was new. */
  const applyFriendBox = useCallback(
    (personId: string, box: Box): BoxItem[] => {
      let fresh: BoxItem[] = [];
      commit((s) => void (fresh = applyBox(s, personId, box)));
      return fresh;
    },
    [commit],
  );
  const markFriendJoined = useCallback(
    (personId: string) =>
      commit((s) => {
        const p = s.people.find((x) => x.id === personId);
        if (p?.link) p.link.status = 'linked';
      }),
    [commit],
  );
  /** Disconnect: what the friend shared stays here as ordinary history, and nothing more is exchanged. */
  const unlinkPerson = useCallback(
    (personId: string) =>
      commit((s) => {
        const p = s.people.find((x) => x.id === personId);
        const chan = p?.link?.chan;
        if (!p || !chan) return;
        delete p.link;
        // No longer connected: their photo goes, unless a shared group still brings it.
        if (!s.groups.some((g) => inGroupOnPulse(g, personId))) delete p.photo;
        for (const x of s.splits) if (x.remote === chan) delete x.remote;
        for (const x of s.settlements) if (x.remote === chan) delete x.remote;
      }),
    [commit],
  );
  /** My own PULSE link: one link for everybody. Made the first time it's asked for. */
  const ensureDoor = useCallback((): Door => {
    let d = ref.current.user.door;
    if (!d) {
      const fresh = newDoor();
      d = fresh;
      commit((s) => void (s.user.door = fresh));
    }
    return d;
  }, [commit]);
  /** A new link. The old one stops working; people already connected stay connected. */
  const resetDoor = useCallback((): Door => {
    const old = ref.current.user.door;
    if (old) void closeDoor(old);
    const fresh = newDoor();
    commit((s) => void (s.user.door = fresh));
    return fresh;
  }, [commit]);
  /** Someone opened my link. They become a new person here, or take their old place if they were here before. */
  const friendKnocked = useCallback(
    (name: string, link: FriendLink, theirUid?: string): string => {
      let id = '';
      commit((s) => void (id = acceptKnock(s, name, link, theirUid, uid('p'))));
      return id;
    },
    [commit],
  );
  /** Two names are the same person: fold `fromId` into `intoId`. */
  const mergePeople = useCallback(
    (fromId: string, intoId: string) => {
      const into = ref.current.people.find((p) => p.id === intoId);
      commit((s) => mergePeopleIn(s, fromId, intoId));
      toast({ text: `Merged. Everything is under ${into?.short ?? 'one name'} now.`, tone: 'good' });
    },
    [commit, toast],
  );

  // ---------- shared groups (lib/friends.ts) ----------
  /** Start sharing a group with a link. Returns its keys (the ones it already has, if it's shared). */
  const shareGroup = useCallback(
    (groupId: string): GroupShare | null => {
      let share: GroupShare | null = null;
      commit((s) => {
        const g = s.groups.find((x) => x.id === groupId);
        if (!g) return;
        if (!g.shared) g.shared = newShare(s.today);
        share = structuredClone(g.shared);
      });
      return share;
    },
    [commit],
  );
  /** I opened a group's link: the group appears here, and the next sync fills it in. */
  const joinGroup = useCallback(
    (name: string, emoji: string, share: GroupShare): string => {
      const id = uid('g');
      commit((s) => void s.groups.unshift({ id, name: name.trim() || 'Group', emoji, members: ['me'], createdAt: s.today, shared: share }));
      return id;
    },
    [commit],
  );
  const applyGroupView = useCallback(
    (groupId: string, view: GroupView): GroupNews[] => {
      let news: GroupNews[] = [];
      commit((s) => void (news = applyGroup(s, groupId, view)));
      return news;
    },
    [commit],
  );
  /** Stop sharing on this phone. The group and its history stay as an ordinary group. */
  const unshareGroup = useCallback((groupId: string) => commit((s) => unshareGroupIn(s, groupId)), [commit]);
  /** Delete a group: its expenses and who-owes-what go with it. Shared groups also stop being shared. */
  const deleteGroup = useCallback(
    (groupId: string) => {
      const g = ref.current.groups.find((x) => x.id === groupId);
      if (!g) return;
      if (g.shared && personal(ref.current)) void deleteGroupChannel(g.shared);
      commit((s) => removeGroup(s, groupId));
      toast({ text: `${g.name} deleted.` });
    },
    [commit, toast],
  );
  const setGroupClosed = useCallback(
    (groupId: string, closed: boolean) =>
      commit((s) => {
        const sh = s.groups.find((x) => x.id === groupId)?.shared;
        if (!sh) return;
        if (closed) sh.closed = true;
        else delete sh.closed;
      }),
    [commit],
  );
  /** Add someone to a group by name (someone who isn't on PULSE). */
  const addGroupMember = useCallback(
    (groupId: string, name: string) => {
      const clean = name.trim();
      if (!clean) return;
      commit((s) => {
        const g = s.groups.find((x) => x.id === groupId);
        if (!g) return;
        const p: Person = { id: uid('p'), name: clean, short: clean.split(' ')[0], hue: Math.floor(Math.random() * 360) };
        s.people.push(p);
        g.members.push(p.id);
      });
    },
    [commit],
  );

  /** A friend marked a payment between us: move the money in or out of one of my accounts too. */
  const bankSettlement = useCallback(
    (id: string, accountId?: string) => {
      commit((s) => {
        const st = s.settlements.find((x) => x.id === id);
        if (!st || st.banked) return;
        const other = st.from === 'me' ? st.to : st.from;
        const person = s.people.find((p) => p.id === other);
        const tx: Transaction = { id: uid('t'), merchant: person?.name ?? 'Settle up', amount: st.amount, type: 'transfer', direction: st.from === 'me' ? 'out' : 'in', category: 'transfer', date: s.today, account: accountId ?? defaultAccount(s), people: [other], notes: 'Settled up', recurring: false, status: 'completed' };
        s.transactions.unshift(tx);
        applyMoney(s, tx, 1);
        st.banked = true;
      });
      haptic(12);
      toast({ text: 'Balance updated.', tone: 'good' });
    },
    [commit, toast],
  );

  const addGroup = useCallback(
    (g: Omit<Group, 'id' | 'createdAt'>) => {
      const id = uid('g');
      commit((s) => void s.groups.unshift({ ...g, id, createdAt: s.today }));
      toast({ text: `${g.name} is ready. Add the first expense.` });
      return id;
    },
    [commit, toast],
  );

  const addSplit = useCallback(
    (input: NewSplit) => {
      const id = uid('s');
      if (ref.current.mode === 'personal') track('split');
      const next = commit((s) => {
        let transactionId: string | undefined;
        if (input.paidBy === 'me') {
          const tx: Transaction = {
            id: uid('t'),
            merchant: input.description,
            amount: input.amount,
            type: 'expense',
            category: input.category,
            date: input.date,
            account: input.account ?? defaultAccount(s),
            plan: input.plan,
            people: input.shares.map((x) => x.person).filter((p) => p !== 'me'),
            notes: input.notes,
            recurring: false,
            status: 'completed',
            splitId: id,
          };
          s.transactions.unshift(tx);
          applyMoney(s, tx, 1);
          transactionId = tx.id;
        }
        s.splits.unshift({ id, group: input.group, description: input.description, amount: input.amount, paidBy: input.paidBy, date: input.date, mode: input.mode, shares: input.shares, category: input.category, plan: input.plan, transactionId });
      });
      haptic(12);
      const mine = input.shares.find((x) => x.person === 'me')?.amount ?? 0;
      const sts = safeToSpend(next);
      toast({
        text: input.paidBy === 'me' ? `Split saved. Your share is ${rupees(mine)}. Safe to spend: ${rupees(sts.safe)}.` : `Split saved. You owe ${rupees(mine)} for this.`,
        tone: 'good',
      });
      return id;
    },
    [commit, toast],
  );

  const recordSettlement = useCallback(
    (st: Omit<Settlement, 'id' | 'date'>, accountId?: string) => {
      commit((s) => {
        const account = accountId ?? defaultAccount(s);
        s.settlements.unshift({ ...st, id: uid('st'), date: s.today });
        const other = st.from === 'me' ? st.to : st.from;
        const person = s.people.find((p) => p.id === other);
        const g = s.groups.find((x) => x.id === st.group);
        const tx: Transaction = {
          id: uid('t'),
          merchant: person?.name ?? 'Settle up',
          amount: st.amount,
          type: 'transfer',
          direction: st.from === 'me' ? 'out' : 'in',
          category: 'transfer',
          date: s.today,
          account,
          people: [other],
          notes: `Settled up${g ? ` · ${g.name}` : ''}`,
          recurring: false,
          status: 'completed',
        };
        s.transactions.unshift(tx);
        applyMoney(s, tx, 1);
      });
      haptic(14);
      burst({ kind: 'mini', power: 1 });
      toast({ text: 'Settled. Balances updated.', tone: 'good', emoji: '🤝' });
    },
    [commit, toast],
  );

  // ---------- misc ----------
  const updateSettings = useCallback((patch: Partial<Settings>) => commit((s) => void Object.assign(s.settings, patch)), [commit]);
  const updateUser = useCallback((patch: Partial<State['user']>) => commit((s) => void Object.assign(s.user, patch)), [commit]);
  const saveCategory = useCallback(
    (c: Category) =>
      commit((s) => {
        const ex = s.categories.find((x) => x.id === c.id);
        if (ex) Object.assign(ex, c);
        else s.categories.push(c);
      }),
    [commit],
  );
  const deleteCategory = useCallback(
    (id: string) => {
      const c = ref.current.categories.find((x) => x.id === id);
      commit((s) => {
        s.categories = s.categories.filter((x) => x.id !== id);
        const fallback = c?.kind === 'income' ? 'income-other' : 'other';
        s.transactions.forEach((t) => {
          if (t.category === id) t.category = fallback;
        });
        s.splits.forEach((t) => {
          if (t.category === id) t.category = fallback;
        });
        s.subscriptions.forEach((t) => {
          if (t.category === id) t.category = fallback;
        });
        s.budgets = s.budgets.filter((b) => b.category !== id);
      });
      toast({ text: `${c?.name ?? 'Category'} removed. Its transactions moved to ${c?.kind === 'income' ? 'Other income' : 'Other'}.` });
    },
    [commit, toast],
  );
  const saveIncome = useCallback(
    (inc: Omit<IncomeSource, 'id'> & { id?: string }) => {
      commit((s) => {
        let id = inc.id;
        if (id) Object.assign(s.incomes.find((x) => x.id === id)!, inc);
        else {
          id = uid('inc');
          s.incomes.push({ ...inc, id } as IncomeSource);
        }
        // Only one main payday.
        if (inc.main) for (const x of s.incomes) if (x.id !== id && x.main) x.main = undefined;
      });
      toast({ text: 'Income source saved.' });
    },
    [commit, toast],
  );
  /** Remove an income source. Money already received from it stays in your history. */
  const deleteIncome = useCallback(
    (id: string) => {
      const inc = ref.current.incomes.find((x) => x.id === id);
      const before = ref.current;
      commit((s) => void (s.incomes = s.incomes.filter((x) => x.id !== id)));
      toast({
        text: `${inc?.name ?? 'Income source'} removed. Past payments stay in your history.`,
        action: {
          label: 'Undo',
          run: () => {
            ref.current = before;
            setState(before);
          },
        },
      });
    },
    [commit, toast],
  );
  const dismissDetection = useCallback((key: string) => commit((s) => void s.dismissedDetections.push(key)), [commit]);
  /** Replace everything with a person's own fresh start (built by createFresh). */
  const startPersonal = useCallback(
    (fresh: State) => {
      writeStash(null);
      setHasStash(false);
      ref.current = fresh;
      setState(fresh);
      setToasts([]);
      toast({ text: `Welcome, ${fresh.user.name}. Add your first expense with the + button.`, tone: 'good' });
    },
    [toast],
  );
  const startDemo = useCallback(() => {
    const demo = createSeed();
    demo.onboarding.done = true;
    ref.current = demo;
    setState(demo);
  }, []);
  /** Open the sample month. Anyone with their own data gets it parked, not replaced. */
  const exploreDemo = useCallback(() => {
    markDemo();
    const parked = ref.current.mode === 'personal';
    if (parked) {
      writeStash(ref.current);
      setHasStash(true);
    }
    const demo = createSeed();
    demo.onboarding.done = true;
    ref.current = demo;
    setState(demo);
    setToasts([]);
    toast({ text: parked ? "You're in the demo. Your own money is saved and waiting." : 'Demo data loaded. Try anything, nothing here is real.' });
  }, [toast]);
  /** Leave the demo and bring the person's own data back exactly as it was. */
  const backToMine = useCallback(() => {
    const mine = readStash();
    if (!mine) return;
    const next = refresh(mine);
    writeStash(null);
    setHasStash(false);
    ref.current = next;
    setState(next);
    setToasts([]);
    toast({ text: `Welcome back, ${next.user.name}. Your money is just as you left it.`, tone: 'good' });
  }, [toast]);
  const replayOnboarding = useCallback(() => commit((s) => void (s.onboarding.done = false)), [commit]);
  /** Wipe everything this device has stored and return to the welcome screen. */
  const eraseAll = useCallback(() => {
    // Friends stop seeing this person's splits: leave every shared channel (this device only if it's the last one syncing).
    const mine = ref.current.mode === 'personal' ? ref.current : readStash();
    if (!loadSync()) {
      for (const p of mine?.people ?? []) if (p.link) void leaveChannel(p.link);
      for (const g of mine?.groups ?? []) if (g.shared) void leaveGroupChannel(g.shared);
      if (mine?.user.door) void closeDoor(mine.user.door);
    }
    try {
      localStorage.removeItem('pulse-friends-v1');
    } catch {
      /* ignore */
    }
    writeStash(null);
    setHasStash(false);
    saveSync(null);
    setSync({ enabled: false, code: null, status: 'idle', lastSync: null });
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
    const blank = createSeed();
    blank.onboarding.done = false;
    ref.current = blank;
    setState(blank);
    setToasts([]);
  }, []);
  const closeOnboarding = useCallback(() => commit((s) => void (s.onboarding.done = true)), [commit]);
  const resetDemo = useCallback(() => {
    const fresh = createSeed();
    fresh.onboarding.done = true;
    ref.current = fresh;
    setState(fresh);
    toast({ text: 'Demo data restored.' });
  }, [toast]);

  // ---------- backup ----------
  const exportBackup = useCallback(() => JSON.stringify({ app: 'pulse', version: 1, savedAt: new Date().toISOString(), state: ref.current }), []);
  /** The person's own data, even while they're looking at the demo. Null if they have none. */
  const personalState = useCallback((): State | null => (ref.current.mode === 'personal' ? ref.current : readStash()), []);
  /** Replace everything on this device with a restored or synced copy of the person's data. */
  const restoreState = useCallback(
    (st: State, message?: string) => {
      const next = refresh({ ...st, mode: 'personal', onboarding: { ...st.onboarding, done: true } });
      writeStash(null);
      setHasStash(false);
      ref.current = next;
      setState(next);
      if (message !== '') toast({ text: message ?? `Backup restored for ${next.user.name}.`, tone: 'good', emoji: '✅' });
    },
    [toast],
  );
  const importBackup = useCallback(
    (text: string): string | null => {
      try {
        const data = JSON.parse(text.trim());
        const st = data?.state ?? data;
        if (!isState(st)) return "That doesn't look like a PULSE backup. Paste the whole code you copied.";
        const next = refresh({ ...st, onboarding: { ...st.onboarding, done: true } });
        ref.current = next;
        setState(next);
        toast({ text: `Backup restored for ${next.user.name}.`, tone: 'good' });
        return null;
      } catch {
        return "That doesn't look like a PULSE backup. Paste the whole code you copied.";
      }
    },
    [toast],
  );

  // ---------- investments / SIPs ----------
  const saveInvestment = useCallback(
    (inv: Omit<Investment, 'id'> & { id?: string }, newAccountName?: string, openingValue?: number) => {
      let made: Transaction[] = [];
      const next = commit((s) => {
        const data = { ...inv };
        if (data.toAccount === '__new') {
          const acct: Account = { id: uid('acct'), name: newAccountName?.trim() || data.platform || 'Investments', institution: data.platform || 'Investments', type: 'investment', balance: openingValue ?? 0, spendable: false };
          s.accounts.push(acct);
          data.toAccount = acct.id;
        }
        if (data.id) Object.assign(s.investments.find((x) => x.id === data.id)!, data);
        else s.investments.push({ ...data, id: uid('inv') } as Investment);
        made = processDueInvestments(s);
      });
      haptic(12);
      if (!inv.id) burst({ kind: 'coins', power: 0.8 });
      const sts = safeToSpend(next);
      toast({
        text: made.length
          ? `${inv.name} saved and ${rupees(made.reduce((a, t) => a + t.amount, 0))} deducted today. Safe to spend: ${rupees(sts.safe)}.`
          : inv.id
            ? `${inv.name} updated.`
            : `${inv.name} added. ${rupees(inv.amount)} will be deducted on ${fmtDate(inv.nextDate)}.`,
        tone: 'good',
      });
    },
    [commit, toast],
  );
  const setInvestmentStatus = useCallback(
    (id: string, status: Investment['status']) => {
      commit((s) => {
        const x = s.investments.find((y) => y.id === id);
        if (x) x.status = status;
      });
      toast({ text: status === 'active' ? 'SIP resumed.' : status === 'paused' ? 'SIP paused. Nothing will be deducted until you resume.' : 'SIP stopped.' });
    },
    [commit, toast],
  );
  const deleteInvestment = useCallback(
    (id: string) => {
      commit((s) => void (s.investments = s.investments.filter((x) => x.id !== id)));
      toast({ text: 'Removed. Past instalments stay in your history.' });
    },
    [commit, toast],
  );

  // ---------- insurance ----------
  const saveInsurance = useCallback(
    (p: Omit<Insurance, 'id' | 'since'> & { id?: string }) => {
      let made: Transaction[] = [];
      const next = commit((s) => {
        s.insurance = s.insurance ?? [];
        if (p.id) Object.assign(s.insurance.find((x) => x.id === p.id)!, p);
        else s.insurance.push({ ...p, id: uid('ins'), since: s.today } as Insurance);
        made = processDueInsurance(s);
      });
      haptic(12);
      const sts = safeToSpend(next);
      const kept = sts.setAsideItems.find((x) => x.policy.name === p.name)?.amount ?? 0;
      toast({
        text: made.length
          ? `${p.name} saved and ${rupees(made.reduce((a, t) => a + t.amount, 0))} recorded for today. Safe to spend: ${rupees(sts.safe)}.`
          : p.id
            ? `${p.name} updated.`
            : kept > 0
              ? `${p.name} added. ${rupees(kept)} kept aside so far for ${fmtDate(p.nextDate)}.`
              : `${p.name} added. ${rupees(p.premium)} is due on ${fmtDate(p.nextDate)}.`,
        tone: 'good',
        emoji: p.id ? undefined : '🛡️',
      });
    },
    [commit, toast],
  );
  /** A premium paid by hand: record it and move the policy to its next due date. */
  const payInsurance = useCallback(
    (id: string, amount?: number) => {
      let name = '';
      const next = commit((s) => {
        const p = (s.insurance ?? []).find((x) => x.id === id);
        if (!p) return;
        name = p.name;
        const tx = premiumTx(s, p, s.today, 'Premium', amount && amount > 0 ? amount : p.premium);
        if (!s.transactions.some((t) => t.id === tx.id)) {
          s.transactions.unshift(tx);
          applyMoney(s, tx, 1);
        }
        let guard = 0;
        do p.nextDate = addMonths(p.nextDate, PREMIUM_MONTHS[p.cycle]);
        while (p.nextDate <= s.today && guard++ < 60);
      });
      if (!name) return;
      haptic(14);
      const p = (next.insurance ?? []).find((x) => x.id === id)!;
      toast({ text: `${name} premium recorded. Next one is due ${fmtDate(p.nextDate)}.`, tone: 'good', emoji: '🛡️' });
    },
    [commit, toast],
  );
  const deleteInsurance = useCallback(
    (id: string) => {
      const before = ref.current;
      const p = (before.insurance ?? []).find((x) => x.id === id);
      if (!p) return;
      commit((s) => void (s.insurance = (s.insurance ?? []).filter((x) => x.id !== id)));
      toast({
        text: `${p.name} removed. Past premiums stay in your history.`,
        action: {
          label: 'Undo',
          run: () => commit((s) => void (s.insurance = [...(s.insurance ?? []), p])),
        },
      });
    },
    [commit, toast],
  );

  // ---------- accounts, cards, debts ----------
  const saveAccount = useCallback(
    (a: Omit<Account, 'id'> & { id?: string }) => {
      commit((s) => {
        if (a.id) Object.assign(s.accounts.find((x) => x.id === a.id)!, a);
        else s.accounts.push({ ...a, id: uid('acct') } as Account);
      });
      toast({ text: a.id ? 'Account updated.' : `${a.name} added.` });
    },
    [commit, toast],
  );
  /** The cash account's id. Makes an empty one if the person removed theirs, so "paid in cash" always works. */
  const ensureCashAccount = useCallback(() => {
    const ex = ref.current.accounts.find((a) => a.type === 'cash');
    if (ex) return ex.id;
    const id = uid('acct');
    commit((s) => void s.accounts.push({ id, name: 'Cash', institution: 'Wallet', type: 'cash', balance: 0, spendable: true }));
    return id;
  }, [commit]);
  const deleteAccount = useCallback(
    (id: string) => {
      commit((s) => void (s.accounts = s.accounts.filter((x) => x.id !== id)));
      toast({ text: 'Account removed.' });
    },
    [commit, toast],
  );
  const saveCard = useCallback(
    (c: Omit<CreditCard, 'id'> & { id?: string }) => {
      commit((s) => {
        if (c.id) Object.assign(s.cards.find((x) => x.id === c.id)!, c);
        else s.cards.push({ ...c, id: uid('card') } as CreditCard);
      });
      toast({ text: c.id ? 'Card updated.' : `${c.name} card added.` });
    },
    [commit, toast],
  );
  const deleteCard = useCallback((id: string) => commit((s) => void (s.cards = s.cards.filter((x) => x.id !== id))), [commit]);
  const saveDebt = useCallback(
    (d: Omit<Debt, 'id'> & { id?: string }) => {
      let made: Transaction[] = [];
      let saved: Debt | undefined;
      const next = commit((s) => {
        const old = d.id ? s.debts.find((x) => x.id === d.id) : undefined;
        // A new loan, or a changed due day, starts from the next time that day comes round.
        const nextDate = old && old.dueDay === d.dueDay && old.nextDate ? old.nextDate : nextDayOfMonth(s.today, d.dueDay);
        if (old) Object.assign(old, d, { nextDate });
        else s.debts.push({ ...d, nextDate, id: uid('debt') } as Debt);
        saved = old ?? s.debts[s.debts.length - 1];
        made = personal(s) ? processDueDebts(s) : [];
      });
      const emi = made.find((t) => t.debtId === saved?.id);
      toast({
        text: emi
          ? `${d.name} saved. Today's EMI of ${rupees(emi.amount)} is recorded. Safe to spend: ${rupees(safeToSpend(next).safe)}.`
          : d.id
            ? 'Loan updated.'
            : saved?.autoDebit === false
              ? `${d.name} added. Mark each EMI paid on its date.`
              : `${d.name} added. The EMI will be recorded on ${fmtDate(saved?.nextDate ?? next.today)}.`,
      });
    },
    [commit, toast],
  );
  /** "Mark as paid" for a loan that isn't on auto-debit: record this EMI now. */
  const payDebt = useCallback(
    (id: string) => {
      let tx: Transaction | null = null;
      let left = 0;
      const next = commit((s) => {
        const d = s.debts.find((x) => x.id === id);
        if (!d || d.remaining <= 0) return;
        if (!d.nextDate) d.nextDate = nextDayOfMonth(s.today, d.dueDay);
        tx = payEmi(s, d, s.today, 'Marked as paid');
        left = d.remaining;
      });
      haptic(12);
      const paid = tx as Transaction | null;
      if (!paid) return void toast({ text: 'That EMI was already recorded.' });
      if (left <= 0) burst({ kind: 'coins', power: 1.4 });
      toast({ text: left <= 0 ? `${paid.merchant} recorded. This loan is paid off!` : `${paid.merchant} recorded. ${rupees(left)} left on the loan. Safe to spend: ${rupees(safeToSpend(next).safe)}.`, tone: 'good', emoji: left <= 0 ? '🎉' : undefined });
    },
    [commit, toast],
  );
  const deleteDebt = useCallback((id: string) => commit((s) => void (s.debts = s.debts.filter((x) => x.id !== id))), [commit]);

  // ---------- paydays ----------
  /** The salary landed: record it (optionally with a different amount), and maybe auto-add from now on. */
  const confirmPayday = useCallback(
    (incomeId: string, date: string, amount?: number, auto?: boolean) => {
      const i = ref.current.incomes.find((x) => x.id === incomeId);
      if (!i) return;
      if (auto) commit((s) => void (s.incomes.find((x) => x.id === incomeId)!.autoCredit = true));
      addTransaction({ merchant: i.kind === 'salary' && !/^salary$/i.test(i.name.trim()) ? `Salary · ${i.name}` : i.name, amount: amount && amount > 0 ? amount : i.expected, type: 'income', category: incomeCategory(i.kind), date, account: defaultAccount(ref.current), recurring: true, incomeId: i.id });
    },
    [commit, addTransaction],
  );
  /** "Not yet": stop asking about this payday. */
  const skipPayday = useCallback(
    (incomeId: string, date: string) => {
      commit((s) => void s.dismissedDetections.push(`payday:${incomeId}:${date}`));
      toast({ text: "Okay. Add it with + whenever it lands, and it'll count from then." });
    },
    [commit, toast],
  );

  // ---------- sync across devices ----------
  const [sync, setSync] = useState<SyncStatus>(() => {
    const cfg = loadSync();
    return { enabled: !!cfg, code: cfg?.code ?? null, status: 'idle', lastSync: cfg?.lastSync ?? null };
  });
  const busy = useRef(false);
  const again = useRef(false);
  /** Put merged data on screen without losing anything the person typed while we were online. */
  const applyMerged = useCallback((captured: State, merged: State) => {
    const now = ref.current;
    const next = now === captured ? merged : merge3(captured, now, merged, true);
    if (sameData(next, now)) return now;
    const fresh = refresh(next);
    ref.current = fresh;
    setState(fresh);
    return fresh;
  }, []);
  const syncNow = useCallback(async () => {
    const cfg = loadSync();
    if (!cfg || ref.current.mode !== 'personal') return;
    if (busy.current) return void (again.current = true);
    busy.current = true;
    setSync((x) => ({ ...x, status: 'syncing' }));
    try {
      for (let round = 0; round < 5; round++) {
        const local = ref.current;
        if (local.mode !== 'personal') break;
        const base = loadBase();
        if (!sameData(local, base)) {
          // This device has changes: try to save them on top of the version it last saw.
          const res = await push(cfg.code, local, cfg.rev);
          if (res.ok) {
            cfg.rev = res.rev;
            saveBase(local);
            break;
          }
          if (!res.state) {
            cfg.rev = 0; // the online copy was removed; start it again from this device
            continue;
          }
          const merged = merge3(base, local, res.state, true);
          applyMerged(local, merged);
          saveBase(res.state);
          cfg.rev = res.rev;
          continue; // push the merged result
        }
        const remote = await pull(cfg.code);
        if (!remote) {
          if (cfg.rev === 0) break;
          cfg.rev = 0;
          saveBase({ ...local, transactions: [] }); // forces a fresh upload next round
          continue;
        }
        if (remote.rev === cfg.rev) break;
        const merged = merge3(base, local, remote.state, false);
        applyMerged(local, merged);
        saveBase(remote.state);
        cfg.rev = remote.rev;
        if (sameData(merged, remote.state)) break;
      }
      cfg.lastSync = new Date().toISOString();
      saveSync(cfg);
      setSync({ enabled: true, code: cfg.code, status: 'synced', lastSync: cfg.lastSync });
    } catch (e) {
      saveSync(cfg);
      const status: SyncStatus['status'] = e instanceof SyncUnavailable ? (e.message === 'offline' ? 'offline' : 'no-server') : 'error';
      setSync((x) => ({ ...x, status }));
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        window.setTimeout(() => void syncNow(), 400);
      }
    }
  }, [applyMerged]);

  /** Start syncing from this device: makes a new code and uploads the data, encrypted. */
  const enableSync = useCallback(async (): Promise<string | null> => {
    const mine = personalState();
    if (!mine) return null;
    track('sync');
    const code = newSyncCode();
    saveSync({ code, rev: 0 });
    try {
      localStorage.removeItem('pulse-sync-base-v1');
    } catch {
      /* ignore */
    }
    setSync({ enabled: true, code, status: 'syncing', lastSync: null });
    await syncNow();
    return code;
  }, [personalState, syncNow]);

  /** Link this device to data already syncing elsewhere. Returns an error message, or null. */
  const joinSync = useCallback(
    async (input: string): Promise<string | null> => {
      track('sync');
      const code = normalizeCode(input);
      if (!code) return 'That code doesn\'t look right. It has 16 letters and numbers after PULSE-.';
      let remote: Awaited<ReturnType<typeof pull>>;
      try {
        remote = await pull(code);
      } catch (e) {
        if (e instanceof SyncUnavailable) return e.message === 'offline' ? "You're offline. Connect to the internet and try again." : "Sync isn't switched on for this website yet.";
        return "Couldn't open the data for that code. Check the code and try again.";
      }
      if (!remote) return 'No data found for that code. Check it, or turn on sync on your other device first.';
      const mine = personalState();
      const hasMine = !!mine && (mine.transactions.length > 0 || mine.plans.length > 0);
      const merged = hasMine ? merge3(null, mine!, remote.state, false) : remote.state;
      restoreState(merged, hasMine ? 'Linked. Your data from both devices is now combined.' : `Linked. Welcome back, ${merged.user.name}.`);
      saveSync({ code, rev: remote.rev, lastSync: new Date().toISOString() });
      saveBase(remote.state);
      setSync({ enabled: true, code, status: 'synced', lastSync: new Date().toISOString() });
      window.setTimeout(() => void syncNow(), 300);
      return null;
    },
    [personalState, restoreState, syncNow],
  );

  /**
   * The person signed in: their data lives under their account's sync code from now on.
   *   'restored' this device had nothing, and their saved data has been brought down
   *   'new'      this device had nothing and neither did the account: setup comes next
   *   'kept'     this device had data: it is saved to the account (and combined with what was there)
   *   'offline'  the saved data couldn't be reached
   */
  const attachAccount = useCallback(
    async (code: string): Promise<'restored' | 'new' | 'kept' | 'offline'> => {
      const clearBase = () => {
        try {
          localStorage.removeItem('pulse-sync-base-v1');
        } catch {
          /* ignore */
        }
      };
      const mine = personalState();
      if (!mine) {
        let remote: Awaited<ReturnType<typeof pull>>;
        try {
          remote = await pull(code);
        } catch {
          return 'offline';
        }
        const at = new Date().toISOString();
        if (remote) {
          restoreState(remote.state, `Welcome back, ${remote.state.user.name}. Your money is right here.`);
          saveSync({ code, rev: remote.rev, lastSync: at });
          saveBase(remote.state);
          setSync({ enabled: true, code, status: 'synced', lastSync: at });
          return 'restored';
        }
        saveSync({ code, rev: 0 });
        clearBase();
        setSync({ enabled: true, code, status: 'idle', lastSync: null });
        return 'new';
      }
      if (loadSync()?.code !== code) {
        saveSync({ code, rev: 0 });
        clearBase();
      }
      setSync({ enabled: true, code, status: 'syncing', lastSync: null });
      await syncNow();
      return 'kept';
    },
    [personalState, restoreState, syncNow],
  );

  const disableSync = useCallback(async (removeOnline: boolean): Promise<string | null> => {
    const cfg = loadSync();
    if (cfg && removeOnline) {
      try {
        await removeRemote(cfg.code);
      } catch {
        return "Couldn't reach the sync server to delete the online copy. Try again when you're online.";
      }
    }
    saveSync(null);
    setSync({ enabled: false, code: null, status: 'idle', lastSync: null });
    return null;
  }, []);

  // Sync a moment after every change, when coming back to the app, when back online, and every 30s.
  useEffect(() => {
    if (!sync.enabled || state.mode !== 'personal') return;
    const t = window.setTimeout(() => void syncNow(), 1500);
    return () => window.clearTimeout(t);
  }, [state, sync.enabled, syncNow]);
  useEffect(() => {
    if (!sync.enabled) return;
    const kick = () => document.visibilityState === 'visible' && void syncNow();
    const iv = window.setInterval(kick, 30_000);
    document.addEventListener('visibilitychange', kick);
    window.addEventListener('online', kick);
    window.addEventListener('focus', kick);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', kick);
      window.removeEventListener('online', kick);
      window.removeEventListener('focus', kick);
    };
  }, [sync.enabled, syncNow]);

  return {
    state,
    toasts,
    toast,
    dismissToast,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    savePlan,
    deletePlan,
    contribute,
    saveBudget,
    deleteBudget,
    saveSubscription,
    setSubStatus,
    deleteSubscription,
    addPerson,
    linkPerson,
    applyFriendBox,
    markFriendJoined,
    unlinkPerson,
    ensureDoor,
    resetDoor,
    friendKnocked,
    mergePeople,
    shareGroup,
    joinGroup,
    applyGroupView,
    unshareGroup,
    deleteGroup,
    setGroupClosed,
    addGroupMember,
    bankSettlement,
    addGroup,
    addSplit,
    recordSettlement,
    updateSettings,
    updateUser,
    saveCategory,
    deleteCategory,
    saveIncome,
    deleteIncome,
    dismissDetection,
    startPersonal,
    startDemo,
    exploreDemo,
    backToMine,
    hasStash,
    replayOnboarding,
    closeOnboarding,
    resetDemo,
    eraseAll,
    exportBackup,
    importBackup,
    personalState,
    restoreState,
    confirmPayday,
    skipPayday,
    sync,
    syncNow,
    enableSync,
    joinSync,
    attachAccount,
    disableSync,
    saveAccount,
    ensureCashAccount,
    deleteAccount,
    saveInvestment,
    saveInsurance,
    payInsurance,
    deleteInsurance,
    setInvestmentStatus,
    deleteInvestment,
    saveCard,
    deleteCard,
    saveDebt,
    payDebt,
    deleteDebt,
  };
}

export type Store = ReturnType<typeof useStoreImpl>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useStoreImpl();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

/** Memoised selector over state. */
export function useSel<T>(fn: (s: State) => T): T {
  const { state } = useStore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => fn(state), [state]);
}
