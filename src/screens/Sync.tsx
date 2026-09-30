import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { syncLink } from '../lib/sync';
import { haptic } from '../lib/format';
import { TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';

/** A QR code as crisp SVG squares, in the page's ink colour. */
export function QR({ text, size = 176 }: { text: string; size?: number }) {
  const cells = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { n, d };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${cells.n + 4} ${cells.n + 4}`} width={size} height={size} role="img" aria-label="QR code with your sync link" className="rounded-xl bg-white p-1" shapeRendering="crispEdges">
      <path d={cells.d} fill="#17140F" />
    </svg>
  );
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'not yet';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** One short line for lists: "On · synced 2 min ago". */
export function syncSummary(sync: { enabled: boolean; status: string; lastSync: string | null }, mode: string): string {
  if (!sync.enabled) return 'Same data on phone, laptop and home-screen app';
  if (mode === 'demo') return 'On · paused in the demo';
  if (sync.status === 'offline') return 'On · offline';
  if (sync.status === 'no-server' || sync.status === 'error') return "On · can't reach the server";
  if (sync.status === 'syncing') return 'On · syncing…';
  return `On · synced ${timeAgo(sync.lastSync)}`;
}

export function SyncStatusLine() {
  const { sync, state } = useStore();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 20_000);
    return () => window.clearInterval(t);
  }, []);
  if (state.mode === 'demo') return <span className="text-ink3">Paused while you're in the demo</span>;
  const map = {
    idle: ['bg-ink3', 'Starting…'],
    syncing: ['animate-pulse bg-accent', 'Syncing…'],
    synced: ['bg-pos', `Synced ${timeAgo(sync.lastSync)}`],
    offline: ['bg-warn', "Offline. It'll sync when you're back online"],
    'no-server': ['bg-warn', "Sync isn't switched on for this website yet"],
    error: ['bg-neg', "Couldn't sync. It'll try again shortly"],
  } as const;
  const [dot, text] = map[sync.status];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {text}
    </span>
  );
}

/** Enter a code from another device. Used here and on the welcome screen. */
export function JoinWithCode({ initial = '', onDone }: { initial?: string; onDone?: () => void }) {
  const store = useStore();
  const [code, setCode] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setErr(null);
    const e = await store.joinSync(code);
    setBusy(false);
    if (e) return setErr(e);
    haptic(16);
    onDone?.();
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void go();
      }}
    >
      <label htmlFor="join-code" className="text-[13px] font-semibold text-ink2">
        Sync code from your other device
      </label>
      <input
        id="join-code"
        className="field text-center font-mono text-[17px] uppercase tracking-wider"
        placeholder="PULSE-XXXX-XXXX-XXXX-XXXX"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setErr(null);
        }}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {err && (
        <p className="text-[13px] font-medium text-warn" role="alert">
          {err}
        </p>
      )}
      <button type="submit" disabled={busy || code.replace(/[\s-]/g, '').length < 16} className="btn-accent w-full disabled:opacity-40">
        {busy ? 'Linking…' : 'Link this device'}
      </button>
    </form>
  );
}

export function SyncScreen({ code: incoming }: { code?: string }) {
  const store = useStore();
  const ui = useUI();
  const { sync } = store;
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(!!incoming);
  const [showQR, setShowQR] = useState(false);
  const mine = store.personalState();

  const copy = async () => {
    if (!sync.code) return;
    try {
      await navigator.clipboard.writeText(sync.code);
      haptic(10);
      store.toast({ text: 'Sync code copied.', emoji: '📋' });
    } catch {
      store.toast({ text: 'Copy is blocked here. Write the code down instead.' });
    }
  };
  const share = async () => {
    if (!sync.code) return;
    try {
      await navigator.share({ title: 'My PULSE sync code', text: `My PULSE sync code: ${sync.code}\n${syncLink(sync.code)}` });
    } catch {
      /* cancelled */
    }
  };

  return (
    <div>
      <TopNavigation title="Sync my devices" onBack={ui.pop} sub="The same PULSE on your phone, laptop and home-screen app." />

      {sync.enabled && sync.code ? (
        <div className="flex flex-col gap-4">
          <section className="rounded-3xl border border-line bg-surface p-5" aria-labelledby="sync-on">
            <p id="sync-on" className="text-[14px] font-medium text-ink2" aria-live="polite">
              <SyncStatusLine />
            </p>
            <p className="eyebrow mt-4">Your sync code</p>
            <p className="num mt-1.5 select-all break-all rounded-2xl bg-sunk px-3 py-3 text-center font-mono text-[clamp(15px,4.6vw,20px)] font-semibold tracking-wider">{sync.code}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" className="btn-primary min-h-[44px] px-2 text-[14px]" onClick={copy}>
                <Icon name="copy" size={16} /> Copy
              </button>
              <button type="button" className="btn-quiet min-h-[44px] px-2 text-[14px] disabled:opacity-40" disabled={typeof navigator.share !== 'function'} onClick={share}>
                <Icon name="share" size={16} /> Share
              </button>
              <button type="button" className="btn-quiet min-h-[44px] px-2 text-[14px]" onClick={() => setShowQR((v) => !v)} aria-expanded={showQR}>
                <Icon name="scan" size={16} /> QR
              </button>
            </div>
            {showQR && (
              <div className="mt-4 flex animate-toast flex-col items-center gap-2">
                <QR text={syncLink(sync.code)} />
                <p className="max-w-[30ch] text-center text-[12.5px] text-ink3">Scan with the other phone's camera to open PULSE with this code filled in.</p>
              </div>
            )}
            <button type="button" className="btn-ghost mt-3 w-full" disabled={sync.status === 'syncing'} onClick={() => void store.syncNow()}>
              <Icon name="reset" size={16} /> Sync now
            </button>
          </section>

          <section className="rounded-3xl bg-warn/10 p-4 text-[13.5px] leading-snug" aria-label="Keep your code safe">
            <p className="font-semibold">Save this code somewhere safe.</p>
            <p className="mt-1 text-ink2">It's the only key to your synced data. PULSE can't show it again if you lose every device, and there's no reset, because we never see your data. Anyone with the code can see your money, so don't post it.</p>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-5">
            <h2 className="display text-[17px]">Add another device</h2>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[14px] text-ink2">
              <li>Open pulsemoney.in on the other phone, laptop or home-screen app.</li>
              <li>
                On the welcome screen tap <b>I use PULSE on another device</b>, or go to You → Sync my devices.
              </li>
              <li>Type this code (or scan the QR). Done. Changes show up on both in a few seconds.</li>
            </ol>
          </section>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn-quiet w-full"
              onClick={() =>
                ui.openSheet({
                  type: 'confirm',
                  title: 'Stop syncing this device?',
                  body: 'Your data stays on this device and on your other devices. This one just stops getting updates.',
                  confirm: 'Stop syncing',
                  run: () => void store.disableSync(false).then(() => store.toast({ text: 'Sync is off on this device.' })),
                })
              }
            >
              Stop syncing on this device
            </button>
            <button
              type="button"
              className="btn-ghost w-full text-neg"
              onClick={() =>
                ui.openSheet({
                  type: 'confirm',
                  title: 'Delete the online copy?',
                  body: 'This turns sync off and deletes the encrypted copy from the server. Data on each device stays, but they stop syncing and the code stops working.',
                  confirm: 'Delete online copy',
                  run: () => void store.disableSync(true).then((e) => store.toast({ text: e ?? 'Online copy deleted. Sync is off.' })),
                })
              }
            >
              Turn off and delete the online copy
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <section className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-[22px]" aria-hidden="true">
                🔄
              </span>
              <h2 className="display text-[19px] leading-tight">Every change, on every device</h2>
            </div>
            <ul className="mt-4 flex flex-col gap-2.5 text-[14px] text-ink2">
              <li className="flex gap-2.5">
                <Icon name="check" size={17} className="mt-0.5 shrink-0 text-pos" strokeWidth={2.6} /> Log on your phone, see it on your laptop in seconds.
              </li>
              <li className="flex gap-2.5">
                <Icon name="lock" size={17} className="mt-0.5 shrink-0 text-pos" /> Locked on your device before upload. Nobody else can read it, not even PULSE.
              </li>
              <li className="flex gap-2.5">
                <Icon name="user" size={17} className="mt-0.5 shrink-0 text-pos" /> No account, no email, no password. Just a code.
              </li>
            </ul>
            {mine ? (
              <button
                type="button"
                className="btn-accent mt-5 w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const code = await store.enableSync();
                  setBusy(false);
                  if (code) haptic(16);
                }}
              >
                {busy ? 'Turning on…' : 'Turn on sync'}
              </button>
            ) : (
              <p className="mt-4 rounded-2xl bg-sunk p-3 text-[13.5px] text-ink2">Start with your own money first, then turn on sync here.</p>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-surface p-5">
            {joining ? (
              <JoinWithCode initial={incoming ?? ''} onDone={() => ui.resetTo('home')} />
            ) : (
              <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setJoining(true)}>
                <span>
                  <span className="block text-[15px] font-semibold">Already syncing on another device?</span>
                  <span className="block text-[13px] text-ink3">Enter its sync code to link this one.</span>
                </span>
                <Icon name="chevron" size={18} className="shrink-0 text-ink3" />
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
