import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { activeYears, monthStat, yearSummary, type MonthStat } from '../lib/history';
import { spendByCategory } from '../lib/finance';
import { endOfMonth, monthName, monthShort, rupees, rupeesShort } from '../lib/format';
import { CategoryMark, TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';

// ------------------------------------------------------------------
// Twelve monthly bars for one year. Tap a bar to pick that month.
// ------------------------------------------------------------------
export function MonthBars({ months, selected, onSelect, compact, avg }: { months: MonthStat[]; selected?: string; onSelect?: (m: string) => void; compact?: boolean; avg?: number }) {
  const max = Math.max(1, ...months.map((m) => m.spent));
  const h = compact ? 64 : 148;
  const avgPct = avg && avg > 0 ? Math.min(1, avg / max) : 0;
  return (
    <div className="relative">
      <div className="relative flex items-end gap-[2px]" style={{ height: h }} role={onSelect ? 'radiogroup' : 'img'} aria-label={onSelect ? 'Months' : `Monthly spending: ${months.filter((m) => !m.future).map((m) => `${monthShort(m.month)} ${rupees(m.spent)}`).join(', ')}`}>
        {avgPct > 0 && !compact && (
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink3/50" style={{ bottom: `${avgPct * 100}%` }} aria-hidden="true">
            <span className="absolute -top-[9px] right-0 bg-surface pl-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink3">avg</span>
          </div>
        )}
        {months.map((m, idx) => {
          const on = selected === m.month;
          const pct = m.spent / max;
          const bar = (
            <span
              className={`block w-full origin-bottom animate-grow rounded-t-[4px] transition-colors ${m.future ? 'bg-transparent' : on ? 'bg-accent' : m.current ? 'bg-ink/30' : 'bg-ink/15 group-hover:bg-ink/25'}`}
              style={{ height: m.future ? 0 : `max(${m.spent > 0 ? 3 : 1.5}px, ${pct * 100}%)`, animationDelay: `${idx * 35}ms` }}
            />
          );
          return onSelect && !m.future ? (
            <button key={m.month} type="button" role="radio" aria-checked={on} aria-label={`${monthName(m.month)}: ${rupees(m.spent)} spent${m.current ? ' so far' : ''}`} title={`${monthShort(m.month)} · ${rupees(m.spent)}`} onClick={() => onSelect(m.month)} className="group flex h-full flex-1 items-end focus-visible:outline-offset-1">
              {bar}
            </button>
          ) : (
            <span key={m.month} className="flex h-full flex-1 items-end" aria-hidden="true">
              {m.future ? <span className="block h-px w-full bg-line" /> : bar}
            </span>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px]" aria-hidden="true">
        {months.map((m) => (
          <span key={m.month} className={`flex-1 text-center text-[10.5px] ${selected === m.month ? 'font-bold text-ink' : m.future ? 'text-ink3/50' : 'text-ink3'}`}>
            {compact ? monthShort(m.month).charAt(0) : monthShort(m.month).slice(0, 3)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The small year card on the You screen. */
export function YearGlance() {
  const { state } = useStore();
  const ui = useUI();
  const year = Number(state.today.slice(0, 4));
  const y = useMemo(() => yearSummary(state, year), [state, year]);
  return (
    <button type="button" onClick={() => ui.push({ name: 'history', year })} className="tap mb-8 block w-full rounded-3xl border border-line bg-surface p-5 text-left hover:border-ink3/40">
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="eyebrow block">Spending in {year}</span>
          <span className="num-hero mt-1 block text-[28px] leading-none">{rupees(y.spent)}</span>
          <span className="mt-1.5 block text-[13.5px] text-ink2">{y.avgSpent ? `${rupees(y.avgSpent)} a month on average` : 'Your year builds up here as you log'}</span>
        </span>
        <span className="flex items-center gap-1 text-[13px] font-semibold text-accent-ink">
          History <Icon name="chevron" size={16} />
        </span>
      </span>
      <span className="mt-4 block">
        <MonthBars months={y.months} selected={state.today.slice(0, 8) + '01'} compact />
      </span>
    </button>
  );
}

// ------------------------------------------------------------------
// Spending history: a yearly report plus every month, for the long run.
// ------------------------------------------------------------------
export function HistoryScreen({ year: initialYear }: { year?: number }) {
  const { state } = useStore();
  const ui = useUI();
  const years = activeYears(state);
  const thisYear = Number(state.today.slice(0, 4));
  const [year, setYear] = useState(initialYear && years.includes(initialYear) ? initialYear : thisYear);
  const y = useMemo(() => yearSummary(state, year), [state, year]);
  const started = y.months.filter((m) => !m.future);
  const defaultMonth = (year === thisYear ? state.today.slice(0, 8) + '01' : [...started].reverse().find((m) => m.spent > 0)?.month) ?? started[started.length - 1]?.month ?? `${year}-12-01`;
  const [picked, setPicked] = useState<string | null>(null);
  const sel = picked && picked.startsWith(String(year)) ? picked : defaultMonth;
  const selStat = y.months.find((m) => m.month === sel) ?? monthStat(state, sel);
  const selCats = useMemo(() => {
    if (selStat.future) return [];
    const end = selStat.current ? state.today : endOfMonth(sel);
    return spendByCategory(state, sel, end).slice(0, 4);
  }, [state, sel, selStat.future, selStat.current]);
  const idx = years.indexOf(year);
  const vsAvg = y.avgSpent && selStat.spent ? (selStat.spent - y.avgSpent) / y.avgSpent : 0;
  const maxCat = Math.max(1, ...y.categories.map((c) => c.amount));
  // Months before the first thing was logged are left out of the list, not shown as zero.
  const firstLogged = state.transactions.reduce<string>((m, t) => (t.date < m ? t.date : m), state.today).slice(0, 8) + '01';
  const history = [...started].reverse().filter((m) => m.month >= firstLogged || m.spent > 0 || m.income > 0);
  const tracked = started.filter((m) => m.month >= firstLogged).length;
  const maxMonth = Math.max(1, ...history.map((m) => Math.max(m.spent, m.income)));

  return (
    <div>
      <TopNavigation title="Spending history" onBack={ui.pop} sub="Your year at a glance, and every month you've tracked." />

      <div className="mb-4 flex items-center justify-between">
        <button type="button" className="tap grid h-10 w-10 place-items-center rounded-full border border-line disabled:opacity-30" disabled={idx >= years.length - 1} onClick={() => setYear(years[idx + 1])} aria-label="Previous year">
          <Icon name="back" size={18} />
        </button>
        <p className="display text-[22px]" aria-live="polite">
          {year}
        </p>
        <button type="button" className="tap grid h-10 w-10 place-items-center rounded-full border border-line disabled:opacity-30" disabled={idx <= 0} onClick={() => setYear(years[idx - 1])} aria-label="Next year">
          <Icon name="chevron" size={18} />
        </button>
      </div>

      <section className="rounded-3xl border border-line bg-surface p-5" aria-labelledby="hist-year">
        <p id="hist-year" className="eyebrow">
          Spent in {year}
          {year === thisYear ? ' so far' : ''}
        </p>
        <p className="num-hero mt-1 text-[38px] leading-none">{rupees(y.spent)}</p>
        <p className="mt-2 text-[14px] text-ink2">{y.avgSpent ? `${rupees(y.avgSpent)} a month on average across ${started.filter((m) => m.spent > 0).length} month${started.filter((m) => m.spent > 0).length === 1 ? '' : 's'}` : 'Nothing logged this year yet.'}</p>

        <div className="mt-5 rounded-2xl bg-sunk/60 p-3.5" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[14px] font-semibold">
              {monthName(sel)}
              {selStat.current ? ' so far' : ''}
            </p>
            <p className="num text-[18px] font-semibold">{rupees(selStat.spent)}</p>
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink3">
            {selStat.spent && y.avgSpent && !selStat.current ? `${Math.abs(Math.round(vsAvg * 100))}% ${vsAvg >= 0 ? 'above' : 'below'} your monthly average · ` : ''}
            {rupees(selStat.income)} in · {rupees(selStat.saved + selStat.invested)} to plans & SIPs
          </p>
        </div>

        <div className="mt-4">
          <MonthBars months={y.months} selected={sel} onSelect={setPicked} avg={y.avgSpent} />
        </div>
        <p className="mt-2 text-[12px] text-ink3">Tap a bar to see that month. The dashed line is your average.</p>

        {selCats.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            {selCats.map((c) => (
              <li key={c.category} className="flex items-center gap-3 text-[14px]">
                <CategoryMark state={state} category={c.category} size={28} />
                <span className="min-w-0 flex-1 truncate">{state.categories.find((x) => x.id === c.category)?.name ?? c.category}</span>
                <span className="num font-semibold">{rupees(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {!selStat.future && (selStat.spent > 0 || selStat.income > 0) && (
          <button type="button" className="btn-quiet mt-4 w-full" onClick={() => ui.openSheet({ type: 'recap', month: sel })}>
            <Icon name="spark" size={16} /> Open {monthName(sel)} recap
          </button>
        )}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3" aria-label={`${year} totals`}>
        {[
          { label: 'Money in', value: rupees(y.income) },
          { label: 'Into plans & SIPs', value: rupees(y.saved + y.invested) },
          { label: 'Costliest month', value: y.highest ? `${monthShort(y.highest.month)} · ${rupeesShort(y.highest.spent)}` : '—' },
          y.lowest ? { label: 'Lightest month', value: `${monthShort(y.lowest.month)} · ${rupeesShort(y.lowest.spent)}` } : { label: 'Months tracked', value: String(tracked) },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[12.5px] text-ink3">{t.label}</p>
            <p className="num mt-1 text-[17px] font-semibold">{t.value}</p>
          </div>
        ))}
      </section>

      {y.categories.length > 0 && (
        <section className="mt-8" aria-labelledby="hist-cats">
          <h2 id="hist-cats" className="eyebrow mb-3 px-1">
            Where it went in {year}
          </h2>
          <ul className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-4">
            {y.categories.slice(0, 8).map((c) => (
              <li key={c.category}>
                <div className="flex items-center gap-3">
                  <CategoryMark state={state} category={c.category} size={32} />
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{c.name}</span>
                  <span className="num text-[14px] font-semibold">{rupees(c.amount)}</span>
                  <span className="num w-10 text-right text-[12.5px] text-ink3">{Math.round(c.share * 100)}%</span>
                </div>
                <div className="ml-11 mt-1.5 h-1.5 rounded-full bg-sunk">
                  <div className="h-full rounded-full bg-ink/60" style={{ width: `${Math.max(2, (c.amount / maxCat) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8" aria-labelledby="hist-months">
        <h2 id="hist-months" className="eyebrow mb-1 px-1">
          Month by month
        </h2>
        <p className="mb-3 px-1 text-[12.5px] text-ink3">
          <span className="mr-3 inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" /> Spent
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-pos" /> Came in
          </span>
        </p>
        {history.length ? (
          <ul className="flex flex-col">
            {history.map((m) => (
              <li key={m.month}>
                <button type="button" className="row-btn flex-col items-stretch gap-2 py-3" onClick={() => ui.openSheet({ type: 'recap', month: m.month })} aria-label={`${monthName(m.month)} ${year}: ${rupees(m.spent)} spent, ${rupees(m.income)} came in. Open recap`}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-semibold">
                      {monthName(m.month)}
                      {m.current ? <span className="ml-1.5 text-[12.5px] font-medium text-ink3">so far</span> : null}
                    </span>
                    <span className="num text-[15px] font-semibold">{rupees(m.spent)}</span>
                  </span>
                  <span className="flex flex-col gap-1" aria-hidden="true">
                    <span className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(m.spent ? 1.5 : 0, (m.spent / maxMonth) * 100)}%` }} />
                    <span className="h-1.5 rounded-full bg-pos/70" style={{ width: `${Math.max(m.income ? 1.5 : 0, (m.income / maxMonth) * 100)}%` }} />
                  </span>
                  <span className="flex justify-between text-[12.5px] text-ink3">
                    <span>{rupees(m.income)} came in</span>
                    <span>{m.income - m.spent >= 0 ? `${rupees(m.income - m.spent)} not spent` : `${rupees(m.spent - m.income)} more than came in`}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-[14px] text-ink3">Nothing logged in {year} yet.</p>
        )}
        {history.length > 0 && year === Number(firstLogged.slice(0, 4)) && firstLogged.slice(5, 7) !== '01' && (
          <p className="mt-2 px-1 text-[12.5px] text-ink3">You started tracking in {monthName(firstLogged)} {year}. Earlier months fill in if you add past expenses.</p>
        )}
      </section>

      {years.length > 1 && (
        <section className="mt-8" aria-labelledby="hist-years">
          <h2 id="hist-years" className="eyebrow mb-2 px-1">
            Every year
          </h2>
          {years.map((yr) => {
            const s = yr === year ? y : yearSummary(state, yr);
            return (
              <button key={yr} type="button" className="row-btn" onClick={() => setYear(yr)} aria-pressed={yr === year}>
                <span className="flex-1 text-[15px] font-semibold">{yr}</span>
                <span className="num text-[14.5px]">{rupees(s.spent)} spent</span>
                <Icon name="chevron" size={16} className="text-ink3" />
              </button>
            );
          })}
        </section>
      )}
      <p className="mt-6 px-1 text-[12.5px] text-ink3">Everything here comes from what you log in PULSE on this device. Export a backup from You → Export data to keep it safe.</p>
    </div>
  );
}
