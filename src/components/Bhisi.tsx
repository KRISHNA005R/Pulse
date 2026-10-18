import { useMemo, useState } from 'react';
import type { Bhisi } from '../types';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { addMonths, fmtDate, relDay, rupees } from '../lib/format';
import { roundMoney } from '../lib/currency';
import { currentRound, inBowl, isDone, myStanding, pot, replayUrl, type DrawReplay } from '../lib/bhisi';
import { Icon } from './ui/Icon';
import { Field, MoneyInput, PersonAvatar, TopNavigation } from './ui/bits';
import { PeoplePicker } from './People';
import { MatkaDraw, type Chit } from './Matka';

const EMOJI = ['🏺', '💰', '🪙', '🎰', '🏠', '🎉', '🍜', '✨'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (d: string) => MON[Number(d.slice(5, 7)) - 1];

function useNames() {
  const { state } = useStore();
  return (id: string) => (id === 'me' ? 'You' : state.people.find((p) => p.id === id)?.short ?? 'Someone');
}

/** Small matka for empty states and cards. */
function MiniPot({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M25 22 C15 25 9 34 10 42 C11 53 21 60 32 60 C43 60 53 53 54 42 C55 34 49 25 39 22 Z" fill="#EC5B2B" />
      <rect x="10" y="36" width="44" height="7" fill="#FFFBF4" />
      <path d="M24 23 L26 16 L38 16 L40 23 Z" fill="#AD431F" />
      <ellipse cx="32" cy="16" rx="9.5" ry="3" fill="#EC5B2B" />
      <ellipse cx="32" cy="16" rx="7" ry="2" fill="#17140F" />
      <rect x="27" y="6" width="4" height="10" rx="1.5" fill="#FFFBF4" transform="rotate(-12 29 11)" />
      <rect x="33" y="5" width="4" height="11" rx="1.5" fill="#FFFBF4" transform="rotate(10 35 10)" />
    </svg>
  );
}

// ------------------------------------------------------------------
// Plans → Bhisi
// ------------------------------------------------------------------
export function BhisiList() {
  const { state } = useStore();
  const ui = useUI();
  const list = state.bhisis ?? [];
  if (!list.length)
    return (
      <section className="overflow-hidden rounded-3xl border border-line bg-surface p-6 text-center">
        <div className="mx-auto w-fit">
          <MiniPot size={88} />
        </div>
        <h2 className="display mt-3 text-[22px] leading-tight">Bhisi, but make it digital</h2>
        <p className="mx-auto mt-2 max-w-[300px] text-[14px] text-ink2">Your gang chips in every month. A lucky chit picks who takes the whole pot. Everyone wins once.</p>
        <ol className="mx-auto mt-5 flex max-w-[340px] flex-col gap-2 text-left">
          {[
            ['💸', 'Everyone puts in the same amount monthly'],
            ['🏺', 'Shake the matka, one chit comes out'],
            ['🏆', 'That person takes the pot. Next month, again'],
          ].map(([e, t], i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl bg-sunk px-3.5 py-2.5 text-[14px]">
              <span className="text-[18px]" aria-hidden="true">
                {e}
              </span>
              {t}
            </li>
          ))}
        </ol>
        <button type="button" className="btn-accent mt-5 w-full" onClick={() => ui.openSheet({ type: 'bhisi-form' })}>
          <Icon name="plus" size={17} className="shrink-0" /> Start a bhisi
        </button>
        <p className="mt-3 text-[12px] text-ink3">PULSE only keeps track. It never holds or moves your money.</p>
      </section>
    );
  return (
    <div className="flex flex-col gap-3">
      {list.map((b) => (
        <BhisiCard key={b.id} b={b} />
      ))}
    </div>
  );
}

function BhisiCard({ b }: { b: Bhisi }) {
  const { state } = useStore();
  const ui = useUI();
  const i = currentRound(b);
  const r = i === undefined ? undefined : b.rounds[i];
  const bowl = inBowl(b);
  return (
    <button type="button" onClick={() => ui.push({ name: 'bhisi', id: b.id })} className="tap w-full rounded-3xl border border-line bg-surface p-4 text-left hover:border-ink3/40">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-[24px]" aria-hidden="true">
          {b.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="display block truncate text-[17px]">{b.name}</span>
          <span className="num block text-[13.5px] text-ink2">
            {rupees(pot(b))} pot · {i === undefined ? 'all rounds done' : `round ${i + 1} of ${b.rounds.length}`}
          </span>
        </span>
        {r && <span className="shrink-0 rounded-full bg-sunk px-2.5 py-1 text-[12px] font-semibold">Draw {relDay(r.date, state.today).toLowerCase()}</span>}
      </div>
      {r ? (
        <>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-sunk">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(r.paid.length / b.members.length) * 100}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[12.5px] text-ink3">
            <span>
              {r.paid.length}/{b.members.length} paid
            </span>
            <span>{bowl.length} chits in the matka</span>
          </div>
        </>
      ) : (
        <p className="mt-3 text-[13.5px] font-semibold text-pos">Everyone got their turn 🎉</p>
      )}
    </button>
  );
}

// ------------------------------------------------------------------
// New bhisi
// ------------------------------------------------------------------
export function BhisiForm({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const [emoji, setEmoji] = useState('🏺');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [start, setStart] = useState(state.today);
  const n = people.length + 1;
  const amt = parseFloat(amount) || 0;
  const valid = name.trim() && amt > 0 && people.length >= 1 && start;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
        {EMOJI.map((e) => (
          <button key={e} type="button" role="radio" aria-checked={emoji === e} aria-label={e} onClick={() => setEmoji(e)} className={`tap grid h-10 w-10 place-items-center rounded-xl text-[20px] ${emoji === e ? 'bg-ink' : 'bg-sunk'}`}>
            {e}
          </button>
        ))}
      </div>
      <Field label="Name" htmlFor="bh-name">
        <input id="bh-name" className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Hostel gang BC" />
      </Field>
      <div className="rounded-2xl bg-sunk pb-1 pt-2">
        <MoneyInput value={amount} onChange={setAmount} label="Each person puts in, every month" id="bh-amount" />
        <p className="-mt-1 text-center text-[13px] text-ink3">each person, every month</p>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink2">Who’s in? (you’re in already)</p>
        <PeoplePicker selected={people} onChange={setPeople} inputId="bh-people" />
      </div>
      <Field label="First draw" htmlFor="bh-start" hint="Then the same date every month.">
        <input id="bh-start" type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      {amt > 0 && people.length > 0 && (
        <div className="rounded-2xl bg-accent-soft p-4 text-[14.5px]">
          <p className="display text-[22px] leading-tight">{rupees(roundMoney(amt * n))} pot</p>
          <p className="mt-1">
            {n} people × {rupees(amt)}, every month for {n} months. Last draw {fmtDate(addMonths(start, n - 1), true)}.
          </p>
        </div>
      )}
      <button
        type="button"
        disabled={!valid}
        className="btn-accent w-full disabled:opacity-40"
        onClick={() => {
          const id = store.createBhisi({ name: name.trim(), emoji, amount: amt, members: ['me', ...people], start });
          onDone();
          ui.push({ name: 'bhisi', id });
        }}
      >
        Start bhisi
      </button>
      <p className="-mt-1 text-center text-[12px] text-ink3">PULSE keeps track of who paid and who won. It never holds or moves money.</p>
    </div>
  );
}

// ------------------------------------------------------------------
// One bhisi
// ------------------------------------------------------------------
export function BhisiDetail({ id }: { id: string }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const name = useNames();
  const b = state.bhisis?.find((x) => x.id === id);
  if (!b)
    return (
      <div>
        <TopNavigation title="Bhisi" onBack={ui.pop} />
        <p className="text-ink3">This bhisi was deleted.</p>
      </div>
    );
  const i = currentRound(b);
  const r = i === undefined ? undefined : b.rounds[i];
  const bowl = inBowl(b);
  const unpaid = r ? b.members.filter((m) => !r.paid.includes(m)) : [];
  const me = myStanding(b);
  const nudge = r && unpaid.some((m) => m !== 'me') ? `https://wa.me/?text=${encodeURIComponent(`Bhisi reminder 🏺 ${b.name}: ${rupees(b.amount)} for round ${(i ?? 0) + 1}. Draw on ${fmtDate(r.date, true)}. Pay up, bestie 🙏`)}` : '';

  return (
    <div>
      <TopNavigation title={`${b.name} ${b.emoji}`} onBack={ui.pop} />

      {/* Hero: always ink, like a ticket booth */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 p-5 text-[#FFFBF4]" style={{ background: '#17140F' }} aria-label="This round">
        <div className="pointer-events-none absolute -right-3 top-1 opacity-95">
          <MiniPot size={120} />
        </div>
        <p className="text-[12.5px] font-semibold uppercase tracking-[.14em] text-[#FFFBF4]/60">{r ? `Round ${(i ?? 0) + 1} of ${b.rounds.length}` : 'Complete'}</p>
        <p className="num-hero mt-2 text-[40px] leading-none">{rupees(pot(b))}</p>
        <p className="mt-1.5 text-[14px] text-[#FFFBF4]/75">{r ? `in the pot · draw ${relDay(r.date, state.today).toLowerCase()}` : 'Everyone got their turn. Iconic.'}</p>
        {r && (
          <>
            <button type="button" className="btn mt-5 w-full bg-[#EC5B2B] text-[#17140F]" onClick={() => ui.openSheet({ type: 'bhisi-draw', bhisiId: b.id })}>
              Draw the chitti 🤞
            </button>
            {unpaid.length > 0 && (
              <p className="mt-2 text-center text-[12.5px] text-[#FFFBF4]/60">
                {unpaid.length} still to pay · you can draw anyway
              </p>
            )}
          </>
        )}
      </section>

      {/* Rounds strip */}
      <section className="mt-5" aria-label="Rounds">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {b.rounds.map((x, k) => {
            const now = k === i;
            return (
              <div key={k} className={`flex w-[68px] shrink-0 flex-col items-center rounded-2xl border px-1 py-2.5 ${now ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                <span className="text-[11px] font-semibold uppercase text-ink3">{month(x.date)}</span>
                <span className="mt-1.5">
                  {x.winner ? (
                    <PersonAvatar person={state.people.find((p) => p.id === x.winner)} me={x.winner === 'me'} size={34} />
                  ) : (
                    <span className={`grid h-[34px] w-[34px] place-items-center rounded-full text-[15px] font-bold ${now ? 'animate-ring bg-accent text-[#17140F]' : 'border border-dashed border-line text-ink3'}`}>?</span>
                  )}
                </span>
                <span className="mt-1 max-w-full truncate text-[11.5px] font-semibold">{x.winner ? name(x.winner) : now ? 'Next' : `#${k + 1}`}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Who's paid */}
      {r && (
        <section className="mt-5 rounded-3xl border border-line bg-surface p-4" aria-labelledby="bh-paid">
          <div className="flex items-center justify-between">
            <h2 id="bh-paid" className="text-[15px] font-semibold">
              Who’s paid · {month(r.date)}
            </h2>
            <span className="num text-[13px] font-semibold text-ink3">
              {r.paid.length}/{b.members.length}
            </span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-sunk">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(r.paid.length / b.members.length) * 100}%` }} />
          </div>
          <ul className="mt-2 flex flex-col">
            {b.members.map((m) => {
              const paid = r.paid.includes(m);
              return (
                <li key={m} className="flex items-center gap-3 py-2">
                  <PersonAvatar person={state.people.find((p) => p.id === m)} me={m === 'me'} size={34} />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{name(m)}</span>
                  <button
                    type="button"
                    aria-pressed={paid}
                    onClick={() => store.toggleBhisiPaid(b.id, i!, m)}
                    className={`tap min-h-[34px] rounded-full px-3.5 text-[13px] font-semibold ${paid ? 'bg-pos/12 text-pos' : 'border border-line text-ink2'}`}
                  >
                    {paid ? 'Paid ✓' : m === 'me' ? `I paid ${rupees(b.amount)}` : 'Mark paid'}
                  </button>
                </li>
              );
            })}
          </ul>
          {nudge && (
            <a href={nudge} target="_blank" rel="noreferrer" className="btn-quiet mt-2 w-full">
              <Icon name="send" size={16} /> Nudge on WhatsApp
            </a>
          )}
        </section>
      )}

      {/* Still in the matka */}
      {bowl.length > 0 && (
        <section className="mt-4 rounded-3xl border border-line bg-surface p-4" aria-labelledby="bh-bowl">
          <h2 id="bh-bowl" className="text-[15px] font-semibold">
            Still in the matka · {bowl.length}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {bowl.map((m) => (
              <span key={m} className="flex items-center gap-1.5 rounded-full bg-sunk py-1 pl-1 pr-3 text-[13px] font-medium">
                <PersonAvatar person={state.people.find((p) => p.id === m)} me={m === 'me'} size={24} />
                {name(m)}
              </span>
            ))}
          </div>
        </section>
      )}

      {b.members.includes('me') && (
        <section className="mt-4 rounded-3xl bg-accent-soft p-4" aria-label="What it means for you">
          <p className="text-[14.5px] font-medium leading-snug">{me.line}</p>
          <p className="num mt-2 text-[12.5px] text-ink2">
            You’ve put in {rupees(me.paid)}
            {me.got ? ` · got ${rupees(me.got)}` : ''}
          </p>
        </section>
      )}

      <div className="mt-8 text-center">
        <button
          type="button"
          className="btn-ghost text-neg"
          onClick={() =>
            ui.openSheet({
              type: 'confirm',
              title: `Delete ${b.name}?`,
              body: 'Who paid and who won is removed. Money already recorded in your accounts stays in Activity.',
              confirm: 'Delete bhisi',
              run: () => {
                store.deleteBhisi(b.id);
                ui.pop();
              },
            })
          }
        >
          <Icon name="trash" size={16} /> Delete bhisi
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// The draw (sheet)
// ------------------------------------------------------------------
async function shareText(text: string, url: string, toast: (t: { text: string }) => void) {
  try {
    if (navigator.share) return await navigator.share({ text, url });
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast({ text: 'Copied. Paste it in your group chat.' });
  } catch {
    /* closed the share sheet */
  }
}

export function BhisiDraw({ bhisiId, onDone }: { bhisiId: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const b0 = state.bhisis?.find((x) => x.id === bhisiId);
  // Freeze what goes into the matka when the sheet opens.
  const [setup] = useState(() => {
    if (!b0) return null;
    const i = currentRound(b0);
    const chits: Chit[] = inBowl(b0).map((m) => {
      const p = state.people.find((x) => x.id === m);
      return { id: m, name: m === 'me' ? state.user.name || 'You' : p?.short ?? 'Someone', person: p, me: m === 'me' };
    });
    return { i: i ?? 0, chits, pot: pot(b0), rounds: b0.rounds.length, name: b0.name, emoji: b0.emoji };
  });
  const [won, setWon] = useState<Chit | null>(null);
  if (!setup || isDone(b0!) && !won) return <p className="text-ink3">Everyone has already won in this bhisi.</p>;
  const replay: DrawReplay | null = won ? { n: setup.name, e: setup.emoji, r: setup.i + 1, p: setup.pot, w: won.name, c: setup.chits.map((c) => c.name) } : null;
  return (
    <div>
      <MatkaDraw chits={setup.chits} draw={() => store.drawBhisi(bhisiId)} round={setup.i + 1} rounds={setup.rounds} pot={setup.pot} onRevealed={setWon} />
      {won && replay && (
        <div className="pop-in -mt-2 flex flex-col gap-2" style={{ animationDelay: '.6s' }}>
          <button
            type="button"
            className="btn-accent w-full"
            onClick={() => void shareText(`🏺 ${setup.name} · round ${replay.r}: ${won.me ? 'I' : won.name} took the ${rupees(setup.pot)} pot! Watch the chit come out:`, replayUrl(replay), store.toast)}
          >
            <Icon name="share" size={16} /> Share the chit with the gang
          </button>
          <button type="button" className="btn-quiet w-full" onClick={onDone}>
            Done
          </button>
          <p className="text-center text-[12px] text-ink3">Anyone with the link watches the same chit come out. The result is locked.</p>
        </div>
      )}
    </div>
  );
}

/** Someone shared a draw: replay the same chit coming out. */
export function DrawReplaySheet({ replay, onDone }: { replay: DrawReplay; onDone: () => void }) {
  const chits = useMemo<Chit[]>(() => replay.c.map((n, k) => ({ id: `${k}:${n}`, name: n })), [replay]);
  const winner = chits.find((c) => c.name === replay.w)?.id;
  const [done, setDone] = useState(false);
  return (
    <div>
      <p className="text-center text-[14px] text-ink2">
        {replay.e} {replay.n} · round {replay.r}. Same draw, same chit.
      </p>
      <MatkaDraw chits={chits} draw={() => winner} round={replay.r} rounds={Math.max(replay.r, chits.length)} pot={replay.p} when="by the organiser" onRevealed={() => setDone(true)} />
      {done && (
        <button type="button" className="btn-quiet pop-in -mt-2 w-full" onClick={onDone}>
          Done
        </button>
      )}
    </div>
  );
}
