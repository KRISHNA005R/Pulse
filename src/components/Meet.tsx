import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { loadSession } from '../lib/auth';
import { syncFriends } from '../lib/friends';
import { haptic, hapticSuccess } from '../lib/format';
import { act, keepMeet, meetToken, peopleCall, peopleView } from '../lib/people';
import { calm, gifUrl, okFace } from '../lib/photo';
import { QR } from '../screens/Sync';
import { useHost } from './Friends';
import { PersonAvatar } from './ui/bits';
import { Icon } from './ui/Icon';

// Meet: two phones together, like NameDrop. One shows its Meet code, the other scans it, and both
// light up with who they just met. Apple's NameDrop isn't open to apps (and the web has no
// phone-to-phone NFC or Bluetooth), so the "touch" is a QR made for the moment: it lasts 3 minutes,
// showing it is your yes, scanning it is theirs, and the one showing sees who joined (and can undo).

interface Who {
  uid: string;
  u: string;
  name: string;
  face?: string;
}
type Phase = { k: 'show' } | { k: 'scan' } | { k: 'joining' } | { k: 'done'; who: Who; already?: boolean } | { k: 'oops'; text: string };

/** Someone's face from their profile: a photo, their GIF, or their first letter. */
function Face({ who, size }: { who: Pick<Who, 'name' | 'face'>; size: number }) {
  const src = okFace(who.face) ? who.face : who.face && /^[0-9a-f]{32}$/.test(who.face) ? gifUrl(who.face) : '';
  if (src) return <img src={src} alt="" width={size} height={size} className="rounded-full object-cover ring-4 ring-bg" style={{ width: size, height: size }} />;
  return (
    <span className="grid place-items-center rounded-full bg-[#17140F] font-semibold text-[#FFFBF4] ring-4 ring-bg" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {(who.name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function MeetSheet({ token: given, onDone }: { token?: string; onDone: () => void }) {
  const store = useStore();
  const ui = useUI();
  const host = useHost();
  const signedIn = !!loadSession() && store.state.mode === 'personal';
  const [phase, setPhase] = useState<Phase>(given ? { k: 'joining' } : { k: 'show' });
  const [code, setCode] = useState<{ token: string; exp: string } | null>(null);
  const seen = useRef(new Set<string>());

  const celebrate = (who: Who, already?: boolean) => {
    hapticSuccess();
    setPhase({ k: 'done', who, already });
    void syncFriends(host);
  };

  const join = async (token: string) => {
    setPhase({ k: 'joining' });
    const r = await peopleCall({ action: 'meet', token });
    if (!r) return setPhase({ k: 'oops', text: 'No connection. Try again.' });
    if (r.status !== 200) return setPhase({ k: 'oops', text: String(r.data.error ?? 'That didn’t work. Try again.') });
    celebrate(r.data.person as Who, !!r.data.already);
  };

  // Opened from a Meet link or a scan.
  useEffect(() => {
    if (!given) return;
    if (signedIn) void join(given);
    else keepMeet(given);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Showing my code: get one, keep it fresh, and watch for who scans it.
  useEffect(() => {
    if (!signedIn || phase.k !== 'show') return;
    let stop = false;
    let t = 0;
    const tickOnce = async (fresh = false) => {
      if (stop) return;
      let c = code;
      if (!c || fresh || Date.parse(c.exp) - Date.now() < 20_000) {
        const r = await peopleCall({ action: 'meet-open', ...(fresh ? { fresh: true } : {}) });
        if (stop) return;
        if (r?.status === 200) {
          c = { token: String(r.data.token), exp: String(r.data.exp) };
          setCode(c);
        } else if (!c) return setPhase({ k: 'oops', text: r ? String(r.data.error ?? 'Couldn’t make a code.') : 'No connection. Try again.' });
      }
      if (c) {
        const p = await peopleCall({ action: 'meet-poll', token: c.token });
        if (stop) return;
        const got = ((p?.status === 200 ? p.data.got : []) as Who[]).filter((w) => !seen.current.has(w.uid));
        if (got.length) {
          for (const w of got) seen.current.add(w.uid);
          return celebrate(got[got.length - 1]);
        }
      }
      t = window.setTimeout(() => void tickOnce(), document.visibilityState === 'visible' ? 1800 : 6000);
    };
    void tickOnce();
    return () => {
      stop = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, phase.k]);

  if (!signedIn)
    return (
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        <Rings>
          <PersonAvatar me size={84} />
        </Rings>
        <p className="text-[15px] text-ink2">Sign in to meet friends.</p>
        <button
          type="button"
          className="btn-accent w-full"
          onClick={() => {
            onDone();
            ui.resetTo('you', { name: 'account' });
          }}
        >
          Sign in
        </button>
      </div>
    );

  if (phase.k === 'done') return <Met who={phase.who} already={phase.already} onDone={onDone} />;

  if (phase.k === 'scan')
    return (
      <Scanner
        onCode={(text) => {
          const t = meetToken(text);
          if (t) return void join(t);
          // Someone's PULSE link (their card) works too.
          if (/#(hi|join)=/.test(text) && text.startsWith(location.origin)) {
            onDone();
            location.hash = text.slice(text.indexOf('#'));
            return;
          }
          haptic(20);
          setPhase({ k: 'oops', text: 'That’s not a PULSE code.' });
        }}
        onBack={() => setPhase({ k: 'show' })}
      />
    );

  if (phase.k === 'joining')
    return (
      <div className="flex flex-col items-center gap-5 py-6 text-center" role="status">
        <Rings fast>
          <PersonAvatar me size={84} />
        </Rings>
        <p className="text-[15px] font-semibold">Connecting…</p>
      </div>
    );

  if (phase.k === 'oops')
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-sunk text-[26px]" aria-hidden="true">
          🙈
        </span>
        <p className="text-[15px] font-semibold" role="alert">
          {phase.text}
        </p>
        <button type="button" className="btn-accent w-full" onClick={() => setPhase({ k: 'show' })}>
          Try again
        </button>
      </div>
    );

  const me = peopleView().me;
  const url = code ? `${location.origin}/#meet=${code.token}` : '';
  return (
    <div className="flex flex-col items-center gap-4 pb-1 text-center">
      <Rings>
        <PersonAvatar me size={76} />
      </Rings>
      <div className="-mt-1">
        <p className="display text-[22px] leading-tight">{store.state.user.fullName || store.state.user.name}</p>
        {(me?.u ?? store.state.user.username) && <p className="text-[14.5px] font-semibold text-accent-ink">@{me?.u ?? store.state.user.username}</p>}
      </div>
      <div className="rounded-[26px] bg-white p-2.5 shadow-soft" data-testid="meet-code" data-token={code?.token ?? ''}>
        {url ? <QR text={url} size={196} label="Your Meet code" /> : <span className="block h-[196px] w-[196px] animate-pulse rounded-xl bg-sunk" />}
      </div>
      <p className="text-[14px] text-ink2">Phones together. They scan, you’re friends.</p>
      <button
        type="button"
        className="btn-accent w-full"
        onClick={() => {
          haptic(10);
          setPhase({ k: 'scan' });
        }}
      >
        <Icon name="scan" size={18} /> Scan their code
      </button>
    </div>
  );
}

/** My face with PULSE's heartbeat rings around it while waiting. */
function Rings({ children, fast }: { children: React.ReactNode; fast?: boolean }) {
  return (
    <div className="relative grid h-[150px] w-[150px] place-items-center" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`meet-ring ${fast ? 'meet-ring-fast' : ''}`} style={{ animationDelay: `${i * (fast ? 0.35 : 0.7)}s` }} />
      ))}
      <span className="relative">{children}</span>
    </div>
  );
}

/** The moment: two faces slide together, a pulse, and you're friends. */
function Met({ who, already, onDone }: { who: Who; already?: boolean; onDone: () => void }) {
  const store = useStore();
  const ui = useUI();
  const host = useHost();
  const [undone, setUndone] = useState(false);
  const first = who.name.split(' ')[0] || who.name;
  return (
    <div className="flex flex-col items-center gap-4 pb-1 text-center" role="status" aria-live="polite">
      <div className="relative flex h-[170px] w-full items-center justify-center overflow-hidden">
        <span className="meet-burst" aria-hidden="true" />
        <span className="meet-left relative z-[1] rounded-full ring-4 ring-bg">
          <PersonAvatar me size={92} />
        </span>
        <span className="meet-right relative z-[1] -ml-5">
          <Face who={who} size={92} />
        </span>
        <span className="meet-check absolute bottom-3 left-1/2 z-[2] grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full bg-accent text-[#17140F] ring-4 ring-bg" aria-hidden="true">
          <Icon name="check" size={18} strokeWidth={3} />
        </span>
      </div>
      <div className="meet-text">
        <p className="display text-[24px] leading-tight">{undone ? 'Undone.' : already ? `Already friends with ${first}` : `You and ${first} are friends`}</p>
        <p className="mt-1 text-[14.5px] text-ink3">@{who.u}</p>
      </div>
      <button type="button" className="btn-accent meet-text w-full" onClick={onDone}>
        Done
      </button>
      {!already && !undone && (
        <button
          type="button"
          className="btn-ghost -mt-2 w-full text-[13.5px] text-ink3"
          onClick={async () => {
            const r = await act('remove', who.uid);
            if (r.error) return store.toast({ text: r.error });
            setUndone(true);
            void syncFriends(host);
            window.setTimeout(() => {
              onDone();
              ui.closeAllSheets();
            }, 900);
          }}
        >
          Not who you meant? Undo
        </button>
      )}
    </div>
  );
}

/** The camera, reading QR codes. Uses the phone's own reader where there is one (Android), else jsQR. */
function Scanner({ onCode, onBack }: { onCode: (text: string) => void; onBack: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'on' | 'blocked'>('starting');
  const done = useRef(false);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stop) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setState('on');
        type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
        const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const native = Native ? new Native({ formats: ['qr_code'] }) : null;
        const jsQR = native ? null : (await import('jsqr')).default;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let busy = false;
        const look = async () => {
          if (stop || done.current) return;
          if (!busy && v.readyState >= 2 && v.videoWidth) {
            busy = true;
            try {
              let text = '';
              if (native) text = (await native.detect(v))[0]?.rawValue ?? '';
              else if (jsQR && ctx) {
                const w = 480;
                const h = Math.round((v.videoHeight / v.videoWidth) * w);
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(v, 0, 0, w, h);
                text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? '';
              }
              if (text && !done.current) {
                done.current = true;
                haptic(14);
                onCode(text);
                return;
              }
            } catch {
              /* try the next frame */
            }
            busy = false;
          }
          raf = window.setTimeout(() => void look(), calm() ? 250 : 120);
        };
        void look();
      } catch {
        if (!stop) setState('blocked');
      }
    })();
    return () => {
      stop = true;
      window.clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative aspect-square w-full max-w-[340px] overflow-hidden rounded-[28px] bg-[#17140F]">
        <video ref={video} className="h-full w-full object-cover" playsInline muted aria-label="Camera" />
        {state === 'on' && (
          <>
            <span className="pointer-events-none absolute inset-[14%] rounded-[22px] border-[3px] border-[#FFFBF4]/90" aria-hidden="true" />
            <span className="pointer-events-none absolute inset-x-[16%] h-[3px] animate-scan rounded-full bg-accent shadow-[0_0_14px_rgb(236_91_43)]" aria-hidden="true" />
          </>
        )}
        {state === 'blocked' && (
          <div className="absolute inset-0 grid place-items-center p-6 text-[#FFFBF4]">
            <p className="text-[14.5px]">Camera is off. Allow it in settings, or scan with your phone’s camera.</p>
          </div>
        )}
      </div>
      <p className="text-[14px] text-ink2">Point at their Meet code.</p>
      <button type="button" className="btn-quiet w-full" onClick={onBack}>
        Show my code
      </button>
    </div>
  );
}
