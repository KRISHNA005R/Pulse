import { useUI, type Tab } from '../store/ui';
import { useStore } from '../store/store';
import { Icon } from './ui/Icon';
import { haptic } from '../lib/format';
import { streak } from '../lib/streak';
import { useState } from 'react';

/** Pill widths when a tab is active (icon + gap + label + padding). */
const PILL_W: Record<Tab, number> = { home: 110, activity: 126, plans: 106, you: 94 };

const ITEMS: { tab: Tab; label: string; icon: string }[] = [
  { tab: 'home', label: 'Home', icon: 'home' },
  { tab: 'activity', label: 'Activity', icon: 'activity' },
  { tab: 'plans', label: 'Plans', icon: 'target' },
  { tab: 'you', label: 'You', icon: 'user' },
];

/**
 * Bottom bar: the current tab is a filled pill with its name, the others are
 * outlined circles, and the orange circle at the end adds money.
 */
export function BottomNavigation() {
  const ui = useUI();
  const { state } = useStore();
  // Nothing logged yet today: the + button breathes a little, nudging a quick log.
  const nudge = state.mode === 'personal' && !streak(state).today;
  const [spin, setSpin] = useState(0);
  const ease = 'cubic-bezier(.32,.72,0,1)';
  const tabButton = (it: (typeof ITEMS)[number]) => {
    const on = ui.tab === it.tab;
    return (
      <button
        key={it.tab}
        type="button"
        onClick={() => {
          if (!on) haptic(6);
          ui.setTab(it.tab);
        }}
        aria-current={on ? 'page' : undefined}
        aria-label={it.label}
        className={`flex h-[50px] shrink-0 items-center overflow-hidden rounded-full border-[1.5px] active:scale-[0.96] ${on ? 'border-transparent bg-pill text-pill-fg' : 'border-ink/75 bg-transparent text-ink hover:bg-sunk'}`}
        style={{
          width: on ? PILL_W[it.tab] : 50,
          paddingLeft: 13, // keeps the icon exactly where it sits in the circle
          transition: `width 480ms ${ease}, background-color 320ms ease, border-color 320ms ease, color 320ms ease, transform 150ms ease`,
        }}
      >
        <Icon key={on ? 'on' : 'off'} name={it.icon} size={21} strokeWidth={on ? 2.3 : 1.9} className={`shrink-0 ${on ? 'animate-navpop' : ''}`} />
        <span
          className="ml-2 whitespace-nowrap text-[15px] font-semibold"
          style={{
            opacity: on ? 1 : 0,
            transform: on ? 'translateX(0)' : 'translateX(-6px)',
            transition: on ? `opacity 280ms ease 140ms, transform 380ms ${ease} 100ms` : 'opacity 120ms ease, transform 200ms ease',
          }}
        >
          {it.label}
        </span>
      </button>
    );
  };
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 bg-bg/85 backdrop-blur-md lg:hidden" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}>
      <div className="mx-auto flex max-w-[480px] items-center justify-between gap-1.5 px-4 pt-2.5">
        {ITEMS.map(tabButton)}
        <button
          type="button"
          onClick={() => {
            haptic(10);
            setSpin((n) => n + 1);
            ui.openSheet({ type: 'composer' });
          }}
          className={`tap grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-[0_8px_20px_-8px_rgb(var(--accent))] ${nudge ? 'animate-ring' : ''}`}
          aria-label="Add expense"
        >
          <span className="grid place-items-center transition-transform duration-500 [transition-timing-function:cubic-bezier(.34,1.8,.5,1)]" style={{ transform: `rotate(${spin * 90}deg)` }}>
            <Icon name="plus" size={24} strokeWidth={2.4} />
          </span>
        </button>
      </div>
    </nav>
  );
}

export function SideNavigation() {
  const ui = useUI();
  const { state } = useStore();
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
      <p className="display px-3 text-[24px] tracking-tight">
        PULSE<span className="text-accent-ink">.</span>
      </p>
      <button type="button" onClick={() => ui.openSheet({ type: 'command' })} className="tap mt-6 flex min-h-[42px] items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[14px] text-ink3 hover:border-ink3/40">
        <Icon name="search" size={16} /> Search or ask
        <kbd className="ml-auto rounded-md bg-sunk px-1.5 text-[11.5px] font-semibold text-ink2">/</kbd>
      </button>
      <ul className="mt-5 flex flex-col gap-1">
        {ITEMS.map((it) => {
          const on = ui.tab === it.tab;
          return (
            <li key={it.tab}>
              <button type="button" onClick={() => ui.setTab(it.tab)} aria-current={on ? 'page' : undefined} className={`tap flex min-h-[46px] w-full items-center gap-3 rounded-full px-4 text-[15px] font-semibold ${on ? 'bg-pill text-pill-fg' : 'text-ink2 hover:bg-sunk'}`}>
                <Icon name={it.icon} size={19} strokeWidth={on ? 2.3 : 1.9} />
                {it.label}
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => ui.openSheet({ type: 'composer' })} className="btn-accent mt-6 w-full">
        <Icon name="plus" size={18} /> Add expense
      </button>
      <button type="button" onClick={() => ui.openSheet({ type: 'ai' })} className="btn-ghost mt-2 w-full xl:hidden">
        <Icon name="spark" size={17} /> Ask PULSE AI
      </button>
      <div className="mt-auto px-3 text-[12px] leading-relaxed text-ink3">
        {state.mode === 'demo' ? `Demo data for ${state.user.name}.` : `Signed in as ${state.user.name} on this device.`} Nothing leaves this page.
      </div>
    </nav>
  );
}

export function MobileTopBar() {
  const ui = useUI();
  return (
    <div className="mb-5 flex items-center justify-between lg:hidden">
      <p className="display text-[21px] tracking-tight">
        PULSE<span className="text-accent-ink">.</span>
      </p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => ui.openSheet({ type: 'command' })} className="tap grid h-11 w-11 place-items-center rounded-full hover:bg-sunk" aria-label="Search or run a command">
          <Icon name="search" size={20} />
        </button>
        <button type="button" onClick={() => ui.openSheet({ type: 'ai' })} className="tap inline-flex h-11 items-center gap-1.5 rounded-full bg-sunk px-3.5 text-[14px] font-semibold" aria-label="Ask PULSE AI">
          <Icon name="spark" size={17} className="text-accent-ink" /> AI
        </button>
      </div>
    </div>
  );
}
