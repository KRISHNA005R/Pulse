import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { revealIn } from './lib/motion';
import { takeSyncLink } from './lib/sync';
import { StoreProvider, useStore } from './store/store';
import { AuthProvider } from './store/auth';
import { AccountScreen, MemberMoment, useAuthGate } from './components/Auth';
import { usePeopleNotices } from './components/peopleHooks';
import { keepMeet, meetToken } from './lib/people';
import { loadSession } from './lib/auth';
import { UIProvider, useUI } from './store/ui';
import { BottomNavigation, MobileTopBar, SideNavigation } from './components/Navigation';
import { SheetHost } from './components/SheetHost';
import { Toasts } from './components/money';
import { Tour } from './components/Tour';
import { Onboarding } from './components/Onboarding';
import { Icon } from './components/ui/Icon';
import { Lazy, lazyNamed } from './components/Lazy';
import { HomeScreen } from './screens/Home';
import { MIGRATED_FLAG } from './lib/migrate';
import { applyUpdate, onUpdateReady } from './lib/update';
import { useInstallNudge } from './components/InstallPrompt';
import { useFriends } from './components/Friends';
import { takeReplay } from './lib/bhisi';
import { takeBhisiAutoJoin, takeBhisiLink } from './lib/bhisiShare';
import { syncReminders } from './lib/reminders';

// Every screen but Home loads when first opened (components/Lazy.tsx), so PULSE opens faster.
const HistoryScreen = lazyNamed(() => import('./screens/History'), 'HistoryScreen');
const SyncScreen = lazyNamed(() => import('./screens/Sync'), 'SyncScreen');
const PeopleScreen = lazyNamed(() => import('./components/People'), 'PeopleScreen');
const AIChat = lazyNamed(() => import('./components/Assistant'), 'AIChat');
const TransactionDetail = lazyNamed(() => import('./components/TransactionDetail'), 'TransactionDetail');
const ActivityScreen = lazyNamed(() => import('./screens/Activity'), 'ActivityScreen');
const GroupDetail = lazyNamed(() => import('./screens/Plans'), 'GroupDetail');
const PersonDetail = lazyNamed(() => import('./screens/Plans'), 'PersonDetail');
const PlanDetail = lazyNamed(() => import('./screens/Plans'), 'PlanDetail');
const PlansScreen = lazyNamed(() => import('./screens/Plans'), 'PlansScreen');
const DemoGuideScreen = lazyNamed(() => import('./screens/Learn'), 'DemoGuideScreen');
const InstallScreen = lazyNamed(() => import('./screens/Learn'), 'InstallScreen');
const InsuranceScreen = lazyNamed(() => import('./screens/Insurance'), 'InsuranceScreen');
const RemindersScreen = lazyNamed(() => import('./screens/Reminders'), 'RemindersScreen');
const BhisiDetail = lazyNamed(() => import('./components/Bhisi'), 'BhisiDetail');
const FeedbackScreen = lazyNamed(() => import('./screens/Feedback'), 'FeedbackScreen');
const AccountsScreen = lazyNamed(() => import('./screens/You'), 'AccountsScreen');
const InvestmentsScreen = lazyNamed(() => import('./screens/You'), 'InvestmentsScreen');
const CardsScreen = lazyNamed(() => import('./screens/You'), 'CardsScreen');
const CategoriesScreen = lazyNamed(() => import('./screens/You'), 'CategoriesScreen');
const DebtScreen = lazyNamed(() => import('./screens/You'), 'DebtScreen');
const IncomeScreen = lazyNamed(() => import('./screens/You'), 'IncomeScreen');
const NetWorthScreen = lazyNamed(() => import('./screens/You'), 'NetWorthScreen');
const SettingsScreen = lazyNamed(() => import('./screens/You'), 'SettingsScreen');
const SubscriptionsScreen = lazyNamed(() => import('./screens/You'), 'SubscriptionsScreen');
const YouScreen = lazyNamed(() => import('./screens/You'), 'YouScreen');
const FriendsScreen = lazyNamed(() => import('./components/FriendsHub'), 'FriendsScreen');

