import { useEffect, useLayoutEffect, useRef } from 'react';
import { HistoryScreen } from './screens/History';
import { SyncScreen } from './screens/Sync';
import { takeSyncLink } from './lib/sync';
import { StoreProvider, useStore } from './store/store';
import { UIProvider, useUI } from './store/ui';
import { BottomNavigation, MobileTopBar, SideNavigation } from './components/Navigation';
import { SheetHost } from './components/SheetHost';
import { Toasts } from './components/money';
import { Onboarding } from './components/Onboarding';
import { AIChat } from './components/Assistant';
import { TransactionDetail } from './components/TransactionDetail';
import { Icon } from './components/ui/Icon';
import { HomeScreen } from './screens/Home';
import { ActivityScreen } from './screens/Activity';
import { GroupDetail, PersonDetail, PlanDetail, PlansScreen } from './screens/Plans';
import { DemoGuideScreen, InstallScreen } from './screens/Learn';
import { MIGRATED_FLAG } from './lib/migrate';
import { AccountsScreen, InvestmentsScreen, CardsScreen, CategoriesScreen, DebtScreen, IncomeScreen, NetWorthScreen, SettingsScreen, SubscriptionsScreen, YouScreen } from './screens/You';

function Screen() {
  const ui = useUI();
  const r = ui.route;
  if (r) {
    switch (r.name) {
      case 'plan':
        return <PlanDetail id={r.id} />;
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

/** Desktop contextual panel: the selected transaction, otherwise PULSE AI. */
function ContextPanel() {
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
            <TransactionDetail key={ui.selectedTx} id={ui.selectedTx} inline onClose={() => ui.setSelectedTx(null)} />
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-on-accent" aria-hidden="true">
              <Icon name="spark" size={14} />
            </span>
            <h2 className="display flex-1 text-[18px]">PULSE AI</h2>
            {ui.chat.length > 0 && (
              <button type="button" className="text-[13px] font-semibold text-ink3 hover:text-ink" onClick={() => ui.setChat([])}>
                Clear
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <AIChat compact />
          </div>
        </>
      )}
    </aside>
  );
}

function Shell() {
  const store = useStore();
  const { state, replayOnboarding, hasStash, backToMine, toast, exploreDemo, updateSettings } = store;
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
  const ui = useUI();
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

  // Home-screen shortcuts and deep links: /?action=add | afford | ai, /?tab=plans|activity|you
  useEffect(() => {
    if (!state.onboarding.done) return;
    const q = new URLSearchParams(location.search);
    const action = q.get('action');
    const tab = q.get('tab');
    if (!action && !tab) return;
    if (tab === 'plans' || tab === 'activity' || tab === 'you' || tab === 'home') ui.resetTo(tab);
    if (action === 'add') ui.openSheet({ type: 'composer' });
    if (action === 'afford') ui.openSheet({ type: 'afford' });
    if (action === 'ai') ui.openSheet({ type: 'ai' });
    q.delete('action');
    q.delete('tab');
    q.delete('source');
    const rest = q.toString();
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
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
          {state.mode === 'personal' && state.onboarding.done && onRoot && ui.tab === 'home' && !state.settings.hideDemoPrompt && (
            <div className="mb-5 flex items-center gap-3 rounded-2xl border border-line bg-surface py-3 pl-4 pr-2">
              <p className="min-w-0 flex-1 text-[14px] text-ink2">
                Peek at the <span className="font-semibold text-ink">demo</span> anytime. Your money stays saved.
              </p>
              <button type="button" className="btn-accent min-h-[38px] shrink-0 px-4 text-[13.5px]" onClick={exploreDemo}>
                Explore demo
              </button>
              <button type="button" className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label="Hide this" onClick={() => updateSettings({ hideDemoPrompt: true })}>
                <Icon name="x" size={16} />
              </button>
            </div>
          )}
          <div className="animate-rise">
            <Screen />
          </div>
        </div>
      </main>
      <ContextPanel />
      <BottomNavigation />
      <SheetHost />
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <UIProvider>
        <Shell />
      </UIProvider>
    </StoreProvider>
  );
}
