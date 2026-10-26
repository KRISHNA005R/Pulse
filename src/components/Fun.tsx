import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { burst } from '../lib/celebrate';
import { addDays, fmtDate, haptic, rupees } from '../lib/format';
import { BRAND } from '../lib/brand';
import { guessRound, guessVerdict, survived } from '../lib/fun';
import { Icon } from './ui/Icon';
import { MoneyInput } from './ui/bits';

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
            <div className="rise-in mt-3">
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
      <div className="relative flex items-center gap-2 py-3 pl-4 pr-2">
        <div className="min-w-0 flex-1 pr-1">
          <p className="display text-[18px] leading-tight">You survived payday</p>
          <p className="mt-0.5 text-[14px] text-ink2">
            Made it with <span className="num font-semibold text-pos">{rupees(w.left)}</span> left. {w.inARow > 1 ? `${w.inARow} paydays in a row. Built different.` : 'First one on the board.'}
          </p>
        </div>
        <img src="/illustrations/payday-win.webp" alt="" aria-hidden="true" width={700} height={694} decoding="async" data-testid="payday-art" className="pop-in h-[112px] w-[112px] shrink-0 object-contain" />
        <button type="button" className="tap absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label="Close" onClick={() => store.updateSettings({ paydaySeen: w.date })}>
          <Icon name="x" size={16} />
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Beta: one card on Home that points to everything new
// ------------------------------------------------------------------
export const NEW_STUFF = ['bhisi', 'gullak'] as const;

export function NewStuffCard() {
  const store = useStore();
  const ui = useUI();
  const tried = store.state.settings.newTried ?? [];
  if (store.state.settings.newStuffSeen || NEW_STUFF.every((k) => tried.includes(k))) return null;
  const items: { key: (typeof NEW_STUFF)[number]; emoji: string; label: string; sub: string; run: () => void }[] = [
    { key: 'bhisi', emoji: '🏺', label: 'Bhisi', sub: 'Lucky chit', run: () => { ui.setPlansSegment('bhisi'); ui.resetTo('plans'); } },
    { key: 'gullak', emoji: '🪙', label: 'Gullak', sub: 'Coin a day', run: () => ui.openSheet({ type: 'gullak-form' }) },
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
      <div className="mt-3 grid grid-cols-2 gap-2">
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
