import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { burst } from '../lib/celebrate';
import { addDays, fmtDate, haptic, rupees } from '../lib/format';
import { BRAND } from '../lib/brand';
import { cardBlob, ensureFonts, fit, font, rr, spacing, wordmark } from '../lib/cardArt';
import { guessRound, guessVerdict, moneyAura, survived, type Aura } from '../lib/fun';
import { Icon } from './ui/Icon';
import { MoneyInput } from './ui/bits';

// ------------------------------------------------------------------
// Money aura
// ------------------------------------------------------------------
const MONTH_ONLY = (label: string) => label.replace(' so far', '').toUpperCase();

/** The aura card as it appears in the app (and, drawn on a canvas, as the shared image). */
function AuraFace({ aura }: { aura: Aura }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] p-6 text-[#17140F]" style={{ background: BRAND.accent }}>
      {['12%,10%', '84%,16%', '90%,58%', '8%,64%', '70%,88%'].map((p, i) => (
        <span key={i} className="absolute text-[18px] opacity-70" style={{ left: p.split(',')[0], top: p.split(',')[1] }} aria-hidden="true">
          ✦
        </span>
      ))}
      <p className="relative text-center text-[12px] font-bold tracking-[.22em]">MY {MONTH_ONLY(aura.label)} MONEY AURA</p>
      <div className="pop-in relative mx-auto mt-5 grid h-[132px] w-[132px] place-items-center rounded-full text-[70px] shadow-[0_10px_0_rgba(23,20,15,.9)]" style={{ background: BRAND.paper, border: '4px solid #17140F' }} aria-hidden="true">
        {aura.emoji}
      </div>
      <p className="relative mt-6 text-center text-[30px] font-extrabold leading-[1.05]" style={{ fontFamily: BRAND.display }}>
        {aura.name}
      </p>
      <p className="relative mx-auto mt-2 max-w-[280px] text-center text-[15px] font-medium leading-snug">{aura.line}</p>
      <div className="relative mt-5 -rotate-1 rounded-2xl p-4" style={{ background: BRAND.paper, border: '3px solid #17140F' }}>
        {aura.stats.map((s) => (
          <div key={s.label} className="flex items-baseline justify-between gap-3 py-1 text-[14px]">
            <span className="shrink-0 text-[#5d554a]">{s.label}</span>
            <span className="num min-w-0 truncate text-right font-bold">{s.value}</span>
          </div>
        ))}
      </div>
      <p className="relative mt-4 text-center text-[12px] font-extrabold tracking-[.12em]" style={{ fontFamily: BRAND.display }}>
        PULSE<span style={{ color: BRAND.paper }}>.</span>
      </p>
    </div>
  );
}

