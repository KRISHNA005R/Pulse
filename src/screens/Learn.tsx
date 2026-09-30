import { useState } from 'react';
import { currentCurrency, ex } from '../lib/currency';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { Segmented, TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';
import { inFrame, isIOS, useInstall } from '../lib/pwa';

const SITE = 'pulsemoney.in';

// ------------------------------------------------------------------
// Explore the demo: a guided tour of the sample month
// ------------------------------------------------------------------

type Stop = { emoji: string; title: string; body: string; go: string; run: () => void };

export function DemoGuideScreen() {
  const store = useStore();
  const { state, hasStash } = store;
  const ui = useUI();
  const inDemo = state.mode === 'demo';

  /** Every stop works from anywhere: it opens the demo first if needed. */
  const visit = (run: () => void) => {
    if (!inDemo) store.exploreDemo();
    run();
  };

  const stops: Stop[] = [
    {
      emoji: '💸', title: 'Safe to spend', go: 'See the maths',
      body: 'The big number on Home. It is what is really free until payday, after bills, SIPs and plan savings. Tap it to see every line.',
      run: () => { ui.resetTo('home'); ui.openSheet({ type: 'safe' }); },
    },
    {
      emoji: '✍️', title: 'Log money in seconds', go: 'Try it',
      body: 'Type the way you talk, like "pizza 450 with Rahul". PULSE picks the category and emoji, then you swipe to save.',
      run: () => ui.openSheet({ type: 'composer' }),
    },
    {
      emoji: '🤔', title: 'Can I afford this?', go: `Check ${ex(5000)}`,
      body: 'Before you buy, see what it does to your week, your daily limit and your plans. No lectures.',
      run: () => ui.openSheet({ type: 'afford', amount: inDemo ? 5000 : currentCurrency().big, what: 'dinner' }),
    },
    {
      emoji: '🏝️', title: 'Life plans', go: 'Open Goa 2026',
      body: 'Goa 2026 is 62% saved. PULSE says if you are ahead or behind, and how much to put aside each payday.',
      run: () => ui.resetTo('plans', { name: 'plan', id: 'goa' }),
    },
    {
      emoji: '👥', title: 'Split with friends', go: 'Open Goa Gang',
      body: 'Split a bill equally, by amount, percentage or shares. See who owes whom and settle up in the same place.',
      run: () => { ui.setPlansSegment('splits'); ui.resetTo('plans', { name: 'group', id: 'g-goa' }); },
    },
    {
      emoji: '📈', title: 'SIPs on autopilot', go: 'See SIPs',
      body: 'Two SIPs are set up. They come out on their date each month, and safe-to-spend already allows for them.',
      run: () => ui.resetTo('you', { name: 'investments' }),
    },
    {
      emoji: '🔁', title: 'Bills & subscriptions', go: 'See bills',
      body: 'Every renewal with its next date, plus a nudge when something was charged twice.',
      run: () => ui.resetTo('you', { name: 'subscriptions' }),
    },
    {
      emoji: '✦', title: 'Ask PULSE AI', go: 'Ask a question',
      body: 'Ask "how much did I spend on food?" or "when will I reach Goa?". Answers come from the numbers in the app.',
      run: () => ui.openSheet({ type: 'ai' }),
    },
    {
      emoji: '📅', title: 'Monthly recap', go: 'Play recap',
      body: 'Your month as a few swipeable cards: wins, things to notice and one easy change.',
      run: () => ui.openSheet({ type: 'recap' }),
    },
    {
      emoji: '🎟️', title: 'Budget out loud', go: 'Make a card',
      body: 'Share a ticket, receipt or sticker card of your budget. Only the line you type is shown, never your balance.',
      run: () => ui.openSheet({ type: 'share-card' }),
    },
  ];

  return (
    <div>
      <TopNavigation title="Explore the demo" sub="A month of sample money for Aarav, a 23-year-old in Bengaluru" onBack={ui.pop} />

      <section className="mb-6 rounded-3xl bg-accent p-5 text-on-accent">
        {inDemo ? (
          <>
            <p className="eyebrow !text-current opacity-75">You're in the demo</p>
            <p className="display mt-1 text-[22px] leading-tight">Tap around. Nothing here is real.</p>
            <p className="mt-1.5 text-[14px] opacity-85">
              {hasStash ? 'Your own money is saved and waiting. One tap brings it back exactly as it was.' : 'Add, delete or split anything. You can reset the demo whenever you like.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {hasStash ? (
                <button type="button" className="btn min-h-[44px] bg-[#17140F] px-5 text-[#FFFBF4]" onClick={() => { store.backToMine(); ui.resetTo('home'); }}>
                  Back to my money
                </button>
              ) : (
                <button type="button" className="btn min-h-[44px] bg-[#17140F] px-5 text-[#FFFBF4]" onClick={store.replayOnboarding}>
                  Start with my own money
                </button>
              )}
              <button
                type="button"
                className="btn min-h-[44px] bg-[#17140F]/10 px-4"
                onClick={() => ui.openSheet({ type: 'confirm', title: 'Reset demo data?', body: 'This restores the original sample transactions, plans and groups. Anything you added in the demo will be removed.', confirm: 'Reset', run: store.resetDemo })}
              >
                <Icon name="reset" size={16} /> Reset demo
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="eyebrow !text-current opacity-75">Try every feature</p>
            <p className="display mt-1 text-[22px] leading-tight">See PULSE with a full month of money.</p>
            <p className="mt-1.5 text-[14px] opacity-85">Your own data is parked safely while you explore, and comes back with one tap.</p>
            <button type="button" className="btn mt-4 min-h-[44px] bg-[#17140F] px-5 text-[#FFFBF4]" onClick={() => { store.exploreDemo(); ui.resetTo('home'); }}>
              <Icon name="play" size={16} /> Open the demo
            </button>
          </>
        )}
      </section>

      <h2 className="eyebrow mb-3 px-1">What to try, in order</h2>
      <ol className="flex flex-col gap-2.5">
        {stops.map((s, i) => (
          <li key={s.title} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start gap-3.5">
              <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sunk text-[20px]" aria-hidden="true">
                {s.emoji}
                <span className="num absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] text-bg">{i + 1}</span>
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15.5px] font-semibold">{s.title}</h3>
                <p className="mt-0.5 text-[14px] leading-snug text-ink2">{s.body}</p>
                <button type="button" className="mt-2.5 inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[13.5px] font-semibold text-accent-ink" onClick={() => visit(s.run)}>
                  {s.go} <Icon name="arrow-right" size={14} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------
// Install on your phone: iPhone and Android, step by step
// ------------------------------------------------------------------

type Platform = 'ios' | 'android';

function Glyph({ children }: { children: React.ReactNode }) {
  return <span className="mx-0.5 inline-grid h-6 min-w-6 translate-y-[3px] place-items-center rounded-md border border-line bg-surface px-1 align-baseline text-[13px] text-ink">{children}</span>;
}

/** The iOS share icon: a square with an arrow out of the top. */
function ShareIOS() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share icon" role="img">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

export function InstallScreen() {
  const inst = useInstall();
  const { toast } = useStore();
  const ui = useUI();
  const [p, setP] = useState<Platform>(isIOS() ? 'ios' : 'android');

  const steps: Record<Platform, { title: string; body: React.ReactNode }[]> = {
    ios: [
      { title: 'Open PULSE in Safari', body: <>Go to <b>{SITE}</b> in Safari. Chrome and Edge work too on iOS 16.4 or later.</> },
      { title: 'Tap Share', body: <>Tap the Share button <Glyph><ShareIOS /></Glyph> in the toolbar at the bottom (at the top on iPad).</> },
      { title: 'Tap Add to Home Screen', body: <>Scroll the list and tap <b>Add to Home Screen</b>. If you see <b>Open as Web App</b>, leave it on.</> },
      { title: 'Tap Add', body: <>PULSE lands on your home screen. Open it from there: it runs full screen and works offline.</> },
    ],
    android: [
      { title: 'Open PULSE in Chrome', body: <>Go to <b>{SITE}</b> in Chrome. Samsung Internet and Edge work too.</> },
      { title: 'Tap Install', body: <>If an <b>Install</b> banner pops up, tap it. If not, tap the menu <Glyph>⋮</Glyph> at the top right.</> },
      { title: 'Tap Install app', body: <>Choose <b>Install app</b> (it may say <b>Add to Home screen</b>, then <b>Install</b>). In Samsung Internet: <Glyph>≡</Glyph> then <b>Add page to</b>, <b>Home screen</b>.</> },
      { title: 'Open it like any app', body: <>PULSE shows up on your home screen and in your app drawer, full screen and offline.</> },
    ],
  };

  const shareLink = async () => {
    const url = `https://${SITE}/`;
    const text = 'PULSE shows what you can safely spend until payday. Free, no bank login.';
    try {
      if (navigator.share) await navigator.share({ title: 'PULSE', text, url });
      else {
        await navigator.clipboard.writeText(url);
        toast({ text: 'Link copied. Send it to a friend.' });
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <div>
      <TopNavigation title="Install PULSE" sub="Free, no app store, about 20 seconds" onBack={ui.pop} />

      {inst.installed ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-pos/10 p-4 text-[14.5px]">
          <Icon name="check" size={18} className="shrink-0 text-pos" />
          <p>You're using the installed app. These steps are here to help a friend.</p>
        </div>
      ) : inst.canPrompt ? (
        <button
          type="button"
          className="btn-primary mb-6 w-full"
          onClick={async () => {
            const r = await inst.prompt();
            if (r === 'accepted') toast({ text: 'PULSE is on your home screen.', tone: 'good' });
          }}
        >
          <Icon name="download" size={17} /> Install on this device now
        </button>
      ) : inFrame() ? (
        <p className="mb-6 rounded-2xl bg-sunk p-4 text-[14px] text-ink2">Installing works on the live site, {SITE}. Open it there on your phone and follow the steps.</p>
      ) : null}

      <Segmented<Platform>
        label="Phone"
        value={p}
        onChange={setP}
        options={[
          { value: 'ios', label: 'iPhone' },
          { value: 'android', label: 'Android' },
        ]}
      />

      <ol className="relative mt-5 flex flex-col gap-3" key={p}>
        {steps[p].map((s, i) => (
          <li key={s.title} className="flex animate-rise gap-3.5 rounded-2xl border border-line bg-surface p-4" style={{ animationDelay: `${i * 50}ms` }}>
            <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-[14px] text-on-accent">{i + 1}</span>
            <div className="min-w-0">
              <h3 className="text-[15.5px] font-semibold">{s.title}</h3>
              <p className="mt-0.5 text-[14px] leading-relaxed text-ink2">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-6 rounded-3xl bg-sunk p-5">
        <h2 className="eyebrow mb-3">What you get</h2>
        <ul className="flex flex-col gap-2.5 text-[14.5px]">
          <li className="flex gap-3"><span aria-hidden="true">📱</span> Opens full screen from your home screen, like any app</li>
          <li className="flex gap-3"><span aria-hidden="true">✈️</span> Works offline, and updates itself</li>
          <li className="flex gap-3"><span aria-hidden="true">⚡</span> Press and hold the icon for shortcuts: Add expense, Can I afford this?, Plans, Ask AI</li>
          <li className="flex gap-3"><span aria-hidden="true">🔒</span> Your numbers stay on your phone. No bank login, ever</li>
        </ul>
      </section>

      <button type="button" className="btn-quiet mt-4 w-full" onClick={shareLink}>
        <Icon name="share" size={16} /> Send PULSE to a friend
      </button>
    </div>
  );
}