function Screen() {
  const ui = useUI();
  const r = ui.route;
  if (r) {
    switch (r.name) {
      case 'plan':
        return <PlanDetail id={r.id} />;
      case 'bhisi':
        return <BhisiDetail id={r.id} />;
      case 'group':
        return <GroupDetail id={r.id} />;
      case 'person':
        return <PersonDetail id={r.id} />;
      case 'subscriptions':
        return <SubscriptionsScreen />;
      case 'networth':
        return <NetWorthScreen />;
      case 'investments':
        return <InvestmentsScreen />;
      case 'insurance':
        return <InsuranceScreen />;
      case 'feedback':
        return <FeedbackScreen />;
      case 'reminders':
        return <RemindersScreen />;
      case 'income':
        return <IncomeScreen />;
      case 'cards':
        return <CardsScreen />;
      case 'debt':
        return <DebtScreen />;
      case 'accounts':
        return <AccountsScreen />;
      case 'categories':
        return <CategoriesScreen />;
      case 'demo-guide':
        return <DemoGuideScreen />;
      case 'install':
        return <InstallScreen />;
      case 'history':
        return <HistoryScreen year={r.year} />;
      case 'sync':
        return <SyncScreen code={r.code} />;
      case 'account':
        return <AccountScreen />;
      case 'people':
        return <PeopleScreen />;
      case 'friends':
        return <FriendsScreen />;
      case 'settings':
        return <SettingsScreen section={r.section} />;
    }
  }
  switch (ui.tab) {
    case 'home':
      return <HomeScreen />;
    case 'activity':
      return <ActivityScreen />;
    case 'plans':
      return <PlansScreen />;
    case 'you':
      return <YouScreen />;
  }
}

