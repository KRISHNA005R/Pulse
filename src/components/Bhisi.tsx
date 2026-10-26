import { useEffect, useMemo, useState } from 'react';
import type { Bhisi } from '../types';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { addMonths, daysBetween, fmtDate, relDay, rupees } from '../lib/format';
import { roundMoney } from '../lib/currency';
import { chances, currentRound, EARLY_DAYS, inBowl, isDone, myStanding, pot, replayUrl, ticketLabel, tickets, TICKETS, type DrawReplay } from '../lib/bhisi';
import { bhisiUrl, type BhisiInvite } from '../lib/bhisiShare';
import { Icon } from './ui/Icon';
import { Field, MoneyInput, PersonAvatar, TopNavigation } from './ui/bits';
import { MatkaDraw, Pot, type Chit } from './Matka';

const EMOJI = ['🏺', '💰', '🪙', '🎰', '🏠', '🎉', '🍜', '✨'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (d: string) => MON[Number(d.slice(5, 7)) - 1];
const INK = '#17140F';

function useNames() {
  const { state } = useStore();
  return (id: string) => (id === 'me' ? 'You' : state.people.find((p) => p.id === id)?.short ?? 'Someone');
}

/** Faces in a row, overlapping. */
function Faces({ ids, size = 26, max = 6 }: { ids: string[]; size?: number; max?: number }) {
  const { state } = useStore();
  return (
    <span className="flex items-center">
      {ids.slice(0, max).map((id, i) => (
        <span key={id + i} className={`relative rounded-full bg-surface p-[2px] ${i ? '-ml-2' : ''}`} style={{ zIndex: max - i }}>
          <PersonAvatar person={state.people.find((p) => p.id === id)} me={id === 'me'} size={size} />
        </span>
      ))}
      {ids.length > max && <span className="-ml-2 grid place-items-center rounded-full bg-sunk px-1.5 text-[11px] font-semibold" style={{ height: size + 4, minWidth: size + 4 }}>+{ids.length - max}</span>}
    </span>
  );
}

/** When can the current round be drawn? */
function roundGate(b: Bhisi, today: string) {
  const i = currentRound(b);
  if (i === undefined) return { i, open: false, days: 0, date: '' };
  const date = b.rounds[i].date;
  return { i, open: date <= today, days: Math.max(0, daysBetween(today, date)), date };
}

async function shareLink(text: string, url: string, toast: (t: { text: string }) => void) {
  try {
    if (navigator.share) return void (await navigator.share({ text, url }));
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast({ text: 'Link copied. Paste it in your group chat.' });
  } catch {
    /* closed the share sheet */
  }
}

// ------------------------------------------------------------------
// Plans → Bhisi
// ------------------------------------------------------------------
export function BhisiList() {
  const { state, markTried } = useStore();
  const ui = useUI();
  const list = state.bhisis ?? [];
  useEffect(() => void markTried('bhisi'), []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.length)
    return (
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 pb-6 pt-4 text-center">
        <img src="/illustrations/bhisi.webp" alt="" aria-hidden="true" width={1000} height={558} decoding="async" data-testid="bhisi-art" className="-mx-2 mb-2 h-auto w-[calc(100%+16px)] max-w-none" />
        <h2 className="display mt-1 text-[23px] leading-tight">Bhisi, but make it digital</h2>
        <p className="mx-auto mt-2 max-w-[300px] text-[14px] text-ink2">Your gang chips in every month. A lucky chit picks who takes the whole pot. Everyone wins once.</p>
        <ol className="mx-auto mt-5 flex max-w-[340px] flex-col gap-2 text-left">
          {[
            ['💸', 'Everyone puts in the same amount, monthly'],
            ['🏺', 'On draw day, anyone shakes the matka'],
            ['🔒', 'PULSE picks the chit. Random, locked, no cheating'],
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
        <p className="mt-3 text-[12px] text-ink3">PULSE keeps track and runs the draw. It never holds or moves your money.</p>
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
  const g = roundGate(b, state.today);
  const r = g.i === undefined ? undefined : b.rounds[g.i];
  const unseen = b.rounds.some((x) => x.winner && !x.seen);
  return (
    <button type="button" onClick={() => ui.push({ name: 'bhisi', id: b.id })} className="tap w-full rounded-3xl border border-line bg-surface p-4 text-left hover:border-ink3/40">
      <div className="flex items-center gap-3">
        <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-[24px]" aria-hidden="true">
          {b.emoji}
          {unseen && <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-surface bg-accent" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="display block truncate text-[17px]">{b.name}</span>
          <span className="num block text-[13.5px] text-ink2">
            {b.amount ? `${rupees(pot(b))} pot` : 'Getting the details…'} · {g.i === undefined ? 'complete' : `round ${g.i + 1} of ${b.rounds.length}`}
          </span>
        </span>
        {r && (g.open ? <span className="animate-ring shrink-0 rounded-full bg-accent px-2.5 py-1 text-[12px] font-bold text-[#17140F]">Draw open</span> : <span className="shrink-0 rounded-full bg-sunk px-2.5 py-1 text-[12px] font-semibold">🔒 {g.days === 1 ? 'Tomorrow' : `${g.days} days`}</span>)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Faces ids={b.members} />
        <span className="text-[12.5px] text-ink3">{r ? `${r.paid.length}/${b.members.length} paid` : 'Everyone got their turn 🎉'}</span>
      </div>
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
  const [typed, setTyped] = useState('');
  const nextFirst = addMonths(state.today.slice(0, 8) + '01', 1);
  const [start, setStart] = useState(state.today);
  // Friends you already split with first: people in your groups, then everyone else.
  const friends = useMemo(() => {
    const inGroups = new Set(state.groups.flatMap((g) => g.members));
    const splitWith = new Set(state.splits.flatMap((s) => [s.paidBy, ...s.shares.map((x) => x.person)]));
    return [...state.people].sort((a, b) => Number(inGroups.has(b.id) || splitWith.has(b.id) || !!b.link) - Number(inGroups.has(a.id) || splitWith.has(a.id) || !!a.link) || a.name.localeCompare(b.name));
  }, [state.people, state.groups, state.splits]);
  const groups = state.groups.filter((g) => g.members.some((m) => m !== 'me'));
  const toggle = (id: string) => setPeople((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const addTyped = () => {
    const n = typed.trim();
    if (!n) return;
    const known = state.people.find((p) => p.name.toLowerCase() === n.toLowerCase() || p.short.toLowerCase() === n.toLowerCase());
    const id = known ? known.id : store.addPerson(n).id;
    setPeople((xs) => (xs.includes(id) ? xs : [...xs, id]));
    setTyped('');
  };
  const n = people.length + 1;
  const amt = parseFloat(amount) || 0;
  const valid = name.trim() && amt > 0 && start;
  return (
    <div className="flex flex-col gap-5">
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
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-[13px] font-semibold text-ink2">Who’s in?</p>
          <p className="text-[12.5px] text-ink3">You + {people.length}</p>
        </div>
        {groups.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {groups.map((g) => {
              const others = g.members.filter((m) => m !== 'me');
              const all = others.every((m) => people.includes(m));
              return (
                <button key={g.id} type="button" aria-pressed={all} onClick={() => setPeople((xs) => (all ? xs.filter((x) => !others.includes(x)) : [...new Set([...xs, ...others])]))} className={`tap flex min-w-0 max-w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left ${all ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                  <span className="text-[18px]" aria-hidden="true">
                    {g.emoji}
                  </span>
                  <span>
                    <span className="block max-w-[120px] truncate text-[13.5px] font-semibold">{g.name}</span>
                    <span className="block text-[11.5px] text-ink3">{all ? 'All added ✓' : `Add all ${others.length}`}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {friends.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {friends.slice(0, 16).map((p) => {
              const on = people.includes(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={on} onClick={() => toggle(p.id)} className={`tap relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2 ${on ? 'bg-accent-soft' : 'bg-sunk/60'}`}>
                  <PersonAvatar person={p} size={40} />
                  <span className="max-w-full truncate text-[12px] font-semibold">{p.short}</span>
                  {on && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-[#17140F]"><Icon name="check" size={12} strokeWidth={3} /></span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <input className="field min-w-0 flex-1 py-2" placeholder="Someone else? Type a name" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTyped())} aria-label="Add someone by name" />
          <button type="button" className="btn-quiet min-h-[42px] shrink-0 px-4" onClick={addTyped} disabled={!typed.trim()}>
            Add
          </button>
        </div>
        <p className="mt-2 text-[12.5px] text-ink3">After you start it, share the invite link. Friends join from their own PULSE and get a notification when they win.</p>
      </div>

      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink2">First draw</p>
        <div className="mb-2 flex gap-2">
          {[
            { label: 'Today', d: state.today },
            { label: `1 ${month(nextFirst)}`, d: nextFirst },
            { label: `5 ${month(nextFirst)}`, d: nextFirst.slice(0, 8) + '05' },
          ].map((x) => (
            <button key={x.label} type="button" className="chip flex-1 justify-center" aria-pressed={start === x.d} onClick={() => setStart(x.d)}>
              {x.label}
            </button>
          ))}
        </div>
        <input id="bh-start" type="date" className="field" value={start} min={state.today} onChange={(e) => setStart(e.target.value)} aria-label="First draw date" />
        <p className="mt-1.5 text-[12.5px] text-ink3">Then the same date every month. Each draw opens only on its date.</p>
      </div>

      {amt > 0 && (
        <div className="rounded-2xl p-4 text-[#17140F]" style={{ background: '#EC5B2B' }}>
          <p className="text-[12px] font-bold tracking-[.14em]">THE POT</p>
          <p className="display mt-1 text-[28px] leading-none">{rupees(roundMoney(amt * n))}</p>
          <p className="mt-1.5 text-[13.5px] font-medium">
            {n} {n === 1 ? 'person' : 'people'} so far × {rupees(amt)}, every month for {n} months{n > 1 ? `. Last draw ${fmtDate(addMonths(start, n - 1), true)}` : ''}. Grows as people join.
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
        Start bhisi 🏺
      </button>
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
  const sh = b.share;
  const g = roundGate(b, state.today);
  const i = g.i;
  const r = i === undefined ? undefined : b.rounds[i];
  const bowl = inBowl(b);
  const me = myStanding(b);
  const odds = i === undefined ? [] : chances(b, i).sort((x, y) => y.pct - x.pct || name(x.id).localeCompare(name(y.id)));
  const canMark = (m: string) => !sh || m === 'me' || sh.owner;
  const seatOf = (pid: string) => (sh ? Object.keys(sh.seats).find((k) => sh.seats[k] === pid) : undefined);
  const byName = (pid: string) => !!sh && (sh.owner ? (sh.ghosts ?? []).some((x) => x.pid === pid) : !!seatOf(pid)?.startsWith('g'));
  const unseen = b.rounds.map((x, k) => ({ x, k })).filter(({ x }) => x.winner && !x.seen);
  const invite = sh && !sh.locked ? bhisiUrl(b) : '';
  const nudge = r && r.paid.length < b.members.length ? `https://wa.me/?text=${encodeURIComponent(`Bhisi reminder 🏺 ${b.name}: ${rupees(b.amount)} for round ${(i ?? 0) + 1}. Draw on ${fmtDate(r.date, true)}. Pay up, bestie 🙏`)}` : '';

  return (
    <div>
      <TopNavigation title={`${b.name} ${b.emoji}`} onBack={ui.pop} sub={sh ? (sh.owner ? 'Shared · you made it' : 'Shared bhisi') : undefined} />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 p-5 text-[#FFFBF4]" style={{ background: INK }} aria-label="This round">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[.16em] text-[#FFFBF4]/60">{r ? `Round ${(i ?? 0) + 1} of ${b.rounds.length}` : 'Complete'}</p>
            <p className="num-hero mt-2 break-all text-[clamp(28px,9vw,40px)] leading-none">{b.amount ? rupees(pot(b)) : '—'}</p>
            <p className="mt-1.5 text-[14px] text-[#FFFBF4]/75">{r ? (g.open ? 'in the pot. The draw is open!' : `in the pot · draw ${relDay(r.date, state.today).toLowerCase()}`) : 'Everyone got their turn. Iconic.'}</p>
          </div>
          <div className="pointer-events-none -mr-1 -mt-2 shrink-0">
            <Pot size={92} />
          </div>
        </div>
        {r && b.members.length > 1 && (
          <>
            {g.open ? (
              <button type="button" className="btn animate-ring mt-5 w-full bg-[#EC5B2B] text-[#17140F]" onClick={() => ui.openSheet({ type: 'bhisi-draw', bhisiId: b.id })}>
                Draw the chitti 🤞
              </button>
            ) : (
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/[.07] px-4 py-3">
                <span className="text-[22px]" aria-hidden="true">
                  🔒
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">Opens {fmtDate(r.date, true)}</span>
                  <span className="block text-[12.5px] text-[#FFFBF4]/60">{g.days === 1 ? 'Tomorrow' : `In ${g.days} days`}. Then anyone in the bhisi can draw.</span>
                </span>
              </div>
            )}
            <p className="mt-2 text-center text-[12px] text-[#FFFBF4]/55">{sh ? 'PULSE’s server picks the chit. Random and locked, nobody can redraw.' : 'Random every time. Nobody can redraw.'}</p>
          </>
        )}
      </section>

      {/* A result someone else drew */}
      {unseen.length > 0 && (
        <button type="button" onClick={() => ui.openSheet({ type: 'bhisi-watch', bhisiId: b.id, round: unseen[unseen.length - 1].k })} className="tap mt-3 flex w-full items-center gap-3 rounded-3xl p-4 text-left text-[#17140F]" style={{ background: '#EC5B2B' }}>
          <span className="text-[28px]" aria-hidden="true">
            🎬
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-bold">Round {unseen[unseen.length - 1].k + 1} result is in</span>
            <span className="block text-[13px] font-medium">Tap to watch the chit come out</span>
          </span>
          <Icon name="play" size={20} />
        </button>
      )}

      {/* Invite */}
      {invite && (
        <section className="mt-3 rounded-3xl border border-line bg-surface p-4" aria-label="Invite">
          <div className="flex items-center gap-3">
            <Faces ids={b.members} size={30} />
            <span className="min-w-0 flex-1 text-[13px] text-ink2">
              {b.members.filter((m) => !byName(m)).length} on PULSE{b.members.some(byName) ? ` · ${b.members.filter(byName).length} added by name` : ''}
            </span>
          </div>
          <button type="button" className="btn-primary mt-3 w-full" onClick={() => void shareLink(`Join my bhisi "${b.name}" on PULSE 🏺 ${rupees(b.amount)} a month, lucky chit every month:`, invite, store.toast)}>
            <Icon name="share" size={16} /> Send the invite link
          </button>
          <p className="mt-2 text-[12px] text-ink3">Friends who open it join from their own PULSE, follow the draws and get notified when they win. Joining closes at the first draw.</p>
        </section>
      )}

      {/* Rounds strip */}
      <section className="mt-5" aria-label="Rounds">
        <div className="grid grid-cols-5 gap-1.5">
          {b.rounds.map((x, k) => {
            const now = k === i;
            const future = !x.winner && x.date > state.today;
            return (
              <div key={k} className={`flex min-w-0 flex-col items-center rounded-2xl border px-0.5 py-2 ${now ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                <span className="text-[10.5px] font-semibold uppercase text-ink3">
                  {x.date.slice(8, 10).replace(/^0/, '')} {month(x.date)}
                </span>
                <span className="mt-1.5">
                  {x.winner ? (
                    <PersonAvatar person={state.people.find((p) => p.id === x.winner)} me={x.winner === 'me'} size={34} />
                  ) : (
                    <span className={`grid h-[34px] w-[34px] place-items-center rounded-full text-[14px] font-bold ${now && !future ? 'animate-ring bg-accent text-[#17140F]' : 'border border-dashed border-line text-ink3'}`}>{future ? '🔒' : '?'}</span>
                  )}
                </span>
                <span className="mt-1 w-full truncate px-0.5 text-center text-[11px] font-semibold">{x.winner ? name(x.winner) : now ? (future ? 'Next' : 'Now!') : `#${k + 1}`}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Who's paid */}
      {r && (
        <section className="mt-4 rounded-3xl border border-line bg-surface p-4" aria-labelledby="bh-paid">
          <div className="flex items-center justify-between">
            <h2 id="bh-paid" className="text-[15px] font-semibold">
              Who’s paid · {month(r.date)}
            </h2>
            <span className="num text-[13px] font-semibold text-ink3">
              {r.paid.length}/{b.members.length}
            </span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-sunk">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(r.paid.length / Math.max(1, b.members.length)) * 100}%` }} />
          </div>
          <ul className="mt-2 flex flex-col">
            {b.members.map((m) => {
              const paid = r.paid.includes(m);
              const won = b.rounds.some((x) => x.winner === m);
              return (
                <li key={m} className="flex items-center gap-3 py-2">
                  <PersonAvatar person={state.people.find((p) => p.id === m)} me={m === 'me'} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">
                      {name(m)} {won && <span title="Already won">🏆</span>}
                    </span>
                    {sh && m !== 'me' && <span className="block text-[12px] text-ink3">{byName(m) ? 'Added by name · not joined yet' : 'On PULSE'}</span>}
                  </span>
                  {canMark(m) ? (
                    <button type="button" aria-pressed={paid} onClick={() => store.toggleBhisiPaid(b.id, i!, m)} className={`tap min-h-[34px] rounded-full px-3.5 text-[13px] font-semibold ${paid ? 'bg-pos/12 text-pos' : 'border border-line text-ink2'}`}>
                      {paid ? (r.paidAt?.[m] && tickets(r.paidAt[m], r.date) >= TICKETS.early ? 'Early bird 🐦' : 'Paid ✓') : m === 'me' ? `I paid ${rupees(b.amount)}` : 'Mark paid'}
                    </button>
                  ) : (
                    <span className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${paid ? 'bg-pos/12 text-pos' : 'bg-sunk text-ink3'}`}>{paid ? 'Paid ✓' : 'Not yet'}</span>
                  )}
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

      {r && bowl.length > 0 && (
        <section className="mt-4 rounded-3xl border border-line bg-surface p-4" aria-labelledby="bh-bowl">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="bh-bowl" className="text-[15px] font-semibold">
              Who’s in the matka · {bowl.length}
            </h2>
            <span className="text-[12px] text-ink3">chance this round</span>
          </div>
          <ul className="mt-3 flex flex-col gap-2.5">
            {odds.map((o) => (
              <li key={o.id} className="flex items-center gap-3">
                <PersonAvatar person={state.people.find((p) => p.id === o.id)} me={o.id === 'me'} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[14px] font-medium">
                      {name(o.id)} <span className="text-[12px] font-normal text-ink3">· {ticketLabel(o.tickets)}</span>
                    </span>
                    <span className="num shrink-0 text-[14px] font-bold">{o.pct}%</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-sunk">
                    <span className={`block h-full rounded-full ${o.tickets >= TICKETS.early ? 'bg-accent' : o.tickets >= TICKETS.paid ? 'bg-accent/70' : 'bg-ink3/40'}`} style={{ width: `${o.pct}%` }} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-2xl bg-accent-soft px-3.5 py-3 text-[13px] leading-snug">
            <p className="font-semibold">🍀 Pay early, boost your luck</p>
            <p className="mt-0.5 text-ink2">Paid {EARLY_DAYS}+ days before the draw: 1.5× the chance. Paid before the draw: 1.25×. It’s still a lucky draw: anyone can come out, nobody’s guaranteed.</p>
          </div>
        </section>
      )}

      {b.members.includes('me') && b.amount > 0 && (
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
              title: sh && !sh.owner ? `Leave ${b.name}?` : `Delete ${b.name}?`,
              body: sh && !sh.owner ? 'You stop following this bhisi. Money already recorded stays in Activity.' : sh ? 'It’s deleted for everyone in it. Money already recorded stays in Activity.' : 'Who paid and who won is removed. Money already recorded stays in Activity.',
              confirm: sh && !sh.owner ? 'Leave bhisi' : 'Delete bhisi',
              run: () => {
                store.deleteBhisi(b.id);
                ui.pop();
              },
            })
          }
        >
          <Icon name="trash" size={16} /> {sh && !sh.owner ? 'Leave bhisi' : 'Delete bhisi'}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// The draw, watching a draw, joining
// ------------------------------------------------------------------
function useChits(b: Bhisi | undefined, before: number) {
  const { state } = useStore();
  return useMemo<Chit[]>(() => {
    if (!b) return [];
    const won = new Set(b.rounds.slice(0, before).map((r) => r.winner));
    return b.members
      .filter((m) => !won.has(m))
      .map((m) => {
        const p = state.people.find((x) => x.id === m);
        return { id: m, name: m === 'me' ? state.user.name || 'You' : p?.short ?? 'Someone', person: p, me: m === 'me' };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.id, before]);
}

export function BhisiDraw({ bhisiId, onDone }: { bhisiId: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const b = state.bhisis?.find((x) => x.id === bhisiId);
  const [setup] = useState(() => (b ? { i: currentRound(b) ?? 0, pot: pot(b), rounds: b.rounds.length, name: b.name, emoji: b.emoji, shared: !!b.share } : null));
  const chits = useChits(b, setup?.i ?? 0);
  const [won, setWon] = useState<Chit | null>(null);
  const [myChance] = useState(() => (b && setup ? chances(b, setup.i).find((c) => c.id === 'me')?.pct : undefined));
  if (!b || !setup) return null;
  if (isDone(b) && !won) return <p className="text-ink3">Everyone has already won in this bhisi.</p>;
  if (!won && b.rounds[setup.i] && b.rounds[setup.i].date > state.today) return <p className="text-ink3">This round opens on {fmtDate(b.rounds[setup.i].date, true)}.</p>;
  const replay: DrawReplay | null = won ? { n: setup.name, e: setup.emoji, r: setup.i + 1, p: setup.pot, w: won.name, c: chits.map((c) => c.name) } : null;
  return (
    <div>
      <MatkaDraw chits={chits} draw={setup.shared ? () => store.drawBhisiShared(bhisiId) : () => store.drawBhisi(bhisiId)} round={setup.i + 1} rounds={setup.rounds} pot={setup.pot} onRevealed={setWon} hint={myChance !== undefined ? `Your chance: ${myChance}% 🍀` : undefined} />
      {won && replay && (
        <div className="rise-in mt-2 flex flex-col gap-2" style={{ animationDelay: '.6s' }}>
          <button type="button" className="btn-accent w-full" onClick={() => void shareLink(`🏺 ${setup.name} · round ${replay.r}: ${won.me ? 'I' : won.name} took the ${rupees(setup.pot)} pot! Watch the chit come out:`, replayUrl(replay), store.toast)}>
            <Icon name="share" size={16} /> Share the chit with the gang
          </button>
          <button type="button" className="btn-quiet w-full" onClick={onDone}>
            Done
          </button>
          <p className="text-center text-[12px] text-ink3">{setup.shared ? 'Everyone in the bhisi got a notification. The result is locked.' : 'The result is locked.'}</p>
        </div>
      )}
    </div>
  );
}

/** Watch a round someone else drew: the same chit comes out. */
export function BhisiWatch({ bhisiId, round, onDone }: { bhisiId: string; round: number; onDone: () => void }) {
  const store = useStore();
  const b = store.state.bhisis?.find((x) => x.id === bhisiId);
  const chits = useChits(b, round);
  const [done, setDone] = useState(false);
  const r = b?.rounds[round];
  if (!b || !r?.winner) return null;
  return (
    <div>
      <p className="text-center text-[14px] text-ink2">
        {b.emoji} {b.name} · round {round + 1}. The real result, drawn {r.drawnAt ? fmtDate(r.drawnAt) : 'already'}.
      </p>
      {r.odds && (
        <p className="mx-auto mt-2 max-w-[320px] text-center text-[12.5px] text-ink3">
          Odds at the draw: {chances(b, round).map((c) => `${c.id === 'me' ? 'You' : store.state.people.find((p) => p.id === c.id)?.short ?? 'Someone'} ${c.pct}%`).join(' · ')}
        </p>
      )}
      <MatkaDraw
        chits={chits}
        draw={() => r.winner}
        round={round + 1}
        rounds={b.rounds.length}
        pot={pot(b)}
        when={r.drawnAt ? `DRAWN ${fmtDate(r.drawnAt, true)}` : undefined}
        onRevealed={() => {
          setDone(true);
          store.markRoundSeen(bhisiId, round);
        }}
      />
      {done && (
        <button type="button" className="btn-quiet rise-in mt-2 w-full" onClick={onDone}>
          Done
        </button>
      )}
    </div>
  );
}

/** Someone shared a draw link: replay the same chit coming out. */
export function DrawReplaySheet({ replay, onDone }: { replay: DrawReplay; onDone: () => void }) {
  const chits = useMemo<Chit[]>(() => replay.c.map((n, k) => ({ id: `${k}:${n}`, name: n })), [replay]);
  const winner = chits.find((c) => c.name === replay.w)?.id;
  const [done, setDone] = useState(false);
  return (
    <div>
      <p className="text-center text-[14px] text-ink2">
        {replay.e} {replay.n} · round {replay.r}. Same draw, same chit.
      </p>
      <MatkaDraw chits={chits} draw={() => winner} round={replay.r} rounds={Math.max(replay.r, chits.length)} pot={replay.p} when="drawn on PULSE" onRevealed={() => setDone(true)} />
      {done && (
        <button type="button" className="btn-quiet rise-in mt-2 w-full" onClick={onDone}>
          Done
        </button>
      )}
    </div>
  );
}

/** Opened a bhisi invite link. */
export function BhisiJoin({ invite, onDone }: { invite: BhisiInvite; onDone: () => void }) {
  const store = useStore();
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="text-center">
      <div className="mx-auto w-fit">
        <Pot size={140} />
      </div>
      <p className="display mt-1 text-[22px] leading-tight">Join {invite.name || 'this bhisi'}?</p>
      <p className="mx-auto mt-2 max-w-[300px] text-[14px] text-ink2">Your chit goes into the matka. Every month one chit comes out, picked by PULSE’s server: random and locked. You get a notification if it’s yours.</p>
      {err && <p className="mx-auto mt-3 max-w-[300px] rounded-2xl bg-sunk px-3.5 py-2.5 text-[13.5px] text-ink2">{err}</p>}
      <button
        type="button"
        className="btn-accent mt-5 w-full disabled:opacity-50"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await store.joinBhisi(invite);
          setBusy(false);
          if (res.error) return setErr(res.error);
          onDone();
          ui.resetTo('plans');
          ui.setPlansSegment('bhisi');
          if (res.id) ui.push({ name: 'bhisi', id: res.id });
        }}
      >
        {busy ? 'Joining…' : 'Join the bhisi 🏺'}
      </button>
      <button type="button" className="btn-ghost mt-2 w-full" onClick={onDone}>
        Not now
      </button>
      <p className="mt-2 text-[12px]" style={{ color: '#8A8073' }}>
        PULSE never holds or moves money.
      </p>
    </div>
  );
}
