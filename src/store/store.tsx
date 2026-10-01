import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  Account,
  Budget,
  Category,
  CreditCard,
  Debt,
  Group,
  Person,
  Plan,
  Settings,
  Settlement,
  SplitExpense,
  State,
  Subscription,
  Transaction,
  IncomeSource,
  Investment,
} from '../types';
import { CATEGORIES, createSeed } from '../data/seed';
import { roundMoney, setCurrency } from '../lib/currency';
import { burst } from '../lib/celebrate';
import { streak } from '../lib/streak';
import { markDemo, startStats, track } from '../lib/stats';
import { loadBase, loadSync, merge3, newSyncCode, normalizeCode, pull, push, removeRemote, sameData, saveBase, saveSync, SyncUnavailable } from '../lib/sync';
import { suggestEmoji } from '../lib/lexicon';
import { addMonths, fmtDate, haptic, monthKey, realToday, rupees, uid } from '../lib/format';
import { budgetFor, budgetState, categoryName, CYCLE_MONTHS, defaultAccount, incomeCategory, netWorth, planMetrics, prevMonth, safeToSpend } from '../lib/finance';

// ------------------------------------------------------------------
// Pure state transitions. Every mutation that moves money goes through
// applyMoney() so balances, cards and plan pots stay consistent.
// ------------------------------------------------------------------

function applyMoney(s: State, tx: Transaction, sign: 1 | -1) {
  const acct = s.accounts.find((a) => a.id === tx.account);
  const card = s.cards.find((c) => c.id === tx.account);
  const amt = tx.amount * sign;
  if (tx.type === 'expense') {
    if (card) card.balance += amt;
    else if (acct) acct.balance -= amt;
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
  s.settings.currency = s.settings.currency ?? 'INR';
  for (const c of CATEGORIES) if (!s.categories.some((x) => x.id === c.id)) s.categories.push(structuredClone(c));
  for (const c of s.categories) if (!c.emoji) c.emoji = CATEGORIES.find((d) => d.id === c.id)?.emoji ?? suggestEmoji(c.name);
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
  for (const sub of s.subscriptions) {
    const step = sub.cycle === 'yearly' ? 12 : 1;
    let guard = 0;
    if (sub.cycle === 'weekly') {
      while (sub.nextDate < today && guard++ < 400) {
        const d = new Date(sub.nextDate);
        d.setDate(d.getDate() + 7);
        sub.nextDate = d.toISOString().slice(0, 10);
      }
    } else while (sub.nextDate < today && guard++ < 60) sub.nextDate = addMonths(sub.nextDate, step);
  }
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
      toast({ text: `Added. Safe to spend is now ${rupees(sts.safe)}.` });
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
      commit((s) => {
        if (sub.id) Object.assign(s.subscriptions.find((x) => x.id === sub.id)!, sub);
        else s.subscriptions.push({ ...sub, id: uid('sub') } as Subscription);
      });
      toast({ text: sub.id ? 'Saved.' : `${sub.name} added. It's now counted in safe-to-spend.` });
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
      commit((s) => {
        if (d.id) Object.assign(s.debts.find((x) => x.id === d.id)!, d);
        else s.debts.push({ ...d, id: uid('debt') } as Debt);
      });
      toast({ text: d.id ? 'Loan updated.' : `${d.name} added.` });
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
    disableSync,
    saveAccount,
    deleteAccount,
    saveInvestment,
    setInvestmentStatus,
    deleteInvestment,
    saveCard,
    deleteCard,
    saveDebt,
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
