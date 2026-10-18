import { useState } from 'react';
import type { JailItem } from '../types';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { daysBetween, rupees } from '../lib/format';
import { JAIL_DAYS, jailFreedTotal, jailReady } from '../lib/fun';
import { Icon } from './ui/Icon';
import { MoneyInput } from './ui/bits';
import { GullakArt } from './Gullak';


/** Something you want, behind bars. */
export function JailArt({ emoji = '🛍️', size = 56, open = false }: { emoji?: string; size?: number; open?: boolean }) {
  return (
    <span className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-accent-soft" style={{ width: size, height: size }} aria-hidden="true">
      <span style={{ fontSize: size * 0.48 }}>{emoji}</span>
      {!open && (
        <span className="absolute inset-0 flex justify-evenly">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-full rounded-full bg-ink/85" style={{ width: Math.max(2.5, size / 16) }} />
          ))}
        </span>
      )}
      {!open && <span className="absolute inset-x-0 top-[18%] h-[3px] bg-ink/85" />}
    </span>
  );
}

const EMOJI = ['👟', '👗', '📱', '🎧', '💄', '🎮', '🛍️'];

export function JailForm({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const [emoji, setEmoji] = useState('👟');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const n = parseFloat(amount) || 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center text-center">
        <JailArt emoji={emoji} size={84} />
        <p className="mt-3 max-w-[300px] text-[14px] text-ink2">Want it? Lock it up for {JAIL_DAYS} days first. If you still want it after, buy it guilt-free. Most cravings don’t survive jail.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="What is it">
        {EMOJI.map((e) => (
          <button key={e} type="button" role="radio" aria-checked={emoji === e} aria-label={e} onClick={() => setEmoji(e)} className={`tap grid h-10 w-10 place-items-center rounded-xl text-[20px] ${emoji === e ? 'bg-ink' : 'bg-sunk'}`}>
            {e}
          </button>
        ))}
      </div>
      <input className="field" placeholder="What do you want? (Nike Dunks, AirPods…)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="What do you want" />
      <div className="rounded-2xl bg-sunk pb-1 pt-1">
        <MoneyInput value={amount} onChange={setAmount} label="How much is it" id="jail-amount" size="md" />
        <p className="pb-1 text-center text-[12.5px] text-ink3">how much it costs</p>
      </div>
      <button
        type="button"
        disabled={!name.trim() || !n}
        className="btn-accent w-full disabled:opacity-40"
        onClick={() => {
          store.jailAdd(name, n, emoji);
          onDone();
        }}
      >
        Lock it up 🔒
      </button>
    </div>
  );
}

function JailRow({ j }: { j: JailItem }) {
  const store = useStore();
  const { state } = store;
  const ready = jailReady(j, state.today);
  const left = Math.max(0, daysBetween(state.today, j.releaseAt));
  return (
    <li className={`rounded-2xl p-3 ${ready ? 'bg-accent-soft' : 'bg-sunk'}`}>
      <div className="flex items-center gap-3">
        <JailArt emoji={j.emoji} size={46} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{j.name}</span>
          <span className="block text-[12.5px] text-ink2">
            <span className="num">{rupees(j.amount)}</span> · {ready ? 'time’s up. Still want it?' : `out in ${left} ${left === 1 ? 'day' : 'days'}`}
          </span>
        </span>
        {!ready && (
          <button type="button" className="tap grid h-8 w-8 place-items-center rounded-full text-ink3 hover:bg-surface" aria-label={`Let ${j.name} go now`} onClick={() => store.jailDecide(j.id, 'freed')}>
            <Icon name="x" size={15} />
          </button>
        )}
      </div>
      {ready && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="btn-primary min-h-[40px] px-3 text-[13.5px]" onClick={() => store.jailDecide(j.id, 'freed')}>
            Nah, let it go 🕊️
          </button>
          <button type="button" className="btn-quiet min-h-[40px] bg-surface px-3 text-[13.5px]" onClick={() => store.jailDecide(j.id, 'bought')}>
            Still want it
          </button>
        </div>
      )}
    </li>
  );
}

/** The cart jail card: what's locked up, what's out, and what you didn't spend. */
export function CartJailCard({ home }: { home?: boolean }) {
  const { state } = useStore();
  const ui = useUI();
  const jailed = (state.jail ?? []).filter((j) => j.status === 'jailed').sort((a, b) => a.releaseAt.localeCompare(b.releaseAt));
  const ready = jailed.filter((j) => jailReady(j, state.today));
  const saved = jailFreedTotal(state);
  const freedCount = (state.jail ?? []).filter((j) => j.status === 'freed').length;
  if (home ? !ready.length : !jailed.length && !freedCount) return null;
  const list = home ? ready : jailed;
  return (
    <section className="rounded-3xl border border-line bg-surface p-4" aria-label="Cart jail">
      <div className="flex items-center justify-between gap-2">
        <h2 className="display text-[17px]">Cart jail 🔒</h2>
        {!home && (
          <button type="button" className="chip min-h-[32px] px-3 text-[13px]" onClick={() => ui.openSheet({ type: 'jail-form' })}>
            <Icon name="plus" size={14} /> Lock up
          </button>
        )}
      </div>
      {saved > 0 && (
        <p className="mt-1 text-[13.5px] text-ink2">
          <span className="num font-semibold text-pos">{rupees(saved)}</span> not spent · {freedCount} {freedCount === 1 ? 'craving' : 'cravings'} didn’t survive jail
        </p>
      )}
      {list.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {list.map((j) => (
            <JailRow key={j.id} j={j} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13.5px] text-ink3">Nothing locked up. Next time you’re about to tap Buy now, lock it up here first.</p>
      )}
    </section>
  );
}

/** Plans tab: the two little challenges, as tiles. */
export function ChallengeTiles() {
  const { state } = useStore();
  const ui = useUI();
  const jailed = (state.jail ?? []).filter((j) => j.status === 'jailed').length;
  return (
    <section aria-label="Challenges" className="grid grid-cols-2 gap-3">
      <button type="button" onClick={() => ui.openSheet({ type: 'gullak-form' })} className="tap relative overflow-hidden rounded-3xl border border-line bg-surface p-4 text-left">
        <span className="absolute -bottom-3 -right-3 opacity-95">
          <GullakArt level={0.5} size={86} />
        </span>
        <span className="display block text-[16px]">Gullak</span>
        <span className="mt-1 block max-w-[62%] text-[12.5px] leading-snug text-ink2">A coin a day. Break it at the end.</span>
      </button>
      <button type="button" onClick={() => ui.openSheet({ type: 'jail-form' })} className="tap relative overflow-hidden rounded-3xl border border-line bg-surface p-4 text-left">
        <span className="absolute -bottom-1 -right-1 rotate-6">
          <JailArt emoji="🛍️" size={66} />
        </span>
        <span className="display block text-[16px]">Cart jail</span>
        <span className="mt-1 block max-w-[62%] text-[12.5px] leading-snug text-ink2">{jailed ? `${jailed} locked up right now.` : `Lock it up ${JAIL_DAYS} days before you buy.`}</span>
      </button>
    </section>
  );
}
