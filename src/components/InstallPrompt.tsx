import { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { inFrame, isIOS, isStandalone, useInstall } from '../lib/pwa';
import { daysBetween, haptic } from '../lib/format';
import { Icon } from './ui/Icon';
import { Submark } from './ui/Submark';

// The "put PULSE on your home screen" nudge.
//   1. Once, right after onboarding (or on the next open for people already using PULSE).
//   2. One reminder on Home three days later, for a few days.
//   3. Never again after that. It always stays available under You.
// Remembered per device, because installing is per device.

const KEY = 'pulse-install-nudge-v1';
const REMIND_AFTER_DAYS = 3;
const REMIND_FOR_DAYS = 4;

interface Nudge {
  /** The day the sheet was first shown. */
  first?: string;
  /** The Home reminder was closed or used. */
  reminded?: boolean;
}

function read(): Nudge {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function write(n: Nudge) {
  try {
    localStorage.setItem(KEY, JSON.stringify(n));
  } catch {
    /* ignore */
  }
}

const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/** Worth nudging: not installed yet, on the real site, and on something that can install. */
function eligible(canPrompt: boolean) {
  if (typeof window === 'undefined' || isStandalone() || inFrame()) return false;
  return canPrompt || isIOS() || isAndroid();
}

/** Opens the install sheet once, shortly after the dashboard first appears. Call from the app shell. */
export function useInstallNudge() {
  const { state } = useStore();
  const ui = useUI();
  const inst = useInstall();
  const ready = state.onboarding.done && state.mode === 'personal';
  useEffect(() => {
    if (!ready || read().first || !eligible(inst.canPrompt)) return;
    const t = window.setTimeout(() => {
      if (read().first || isStandalone()) return;
      write({ ...read(), first: state.today });
      ui.openSheet({ type: 'install' });
    }, 1400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, inst.canPrompt]);
}

const REASONS: [string, string, string][] = [
  ['⚡', 'Opens in one tap', 'Full screen, like any other app. Works offline too.'],
  ['🔒', 'Keeps your data safer', 'Browsers can clear a website’s saved data. An installed app keeps it.'],
  ['🔔', 'Lets PULSE remind you', 'Bills due, payday and a nudge to log your day.'],
];

/** The iOS share icon: a square with an arrow out of the top. */
function ShareIOS() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}
const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="mx-0.5 inline-flex h-6 min-w-6 translate-y-[2px] items-center justify-center rounded-md border border-line bg-surface px-1.5 align-baseline text-[12.5px] font-semibold text-ink">{children}</span>
);

/** What goes inside the install sheet. */
export function InstallPrompt({ onDone }: { onDone: () => void }) {
  const inst = useInstall();
  const store = useStore();
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const [making, setMaking] = useState(false);
  const code = store.sync.enabled ? store.sync.code : null;

  const install = async () => {
    setBusy(true);
    const res = await inst.prompt();
    setBusy(false);
    if (res === 'accepted') {
      haptic(16);
      write({ ...read(), reminded: true });
      store.toast({ text: 'PULSE is on your home screen. Open it from there.', tone: 'good', emoji: '🎉' });
      onDone();
    }
  };
  const guide = () => {
    onDone();
    ui.push({ name: 'install' }, 'you');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Submark size={60} className="shrink-0 rounded-[30%] ring-1 ring-line" />
        <p className="text-[15px] leading-snug text-ink2">{inst.ios ? 'Free, no app store, about 20 seconds.' : 'Free, no app store, about 20 seconds. Your money and settings come with it.'}</p>
      </div>

      <ul className="flex flex-col gap-3">
        {REASONS.map(([emoji, title, body]) => (
          <li key={title} className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sunk text-[19px]" aria-hidden="true">
              {emoji}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-tight">{title}</span>
              <span className="block text-[13.5px] leading-snug text-ink3">{body}</span>
            </span>
          </li>
        ))}
      </ul>

      {inst.canPrompt ? (
        <button type="button" className="btn-accent w-full" disabled={busy} onClick={() => void install()}>
          <Icon name="download" size={18} /> {busy ? 'Opening…' : 'Install PULSE'}
        </button>
      ) : inst.ios ? (
        <div className="rounded-2xl bg-sunk/70 p-4">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink3">On iPhone</p>
          <ol className="mt-2 flex flex-col gap-2 text-[14.5px] leading-snug">
            <li>
              <b>1.</b> Tap{' '}
              <Key>
                <ShareIOS />
              </Key>{' '}
              <b>Share</b> at the bottom of the screen.
            </li>
            <li>
              <b>2.</b> Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
            </li>
            <li>
              <b>3.</b> Open PULSE from your home screen and bring your data across with the code below.
            </li>
          </ol>
          <div className="mt-3 rounded-xl border border-line bg-surface p-3">
            <p className="text-[13px] leading-snug text-ink2">On iPhone the home-screen app starts empty. Your code moves everything you've entered here.</p>
            {code ? (
              <>
                <p className="num mt-2 select-all break-all rounded-lg bg-sunk px-2 py-2 text-center font-mono text-[14px] font-semibold tracking-wide">{code}</p>
                <button
                  type="button"
                  className="btn-quiet mt-2 min-h-[40px] w-full text-[14px]"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(code);
                      store.toast({ text: 'Code copied. In the installed app, tap “I use PULSE on another device” and paste it.', emoji: '📋' });
                    } catch {
                      store.toast({ text: 'Copy is blocked here. Write the code down.' });
                    }
                  }}
                >
                  <Icon name="copy" size={16} /> Copy my code
                </button>
                <p className="mt-2 text-[12.5px] text-ink3">In the installed app: tap <b>I use PULSE on another device</b>, then paste it.</p>
              </>
            ) : (
              <button
                type="button"
                className="btn-quiet mt-2 min-h-[40px] w-full text-[14px]"
                disabled={making}
                onClick={async () => {
                  setMaking(true);
                  await store.enableSync();
                  setMaking(false);
                }}
              >
                {making ? 'Getting your code…' : 'Get my transfer code'}
              </button>
            )}
          </div>
          <button type="button" className="mt-3 text-[13.5px] font-semibold text-accent-ink underline-offset-2 hover:underline" onClick={guide}>
            Show me with more detail
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-sunk/70 p-4">
          <p className="text-[14.5px] leading-snug">
            Tap the menu <Key>⋮</Key> at the top right of your browser, then <b>Install app</b> or <b>Add to Home screen</b>.
          </p>
          <button type="button" className="mt-3 text-[13.5px] font-semibold text-accent-ink underline-offset-2 hover:underline" onClick={guide}>
            Show me with more detail
          </button>
        </div>
      )}

      <button type="button" className="btn-ghost w-full" onClick={onDone}>
        {inst.canPrompt ? 'Not now' : 'Got it'}
      </button>
    </div>
  );
}

