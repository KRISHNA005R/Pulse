import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { useUI, type ActivityFilter } from '../store/ui';
import { monthRange, myCost, prevMonth } from '../lib/finance';
import { addDays, monthName, rupees } from '../lib/format';
import { TransactionList } from '../components/money';
import { FilterChip, TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';

const CHIPS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'food', label: 'Food' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'bills', label: 'Bills' },
  { key: 'transport', label: 'Transport' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'investments', label: 'Investments' },
  { key: 'plans', label: 'Plans' },
  { key: 'people', label: 'People' },
];

const RANGES: { key: ActivityFilter['range']; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

export function ActivityScreen() {
  const { state } = useStore();
  const ui = useUI();
  const f = ui.activityFilter;
  const set = (patch: Partial<ActivityFilter>) => ui.setActivityFilter({ ...f, ...patch });
  const [showMore, setShowMore] = useState(f.range !== 'all' || f.account !== 'all');

  const txs = useMemo(() => {
    const q = f.query.trim().toLowerCase();
    let [start, end] = ['0000-00-00', '9999-99-99'];
    if (f.range === 'this-month') [start, end] = monthRange(state.today);
    if (f.range === 'last-month') [start, end] = monthRange(prevMonth(state.today));
    if (f.range === '7d') [start, end] = [addDays(state.today, -6), state.today];
    if (f.range === '30d') [start, end] = [addDays(state.today, -29), state.today];
    return state.transactions.filter((t) => {
      if (t.date < start || t.date > end) return false;
      if (f.account !== 'all' && t.account !== f.account) return false;
      if (f.chip === 'plans' && !t.plan) return false;
      if (f.chip === 'people' && !t.people?.length) return false;
      if (!['all', 'plans', 'people'].includes(f.chip) && t.category !== f.chip) return false;
      if (q) {
        const cat = state.categories.find((c) => c.id === t.category)?.name.toLowerCase() ?? '';
        const people = (t.people ?? []).map((id) => state.people.find((p) => p.id === id)?.name.toLowerCase() ?? '').join(' ');
        const hay = `${t.merchant} ${t.notes ?? ''} ${cat} ${people} ${t.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state, f]);

  const [ms, me] = monthRange(state.today);
  const monthSpent = Math.round(state.transactions.filter((t) => t.type === 'expense' && t.date >= ms && t.date <= me).reduce((a, t) => a + myCost(state, t), 0));
  const filteredOut = Math.round(txs.filter((t) => t.type === 'expense').reduce((a, t) => a + myCost(state, t), 0));
  const filtered = f.chip !== 'all' || f.query || f.range !== 'all' || f.account !== 'all';

  return (
    <div>
      <TopNavigation title="Activity" sub={filtered ? `${txs.length} transactions · ${rupees(filteredOut)} spent` : `${rupees(monthSpent)} spent in ${monthName(state.today)} so far`} />

      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-accent">
          <Icon name="search" size={17} className="text-ink3" />
          <label htmlFor="activity-search" className="sr-only">
            Search transactions
          </label>
          <input id="activity-search" type="search" className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-ink3 focus:outline-none" placeholder="Search merchant, note, person" value={f.query} onChange={(e) => set({ query: e.target.value })} />
        </div>
        <button type="button" onClick={() => setShowMore(!showMore)} aria-expanded={showMore} className={`tap grid h-11 w-11 shrink-0 place-items-center rounded-full border ${showMore ? 'border-ink bg-ink text-bg' : 'border-line bg-surface'}`} aria-label="Date and account filters">
          <Icon name="sliders" size={18} />
        </button>
      </div>

      {showMore && (
        <div className="mt-3 grid animate-rise grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink3">
            Date
            <select className="field py-2.5" value={f.range} onChange={(e) => set({ range: e.target.value as ActivityFilter['range'] })}>
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink3">
            Account
            <select className="field py-2.5" value={f.account} onChange={(e) => set({ account: e.target.value })}>
              <option value="all">All accounts</option>
              {state.accounts.filter((a) => a.type === 'bank' || a.type === 'cash').map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              {state.cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} card
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="toolbar" aria-label="Filter by type">
        {CHIPS.map((c) => (
          <FilterChip key={c.key} label={c.label} active={f.chip === c.key} onClick={() => set({ chip: c.key })} />
        ))}
      </div>

      <div className="mt-6">
        <TransactionList txs={txs} emptyText={f.query ? `Nothing matches “${f.query}”.` : 'No transactions for this filter.'} />
      </div>
      {filtered && (
        <div className="mt-6 text-center">
          <button type="button" className="btn-ghost" onClick={() => ui.setActivityFilter({ chip: 'all', query: '', range: 'all', account: 'all' })}>
            Clear filters
          </button>
        </div>
      )}
      <p className="mt-6 text-center text-[12.5px] text-ink3 md:hidden">Tip: swipe a row left to split or delete.</p>
    </div>
  );
}
