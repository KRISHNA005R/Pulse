import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { burst } from '../lib/celebrate';
import { haptic, rupees } from '../lib/format';
import { ALL, LEVELS, skipNudge, skipStatus, skipSuggestions, type DayKind } from '../lib/skip';
import { Icon } from './ui/Icon';

const DAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function Dot({ kind, label }: { kind: DayKind; label: string }) {
  const base = 'grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold';
  const look: Record<DayKind, string> = {
    clean: 'bg-accent text-[#17140F]',
    freed: 'bg-[rgb(var(--accent)/0.18)] text-accent-ink',
    slip: 'border-2 border-neg/50 text-neg',
    missed: 'border-2 border-dashed border-line text-ink3',
    today: 'border-2 border-dashed border-accent text-accent-ink',
    future: 'bg-sunk text-ink3/60',
    off: 'bg-sunk/60 text-ink3/40',
  };
  return (
    <span className="flex flex-col items-center gap-1">
      <span className={`${base} ${look[kind]}`} aria-hidden="true">
        {kind === 'clean' ? <Icon name="check" size={15} strokeWidth={2.6} /> : kind === 'freed' ? '🧊' : kind === 'slip' ? <Icon name="x" size={13} strokeWidth={2.6} /> : ''}
      </span>
      <span className="text-[11px] font-semibold text-ink3">{label}</span>
    </span>
  );
}

const what = (cats: string[], names: (id: string) => string) => (cats.includes(ALL) ? 'all everyday spending' : cats.map(names).join(' · '));

