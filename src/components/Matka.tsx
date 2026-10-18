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
const NIGHT = '#F18460';
const TINT = '#F5E1D8';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const DISPLAY = '"Unbounded Variable", Unbounded, sans-serif';

/** Torn-paper edge: a zigzag top and bottom. */
function zigzag(teeth = 18, depth = 3.2) {
  const pts: string[] = [];
  for (let i = 0; i <= teeth; i++) pts.push(`${(i / teeth) * 100}% ${i % 2 ? depth : 0}%`);
  for (let i = teeth; i >= 0; i--) pts.push(`${(i / teeth) * 100}% ${100 - (i % 2 ? depth : 0)}%`);
  return `polygon(${pts.join(',')})`;
}

/** The clay matka with a marigold garland, on a little rangoli. Flat brand colours, no gradients. */
export function Pot({ size = 230 }: { size?: number }) {
  const body = 'M90 84 C58 94 36 124 38 156 C40 200 80 228 120 228 C160 228 200 200 202 156 C204 124 182 94 150 84 Z';
  return (
    <svg viewBox="0 0 240 262" width={size} height={(size * 262) / 240} aria-hidden="true" className="block overflow-visible">
      {/* rangoli under the pot */}
      <ellipse cx="120" cy="236" rx="96" ry="16" fill={TINT} opacity=".55" />
      {Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2;
        return <circle key={i} cx={120 + Math.cos(a) * 104} cy={236 + Math.sin(a) * 19} r="2.6" fill={i % 2 ? PERSIMMON : DEEP} opacity=".8" />;
      })}
      <ellipse cx="120" cy="232" rx="70" ry="8" fill={INK} opacity=".16" />
      <defs>
        <clipPath id="pot-body">
          <path d={body} />
        </clipPath>
      </defs>
      <path d={body} fill={PERSIMMON} />
      <g clipPath="url(#pot-body)">
        <path d="M168 88 C198 116 208 176 172 220 L230 240 L230 70 Z" fill={DEEP} opacity=".5" />
        <rect x="0" y="134" width="240" height="24" fill={PAPER} />
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M${18 + i * 16} 154 L${26 + i * 16} 138 L${34 + i * 16} 154 Z`} fill={DEEP} />
        ))}
        {Array.from({ length: 22 }, (_, i) => (
          <circle key={i} cx={12 + i * 10} cy="174" r="2.2" fill={PAPER} opacity=".85" />
        ))}
        <rect x="0" y="188" width="240" height="4" fill={DEEP} opacity=".55" />
      </g>
      <path d="M62 126 C64 110 74 98 88 92" stroke={PAPER} strokeWidth="6" strokeLinecap="round" fill="none" opacity=".45" />
      {/* neck and rim */}
      <path d="M84 90 L92 64 L148 64 L156 90 Z" fill={DEEP} />
      <ellipse cx="120" cy="64" rx="37" ry="10.5" fill={PERSIMMON} />
      <ellipse cx="120" cy="64" rx="28" ry="6.8" fill={INK} />
      {/* marigold garland draped across the neck */}
      {Array.from({ length: 13 }, (_, i) => {
        const t = i / 12;
        const x = 78 + t * 84;
        const y = 92 + Math.sin(t * Math.PI) * 16;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="6.2" fill={i % 2 ? NIGHT : PERSIMMON} stroke={DEEP} strokeWidth="1.4" />
            <circle cx={x} cy={y} r="2" fill={PAPER} opacity=".8" />
          </g>
        );
      })}
      <path d="M76 92 C70 104 72 116 66 124" stroke={DEEP} strokeWidth="2" fill="none" />
      <circle cx="66" cy="126" r="5" fill={NIGHT} stroke={DEEP} strokeWidth="1.4" />
      <path d="M164 92 C170 104 168 116 174 124" stroke={DEEP} strokeWidth="2" fill="none" />
      <circle cx="174" cy="126" r="5" fill={NIGHT} stroke={DEEP} strokeWidth="1.4" />
    </svg>
  );
}

/** A rolled-up chit tied with a red thread. */
function Scroll({ w = 16, h = 46 }: { w?: number; h?: number }) {
  return (
    <span className="relative block rounded-[5px] border" style={{ width: w, height: h, background: PAPER, borderColor: '#E3D6C2', boxShadow: `inset -4px 0 0 ${TINT}` }}>
      <span className="absolute inset-x-[-2px] top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ background: PERSIMMON }} />
    </span>
  );
}

type Stage = 'idle' | 'shaking' | 'rise' | 'hover' | 'unroll' | 'open';
type DrawFn = () => string | undefined | Promise<{ winner?: string; error?: string }>;

/**
 * The lucky draw: chits rattle in the matka, one flies out, hangs there for a second, and unrolls
 * with the winner's name. `draw` decides the winner (PULSE's server, for a shared bhisi) and the
 * animation just shows it: nothing on the phone can change the result.
 */
export function MatkaDraw({ chits, draw, round, rounds, pot, when, onRevealed, autoStart }: { chits: Chit[]; draw: DrawFn; round: number; rounds: number; pot: number; when?: string; onRevealed?: (winner: Chit) => void; autoStart?: boolean }) {
  const { state } = useStore();
  const [stage, setStage] = useState<Stage>('idle');
  const [winner, setWinner] = useState<Chit | null>(null);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  const peek = useMemo(
    () =>
      chits.slice(0, 10).map((c, i, a) => ({
        c,
        left: 50 + (i - (a.length - 1) / 2) * 7.2,
        r: `${((i * 37) % 28) - 14}deg`,
        delay: `${(i * 0.17) % 0.9}s`,
        h: 30 + ((i * 13) % 14),
      })),
    [chits],
  );
  const t = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));

  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    setStage('shaking');
    haptic(30);
    const shook = new Promise<void>((res) => t(1700, res));
    t(500, () => haptic(18));
    t(1000, () => haptic(18));
    let id: string | undefined;
    let err = '';
    try {
      const r = await draw();
      if (typeof r === 'object' && r) {
        id = r.winner;
        err = r.error ?? '';
      } else id = r;
    } catch {
      err = 'The draw didn’t go through. Try again.';
    }
    await shook;
    const w = chits.find((c) => c.id === id);
    if (!w) {
      setStage('idle');
      setError(err || 'Something went off. Try again.');
      busy.current = false;
      return;
    }
    setWinner(w);
    setStage('rise');
    haptic(12);
    t(850, () => {
      setStage('hover');
      playSfx('huge', state.settings.sounds);
    });
    t(1900, () => setStage('unroll'));
    t(2350, () => {
      setStage('open');
      haptic(40);
      burst({ kind: 'confetti', power: 2 });
      playSfx('income', state.settings.sounds);
      onRevealed?.(w);
    });
  };

  useEffect(() => {
    if (autoStart) t(500, () => void start());
    if (!canShake() || !motionAllowed()) return;
    return watchShake(() => void start());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => timers.current.forEach((x) => window.clearTimeout(x)), []);

  const flying = stage === 'rise' || stage === 'hover';
  const revealed = stage === 'unroll' || stage === 'open';
  return (
    <div className="relative flex select-none flex-col items-center overflow-hidden" style={{ minHeight: 620 }}>
      {/* twinkles around */}
      {['8%,12%', '88%,10%', '14%,52%', '86%,46%', '50%,4%'].map((p, i) => (
        <span key={i} className="twinkle pointer-events-none absolute text-[15px]" style={{ left: p.split(',')[0], top: p.split(',')[1], color: PERSIMMON, animationDelay: `${i * 0.35}s` }} aria-hidden="true">
          ✦
        </span>
      ))}
      {/* soft halo behind the pot */}
      {!revealed && <span className="halo pointer-events-none absolute rounded-full" style={{ left: '50%', top: 228, width: 250, height: 250, background: 'rgb(var(--accent) / .12)' }} aria-hidden="true" />}
      {/* sun rays behind the reveal */}
      {stage === 'open' && (
        <svg className="rays pointer-events-none absolute" style={{ left: '50%', top: 300, width: 560, height: 560 }} viewBox="0 0 200 200" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <path key={i} d="M100 100 L95 0 L105 0 Z" fill={PERSIMMON} opacity=".16" transform={`rotate(${i * 22.5} 100 100)`} />
          ))}
        </svg>
      )}

      <button
        type="button"
        onClick={() => void start()}
        disabled={stage !== 'idle'}
        aria-label={stage === 'idle' ? 'Shake the matka and draw a chit' : 'Drawing'}
        className={`relative mt-[96px] outline-none transition-[opacity,transform] duration-500 ${revealed ? 'scale-90 opacity-0' : 'opacity-100'}`}
      >
        <div className={stage === 'shaking' ? 'matka-shaking' : stage === 'idle' ? 'matka-idle' : ''}>
          <div className="absolute inset-x-0" style={{ top: 24, height: 52 }}>
            {peek.map(({ c, left, r, delay, h }) =>
              flying && winner?.id === c.id ? null : (
                <span key={c.id} className="chit absolute" style={{ left: `${left}%`, bottom: 0, marginLeft: -7, ['--r' as string]: r, animationDelay: delay }}>
                  <Scroll w={14} h={h} />
                </span>
              ),
            )}
          </div>
          <Pot />
        </div>
        {stage === 'shaking' &&
          [-1, 1].map((d) =>
            [0, 1, 2].map((k) => <span key={`${d}${k}`} className="puff absolute h-5 w-5 rounded-full" style={{ left: d < 0 ? 18 : 196, top: 200 + k * 10, background: TINT, ['--px' as string]: `${d * 22}px`, animationDelay: `${k * 0.18}s` }} aria-hidden="true" />),
          )}
        {flying && (
          <span className={`absolute ${stage === 'rise' ? 'scroll-rise' : 'scroll-hover'}`} style={{ left: '50%', top: 22 }} aria-hidden="true">
            <Scroll w={18} h={52} />
          </span>
        )}
      </button>

      {stage === 'idle' && (
        <div className="rise-in mt-9 text-center">
          <p className="display text-[20px]">{canShake() ? 'Shake your phone' : 'Tap the matka'}</p>
          <p className="mt-1 text-[13.5px] text-ink3">
            {canShake() ? 'or tap the matka' : 'to shake it'} · {chits.length} {chits.length === 1 ? 'chit' : 'chits'} inside
          </p>
          {error && <p className="mx-auto mt-3 max-w-[290px] rounded-2xl bg-sunk px-3.5 py-2.5 text-[13.5px] text-ink2">{error}</p>}
        </div>
      )}
      {stage === 'shaking' && <p className="mt-9 text-[15px] font-semibold text-ink2">Shaking the matka… 🫨</p>}
      {flying && (
        <p className="dot-anim mt-9 text-[15px] font-semibold text-ink2">
          And the chit says<span>.</span>
          <span>.</span>
          <span>.</span>
        </p>
      )}

      {/* The chit, unrolled */}
      {revealed && winner && (
        <div className="scroll-unroll absolute" style={{ left: '50%', top: 300, width: 276 }} role="status" aria-live="polite">
          <div className="relative px-6 pb-7 pt-8 text-center shadow-[0_18px_40px_-12px_rgba(23,20,15,.45)]" style={{ background: PAPER, color: INK, clipPath: zigzag() }}>
            <p className="text-[11px] font-bold tracking-[.18em]" style={{ fontFamily: MONO, color: DEEP }}>
              ★ CHIT · ROUND {round} OF {rounds} ★
            </p>
            <div className="mx-auto mt-4 w-fit rounded-full p-[3px]" style={{ background: PERSIMMON }}>
              <div className="rounded-full p-[3px]" style={{ background: PAPER }}>
                <PersonAvatar person={winner.person ?? { id: winner.id, name: winner.name, short: winner.name.split(' ')[0], hue: hueOf(winner.name) }} me={winner.me} size={78} />
              </div>
            </div>
            <p className="mt-3 text-[30px] font-extrabold leading-tight" style={{ fontFamily: DISPLAY }}>
              {winner.me ? 'YOU!' : winner.name.split(' ')[0]}
            </p>
            <p className="mt-1.5 text-[11.5px] font-bold tracking-[.2em]" style={{ fontFamily: MONO, color: '#6B6255' }}>
              TAKES THE POT
            </p>
            <p className="mt-1 text-[34px] font-extrabold leading-none" style={{ fontFamily: DISPLAY, color: DEEP }}>
              {rupees(pot)}
            </p>
            <div className="mx-auto mt-4 border-t-2 border-dashed" style={{ borderColor: '#E0D5C3' }} />
            <p className="mt-3 text-[10.5px] tracking-[.14em]" style={{ fontFamily: MONO, color: '#8A8073' }}>
              PULSE · {(when ?? `DRAWN ${fmtDate(state.today, true)}`).toUpperCase()}
            </p>
            {/* a little stamp */}
            <span className="absolute right-4 top-14 grid h-14 w-14 rotate-12 place-items-center rounded-full border-2 text-[9px] font-black leading-tight tracking-[.08em]" style={{ borderColor: PERSIMMON, color: PERSIMMON, fontFamily: MONO }}>
              LUCKY
              <br />
              CHIT
            </span>
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
