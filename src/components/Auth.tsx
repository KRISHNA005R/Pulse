import { useEffect, useMemo, useRef, useState } from 'react';
import type { State } from '../types';
import { useStore } from '../store/store';
import { useAuth } from '../store/auth';
import { useUI } from '../store/ui';
import { inAppBrowser, loadGoogle, markNudged, memberSince, memberTitle, nudgeInfo, type Account } from '../lib/auth';
import { cardBlob, ensureFonts } from '../lib/cardArt';
import { drawMemberCard, MEMBER_STYLES, type MemberSpec, type MemberStyle } from '../lib/memberArt';
import { daysBetween, haptic, relDay, rupeesShort } from '../lib/format';
import { isStandalone } from '../lib/pwa';
import { Icon } from './ui/Icon';
import { TopNavigation } from './ui/bits';

// Accounts: the screens. How signing in works is in store/auth.tsx and lib/auth.ts.

// ---------------------------------------------------------------------------------------------
// The sign-in buttons. Signing up and logging in are the same tap: a new person goes on to setup,
// someone who has been here before gets their money back.
// ---------------------------------------------------------------------------------------------

// Google's script takes one callback for the page; this always points at the latest one.
let onGoogle: (credential: string) => void = () => {};
let googleStarted = '';

function GoogleButton({ clientId }: { clientId: string }) {
  const auth = useAuth();
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  onGoogle = (c) => void auth.google(c);
  useEffect(() => {
    let live = true;
    void loadGoogle().then((g) => {
      if (!live || !box.current) return;
      if (!g) return setState('failed');
      if (googleStarted !== clientId) {
        // Inside the installed app a pop-up can't hand its answer back, so Google sends the person
        // to its own page and back again (netlify/functions/auth.ts picks that up).
        const redirect = isStandalone();
        g.initialize({ client_id: clientId, callback: (r: { credential?: string }) => r.credential && onGoogle(r.credential), ux_mode: redirect ? 'redirect' : 'popup', ...(redirect ? { login_uri: `${location.origin}/api/auth` } : {}), auto_select: false, itp_support: true });
        googleStarted = clientId;
      }
      box.current.replaceChildren();
      g.renderButton(box.current, { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', width: Math.max(220, Math.min(400, Math.round(box.current.clientWidth))) });
      setState('ready');
    });
    return () => {
      live = false;
    };
  }, [clientId]);
  return (
    <div>
      {/* Google draws its own button in here, with its own logo. It lives in a frame of Google's;
          in dark mode a browser paints such a frame white unless it is told the frame is "light",
          which is what Google's page is. That keeps the corners around the pill see-through. */}
      <div ref={box} className="flex min-h-[44px] w-full justify-center" style={{ colorScheme: 'light' }} data-google-button />
      {state === 'loading' && <p className="text-center text-[13px] text-ink3">Getting Google ready…</p>}
      {state === 'failed' && (
        <p className="rounded-2xl bg-sunk p-3 text-center text-[13.5px] text-ink2" role="status">
          Google sign-in couldn't load. Check your internet{auth.cfg?.email ? ', or use your email below.' : ' and reload.'}
        </p>
      )}
    </div>
  );
}

export function LoginPanel() {
  const auth = useAuth();
  const [step, setStep] = useState<'buttons' | 'email' | 'code'>('buttons');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');
  const [sentAt, setSentAt] = useState(0);
  const cfg = auth.cfg;
  if (!cfg) return null;
  const inApp = inAppBrowser();
  const error = problem || auth.error;

  const send = async () => {
    setSending(true);
    setProblem('');
    auth.clearError();
    const p = await auth.emailStart(email.trim());
    setSending(false);
    if (p) return setProblem(p);
    setSentAt(Date.now());
    setCode('');
    setStep('code');
  };
  const verify = async (value: string) => {
    setProblem('');
    const p = await auth.emailVerify(email.trim(), value);
    if (p) setCode('');
  };

  if (auth.busy)
    return (
      <div className="flex min-h-[112px] flex-col items-center justify-center gap-3 rounded-2xl bg-sunk p-5" role="status">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden="true" />
        <p className="text-[15px] font-medium">Signing you in…</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-2xl bg-warn/15 p-3 text-[14px] text-ink" role="alert">
          {error}
        </p>
      )}

      {step === 'buttons' && (
        <>
          {cfg.google && inApp && (
            <p className="rounded-2xl bg-sunk p-3 text-[13.5px] leading-snug text-ink2">
              <b className="text-ink">Opened from Instagram?</b> Google doesn't allow sign-in inside this little browser. Tap ⋯ at the top and choose <b className="text-ink">Open in browser</b>{cfg.email ? ', or use your email.' : '.'}
            </p>
          )}
          {cfg.google && !inApp && <GoogleButton clientId={cfg.google} />}
          {cfg.email && (
            <button
              type="button"
              className={`${cfg.google && !inApp ? 'btn-quiet' : 'btn-primary'} w-full text-[16px]`}
              onClick={() => {
                auth.clearError();
                setProblem('');
                setStep('email');
              }}
            >
              <Icon name="at" size={18} /> Continue with email
            </button>
          )}
        </>
      )}

      {step === 'email' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) void send();
          }}
        >
          <label htmlFor="login-email" className="text-[13px] font-semibold text-ink2">
            Your email
          </label>
          <input id="login-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoFocus className="field py-3.5 text-[17px]" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="btn-primary w-full text-[16px] disabled:opacity-40" disabled={!email.trim() || sending}>
            {sending ? 'Sending…' : 'Email me a code'}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => setStep('buttons')}>
            Back
          </button>
          <p className="text-center text-[12.5px] text-ink3">No password. We email you a 6-digit code.</p>
        </form>
      )}

      {step === 'code' && (
        <div className="flex flex-col gap-3">
          <label htmlFor="login-code" className="text-[14.5px] text-ink2">
            Enter the 6-digit code we sent to <b className="text-ink">{email.trim()}</b>
          </label>
          <input
            id="login-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={7}
            className="field num py-3.5 text-center text-[26px] tracking-[0.3em]"
            placeholder="······"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(v);
              if (v.length === 6) void verify(v);
            }}
          />
          <p className="text-center text-[12.5px] text-ink3">It can take a minute. Check spam too.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-quiet" disabled={sending || Date.now() - sentAt < 40_000} onClick={() => void send()}>
              {sending ? 'Sending…' : 'Send again'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setStep('email')}>
              Change email
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The small print under the sign-in buttons. */
export function LoginLegal() {
  return (
    <p className="text-center text-[12.5px] leading-snug text-ink3">
      New or coming back, it's the same button.
      <br />
      By continuing you agree to the{' '}
      <a href="/terms/" className="underline underline-offset-2">
        Terms
      </a>{' '}
      and{' '}
      <a href="/privacy/" className="underline underline-offset-2">
        Privacy Policy
      </a>
      .
    </p>
  );
}