/** Home: the running skip streak. */
export function SkipCard() {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const st = useMemo(() => skipStatus(state), [state]);
  const sk = state.skip;

  // A new level gets one moment.
  useEffect(() => {
    if (!st?.level || !sk || st.level.at <= sk.cheered) return;
    const lv = st.level;
    const id = window.setTimeout(() => {
      haptic(22);
      burst({ kind: 'confetti', power: 1.2 });
      store.toast({ text: `${lv.name} unlocked. ${st.count} days without ${sk.cats.includes(ALL) ? 'spending' : 'slipping'}.`, tone: 'good', emoji: lv.emoji });
      store.skipCheer(lv.at);
    }, 500);
    return () => window.clearTimeout(id);
  }, [st?.level?.at, sk?.cheered]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!st || !sk) return null;
  const names = (id: string) => {
    const c = state.categories.find((x) => x.id === id);
    return c ? `${c.emoji ?? ''} ${c.name}`.trim() : id;
  };
  const plan = state.plans.find((p) => p.status === 'active');
  const line =
    st.today === 'clean'
      ? 'Today counts. See you tomorrow.'
      : st.today === 'freed'
        ? 'Free slip used this week. Streak’s safe.'
        : st.today === 'broke'
          ? 'Streak reset. Day one starts tomorrow. No stress.'
          : st.today === 'early'
            ? 'Already had some today. Your streak starts tomorrow.'
          : st.count
            ? 'Didn’t give in today? Tap to count it.'
            : 'Your streak starts the first day you skip.';
  const share = async () => {
    const text = `${st.count} days without ${sk.cats.includes(ALL) ? 'spending a rupee on extras' : sk.cats.map((c) => state.categories.find((x) => x.id === c)?.name ?? c).join(' & ')}${st.saved ? `. ₹${Math.round(st.saved).toLocaleString('en-IN')} not spent` : ''}. Tracking it on PULSE.`;
    try {
      if (navigator.share) await navigator.share({ text, url: location.origin });
      else {
        await navigator.clipboard.writeText(`${text} ${location.origin}`);
        store.toast({ text: 'Copied. Paste it in your story or chat.' });
      }
    } catch {
      /* closed the share sheet */
    }
  };

  return (
    <section aria-label="Skip streak" className="rounded-3xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="tap -m-1 min-w-0 rounded-xl p-1 text-left" onClick={() => ui.openSheet({ type: 'skip' })}>
          <span className="block text-[13px] font-semibold text-ink3">Skip streak</span>
          <span className="mt-1 flex items-baseline gap-2">
            <span className="num-hero text-[40px] leading-none">{st.count}</span>
            <span className="display text-[18px]">{st.count === 1 ? 'day' : 'days'}</span>
          </span>
          <span className="mt-1.5 block truncate text-[13px] text-ink2">Skipping {what(sk.cats, names)}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {st.level && (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-semibold text-accent-ink">
              {st.level.emoji} {st.level.name}
            </span>
          )}
          {st.count >= 3 && (
            <button type="button" className="tap grid h-9 w-9 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label="Share your skip streak" onClick={share}>
              <Icon name="share" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-between" aria-label="This week">
        {st.week.map((d, i) => (
          <Dot key={d.date} kind={d.kind} label={DAY[i]} />
        ))}
      </div>

      {st.saved >= 1 && (
        <p className="mt-4 rounded-2xl bg-sunk px-3.5 py-2.5 text-[14px]">
          <span className="num font-semibold">{rupees(st.saved)}</span> not spent vs your usual
          {st.available < st.saved ? <span className="text-ink3"> · {rupees(st.saved - st.available)} moved</span> : null}
        </p>
      )}

      <p className="mt-3 text-[13.5px] text-ink2">
        {line}
        {st.next && st.count > 0 && st.today !== 'broke' && st.today !== 'early' ? ` ${st.next.at - st.count} to ${st.next.name}.` : ''}
      </p>

      {(st.today === 'pending' || (plan && st.available >= 1)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {st.today === 'pending' && (
            <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={store.skipCheckin}>
              <Icon name="check" size={16} /> Skipped it today
            </button>
          )}
          {plan && st.available >= 1 && (
            <button type="button" className="btn-quiet min-h-[40px] px-4 text-[14px]" onClick={() => ui.openSheet({ type: 'contribute', planId: plan.id, amount: Math.floor(st.available), fromSkip: true })}>
              Move {rupees(Math.floor(st.available))} to {plan.icon} {plan.name}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Home: a one-time nudge when delivery or food orders keep coming. */
export function SkipPromo() {
  const { state, updateSettings } = useStore();
  const ui = useUI();
  const n = useMemo(() => skipNudge(state), [state]);
  if (!n || state.mode !== 'personal') return null;
  const c = state.categories.find((x) => x.id === n.cat);
  return (
    <section aria-label="Try a skip streak" className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-[22px]" aria-hidden="true">
        {c?.emoji ?? '🛵'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-tight">
          {n.times} {c?.name ?? 'orders'} in 2 weeks. Bet you can’t skip it for 3 days.
        </p>
        <p className="mt-0.5 text-[13px] text-ink3">Start a skip streak. See what you don’t spend.</p>
        <button type="button" className="btn-primary mt-3 min-h-[38px] px-4 text-[14px]" onClick={() => ui.openSheet({ type: 'skip', preset: n.cat })}>
          I’m in
        </button>
      </div>
      <button type="button" className="tap -mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label="Not now" onClick={() => updateSettings({ skipPromoHidden: true })}>
        <Icon name="x" size={16} />
      </button>
    </section>
  );
}

/** Sheet: pick what to skip (up to 3, or everything), or stop. */
export function SkipSetup({ preset, onDone }: { preset?: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const sk = state.skip;
  const [cats, setCats] = useState<string[]>(sk?.cats ?? (preset ? [preset] : []));
  const sugg = useMemo(() => skipSuggestions(state), [state]);
  const [more, setMore] = useState(false);
  const shown = more ? sugg : sugg.filter((x, i) => i < 6 || cats.includes(x.cat.id));
  const all = cats.includes(ALL);
  const changed = !sk || sk.cats.slice().sort().join() !== cats.slice().sort().join();
  const toggle = (id: string) => {
    if (id === ALL) return setCats(all ? [] : [ALL]);
    const base = cats.filter((c) => c !== ALL);
    setCats(base.includes(id) ? base.filter((c) => c !== id) : base.length >= 3 ? base : [...base, id]);
  };
  return (
    <div>
      <p className="text-[14.5px] text-ink2">Pick your weakness. Every day you don’t spend on it, the streak grows. One slip a week is free.</p>

      <button type="button" aria-pressed={all} onClick={() => toggle(ALL)} className={`tap mt-4 flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${all ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
        <span className="text-[22px]" aria-hidden="true">
          🚫
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Everything · no-spend</span>
          <span className="block text-[12.5px] text-ink3">No everyday spending at all. Rent, bills and auto-debits don’t count.</span>
        </span>
        {all && <Icon name="check" size={18} className="text-accent-ink" />}
      </button>

      <p className="mb-2 mt-5 text-[13px] font-semibold text-ink2">Or pick up to 3</p>
      <div className={`flex flex-wrap gap-2 ${all ? 'pointer-events-none opacity-40' : ''}`}>
        {shown.map(({ cat, times }) => (
          <button key={cat.id} type="button" className="chip" aria-pressed={cats.includes(cat.id)} onClick={() => toggle(cat.id)}>
            <span aria-hidden="true">{cat.emoji}</span> {cat.name}
            {times > 0 && <span className="text-ink3"> · {times}×</span>}
          </button>
        ))}
        {!more && sugg.length > shown.length && (
          <button type="button" className="chip text-ink3" onClick={() => setMore(true)}>
            More…
          </button>
        )}
      </div>
      <p className="mt-2 text-[12.5px] text-ink3">The number is how often you spent on it in the last 30 days.</p>

      <div className="mt-5 rounded-2xl bg-sunk p-3.5 text-[13px] text-ink2">
        <p className="font-semibold text-ink">Levels</p>
        <p className="mt-1">{LEVELS.map((l) => `${l.emoji} ${l.name} · ${l.at}d`).join('   ')}</p>
      </div>

      <button
        type="button"
        disabled={!cats.length || !changed}
        className="btn-accent mt-5 w-full disabled:opacity-40"
        onClick={() => {
          store.startSkip(cats);
          store.toast({ text: sk ? 'New picks saved. Fresh streak from today.' : 'Skip streak on. Day one starts now.', tone: 'good', emoji: '🔥' });
          onDone();
        }}
      >
        {sk ? (changed ? 'Save · starts a new streak' : 'Saved') : 'Start skip streak'}
      </button>
      {sk && (
        <button
          type="button"
          className="btn-ghost mt-2 w-full text-neg"
          onClick={() => {
            store.stopSkip();
            onDone();
          }}
        >
          Stop skip streak
        </button>
      )}
    </div>
  );
}
