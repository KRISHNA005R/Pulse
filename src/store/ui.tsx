import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Insight } from '../types';
import type { AIAnswer } from '../lib/assistant';
import type { ComposerPreset } from '../components/ExpenseComposer';

export type Tab = 'home' | 'activity' | 'plans' | 'you';

export type Route =
  | { name: 'plan'; id: string }
  | { name: 'group'; id: string }
  | { name: 'person'; id: string }
  | { name: 'subscriptions' }
  | { name: 'networth' }
  | { name: 'investments' }
  | { name: 'insurance' }
  | { name: 'feedback' }
  | { name: 'reminders' }
  | { name: 'income' }
  | { name: 'cards' }
  | { name: 'debt' }
  | { name: 'accounts' }
  | { name: 'categories' }
  | { name: 'demo-guide' }
  | { name: 'install' }
  | { name: 'history'; year?: number }
  | { name: 'sync'; code?: string }
  | { name: 'settings'; section: 'notifications' | 'security' | 'privacy' | 'appearance' | 'currency' | 'budget-prefs' | 'profile' | 'export' | 'connected' };

export type SheetSpec =
  | { type: 'composer'; preset?: ComposerPreset }
  | { type: 'tx'; id: string }
  | { type: 'afford'; amount?: number; what?: string }
  | { type: 'safe' }
  | { type: 'insight'; insight: Insight }
  | { type: 'plan-form'; planId?: string; template?: string }
  | { type: 'contribute'; planId: string }
  | { type: 'budget-form'; budgetId?: string; category?: string }
  | { type: 'sub-form'; subId?: string; preset?: { name: string; amount: number; category: string } }
  | { type: 'group-form' }
  | { type: 'group-expense'; groupId?: string; personId?: string }
  | { type: 'settle'; personId: string; groupId?: string }
  | { type: 'friend-invite' }
  | { type: 'friend-join'; code?: string }
  | { type: 'person-merge'; personId: string }
  | { type: 'share-card'; preset?: 'weekend' | 'plan' }
  | { type: 'receipt' }
  | { type: 'command'; query?: string }
  | { type: 'recap'; month?: string }
  | { type: 'ai' }
  | { type: 'income-form'; incomeId?: string }
  | { type: 'account-form'; accountId?: string }
  | { type: 'erase' }
  | { type: 'category-form'; categoryId?: string; kind?: 'expense' | 'income'; name?: string; onSaved?: (id: string) => void }
  | { type: 'investment-form'; investmentId?: string }
  | { type: 'insurance-form'; insuranceId?: string }
  | { type: 'install' }
  | { type: 'card-form'; cardId?: string }
  | { type: 'debt-form'; debtId?: string }
  | { type: 'confirm'; title: string; body: string; confirm: string; run: () => void };

export type PlansSegment = 'plans' | 'splits' | 'budgets';

export interface ActivityFilter {
  chip: string; // 'all' | category | 'plans' | 'people'
  query: string;
  range: 'this-month' | 'last-month' | '7d' | '30d' | 'all';
  account: string; // 'all' | account id
}

export interface ChatMsg {
  id: string;
  role: 'user' | 'ai';
  text: string;
  answer?: AIAnswer;
  /** Still "thinking": shows the typing dots. */
  typing?: boolean;
}