// ---------------------------------------------------------------------------------------------
// People who were using PULSE before accounts: a friendly ask once a day for a week, then sign-in
// is needed to carry on. Their data stays on the phone throughout and moves into the account.
// ---------------------------------------------------------------------------------------------
function usage(s: State) {
  const spent = s.transactions.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const first = s.transactions.reduce((d, t) => (t.date < d ? t.date : d), s.today);
  return { entries: s.transactions.length, tracked: spent, days: Math.max(1, daysBetween(first, s.today) + 1) };
}

function YourNumbers() {
  const { state } = useStore();
  const u = useMemo(() => usage(state), [state]);
  if (!u.entries) return <p className="rounded-2xl border border-line bg-surface p-4 text-center text-[13.5px] font-semibold text-pos">Everything you've set up moves into your account. Nothing is lost.</p>;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            [String(u.entries), u.entries === 1 ? 'entry' : 'entries'],
            [rupeesShort(u.tracked), 'tracked'],
            [String(u.days), u.days === 1 ? 'day' : 'days'],
          ] as const
        ).map(([v, l]) => (
          <div key={l}>
            <p className="num display text-[20px]">{v}</p>
            <p className="text-[12px] text-ink3">{l}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[13px] font-semibold text-pos">All of it moves into your account. Nothing is lost.</p>
    </div>
  );
}

