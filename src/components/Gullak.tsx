import { useState } from 'react';
import type { Plan } from '../types';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { burst } from '../lib/celebrate';
import { addDays, haptic, rupees } from '../lib/format';
import { playSfx } from '../lib/sfx';
import { gullakFull, gullakTarget, nextCoin } from '../lib/fun';
import { Segmented } from './ui/bits';
import { Icon } from './ui/Icon';

const INK = '#17140F';
const PAPER = '#FFFBF4';
const PERSIMMON = '#EC5B2B';
const DEEP = '#AD431F';

/** A clay gullak. `level` (0..1) is how full it looks: coins stack up inside a little window. */
export function GullakArt({ level = 0, size = 180, broken = false }: { level?: number; size?: number; broken?: boolean }) {
  const top = 176 - Math.max(0, Math.min(1, level)) * 116;
  const id = `g${size}`;
  if (broken)
    return (
      <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
        <ellipse cx="100" cy="186" rx="64" ry="7" fill={INK} opacity=".12" />
        <path d="M40 150 L58 120 L74 138 L92 112 L106 136 L124 110 L140 134 L160 118 L164 160 C150 182 50 182 36 160 Z" fill={PERSIMMON} />
        <path d="M44 156 C60 176 140 176 158 156" stroke={DEEP} strokeWidth="5" fill="none" />
        {[60, 82, 104, 126, 146].map((x, i) => (
          <g key={x} transform={`translate(${x} ${148 - (i % 2) * 10})`}>
            <circle r="9" fill={PAPER} stroke={DEEP} strokeWidth="2" />
            <text y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill={DEEP}>
              ₹
            </text>
          </g>
        ))}
      </svg>
    );
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
      <ellipse cx="100" cy="186" rx="64" ry="7" fill={INK} opacity=".12" />
      <defs>
        <clipPath id={`${id}-body`}>
          <ellipse cx="100" cy="116" rx="72" ry="66" />
        </clipPath>
      </defs>
      <ellipse cx="100" cy="178" rx="30" ry="8" fill={DEEP} />
      <ellipse cx="100" cy="116" rx="72" ry="66" fill={PERSIMMON} />
      <g clipPath={`url(#${id}-body)`}>
        <path d="M150 60 C180 90 182 150 150 180 L200 200 L200 40 Z" fill={DEEP} opacity=".45" />
        {/* The window of coins */}
        <rect x="0" y={top} width="200" height="200" fill={DEEP} opacity=".85" />
        {level > 0 &&
          Array.from({ length: 18 }, (_, i) => {
            const x = 40 + (i % 6) * 24 + (Math.floor(i / 6) % 2) * 12;
            const y = 170 - Math.floor(i / 6) * 18;
            return y > top - 4 ? <circle key={i} cx={x} cy={y} r="8" fill={PAPER} opacity=".9" /> : null;
          })}
        <rect x="0" y="104" width="200" height="5" fill={PAPER} opacity=".9" />
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} cx={30 + i * 13} cy="118" r="2.4" fill={PAPER} opacity=".9" />
        ))}
      </g>
      <path d="M52 92 C56 76 68 64 84 58" stroke={PAPER} strokeWidth="6" strokeLinecap="round" fill="none" opacity=".45" />
      <circle cx="100" cy="50" r="12" fill={DEEP} />
      <rect x="80" y="66" width="40" height="8" rx="4" fill={INK} />
    </svg>
  );
}

// ------------------------------------------------------------------
// Start one
// ------------------------------------------------------------------
const DAYS = [7, 30, 52, 100];

