import { useEffect, useMemo, useRef, useState } from 'react';
import type { Person } from '../types';
import { useStore } from '../store/store';
import { burst } from '../lib/celebrate';
import { fmtDate, haptic, rupees } from '../lib/format';
import { playSfx } from '../lib/sfx';
import { canShake, motionAllowed, watchShake } from '../lib/shake';
import { PersonAvatar } from './ui/bits';

export interface Chit {
  id: string;
  name: string;
  person?: Person;
  me?: boolean;
}

const INK = '#17140F';
const PAPER = '#FFFBF4';
const PERSIMMON = '#EC5B2B';
const DEEP = '#AD431F';
const TINT = '#F5E1D8';

/** Torn-paper edge for the chit: a zigzag top and bottom. */
function zigzag(teeth = 18, depth = 3.2) {
  const pts: string[] = [];
  for (let i = 0; i <= teeth; i++) pts.push(`${(i / teeth) * 100}% ${i % 2 ? depth : 0}%`);
  for (let i = teeth; i >= 0; i--) pts.push(`${(i / teeth) * 100}% ${100 - (i % 2 ? depth : 0)}%`);
  return `polygon(${pts.join(',')})`;
}

/** The clay matka, drawn flat in brand colours. */
function Pot() {
  return (
    <svg viewBox="0 0 240 240" width="220" height="220" aria-hidden="true" className="block">
      <ellipse cx="120" cy="228" rx="78" ry="9" fill={INK} opacity=".12" />
      <defs>
        <clipPath id="matka-body">
          <path d="M92 80 C60 90 38 120 40 152 C42 196 82 224 120 224 C158 224 198 196 200 152 C202 120 180 90 148 80 Z" />
        </clipPath>
      </defs>
      <path d="M92 80 C60 90 38 120 40 152 C42 196 82 224 120 224 C158 224 198 196 200 152 C202 120 180 90 148 80 Z" fill={PERSIMMON} />
      <g clipPath="url(#matka-body)">
        {/* Shade on the right, light on the left: flat shapes, no gradients. */}
        <path d="M168 84 C196 110 206 170 172 214 L220 230 L220 70 Z" fill={DEEP} opacity=".55" />
        <rect x="0" y="126" width="240" height="26" fill={PAPER} />
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M${20 + i * 16} 147 L${28 + i * 16} 131 L${36 + i * 16} 147 Z`} fill={DEEP} />
        ))}
        {Array.from({ length: 22 }, (_, i) => (
          <circle key={i} cx={14 + i * 10} cy="168" r="2.2" fill={PAPER} opacity=".85" />
        ))}
        <rect x="0" y="182" width="240" height="4" fill={DEEP} opacity=".6" />
      </g>
      <path d="M64 120 C66 104 76 94 90 88" stroke={PAPER} strokeWidth="6" strokeLinecap="round" fill="none" opacity=".45" />
      <path d="M86 86 L93 62 L147 62 L154 86 Z" fill={DEEP} />
      <ellipse cx="120" cy="62" rx="36" ry="10" fill={PERSIMMON} />
      <ellipse cx="120" cy="62" rx="27" ry="6.5" fill={INK} />
    </svg>
  );
}

/**
 * The lucky draw: chits rattle in a matka, one flies out and unfolds with the winner's name.
 * `draw` is called once when the draw starts and returns the winner's id (decided before the
 * animation, so the result can't change). Shake the phone or tap the matka to start.
 */
export function MatkaDraw({ chits, draw, round, rounds, pot, when, onRevealed }: { chits: Chit[]; draw: () => string | undefined; round: number; rounds: number; pot: number; when?: string; onRevealed?: (winner: Chit) => void }) {
  const { state } = useStore();
  const [stage, setStage] = useState<'idle' | 'shaking' | 'out' | 'open'>('idle');
  const [winner, setWinner] = useState<Chit | null>(null);
  const started = useRef(false);
  const timers = useRef<number[]>([]);
  const peek = useMemo(
    () =>
      chits.slice(0, 9).map((c, i, a) => ({
        c,
        left: 50 + (i - (a.length - 1) / 2) * 8.5,
        r: `${((i * 37) % 26) - 13}deg`,
        delay: `${(i * 0.17) % 0.9}s`,
        h: 30 + ((i * 13) % 12),
      })),
    [chits],
  );

  const start = () => {
    if (started.current) return;
    const id = draw();
    const w = chits.find((c) => c.id === id);
    if (!w) return;
    started.current = true;
    setWinner(w);
    setStage('shaking');
    haptic(30);
    const t = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
    t(450, () => haptic(20));
    t(900, () => haptic(20));
    t(1500, () => {
      setStage('out');
      haptic(12);
    });
    t(2300, () => {
      setStage('open');
      haptic(40);
      burst({ kind: 'confetti', power: 1.9 });
      playSfx('income', state.settings.sounds);
      onRevealed?.(w);
    });
  };

  // Shake the phone to draw (where the phone allows it without asking).
  useEffect(() => {
    if (!canShake() || !motionAllowed()) return;
    return watchShake(() => start());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => timers.current.forEach((x) => window.clearTimeout(x)), []);

  return (
    <div className="relative flex flex-col items-center select-none" style={{ minHeight: 430 }}>
      {/* Sun rays behind the reveal */}
      {stage === 'open' && (
        <svg className="rays pointer-events-none absolute" style={{ left: '50%', top: 205, width: 520, height: 520 }} viewBox="0 0 200 200" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <path key={i} d="M100 100 L96 0 L104 0 Z" fill={PERSIMMON} opacity=".16" transform={`rotate(${i * 22.5} 100 100)`} />
          ))}
        </svg>
      )}

      <button
        type="button"
        onClick={start}
        disabled={stage !== 'idle'}
        aria-label={stage === 'idle' ? 'Shake the matka and draw a chit' : 'Drawing'}
        className={`relative mt-6 outline-none transition-opacity duration-500 ${stage === 'open' ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className={stage === 'shaking' ? 'matka-shaking' : stage === 'idle' ? 'matka-idle' : ''}>
          {/* Chits peeking out of the mouth */}
          <div className="absolute inset-x-0" style={{ top: 22, height: 50 }}>
            {peek.map(({ c, left, r, delay, h }) =>
              stage === 'out' && winner?.id === c.id ? null : (
                <span
                  key={c.id}
                  className="chit absolute rounded-[4px] border"
                  style={{ left: `${left}%`, bottom: 0, width: 13, height: h, marginLeft: -6.5, background: PAPER, borderColor: '#E6DCCB', ['--r' as string]: r, animationDelay: delay, boxShadow: `inset 0 -6px 0 ${TINT}` }}
                />
              ),
            )}
          </div>
          <Pot />
        </div>
        {stage === 'out' && (
          <span className="chit-fly absolute rounded-[4px] border" style={{ left: '50%', top: 18, width: 16, height: 42, background: PAPER, borderColor: '#E6DCCB', boxShadow: `inset 0 -8px 0 ${TINT}` }} aria-hidden="true" />
        )}
      </button>

      {stage === 'idle' && (
        <div className="pop-in mt-5 text-center">
          <p className="display text-[19px]">{canShake() ? 'Shake your phone' : 'Tap the matka'}</p>
          <p className="mt-1 text-[13.5px] text-ink3">{canShake() ? 'or tap the matka' : 'to shake it'} · {chits.length} chits inside</p>
        </div>
      )}
      {(stage === 'shaking' || stage === 'out') && <p className="mt-5 text-[15px] font-semibold text-ink2">{stage === 'shaking' ? 'Shaking… 🫨' : 'And the chit says…'}</p>}

      {/* The chit, unfolded */}
      {stage === 'open' && winner && (
        <div className="ticket-open absolute" style={{ left: '50%', top: 205, width: 272 }} role="status" aria-live="polite">
          <div className="px-6 pb-7 pt-8 text-center shadow-[0_18px_40px_-12px_rgba(23,20,15,.45)]" style={{ background: PAPER, color: INK, clipPath: zigzag() }}>
            <p className="text-[11px] font-bold tracking-[.18em]" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', color: DEEP }}>
              ★ CHIT · ROUND {round} OF {rounds} ★
            </p>
            <div className="mx-auto mt-4 w-fit rounded-full p-[3px]" style={{ background: PERSIMMON }}>
              <div className="rounded-full p-[3px]" style={{ background: PAPER }}>
                <PersonAvatar person={winner.person ?? { id: winner.id, name: winner.name, short: winner.name.split(' ')[0], hue: hueOf(winner.name) }} me={winner.me} size={76} />
              </div>
            </div>
            <p className="mt-3 text-[28px] font-extrabold leading-tight" style={{ fontFamily: '"Unbounded Variable", Unbounded, sans-serif' }}>
              {winner.me ? 'YOU!' : winner.name.split(' ')[0]}
            </p>
            <p className="mt-1.5 text-[11.5px] font-bold tracking-[.2em]" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', color: '#6B6255' }}>
              TAKES THE POT
            </p>
            <p className="mt-1 text-[34px] font-extrabold leading-none" style={{ fontFamily: '"Unbounded Variable", Unbounded, sans-serif', color: DEEP }}>
              {rupees(pot)}
            </p>
            <div className="mx-auto mt-4 border-t-2 border-dashed" style={{ borderColor: '#E0D5C3' }} />
            <p className="mt-3 text-[10.5px] tracking-[.14em]" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', color: '#8A8073' }}>
              PULSE · DRAWN {(when ?? fmtDate(state.today, true)).toUpperCase()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function hueOf(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}