/** Sheet: "Save your PULSE". Closing it, or "Not now", puts it off until tomorrow. */
export function AuthNudge({ onDone }: { onDone: () => void }) {
  const { state } = useStore();
  const auth = useAuth();
  const left = nudgeInfo(state.today).daysLeft;
  // Signed in: nothing more to ask.
  useEffect(() => {
    if (auth.session) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.session]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="eyebrow">One-time step</p>
        <p className="mt-2 text-[15px] text-ink2">Abhi your money lives only on this phone. Sign in once and it's safe: new phone, browser or app, sab jagah same.</p>
      </div>
      <YourNumbers />
      <LoginPanel />
      {!auth.busy && (
        <button type="button" className="btn-ghost w-full text-[14.5px]" onClick={onDone}>
          Not now · {left} {left === 1 ? 'day' : 'days'} left
        </button>
      )}
    </div>
  );
}

/** The week is up: sign in to carry on. Nothing is deleted; the data is waiting on this phone. */
function AuthWall({ onOffline }: { onOffline: () => void }) {
  const { state } = useStore();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  return (
    <div className="min-h-[100svh] bg-bg" role="main" aria-labelledby="wall-title">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-[480px] flex-col px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
        <p className="display text-[20px] tracking-tight">
          PULSE<span className="text-accent-ink">.</span>
        </p>
        <div className="pt-10">
          <h1 id="wall-title" className="display text-[30px] leading-[1.08]">
            Sign in to keep going, {state.user.name}.
          </h1>
          <p className="mt-3 text-[15.5px] text-ink2">Your money is still here on this phone, exactly as you left it. Sign in once and it's saved to your account for good.</p>
        </div>
        <div className="mt-6">
          <YourNumbers />
        </div>
        <div className="mt-auto flex flex-col gap-3 pt-8">
          {online ? (
            <LoginPanel />
          ) : (
            <>
              <p className="rounded-2xl bg-sunk p-3 text-[14px] text-ink2" role="status">
                You're offline, and signing in needs the internet.
              </p>
              <button type="button" className="btn-primary w-full" onClick={onOffline}>
                Carry on offline for now
              </button>
            </>
          )}
          <LoginLegal />
        </div>
      </div>
    </div>
  );
}

/**
 * Decides what someone who isn't signed in sees. Returns the wall when sign-in is needed to carry
 * on (the app shows it instead of everything else), and opens the daily sheet before that.
 */
export function useAuthGate(): JSX.Element | null {
  const { state } = useStore();
  const auth = useAuth();
  const ui = useUI();
  const [offlinePass, setOfflinePass] = useState(false);
  const needs = auth.on && !auth.session && state.mode === 'personal' && state.onboarding.done;
  const info = nudgeInfo(state.today);
  const sheets = useRef(ui.sheets);
  sheets.current = ui.sheets;

  useEffect(() => {
    if (!needs || !info.due || auth.busy) return;
    // Wait for a quiet moment: not on top of another sheet.
    const t = window.setInterval(() => {
      if (sheets.current.length) return;
      window.clearInterval(t);
      if (!nudgeInfo(state.today).due) return;
      markNudged(state.today);
      ui.openSheet({ type: 'auth-nudge' });
    }, 1600);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needs, info.due, auth.busy, state.today]);

  if (needs && info.required && !offlinePass) return <AuthWall onOffline={() => setOfflinePass(true)} />;
  return null;
}

// ---------------------------------------------------------------------------------------------
// The member card
// ---------------------------------------------------------------------------------------------
const specOf = (a: Account): MemberSpec => ({ n: a.n, name: a.name, title: memberTitle(a.n), since: memberSince(a.created) });

