import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { buildRewind, rewindPrompt, type Rewind } from '../lib/rewind';
import { drawRewindCard } from '../lib/rewindArt';
import { cardBlob, ensureFonts } from '../lib/cardArt';
import { monthRange, prevMonth } from '../lib/finance';
import { addMonths, fmtDate } from '../lib/format';
import { Icon } from './ui/Icon';

// PULSE Rewind: the month as 5 story slides. Tap the right side for the next slide, the left side to
// go back. The last slide is the share card (the "aura glow" image) with Share and Save.

/** The month to rewind by default: last month in the first week, this month (so far) after that. */
export const defaultRewindMonth = (today: string) => (Number(today.slice(8, 10)) <= 7 ? monthRange(prevMonth(today))[0] : monthRange(today)[0]);

const SLIDES = 5;
const INK = '#17140F';
const PAPER = '#FFFBF4';
const ORANGE = '#EC5B2B';
const TINT = '#F5E1D8';
const NIGHT = '#F18460';

function Bars({ i, dark }: { i: number; dark?: boolean }) {
  return (
    <div className="absolute inset-x-3.5 top-3 flex gap-1" aria-hidden="true">
      {Array.from({ length: SLIDES }, (_, k) => (
        <span key={k} className="h-[3px] flex-1 rounded-full" style={{ background: k <= i ? (dark ? INK : '#fff') : dark ? 'rgba(23,20,15,.2)' : 'rgba(255,255,255,.32)' }} />
      ))}
    </div>
  );
}

const Mark = ({ color = PAPER }: { color?: string }) => (
  <span className="display text-[15px] tracking-tight" style={{ color }}>
    PULSE<span style={{ color: ORANGE }}>.</span>
  </span>
);

/** "You saved 18% of what came in." with the number in orange. */
const withNumber = (text: string) => {
  const m = text.match(/^(.*?)(\d+%?)(.*)$/);
  if (!m) return text;
  return (
    <>
      {m[1]}
      <span style={{ color: ORANGE }}>{m[2]}</span>
      {m[3]}
    </>
  );
};