/** The one reminder on Home, three days after the first ask. */
export function InstallBanner() {
  const { state } = useStore();
  const ui = useUI();
  const inst = useInstall();
  const [gone, setGone] = useState(false);
  const n = read();
  const days = n.first ? daysBetween(n.first, state.today) : -1;
  const show = !gone && state.mode === 'personal' && state.onboarding.done && !n.reminded && days >= REMIND_AFTER_DAYS && days < REMIND_AFTER_DAYS + REMIND_FOR_DAYS && eligible(inst.canPrompt);
  if (!show) return null;
  const close = () => {
    write({ ...read(), reminded: true });
    setGone(true);
  };
  return (
    <section aria-label="Install PULSE" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
      <Submark size={44} className="shrink-0 rounded-[30%] ring-1 ring-line" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-tight">Put PULSE on your home screen</p>
        <p className="mt-0.5 text-[13px] text-ink3">One tap to open, safer data, and reminders.</p>
        <button
          type="button"
          className="btn-primary mt-3 min-h-[38px] px-4 text-[14px]"
          onClick={() => {
            close();
            ui.openSheet({ type: 'install' });
          }}
        >
          Show me how
        </button>
      </div>
      <button type="button" className="tap -mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center self-start rounded-full text-ink3 hover:bg-sunk" aria-label="Don't show this again" onClick={close}>
        <Icon name="x" size={16} />
      </button>
    </section>
  );
}
