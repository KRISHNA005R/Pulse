import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Insight } from '../types';
import type { AIAnswer } from '../lib/assistant';
import type { ComposerPreset } from '../components/ExpenseComposer';

export type Tab = 'home' | 'activity' | 'plans' | 'you';

export type Route =
  | { name: 'plan'; id: string }
  | { name: 'group'; id: string }
  | { name: 'person'; id: string }
  | { name: 'people' }
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
  | { name: 'account' }
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
  | { type: 'auth-nudge' }
  | { type: 'member-card' }
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

  // ---------- the phone's back gesture ----------
  // Every screen or sheet opened on top of a tab adds one entry to the browser's history, so the
  // back swipe (or Android's back button) closes the top one instead of leaving PULSE. The browser's
  // history is kept as a mirror of what is on screen: `hist` is how many entries are ours.
  // A flow with steps of its own (setup) counts too: each step it is in adds one, and going back
  // takes it back a step.
  const [flowPos, setFlowPos] = useState(0);
  const flowBack = useRef<(() => void) | null>(null);
  const flowRef = useRef(0);
  flowRef.current = flowPos;
  const setFlow = useCallback((pos: number, onBack: (() => void) | null) => {
    flowBack.current = onBack;
    setFlowPos(onBack ? Math.max(0, pos) : 0);
  }, []);
  const depth = sheets.length + stacks[tab].length + flowPos;
  const depthRef = useRef(depth);
  depthRef.current = depth;
  const sheetsRef = useRef(sheets);
  sheetsRef.current = sheets;
  const hist = useRef(0);
  /** History moves we made ourselves (closing something on screen), whose event is not a gesture. */
  const ours = useRef(0);
  const settle = useRef(0);
  /** Step the browser's history back ourselves. Its event arrives a moment later; nothing else moves until then. */
  const rewind = useCallback((by: number) => {
    ours.current++;
    history.go(-by);
    // If the browser never answers (nothing there to go back to), stop waiting.
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      if (!ours.current) return;
      ours.current = 0;
      mirror();
    }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mirror = useCallback(() => {
    if (ours.current > 0) return; // a move of ours is still on its way: line up when it lands
    const want = depthRef.current;
    try {
      if (want > hist.current) {
        for (let n = hist.current + 1; n <= want; n++) history.pushState({ pulse: n }, '');
        hist.current = want;
      } else if (want < hist.current) {
        const by = hist.current - want;
        hist.current = want;
        rewind(by);
      }
    } catch {
      /* history unavailable (a sandboxed frame): the app works without the gesture */
    }
  }, [rewind]);
  useEffect(() => {
    try {
      // PULSE puts each screen back where it was scrolled (scroll memory, above). Left to itself the
      // browser would also "restore" a position on every back step, and pull the screen to the top.
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    } catch {
      /* ignore */
    }
    try {
      // Reloaded with screens open: the app starts again at the top, so step history back to the top too.
      const was = (history.state as { pulse?: unknown } | null)?.pulse;
      if (typeof was === 'number' && was > 0 && was < 50) {
        hist.current = was;
        rewind(was);
      } else history.replaceState({ ...(history.state as object | null), pulse: 0 }, '');
    } catch {
      /* ignore */
    }
    const onPop = (e: PopStateEvent) => {
      const n = (e.state as { pulse?: unknown } | null)?.pulse;
      if (typeof n !== 'number') return; // not one of our entries (an in-page link)
      if (ours.current > 0) {
        ours.current--;
        hist.current = n;
      } else {
        // The person went back: close what is on top, once per step.
        const steps = hist.current - n;
        hist.current = n;
        for (let i = 0; i < steps; i++) {
          if (sheetsRef.current.length > i) closeSheet();
          else if (flowRef.current > 0 && flowBack.current) flowBack.current();
          else pop();
        }
        if (steps > 0) return; // the screen is about to match; the effect below confirms it
      }
      // Landed somewhere that doesn't match the screen (a forward swipe, or a reload mid-way): line up again.
      window.setTimeout(mirror, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.clearTimeout(settle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(mirror, [depth, mirror]);

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
    setFlow,
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

/**
 * For a flow with steps of its own, like setup: tells the navigation how many steps in it is, so
 * the phone's back gesture goes back one step (by calling `onBack`) instead of leaving PULSE.
 */
export function useBackSteps(pos: number, onBack: () => void) {
  const { setFlow } = useUI();
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    setFlow(pos, () => back.current());
  }, [pos, setFlow]);
  useEffect(() => () => setFlow(0, null), [setFlow]);
}
