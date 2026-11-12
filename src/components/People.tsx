import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { socialTotals } from '../lib/finance';
import { inGroupOnPulse } from '../lib/friends';
import { rupees } from '../lib/format';
import { EmptyState, MoneyStat, PersonAvatar, TopNavigation } from './ui/bits';
import { Icon } from './ui/Icon';

// People, at any size: a list that still works with a hundred friends, and a picker that doesn't
// turn into a wall of names.

/** Who you split with most recently comes first. */
function useRecency() {
  const { state } = useStore();
  return useMemo(() => {
    const last = new Map<string, string>();
    for (const sp of state.splits) for (const id of [sp.paidBy, ...sp.shares.map((x) => x.person)]) if (id !== 'me' && (last.get(id) ?? '') < sp.date) last.set(id, sp.date);
    return last;
  }, [state.splits]);
}

const SHOWN = 10;

/**
 * Pick people for a split or a group: friends connected on PULSE only (no typed names, so no
 * doubles and nobody made up). With a few it is a row of names to tap; with many, the ones picked
 * and the most recent show, and the box searches the rest. New friends come through your PULSE link.
 */
export function PeoplePicker({ selected, onChange, inputId, center }: { selected: string[]; onChange: (ids: string[]) => void; inputId: string; center?: boolean }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const recent = useRecency();
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  // The demo's people are pretend; on a real account, only friends who are connected (plus anyone
  // already picked here, e.g. editing an old split).
  const pool = useMemo(() => (state.mode === 'personal' ? state.people.filter((p) => p.link?.status === 'linked' || selected.includes(p.id)) : state.people), [state.mode, state.people, selected]);
  const many = pool.length > SHOWN;
  const needle = q.trim().toLowerCase();
  const sorted = useMemo(
    () => [...pool].sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)) || (recent.get(b.id) ?? '').localeCompare(recent.get(a.id) ?? '') || a.name.localeCompare(b.name)),
    [pool, selected, recent],
  );
  const match = needle ? sorted.filter((p) => p.name.toLowerCase().includes(needle)) : sorted;
  const shown = all || needle ? match.slice(0, 60) : match.filter((p, i) => i < SHOWN || selected.includes(p.id));
  const hidden = match.length - shown.length;
  // Two friends with the same first name show their full names, so it's clear who is who.
  const twins = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of pool) seen.set(p.short.toLowerCase(), (seen.get(p.short.toLowerCase()) ?? 0) + 1);
    return seen;
  }, [pool]);
  const label = (p: { name: string; short: string }) => ((twins.get(p.short.toLowerCase()) ?? 0) > 1 ? p.name : p.short);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const invite = () => ui.openSheet({ type: 'friend-invite' });
  if (!pool.length)
    return (
      <div className={`rounded-2xl bg-sunk p-4 ${center ? 'mx-auto max-w-[340px] text-center' : ''}`}>
        <p className="text-[14px] font-semibold">No friends on PULSE yet</p>
        <p className="mt-1 text-[13px] text-ink3">Send your PULSE link. Whoever opens it shows up here with their own name, ready to split with.</p>
        <button type="button" className="btn-accent mt-3 w-full" onClick={invite}>
          <Icon name="user-plus" size={16} /> Add a friend
        </button>
      </div>
    );
  return (
    <div>
      <div className={`flex flex-wrap gap-2 ${center ? 'justify-center' : ''}`}>
        {shown.map((p) => (
          <button key={p.id} type="button" className="chip pl-1" aria-pressed={selected.includes(p.id)} onClick={() => toggle(p.id)}>
            <PersonAvatar person={p} size={center ? 26 : 24} /> {label(p)}
          </button>
        ))}
        {hidden > 0 && (
          <button type="button" className="chip text-ink3" onClick={() => setAll(true)}>
            +{hidden} more
          </button>
        )}
        {state.mode === 'personal' && (
          <button type="button" className="chip text-ink2" onClick={invite}>
            <Icon name="user-plus" size={15} /> Add a friend
          </button>
        )}
        {needle && !match.length && <p className="w-full text-[13px] text-ink3">No friend called “{q.trim()}”. New friends join with your PULSE link.</p>}
      </div>
      {many && (
        <div className={`mt-3 ${center ? 'mx-auto max-w-[320px]' : ''}`}>
          <label htmlFor={inputId} className="sr-only">
            Search friends
          </label>
          <input id={inputId} type="search" className="field py-2" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </div>
      )}
    </div>
  );
}