export function GullakForm({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const ui = useUI();
  const [mode, setMode] = useState<'fixed' | 'rising'>('rising');
  const [step, setStep] = useState('10');
  const [days, setDays] = useState(30);
  const [name, setName] = useState('Gullak');
  const n = parseFloat(step) || 0;
  const target = gullakTarget({ mode, step: n, days });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center">
        <GullakArt level={0.35} size={130} />
        <p className="display mt-1 text-[24px] leading-tight">{rupees(target)}</p>
        <p className="text-[13.5px] text-ink2">in {days} days, one coin a day</p>
      </div>
      <Segmented
        label="How it grows"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'rising', label: 'Goes up daily' },
          { value: 'fixed', label: 'Same every day' },
        ]}
      />
      <p className="-mt-2 text-center text-[13px] text-ink3">{mode === 'rising' ? `Day 1: ${rupees(n)}, day 2: ${rupees(n * 2)}, day 3: ${rupees(n * 3)}… small start, big finish.` : `${rupees(n)} every single day. Easy to keep up.`}</p>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-sunk px-4 py-3">
        <span className="text-[14.5px] font-semibold">{mode === 'rising' ? 'Start with' : 'Every day'}</span>
        <span className="flex items-center gap-1">
          <span className="text-ink3">₹</span>
          <input inputMode="decimal" className="num w-20 bg-transparent text-right text-[20px] font-bold outline-none" value={step} onChange={(e) => setStep(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Coin amount" />
        </span>
      </label>
      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink2">For how long?</p>
        <div className="flex gap-2">
          {DAYS.map((d) => (
            <button key={d} type="button" className="chip flex-1 justify-center" aria-pressed={days === d} onClick={() => setDays(d)}>
              {d} days
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Name it</span>
        <input className="field" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        type="button"
        disabled={!n || !name.trim()}
        className="btn-accent w-full disabled:opacity-40"
        onClick={() => {
          const id = store.startGullak({ name: name.trim(), mode, step: n, days, target });
          onDone();
          ui.push({ name: 'plan', id });
        }}
      >
        Start the gullak 🏺
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// The gullak on its plan screen
// ------------------------------------------------------------------
export function GullakHero({ plan }: { plan: Plan }) {
  const store = useStore();
  const { state } = store;
  const g = plan.gullak!;
  const [drop, setDrop] = useState(0);
  const [breaking, setBreaking] = useState(false);
  const full = gullakFull(g) || plan.saved >= plan.target;
  const today = g.drops.includes(state.today);
  const coin = nextCoin(g);
  const level = plan.target ? plan.saved / plan.target : 0;
  const days = Array.from({ length: g.days }, (_, i) => i);
  // Days in a row, ending today or yesterday.
  const run = (() => {
    const set = new Set(g.drops);
    let d = set.has(state.today) ? state.today : addDays(state.today, -1);
    let n = 0;
    while (set.has(d) && n < 400) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  })();

  const dropIt = () => {
    const c = store.dropCoin(plan.id);
    if (!c) return;
    setDrop((x) => x + 1);
    playSfx('expense', state.settings.sounds);
    window.setTimeout(() => burst({ kind: 'coins', power: 0.7 }), 650);
    const n = g.drops.length + 1;
    store.toast({ text: n >= g.days ? 'Last coin in. Time to break it 🔨' : `Day ${n} done. ${rupees(c)} in the gullak.`, tone: 'good' });
  };
  const smash = () => {
    setBreaking(true);
    haptic(40);
    playSfx('huge', state.settings.sounds);
    window.setTimeout(() => {
      burst({ kind: 'confetti', power: 2 });
      store.breakGullak(plan.id);
      store.toast({ text: `Gullak broken. ${rupees(plan.saved)} saved, one coin at a time.`, tone: 'good', emoji: '🏺' });
    }, 700);
  };

  return (
    <section className="rounded-3xl border border-line bg-surface p-5" aria-label="Gullak">
      <div className="relative mx-auto flex w-fit flex-col items-center">
        {drop > 0 && (
          <span key={drop} className="coin-drop absolute left-1/2 top-6 z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-[13px] font-bold" style={{ background: PAPER, borderColor: DEEP, color: DEEP }} aria-hidden="true">
            ₹
          </span>
        )}
        <div key={`w${drop}`} className={drop ? 'gullak-wiggle' : ''}>
          {breaking && !g.broken ? (
            <div className="relative">
              <GullakArt level={level} size={190} />
              {Array.from({ length: 10 }, (_, i) => {
                const a = (i / 10) * Math.PI * 2;
                return <span key={i} className="shard absolute left-1/2 top-1/2 h-5 w-4" style={{ background: i % 2 ? PERSIMMON : DEEP, clipPath: 'polygon(50% 0, 100% 100%, 0 80%)', ['--dx' as string]: `${Math.cos(a) * 140}px`, ['--dy' as string]: `${Math.sin(a) * 140}px`, ['--rot' as string]: `${i * 70}deg` }} />;
              })}
            </div>
          ) : (
            <GullakArt level={level} size={190} broken={g.broken} />
          )}
        </div>
      </div>
      <div className="mt-2 text-center">
        {run > 1 && !g.broken && <p className="pop-in mx-auto mb-2 w-fit rounded-full bg-accent-soft px-3 py-1 text-[12.5px] font-bold text-accent-ink">🔥 {run} days in a row</p>}
        <p className="num-hero text-[36px] leading-none">{rupees(plan.saved)}</p>
        <p className="num mt-1 text-[14px] text-ink3">
          of {rupees(plan.target)} · day {Math.min(g.drops.length, g.days)} of {g.days}
        </p>
      </div>

      {/* One dot per day */}
      <div className="mx-auto mt-4 grid max-w-[340px] gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(10, g.days)}, minmax(0, 1fr))` }} aria-label={`${g.drops.length} of ${g.days} coins in`}>
        {days.map((i) => (
          <span key={i} className={`grid aspect-square place-items-center rounded-full text-[10px] font-bold ${i < g.drops.length ? 'bg-accent text-[#17140F] shadow-[inset_0_-2px_0_rgba(23,20,15,.25)]' : i === g.drops.length && !today && !full ? 'border-2 border-dashed border-accent text-accent-ink' : 'bg-sunk text-ink3/50'}`}>
            {i < g.drops.length ? '₹' : i + 1}
          </span>
        ))}
      </div>

      <div className="mt-5">
        {g.broken ? (
          <p className="rounded-2xl bg-accent-soft p-3 text-center text-[14px] font-medium">Broken and banked. The money’s in this plan: take it out or start a new gullak.</p>
        ) : full ? (
          <button type="button" className="btn-accent w-full" onClick={smash} disabled={breaking}>
            Break the gullak 🔨
          </button>
        ) : today ? (
          <p className="rounded-2xl bg-sunk p-3 text-center text-[14px]">
            Today’s coin is in. Tomorrow: <span className="num font-semibold">{rupees(coin)}</span>
            {g.mode === 'rising' ? ' (it goes up every day)' : ''}.
          </p>
        ) : (
          <button type="button" className="btn-accent w-full" onClick={dropIt}>
            Drop today’s {rupees(coin)} coin
          </button>
        )}
        {!g.broken && !full && <p className="mt-2 text-center text-[12.5px] text-ink3">Ends around {new Date(addDays(plan.startDate, g.days) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Missed a day? No stress, just drop the next coin.</p>}
      </div>
    </section>
  );
}

/** Plans list: a gullak with today's coin button right there. */
export function GullakCard({ plan }: { plan: Plan }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const g = plan.gullak!;
  const today = g.drops.includes(state.today);
  const full = gullakFull(g) || plan.saved >= plan.target;
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-3.5">
      <button type="button" className="tap flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => ui.push({ name: 'plan', id: plan.id })}>
        <span className="shrink-0">
          <GullakArt level={plan.target ? plan.saved / plan.target : 0} size={56} broken={g.broken} />
        </span>
        <span className="min-w-0">
          <span className="display block truncate text-[16px]">{plan.name}</span>
          <span className="num block text-[13px] text-ink2">
            {rupees(plan.saved)} of {rupees(plan.target)} · day {Math.min(g.drops.length, g.days)}/{g.days}
          </span>
        </span>
      </button>
      {!g.broken &&
        (full ? (
          <button type="button" className="btn-primary min-h-[38px] shrink-0 px-3.5 text-[13.5px]" onClick={() => ui.push({ name: 'plan', id: plan.id })}>
            Break it 🔨
          </button>
        ) : today ? (
          <span className="shrink-0 rounded-full bg-pos/12 px-3 py-1.5 text-[12.5px] font-semibold text-pos">Done today ✓</span>
        ) : (
          <button
            type="button"
            className="btn-accent min-h-[38px] shrink-0 px-3.5 text-[13.5px]"
            onClick={() => {
              const c = store.dropCoin(plan.id);
              if (c) {
                playSfx('expense', state.settings.sounds);
                burst({ kind: 'coins', power: 0.6 });
                store.toast({ text: `${rupees(c)} in. Day ${g.drops.length + 1} done.`, tone: 'good', emoji: '🏺' });
              }
            }}
          >
            + {rupees(nextCoin(g))}
          </button>
        ))}
    </div>
  );
}

/** Plans tab: start a gullak. */
export function GullakBanner() {
  const ui = useUI();
  return (
    <button type="button" onClick={() => ui.openSheet({ type: 'gullak-form' })} className="tap relative flex w-full items-center gap-4 overflow-hidden rounded-3xl border border-line bg-surface p-4 text-left">
      <span className="shrink-0">
        <GullakArt level={0.55} size={78} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-bold tracking-[.16em] text-accent-ink">CHALLENGE</span>
        <span className="display block text-[18px] leading-tight">Gullak</span>
        <span className="mt-0.5 block text-[13px] text-ink2">A coin a day: ₹10, ₹20, ₹30… Break it at the end 🔨</span>
      </span>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-[#17140F]" aria-hidden="true">
        <Icon name="plus" size={18} />
      </span>
    </button>
  );
}