function useUIImpl() {
  const [tab, setTabRaw] = useState<Tab>('home');
  const [stacks, setStacks] = useState<Record<Tab, Route[]>>({ home: [], activity: [], plans: [], you: [] });
  const [sheets, setSheets] = useState<SheetSpec[]>([]);
  const [plansSegment, setPlansSegment] = useState<PlansSegment>('plans');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>({ chip: 'all', query: '', range: 'all', account: 'all' });
  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);

  // ---------- scroll memory ----------
  // Each screen remembers how far down it was scrolled (keyed by tab and stack depth), so going
  // back, or returning to a tab, lands exactly where you left. A newly opened screen starts at the top.
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const stacksRef = useRef(stacks);
  stacksRef.current = stacks;
  const scrollMem = useRef<Record<string, number>>({});
  const pendingScroll = useRef<number | null>(null);
  const keyOf = (t: Tab, depth: number) => `${t}:${depth}`;
  const remember = () => {
    const t = tabRef.current;
    scrollMem.current[keyOf(t, stacksRef.current[t].length)] = window.scrollY;
  };
  const forgetTab = (t: Tab) => {
    for (const k of Object.keys(scrollMem.current)) if (k.startsWith(`${t}:`)) delete scrollMem.current[k];
  };

  useLayoutEffect(() => {
    const y = pendingScroll.current;
    if (y === null) return;
    pendingScroll.current = null;
    const go = () => window.scrollTo({ top: y, left: 0, behavior: 'instant' as ScrollBehavior });
    go();
    // Content that settles a frame later (images, fonts) can shorten the page; try once more.
    const raf = requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - y) > 2) go();
    });
    return () => cancelAnimationFrame(raf);
  }, [tab, stacks]);

  const setTab = useCallback((t: Tab) => {
    const cur = tabRef.current;
    if (cur === t) {
      // Tapping the tab you're on goes back to its top level, scrolled to the top.
      forgetTab(t);
      pendingScroll.current = 0;
      setStacks((s) => ({ ...s, [t]: [] }));
      return;
    }
    remember();
    pendingScroll.current = scrollMem.current[keyOf(t, stacksRef.current[t].length)] ?? 0;
    setTabRaw(t);
  }, []);
  const push = useCallback((r: Route, onTab?: Tab) => {
    remember();
    const t = onTab ?? tabRef.current;
    const depth = stacksRef.current[t].length + 1;
    delete scrollMem.current[keyOf(t, depth)];
    pendingScroll.current = 0;
    if (onTab) setTabRaw(onTab);
    setStacks((s) => ({ ...s, [t]: [...s[t], r] }));
  }, []);
  const pop = useCallback(() => {
    const t = tabRef.current;
    const depth = stacksRef.current[t].length;
    if (depth === 0) return;
    delete scrollMem.current[keyOf(t, depth)];
    pendingScroll.current = scrollMem.current[keyOf(t, depth - 1)] ?? 0;
    setStacks((s) => ({ ...s, [t]: s[t].slice(0, -1) }));
  }, []);
  const resetTo = useCallback((t: Tab, r?: Route) => {
    if (t !== tabRef.current) remember();
    forgetTab(t);
    pendingScroll.current = 0;
    setTabRaw(t);
    setStacks((s) => ({ ...s, [t]: r ? [r] : [] }));
  }, []);
  const openSheet = useCallback((s: SheetSpec) => setSheets((xs) => [...xs, s]), []);
  const closeSheet = useCallback(() => setSheets((xs) => xs.slice(0, -1)), []);
  const closeAllSheets = useCallback(() => setSheets([]), []);
  const replaceSheet = useCallback((s: SheetSpec) => setSheets((xs) => [...xs.slice(0, -1), s]), []);

  return {
    tab,
    setTab,
    route: stacks[tab][stacks[tab].length - 1] as Route | undefined,
    depth: stacks[tab].length,
    push,
    pop,
    resetTo,
    sheets,
    openSheet,
    closeSheet,
    closeAllSheets,
    replaceSheet,
    plansSegment,
    setPlansSegment,
    activityFilter,
    setActivityFilter,
    selectedTx,
    setSelectedTx,
    chat,
    setChat,
  };
}

export type UI = ReturnType<typeof useUIImpl>;
const Ctx = createContext<UI | null>(null);
export function UIProvider({ children }: { children: ReactNode }) {
  const ui = useUIImpl();
  return <Ctx.Provider value={ui}>{children}</Ctx.Provider>;
}
export function useUI(): UI {
  const u = useContext(Ctx);
  if (!u) throw new Error('UIProvider missing');
  return u;
}