/** Is the screen wide enough for the desktop side panel (xl, 1280px)? */
function useWide() {
  const q = '(min-width: 1280px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** Desktop contextual panel: the selected transaction, otherwise PULSE AI. Not made at all on phones. */
function ContextPanel() {
  const wide = useWide();
  if (!wide) return null;
  return <ContextPanelWide />;
}
function ContextPanelWide() {
  const ui = useUI();
  return (
    <aside aria-label="Context" className="sticky top-0 hidden h-screen w-[380px] shrink-0 flex-col border-l border-line bg-surface/60 px-5 py-6 xl:flex">
      {ui.selectedTx ? (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="display text-[18px]">Transaction</h2>
            <button type="button" className="tap grid h-9 w-9 place-items-center rounded-full hover:bg-sunk" aria-label="Close transaction" onClick={() => ui.setSelectedTx(null)}>
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <Lazy>
              <TransactionDetail key={ui.selectedTx} id={ui.selectedTx} inline onClose={() => ui.setSelectedTx(null)} />
            </Lazy>
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-on-accent" aria-hidden="true">
              <Icon name="spark" size={14} />
            </span>
            <h2 data-tour="ai" className="display flex-1 text-[18px]">PULSE AI</h2>
            {ui.chat.length > 0 && (
              <button type="button" className="text-[13px] font-semibold text-ink3 hover:text-ink" onClick={() => ui.setChat([])}>
                Clear
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <Lazy>
              <AIChat compact />
            </Lazy>
          </div>
        </>
      )}
    </aside>
  );
}

function Shell() {
  const store = useStore();
  const { state, replayOnboarding, hasStash, backToMine, toast, exploreDemo } = store;
  // Tell people whose data just moved over from the old address.
  useEffect(() => {
    let moved: string | null = null;
    try {
      moved = sessionStorage.getItem(MIGRATED_FLAG);
      sessionStorage.removeItem(MIGRATED_FLAG);
    } catch {
      /* ignore */
    }
    if (moved === 'moved') toast({ text: 'PULSE now lives at pulsemoney.in. Your money came with you.', tone: 'good' });
    else if (moved === 'kept') toast({ text: 'You already had PULSE data on pulsemoney.in, so we kept that.' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A new version installed while you were mid-way through something: offer it, don't force it.
  useEffect(
    () =>
      onUpdateReady(() => toast({ text: 'A new version of PULSE is ready.', emoji: '✨', action: { label: 'Update', run: applyUpdate } })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const ui = useUI();
  useInstallNudge();
  // Someone who isn't signed in: a friendly ask for a week, then sign-in is needed to carry on.
  const wall = useAuthGate();
  useFriends();
  usePeopleNotices();
  // Keep this device's queued reminders in step with the data (a few seconds after things settle).
  useEffect(() => {
    const t = window.setTimeout(() => void syncReminders(state), 6000);
    return () => window.clearTimeout(t);
  }, [state]);
  const initialTheme = useRef<string | null>(null);

  // Theme: explicit choice wins; "match device" hands control back to the page default.
  useEffect(() => {
    const root = document.documentElement;
    if (initialTheme.current === null) initialTheme.current = root.getAttribute('data-theme') ?? '';
    const t = state.settings.theme;
    if (t === 'system') {
      if (initialTheme.current) root.setAttribute('data-theme', initialTheme.current);
      else root.removeAttribute('data-theme');
    } else root.setAttribute('data-theme', t);
    // Keep the browser / installed-app status bar in step with the chosen theme.
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]:not(#sp-tc)').forEach((m) => {
      if (m.dataset.media === undefined) m.dataset.media = m.getAttribute('media') ?? '';
      const darkTag = m.dataset.media.includes('dark');
      if (t === 'system') {
        if (m.dataset.media) m.setAttribute('media', m.dataset.media);
        m.content = darkTag ? '#12110F' : '#F6F5F2';
      } else {
        m.removeAttribute('media');
        m.content = t === 'dark' ? '#12110F' : '#F6F5F2';
      }
    });
  }, [state.settings.theme]);

  // Page title per tab (the home title is the SEO title from index.html).
  const baseTitle = useRef(document.title);
  useEffect(() => {
    const names: Record<string, string> = { activity: 'Activity', plans: 'Plans', you: 'You' };
    document.title = ui.tab === 'home' ? baseTitle.current : `${names[ui.tab]} · PULSE`;
  }, [ui.tab]);

  // A sync link (#sync=PULSE-…) from a QR scan: open the link screen with the code filled in.
  useEffect(() => {
    if (!state.onboarding.done) return;
    const check = () => {
      const code = takeSyncLink();
      if (code && !store.sync.enabled) ui.resetTo('you', { name: 'sync', code });
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.onboarding.done, store.sync.enabled]);

  // A Meet code (#meet=…), scanned with the phone's own camera: connect right away. Not signed in
  // yet: kept for a few minutes and opened after (usePeopleNotices).
  useEffect(() => {
    const check = () => {
      const t = meetToken(location.hash);
      if (!t) return;
      history.replaceState(history.state, '', location.pathname + location.search);
      if (state.onboarding.done && state.mode === 'personal' && loadSession()) ui.openSheet({ type: 'meet', token: t });
      else keepMeet(t);
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.onboarding.done, state.mode]);

  // A shared bhisi draw (#draw=…): replay the same chit coming out.
  useEffect(() => {
    if (!state.onboarding.done) return;
    const check = () => {
      const d = takeReplay();
      if (d) ui.openSheet({ type: 'draw-replay', replay: d });
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.onboarding.done]);

  // A bhisi invite (#bhisi=…): kept until set up, then asked.
  useEffect(() => {
    const ready = state.onboarding.done && state.mode === 'personal';
    const check = () => {
      const inv = takeBhisiLink(ready);
      if (!inv) return;
      // Came in through the invite screen (signed in to join): join and open it, no second question.
      if (!takeBhisiAutoJoin()) return ui.openSheet({ type: 'bhisi-join', invite: inv });
      void store.joinBhisi(inv).then((res) => {
        if (!res.id) return ui.openSheet({ type: 'bhisi-join', invite: inv });
        ui.resetTo('plans');
        ui.setPlansSegment('bhisi');
        ui.push({ name: 'bhisi', id: res.id });
      });
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.onboarding.done, state.mode]);

  // Home-screen shortcuts and deep links: /?action=add | afford | ai | feedback | gullak, /?tab=plans|splits|activity|you
  useEffect(() => {
    if (!state.onboarding.done) return;
    const q = new URLSearchParams(location.search);
    const action = q.get('action');
    const tab = q.get('tab');
    if (!action && !tab) return;
    if (tab === 'plans' || tab === 'activity' || tab === 'you' || tab === 'home') ui.resetTo(tab);
    // A bhisi notification opens on the bhisis.
    if (tab === 'bhisi') {
      ui.resetTo('plans');
      ui.setPlansSegment('bhisi');
    }
    // A friend's notification opens straight on the splits.
    if (tab === 'splits') {
      ui.resetTo('plans');
      ui.setPlansSegment('splits');
    }
    // From iPhone Shortcuts, Back Tap or an NFC tag: /?action=add&amount=20&note=Chai opens the add
    // screen filled in. It never saves by itself: one tap to confirm.
    if (action === 'add') {
      const amount = Number(q.get('amount'));
      const text = (q.get('note') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      ui.openSheet({ type: 'composer', ...(amount > 0 && amount < 1e8 ? { preset: { amount: Math.round(amount * 100) / 100, ...(text ? { text } : {}) } } : text ? { preset: { text } } : {}) });
    }
    if (action === 'meet') ui.openSheet({ type: 'meet' });
    if (action === 'friends') ui.resetTo('you', { name: 'friends' });
    if (action === 'afford') ui.openSheet({ type: 'afford' });
    if (action === 'ai') ui.openSheet({ type: 'ai' });
    // The announcement email's "Start a gullak" button.
    if (action === 'gullak') {
      ui.resetTo('plans');
      ui.openSheet({ type: 'gullak-form' });
    }
    if (action === 'feedback') ui.resetTo('you', { name: 'feedback' });
    q.delete('action');
    q.delete('tab');
    q.delete('source');
    q.delete('amount');
    q.delete('note');
    const rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.onboarding.done]);

  // Global shortcuts: "/" or Ctrl/Cmd+K opens search; "n" adds an expense.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        if (!ui.sheets.some((s) => s.type === 'command')) ui.openSheet({ type: 'command' });
      } else if (e.key === 'n' && !typing && !e.metaKey && !e.ctrlKey && ui.sheets.length === 0) {
        e.preventDefault();
        ui.openSheet({ type: 'composer' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui]);

  const onRoot = !ui.route;

  // The "Peek at the demo" box on Home. Hiding it is remembered on this device only: it used to be
  // saved with the person's settings, so hiding it once hid it on every device they signed in on.
  const [demoBoxHidden, setDemoBoxHidden] = useState(() => {
    try {
      return localStorage.getItem('pulse-demo-box-v1') === 'hidden';
    } catch {
      return false;
    }
  });
  const hideDemoBox = () => {
    setDemoBoxHidden(true);
    try {
      localStorage.setItem('pulse-demo-box-v1', 'hidden');
    } catch {
      /* storage unavailable: hidden until the app is reopened */
    }
  };

  // Setup is a page of its own: nothing renders behind it, so the phone keyboard can't
  // reveal the dashboard, and finishing lands on Home scrolled to the very top.
  const wasOnboarding = useRef(!state.onboarding.done);
  useLayoutEffect(() => {
    if (!state.onboarding.done) {
      wasOnboarding.current = true;
      window.scrollTo(0, 0);
      return;
    }
    if (wasOnboarding.current) {
      wasOnboarding.current = false;
      ui.closeAllSheets();
      ui.resetTo('home');
      window.scrollTo(0, 0);
      requestAnimationFrame(() => window.scrollTo(0, 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.onboarding.done]);

  if (!state.onboarding.done) {
    return (
      <>
        <Onboarding />
        <Toasts />
      </>
    );
  }

  if (wall)
    return (
      <>
        {wall}
        <Toasts />
      </>
    );

  return (
    <div className="flex min-h-full bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
        Skip to content
      </a>
      <SideNavigation />
      <main id="main" className="min-w-0 flex-1 px-4 pb-32 pt-5 md:px-8 lg:pb-16 lg:pt-10">
        <div className="mx-auto w-full max-w-[560px] lg:max-w-[680px]" key={`${ui.tab}-${ui.depth}`}>
          {onRoot && <MobileTopBar />}
          {state.mode === 'demo' && state.onboarding.done && onRoot && (
            <div className="mb-5 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
              <p className="min-w-0 flex-1 text-[14px] text-ink2">
                You're exploring <span className="font-semibold text-ink">demo data</span>.{' '}
                <button type="button" className="font-semibold text-accent-ink underline decoration-accent/40 underline-offset-2" onClick={() => ui.resetTo('you', { name: 'demo-guide' })}>
                  What to try
                </button>
              </p>
              <button type="button" className="btn-accent min-h-[38px] shrink-0 px-4 text-[13.5px]" onClick={hasStash ? backToMine : replayOnboarding}>
                {hasStash ? 'Back to my money' : 'Use my own money'}
              </button>
            </div>
          )}
          {state.mode === 'personal' && state.onboarding.done && onRoot && ui.tab === 'home' && !demoBoxHidden && (
            <div className="mb-5 flex items-center gap-3 rounded-2xl border border-line bg-surface py-3 pl-4 pr-2">
              <p className="min-w-0 flex-1 text-[14px] text-ink2">
                Peek at the <span className="font-semibold text-ink">demo</span> anytime. Your money stays saved.
              </p>
              <button type="button" className="btn-accent min-h-[38px] shrink-0 px-4 text-[13.5px]" onClick={exploreDemo}>
                Explore demo
              </button>
              <button type="button" className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label="Hide this" onClick={hideDemoBox}>
                <Icon name="x" size={16} />
              </button>
            </div>
          )}
          <Lazy tall>
            <ScreenReveal>
              <Screen />
            </ScreenReveal>
          </Lazy>
        </div>
      </main>
      <ContextPanel />
      <BottomNavigation />
      <SheetHost />
      <MemberMoment />
      <Toasts />
      <Tour />
    </div>
  );
}

/** The screen's cards rise in one after another; the ones further down wait until you scroll to them. */
function ScreenReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => (ref.current ? revealIn(ref.current) : undefined), []);
  return <div ref={ref}>{children}</div>;
}

export default function App() {
  return (
    <StoreProvider>
      <AuthProvider>
        <UIProvider>
          <Shell />
        </UIProvider>
      </AuthProvider>
    </StoreProvider>
  );
}