function Slide({ r, i }: { r: Rewind; i: number }) {
  if (i === 0)
    return (
      <div className="flex h-full flex-col p-5 pt-8" style={{ background: INK, color: PAPER }}>
        <Bars i={i} />
        <p className="text-[11px] font-extrabold tracking-[.16em]" style={{ color: NIGHT }}>
          PULSE REWIND
        </p>
        <p className="mt-10 text-[44px] leading-none">📼</p>
        <p className="display mt-3 text-[40px] leading-[.95] tracking-tight">
          Your
          <br />
          {r.monthName},
          <br />
          <span style={{ color: ORANGE }}>{r.partial ? 'so far.' : 'rewound.'}</span>
        </p>
        <p className="mt-4 text-[14px] leading-snug opacity-80">
          {r.opener}
          <br />
          Let’s see what kind of month it was.
        </p>
        <div className="mt-auto flex items-center justify-between text-[11px] font-bold opacity-80">
          <Mark />
          <span>Tap to start →</span>
        </div>
      </div>
    );
  if (i === 1) {
    const top = r.top[0];
    return (
      <div className="flex h-full flex-col p-5 pt-8" style={{ background: ORANGE, color: INK }}>
        <Bars i={i} dark />
        <p className="text-[11px] font-extrabold tracking-[.16em]">WHERE IT WENT</p>
        <p className="display mt-5 text-[78px] leading-none tracking-tight">{top?.pct ?? 0}%</p>
        <p className="display mt-2 text-[23px] leading-tight tracking-tight">
          of your month was {top?.emoji} {top?.name.toLowerCase()}.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          {r.top.map((t) => (
            <div key={t.category} className="grid grid-cols-[minmax(0,44%)_1fr] items-center gap-2.5">
              <span className="truncate text-[12.5px] font-extrabold">
                {t.emoji} {t.name} {t.pct}%
              </span>
              <span className="h-2.5 rounded-full" style={{ background: INK, width: `${Math.max(8, (t.pct / Math.max(1, r.top[0].pct)) * 100)}%` }} />
            </div>
          ))}
        </div>
        {r.app && <p className="mt-auto text-[13px] font-bold">{r.app.name} was your bestie: {r.app.count} times 🛵</p>}
      </div>
    );
  }
  if (i === 2)
    return (
      <div className="flex h-full flex-col p-5 pt-8" style={{ background: PAPER, color: INK }}>
        <Bars i={i} dark />
        <p className="text-[11px] font-extrabold tracking-[.16em]" style={{ color: '#AD431F' }}>
          YOUR HABITS
        </p>
        <p className="display mt-3 text-[28px] leading-[1.05] tracking-tight">{r.habitsTitle}</p>
        <div className="mt-3 rounded-2xl p-3.5" style={{ background: TINT }}>
          <p className="display text-[28px] leading-none">{r.noSpendDays}</p>
          <p className="mt-1 text-[12.5px] font-semibold opacity-85">no-spend {r.noSpendDays === 1 ? 'day' : 'days'} 🧘</p>
        </div>
        <div className="mt-2.5 rounded-2xl p-3.5" style={{ background: INK, color: PAPER }}>
          <p className="display text-[28px] leading-none" style={{ color: ORANGE }}>
            {r.bestStreak} {r.bestStreak === 1 ? 'day' : 'days'}
          </p>
          <p className="mt-1 text-[12.5px] font-semibold opacity-85">longest logging streak 🔥</p>
        </div>
        {r.spendiestDay && (
          <div className="mt-2.5 rounded-2xl p-3.5" style={{ background: TINT }}>
            <p className="display text-[28px] leading-none">{r.spendiestDay}</p>
            <p className="mt-1 text-[12.5px] font-semibold opacity-85">your spendiest day of the week 🎉</p>
          </div>
        )}
      </div>
    );
  return (
    <div className="flex h-full flex-col p-5 pt-8" style={{ background: INK, color: PAPER }}>
      <Bars i={i} />
      <p className="text-[11px] font-extrabold tracking-[.16em]" style={{ color: NIGHT }}>
        YOUR BIGGEST W
      </p>
      <p className="mt-10 text-[54px] leading-none">🏆</p>
      <p className="display mt-3 text-[30px] leading-[1.02] tracking-tight">{withNumber(r.win.text)}</p>
      {r.win.sub && <p className="mt-3 text-[14px] leading-snug opacity-80">{r.win.sub}</p>}
      <div className="mt-auto flex items-center justify-between text-[11px] font-bold opacity-80">
        <Mark />
        <span>One more →</span>
      </div>
    </div>
  );
}