/** The card as it looks inside the app. */
export function MemberBadge({ account }: { account: Account }) {
  return (
    <div className="relative overflow-hidden rounded-3xl p-5" style={{ background: '#17140F', color: '#F6F5F2' }}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full" style={{ background: 'radial-gradient(circle, rgba(236,91,43,0.45), rgba(236,91,43,0))' }} />
      <p className="relative text-[12px] font-semibold tracking-[0.14em] opacity-70">PULSE MEMBER</p>
      <p className="display relative mt-3 text-[56px] leading-none" style={{ color: '#EC5B2B' }}>
        #{account.n}
      </p>
      <p className="relative mt-3 text-[14px] opacity-80">
        {memberTitle(account.n)}
        {memberSince(account.created) ? ` · joined ${memberSince(account.created)}` : ''}
      </p>
    </div>
  );
}

/** Sheet: the card as an image, to post or save. */
export function MemberCardSheet({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const auth = useAuth();
  const canvas = useRef<HTMLCanvasElement>(null);
  const account = auth.session?.account;
  const [style, setStyle] = useState<MemberStyle>('black');
  useEffect(() => {
    if (!account || !canvas.current) return;
    let live = true;
    drawMemberCard(canvas.current, specOf(account), style);
    void ensureFonts().then(() => live && canvas.current && drawMemberCard(canvas.current, specOf(account), style));
    return () => {
      live = false;
    };
  }, [account, style]);
  if (!account) return null;

  const file = async () => {
    if (!canvas.current) return null;
    await ensureFonts();
    drawMemberCard(canvas.current, specOf(account), style);
    const b = await cardBlob(canvas.current);
    return b ? new File([b], `pulse-member-${account.n}-${style}.png`, { type: 'image/png' }) : null;
  };
  const save = async () => {
    const f = await file();
    if (!f) return;
    const href = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = href;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 4000);
    store.toast({ text: 'Saved. Post it to your story from your photos.', tone: 'good' });
  };
  const share = async () => {
    const f = await file();
    if (!f) return;
    const text = `I'm PULSE member #${account.n}. It tells you what's safe to spend till payday → https://pulsemoney.in`;
    try {
      if (navigator.canShare?.({ files: [f] })) return await navigator.share({ files: [f], text });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
    await save();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="radiogroup" aria-label="Card design">
        {MEMBER_STYLES.map((s) => (
          <button key={s.value} type="button" role="radio" aria-checked={style === s.value} className="chip shrink-0" onClick={() => setStyle(s.value)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex justify-center">
        <canvas ref={canvas} role="img" aria-label={`PULSE member number ${account.n}, ${memberTitle(account.n)}, ${MEMBER_STYLES.find((s) => s.value === style)?.label} design`} className="h-auto rounded-2xl shadow-lift" style={{ width: 'min(100%, 250px)' }} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-accent" onClick={() => void share()}>
          <Icon name="share" size={17} /> Share
        </button>
        <button type="button" className="btn-quiet" onClick={() => void save()}>
          <Icon name="download" size={16} /> Save image
        </button>
      </div>
      <button type="button" className="btn-ghost w-full" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

/** Shown once, right after a new account is made: "You're in". */
export function MemberMoment() {
  const { state } = useStore();
  const auth = useAuth();
  const ui = useUI();
  const account = auth.session?.account;
  const show = auth.fresh && !!account && state.mode === 'personal' && state.onboarding.done;
  useEffect(() => {
    if (show) haptic(20);
  }, [show]);
  if (!show || !account) return null;
  const entries = state.transactions.length;
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-labelledby="member-title">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-[480px] flex-col px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
        <p className="display text-[20px] tracking-tight">
          PULSE<span className="text-accent-ink">.</span>
        </p>
        <div className="pt-9">
          <p className="text-[40px] leading-none" aria-hidden="true">
            🎉
          </p>
          <h1 id="member-title" className="display mt-4 text-[32px] leading-[1.05]">
            You're in, {state.user.name}.
          </h1>
          <p className="mt-3 text-[16px] text-ink2">{entries > 0 ? `${entries} ${entries === 1 ? 'entry' : 'entries'} saved to your account.` : 'Everything you add is saved to your account from now on.'}</p>
        </div>
        <div className="mt-6">
          <MemberBadge account={account} />
        </div>
        <ul className="mt-5 flex flex-col gap-2.5 text-[15px] text-ink2">
          {['Same data in the app and the browser', 'Safe even if you lose your phone', 'No more sync codes'].map((t) => (
            <li key={t} className="flex items-center gap-2.5">
              <Icon name="check" size={16} strokeWidth={2.6} className="shrink-0 text-pos" /> {t}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-3 pt-8">
          <button type="button" className="btn-accent w-full text-[16px]" onClick={auth.seenWelcome}>
            {entries > 0 ? 'Back to my money' : 'Open PULSE'}
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => {
              auth.seenWelcome();
              ui.openSheet({ type: 'member-card' });
            }}
          >
            Share my member card
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// You → Your account
// ---------------------------------------------------------------------------------------------
export function AccountScreen() {
  const store = useStore();
  const auth = useAuth();
  const ui = useUI();
  const account = auth.session?.account;
  const [working, setWorking] = useState('');
  if (!account)
    return (
      <div>
        <TopNavigation title="Your account" onBack={ui.pop} />
        <p className="text-[15px] text-ink2">You're not signed in.</p>
        {auth.on && (
          <button type="button" className="btn-accent mt-4" onClick={() => ui.openSheet({ type: 'auth-nudge' })}>
            Sign in
          </button>
        )}
      </div>
    );
  const saved = store.sync.status === 'offline' ? 'You’re offline. Changes are kept on this phone and saved when you’re back online.' : store.sync.lastSync ? `Saved to your account · ${relDay(store.sync.lastSync.slice(0, 10), store.state.today).toLowerCase()}` : 'Saving to your account…';
  const act = async (label: string, fn: () => Promise<string | null>) => {
    setWorking(label);
    const problem = await fn();
    setWorking('');
    if (problem) store.toast({ text: problem });
    else ui.pop(); // signed out: this screen is no longer theirs to be on
  };
  return (
    <div>
      <TopNavigation title="Your account" onBack={ui.pop} sub={account.email} />
      <MemberBadge account={account} />
      <button type="button" className="btn-quiet mt-3 w-full" onClick={() => ui.openSheet({ type: 'member-card' })}>
        <Icon name="share" size={16} /> Share my member card
      </button>

      <ul className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-[14.5px] text-ink2">
        <li className="flex gap-3">
          <Icon name="check" size={17} strokeWidth={2.4} className="mt-0.5 shrink-0 text-pos" /> {saved}
        </li>
        <li className="flex gap-3">
          <Icon name="user" size={17} className="mt-0.5 shrink-0 text-pos" /> Sign in with the same email on any phone, browser or the app, and your money is there.
        </li>
        <li className="flex gap-3">
          <Icon name="shield" size={17} className="mt-0.5 shrink-0 text-pos" />
          <span>
            Your data is stored on PULSE's server under your account. How it's handled:{' '}
            <a href="/privacy/" className="font-semibold text-ink underline underline-offset-2">
              Privacy Policy
            </a>
            .
          </span>
        </li>
      </ul>

      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          className="btn-quiet w-full"
          disabled={!!working}
          onClick={() =>
            ui.openSheet({
              type: 'confirm',
              title: 'Sign out?',
              body: 'Your money stays safe in your account. This phone is cleared, and you can sign back in any time.',
              confirm: 'Sign out',
              run: () => void act('out', auth.signOut),
            })
          }
        >
          {working === 'out' ? 'Signing out…' : 'Sign out'}
        </button>
        <button
          type="button"
          className="btn-ghost w-full text-neg"
          disabled={!!working}
          onClick={() =>
            ui.openSheet({
              type: 'confirm',
              title: 'Delete your account?',
              body: 'This deletes your account and all the money data saved with it, on PULSE’s server and on this phone. It can’t be undone. Want a copy first? Use You → Backup code & export.',
              confirm: 'Delete account',
              run: () => void act('delete', auth.deleteAccount),
            })
          }
        >
          {working === 'delete' ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
      <p className="mt-4 text-center text-[12.5px] text-ink3">
        <a href="/terms/" className="underline underline-offset-2">
          Terms
        </a>{' '}
        ·{' '}
        <a href="/privacy/" className="underline underline-offset-2">
          Privacy Policy
        </a>
      </p>
    </div>
  );
}