function drawAura(c: HTMLCanvasElement, a: Aura) {
  const W = 1080;
  const H = 1920;
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = BRAND.accent;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = BRAND.ink;
  ctx.globalAlpha = 0.7;
  font(ctx, 400, 54, BRAND.body);
  for (const [x, y] of [[130, 240], [900, 300], [960, 1120], [90, 1220], [760, 1720]]) ctx.fillText('✦', x, y);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  spacing(ctx, 12);
  font(ctx, 700, 40, BRAND.body);
  ctx.fillText(`MY ${MONTH_ONLY(a.label)} MONEY AURA`, W / 2, 230);
  spacing(ctx, 0);
  // Emoji coin
  ctx.fillStyle = BRAND.ink;
  ctx.beginPath();
  ctx.arc(W / 2, 560 + 22, 230, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BRAND.paper;
  ctx.beginPath();
  ctx.arc(W / 2, 560, 230, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = BRAND.ink;
  ctx.stroke();
  ctx.font = '230px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(a.emoji, W / 2, 575);
  ctx.textBaseline = 'alphabetic';
  // Name and line
  ctx.fillStyle = BRAND.ink;
  const size = fit(ctx, a.name, 800, 120, BRAND.display, W - 140, 64);
  font(ctx, 800, size, BRAND.display);
  ctx.fillText(a.name, W / 2, 960);
  font(ctx, 500, 46, BRAND.body);
  const words = a.line.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > W - 200 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 1060 + i * 60));
  // Stats panel
  const top = 1260;
  const h = 90 + a.stats.length * 78;
  ctx.save();
  ctx.translate(W / 2, top + h / 2);
  ctx.rotate(-0.02);
  ctx.fillStyle = BRAND.paper;
  rr(ctx, -440, -h / 2, 880, h, 36);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = BRAND.ink;
  ctx.stroke();
  a.stats.forEach((s, i) => {
    const y = -h / 2 + 90 + i * 78;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5d554a';
    font(ctx, 500, 38, BRAND.body);
    ctx.fillText(s.label, -390, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = BRAND.ink;
    font(ctx, 700, 40, BRAND.body);
    ctx.fillText(s.value, 390, y);
  });
  ctx.restore();
  ctx.textAlign = 'center';
  wordmark(ctx, W / 2, H - 110, 56, BRAND.ink, 'center', BRAND.paper);
}

export function AuraSheet() {
  const store = useStore();
  const { state } = store;
  const aura = useMemo(() => moneyAura(state), [state]);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => void store.markTried('aura'), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (aura && state.settings.auraSeen !== aura.key) {
      store.updateSettings({ auraSeen: aura.key });
      window.setTimeout(() => burst({ kind: 'confetti', power: 1.2 }), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aura?.key]);
  if (!aura) return <p className="text-[14.5px] text-ink2">Log a few more spends this month and your money aura shows up here. It needs about a week of entries.</p>;
  const share = async () => {
    const c = canvas.current!;
    await ensureFonts();
    drawAura(c, aura);
    const b = await cardBlob(c);
    if (!b) return;
    const f = new File([b], `pulse-aura-${aura.key}.png`, { type: 'image/png' });
    const text = `My ${aura.label.replace(' so far', '')} money aura: ${aura.name} ${aura.emoji}`;
    try {
      if (navigator.canShare?.({ files: [f] })) return await navigator.share({ files: [f], text });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = f.name;
    a.click();
    store.toast({ text: 'Saved the image. Post it to your story.' });
  };
  return (
    <div>
      <AuraFace aura={aura} />
      <button type="button" className="btn-primary mt-4 w-full" onClick={share}>
        <Icon name="share" size={16} /> Share to story
      </button>
      <p className="mt-2 text-center text-[12px] text-ink3">A new aura every month. Only the vibe is shared, never your balance.</p>
      <canvas ref={canvas} className="hidden" />
    </div>
  );
}

/** Home: first week of the month, when last month's aura is ready and not seen yet. */
export function AuraTeaser() {
  const { state } = useStore();
  const ui = useUI();
  const aura = useMemo(() => moneyAura(state), [state]);
  const day = Number(state.today.slice(8, 10));
  if (!aura || day > 7 || state.settings.auraSeen === aura.key) return null;
  return (
    <button type="button" onClick={() => ui.openSheet({ type: 'aura' })} className="tap relative flex w-full items-center gap-4 overflow-hidden rounded-3xl p-4 text-left text-[#17140F]" style={{ background: BRAND.accent }}>
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-[30px]" style={{ background: BRAND.paper, border: '3px solid #17140F' }} aria-hidden="true">
        ✨
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold tracking-[.16em]">JUST DROPPED</span>
        <span className="display block text-[18px] leading-tight">Your {aura.label} money aura</span>
        <span className="block text-[13px] font-medium">Tap to reveal. Kinda accurate, ngl.</span>
      </span>
      <Icon name="chevron" size={20} className="shrink-0" />
    </button>
  );
}

// ------------------------------------------------------------------
// Guess the bill
// ------------------------------------------------------------------
export function GuessCard() {
  const store = useStore();
  const { state } = store;
  const [round] = useState(() => guessRound(state));
  const [guess, setGuess] = useState('');
  const [shown, setShown] = useState<number | null>(null);
  const [gone, setGone] = useState(false);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  if (!round || gone) return null;
  const cat = state.categories.find((c) => c.id === round.cat);
  const g = parseFloat(guess) || 0;
  const verdict = shown !== null && shown >= round.actual ? guessVerdict(g, round.actual) : null;
  const reveal = () => {
    store.saveGuess({ week: round.week, cat: round.cat, guess: g, actual: round.actual });
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      setShown(Math.round(round.actual * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf.current = requestAnimationFrame(step);
      else {
        haptic(24);
        if (guessVerdict(g, round.actual).good) burst({ kind: 'confetti', power: 1 });
      }
    };
    raf.current = requestAnimationFrame(step);
  };
  return (
    <section aria-label="Guess the bill" className="rounded-3xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold tracking-[.16em] text-accent-ink">GUESS THE BILL 🎯</p>
        {shown === null && (
          <button type="button" className="tap -mr-2 grid h-8 w-8 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label="Skip this week" onClick={() => setGone(true)}>
            <Icon name="x" size={15} />
          </button>
        )}
      </div>
      <p className="display mt-2 text-[19px] leading-snug">
        How much did you spend on {cat?.emoji} {cat?.name ?? 'this'} last week?
      </p>
      <p className="mt-1 text-[13px] text-ink3">
        {fmtDate(round.week)} – {fmtDate(addDays(round.week, 6))} · {round.count} times
      </p>
      {shown === null ? (
        <>
          <div className="mt-3 rounded-2xl bg-sunk">
            <MoneyInput value={guess} onChange={setGuess} label="Your guess" size="md" id="guess-amount" />
          </div>
          <div className="mt-2 flex gap-2">
            {[500, 1000, 2000, 5000].map((v) => (
              <button key={v} type="button" className="chip flex-1 justify-center px-1 text-[13px]" aria-pressed={g === v} onClick={() => setGuess(String(v))}>
                {rupees(v)}
              </button>
            ))}
          </div>
          <button type="button" className="btn-accent mt-3 w-full disabled:opacity-40" disabled={!g} onClick={reveal}>
            Lock my guess
          </button>
        </>
      ) : (
        <div className="mt-4 text-center">
          <p className="text-[13px] text-ink3">You guessed {rupees(g)}. It was…</p>
          <p className="num-hero mt-1 text-[44px] leading-none">{rupees(shown)}</p>
          {verdict && (
            <div className="pop-in mt-3">
              <p className="display text-[19px]">
                {verdict.title} {verdict.emoji}
              </p>
              <p className="mt-1 text-[14px] text-ink2">{verdict.line}</p>
              <button type="button" className="btn-quiet mt-3 w-full" onClick={() => setGone(true)}>
                See you next week
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------
// Survived payday
// ------------------------------------------------------------------
export function PaydayWin() {
  const store = useStore();
  const { state } = store;
  const w = useMemo(() => survived(state), [state]);
  const fired = useRef(false);
  useEffect(() => {
    if (w && !fired.current) {
      fired.current = true;
      window.setTimeout(() => burst({ kind: 'coins', power: 1 }), 400);
    }
  }, [w]);
  if (!w) return null;
  return (
    <section aria-label="Survived payday" className="overflow-hidden rounded-3xl border border-line bg-surface">
      {/* Finish line */}
      <div className="flex h-4" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <span key={i} className="flex flex-1 flex-col">
            <span className="flex-1" style={{ background: i % 2 ? BRAND.ink : BRAND.paper }} />
            <span className="flex-1" style={{ background: i % 2 ? BRAND.paper : BRAND.ink }} />
          </span>
        ))}
      </div>
      <div className="flex items-start gap-3 p-4">
        <span className="pop-in grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-[26px]" aria-hidden="true">
          🏁
        </span>
        <div className="min-w-0 flex-1">
          <p className="display text-[18px] leading-tight">You survived payday</p>
          <p className="mt-0.5 text-[14px] text-ink2">
            Made it with <span className="num font-semibold text-pos">{rupees(w.left)}</span> left. {w.inARow > 1 ? `${w.inARow} paydays in a row. Built different.` : 'First one on the board.'}
          </p>
        </div>
        <button type="button" className="tap -mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label="Close" onClick={() => store.updateSettings({ paydaySeen: w.date })}>
          <Icon name="x" size={16} />
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Beta: one card on Home that points to everything new
// ------------------------------------------------------------------
export const NEW_STUFF = ['bhisi', 'gullak', 'aura', 'roast'] as const;

export function NewStuffCard() {
  const store = useStore();
  const ui = useUI();
  const tried = store.state.settings.newTried ?? [];
  if (store.state.settings.newStuffSeen || NEW_STUFF.every((k) => tried.includes(k))) return null;
  const items: { key: (typeof NEW_STUFF)[number]; emoji: string; label: string; sub: string; run: () => void }[] = [
    { key: 'bhisi', emoji: '🏺', label: 'Bhisi', sub: 'Lucky chit', run: () => { ui.setPlansSegment('bhisi'); ui.resetTo('plans'); } },
    { key: 'gullak', emoji: '🪙', label: 'Gullak', sub: 'Coin a day', run: () => ui.openSheet({ type: 'gullak-form' }) },
    { key: 'aura', emoji: '✨', label: 'Aura', sub: 'Your vibe', run: () => ui.openSheet({ type: 'aura' }) },
    { key: 'roast', emoji: '🔥', label: 'Roast me', sub: 'If you dare', run: () => ui.openSheet({ type: 'ai', ask: 'Roast me' }) },
  ];
  const left = items.filter((x) => !tried.includes(x.key)).length;
  return (
    <section aria-label="New in PULSE" className="rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="display text-[17px] leading-tight">New in PULSE ✨</p>
          <p className="mt-0.5 text-[13px] text-ink3">{left === items.length ? 'Fresh drops. Tap one to try it.' : `${left} left to try. Nice going.`}</p>
        </div>
        <button type="button" className="tap -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label="Hide" onClick={() => store.updateSettings({ newStuffSeen: true })}>
          <Icon name="x" size={15} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {items.map((x) => {
          const done = tried.includes(x.key);
          return (
            <button
              key={x.key}
              type="button"
              onClick={() => {
                store.markTried(x.key);
                x.run();
              }}
              className={`tap relative flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-3 ${done ? 'bg-sunk/50 opacity-60' : 'bg-sunk'}`}
            >
              <span className="text-[24px] leading-none" aria-hidden="true">
                {x.emoji}
              </span>
              <span className="w-full truncate text-center text-[12.5px] font-semibold">{x.label}</span>
              <span className="w-full truncate text-center text-[10.5px] text-ink3">{done ? 'Tried ✓' : x.sub}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