export function RewindStory({ month }: { month?: string }) {
  const store = useStore();
  const { state } = store;
  const r = useMemo(() => buildRewind(state, month ?? defaultRewindMonth(state.today)), [state, month]);
  const [i, setI] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [canShare, setCanShare] = useState(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Opening it counts as seen, so the Home offer goes away.
  useEffect(() => {
    const key = r.partial ? `${r.month.slice(0, 7)}:soon` : r.month.slice(0, 7);
    if (state.settings.rewindSeen !== key && state.settings.rewindSeen !== r.month.slice(0, 7)) store.updateSettings({ rewindSeen: key });
    try {
      const f = new File([new Blob([''])], 'x.png', { type: 'image/png' });
      setCanShare(!!navigator.canShare && navigator.canShare({ files: [f] }));
    } catch {
      setCanShare(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slides move on by themselves, like stories (not with reduced motion, and not on the last one).
  useEffect(() => {
    if (reduced || i >= SLIDES - 1 || !r.enough) return;
    const t = window.setTimeout(() => setI((x) => Math.min(SLIDES - 1, x + 1)), 6500);
    return () => window.clearTimeout(t);
  }, [i, reduced, r.enough]);

  useEffect(() => {
    if (i !== SLIDES - 1 || !canvas.current) return;
    let alive = true;
    void ensureFonts().then(() => alive && canvas.current && drawRewindCard(canvas.current, r));
    return () => {
      alive = false;
    };
  }, [i, r]);

  const file = async () => {
    const c = canvas.current;
    if (!c) return null;
    const blob = await cardBlob(c);
    return blob ? new File([blob], `pulse-rewind-${r.month.slice(0, 7)}.png`, { type: 'image/png' }) : null;
  };
  const share = async () => {
    const f = await file();
    if (!f) return;
    try {
      await navigator.share({ files: [f], text: `My ${r.monthName} on PULSE 📼 pulsemoney.in` });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') store.toast({ text: 'Sharing was blocked. Save the image and post it from Instagram instead.' });
    }
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
    store.toast({ text: 'Saved. Post it to your story from Instagram 📸' });
  };

  if (!r.enough)
    return (
      <div className="py-10 text-center">
        <p className="text-[44px]">📼</p>
        <p className="display mt-3 text-[22px]">Not enough for a Rewind yet</p>
        <p className="mx-auto mt-2 max-w-[300px] text-[14.5px] text-ink2">
          Log a bit more and your next Rewind will be 🔥. A fresh one drops on {fmtDate(addMonths(r.month, 1))}.
        </p>
      </div>
    );

  return (
    <div className="flex flex-col items-center">
      <div className="relative aspect-[9/16] w-full max-w-[340px] select-none overflow-hidden rounded-[26px]" style={{ maxHeight: '68svh' }}>
        {i < SLIDES - 1 ? (
          <Slide r={r} i={i} />
        ) : (
          <div className="relative h-full w-full" style={{ background: '#1A120D' }}>
            <canvas ref={canvas} data-testid="rewind-card" width={1080} height={1920} className="h-full w-full" aria-label={`Share card: ${r.title} ${r.chips.join(', ')}`} role="img" />
            <Bars i={i} />
          </div>
        )}
        {/* Tap zones: left goes back, right goes on. */}
        {i > 0 && <button type="button" aria-label="Previous slide" className="absolute inset-y-0 left-0 w-[32%]" onClick={() => setI(i - 1)} />}
        {i < SLIDES - 1 && <button type="button" aria-label="Next slide" className="absolute inset-y-0 right-0 w-[68%]" onClick={() => setI(i + 1)} />}
      </div>
      {i === SLIDES - 1 ? (
        <div className="mt-4 grid w-full max-w-[340px] grid-cols-2 gap-2">
          {canShare ? (
            <button type="button" className="btn-accent" onClick={share}>
              <Icon name="share" size={17} /> Share to story
            </button>
          ) : null}
          <button type="button" className={canShare ? 'btn-quiet' : 'btn-accent col-span-2'} onClick={save}>
            <Icon name="download" size={17} /> Save image
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[12.5px] text-ink3">Tap the right side for the next slide</p>
      )}
    </div>
  );
}

/** Home: "Your October Rewind is ready" in the first week, "rewind it so far" in the last 3 days. */
export function RewindOffer() {
  const store = useStore();
  const ui = useUI();
  const p = useMemo(() => rewindPrompt(store.state), [store.state]);
  if (!p || store.state.mode !== 'personal') return null;
  const key = p.kind === 'ready' ? p.month.slice(0, 7) : `${p.month.slice(0, 7)}:soon`;
  return (
    <section data-testid="rewind-offer" aria-label="PULSE Rewind" className="flex items-center gap-3 rounded-3xl p-4" style={{ background: INK, color: PAPER }}>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[26px]" style={{ background: '#3E2015' }} aria-hidden="true">
        📼
      </span>
      <div className="min-w-0 flex-1">
        <p className="display text-[16px] leading-tight">{p.kind === 'ready' ? `Your ${p.monthName} Rewind is ready` : `${p.monthName}’s almost done`}</p>
        <p className="mt-0.5 text-[13px] opacity-75">{p.kind === 'ready' ? 'Your month in 5 slides. Made to share.' : 'Rewind it so far. The full one drops on the 1st.'}</p>
        <button type="button" className="mt-2 rounded-full px-3.5 py-1.5 text-[13px] font-bold" style={{ background: ORANGE, color: INK }} onClick={() => ui.openSheet({ type: 'rewind', month: p.month })}>
          Watch it 📼
        </button>
      </div>
      <button type="button" aria-label="Not now" className="tap -mr-1 -mt-8 grid h-9 w-9 shrink-0 place-items-center rounded-full opacity-70 hover:opacity-100" onClick={() => store.updateSettings({ rewindSeen: key })}>
        <Icon name="x" size={16} />
      </button>
    </section>
  );
}