type Filter = 'all' | 'owes' | 'owe' | 'square';

/** Plans → Splits → See all: everyone you split with, searchable. */
export function PeopleScreen() {
  const { state } = useStore();
  const ui = useUI();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const t = useMemo(() => socialTotals(state), [state]);
  const rows = useMemo(
    () =>
      state.people
        .map((p) => ({ p, v: t.balances.get(p.id) ?? 0 }))
        // Biggest balances first, then by name.
        .sort((a, b) => Math.abs(b.v) - Math.abs(a.v) || a.p.name.localeCompare(b.p.name)),
    [state.people, t],
  );
  const count: Record<Filter, number> = { all: rows.length, owes: rows.filter((r) => r.v > 0).length, owe: rows.filter((r) => r.v < 0).length, square: rows.filter((r) => r.v === 0).length };
  const needle = q.trim().toLowerCase();
  const list = rows.filter((r) => (filter === 'all' || (filter === 'owes' ? r.v > 0 : filter === 'owe' ? r.v < 0 : r.v === 0)) && (!needle || r.p.name.toLowerCase().includes(needle)));
  const chips: [Filter, string][] = [
    ['all', 'All'],
    ['owes', 'Owe you'],
    ['owe', 'You owe'],
    ['square', 'Settled'],
  ];
  const note = (id: string) => {
    const p = state.people.find((x) => x.id === id)!;
    if (p.link) return p.link.status === 'linked' ? 'on PULSE' : p.link.door ? 'connecting' : 'invite sent';
    return state.groups.some((g) => inGroupOnPulse(g, id)) ? 'in a group with you' : '';
  };
  return (
    <div>
      <TopNavigation title="People" onBack={ui.pop} sub={`${rows.length} ${rows.length === 1 ? 'person' : 'people'} you split with`} />
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface p-4">
        <MoneyStat label="You owe" value={t.youOwe} />
        <MoneyStat label="You're owed" value={t.owedToYou} tone="pos" />
      </div>

      <label htmlFor="people-search" className="sr-only">
        Search people
      </label>
      <div className="relative mt-4">
        <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" />
        <input id="people-search" type="search" className="field py-2.5 pl-11" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="Show">
        {chips.map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={filter === k} className="chip shrink-0" onClick={() => setFilter(k)}>
            {label} <span className="opacity-60">{count[k]}</span>
          </button>
        ))}
      </div>

      {list.length ? (
        <ul className="mt-3 flex flex-col">
          {list.map(({ p, v }) => {
            const sub = note(p.id);
            return (
              <li key={p.id}>
                <button type="button" className="row-btn" onClick={() => ui.push({ name: 'person', id: p.id })}>
                  <PersonAvatar person={p} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                    {sub && <span className="block truncate text-[12.5px] text-ink3">{sub}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    {v === 0 ? (
                      <span className="text-[13px] text-ink3">settled</span>
                    ) : (
                      <>
                        <span className={`num block text-[15px] font-semibold ${v > 0 ? 'text-pos' : ''}`}>{rupees(Math.abs(v))}</span>
                        <span className="block text-[12px] text-ink3">{v > 0 ? 'owes you' : 'you owe'}</span>
                      </>
                    )}
                  </span>
                  <Icon name="chevron" size={18} className="shrink-0 text-ink3" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : rows.length ? (
        <p className="px-1 py-8 text-center text-[14.5px] text-ink3">Nobody matches that.</p>
      ) : (
        <div className="mt-4">
          <EmptyState icon="users" title="Nobody here yet." body="Split an expense or invite a friend, and they show up here." action={{ label: 'Invite friends', onClick: () => ui.openSheet({ type: 'friend-invite' }) }} />
        </div>
      )}
    </div>
  );
}
