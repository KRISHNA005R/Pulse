import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { activeYears, monthStat, yearSummary, type MonthStat } from '../lib/history';
import { categoryName, spendByCategory } from '../lib/finance';
import { endOfMonth, monthName, monthShort, rupees, rupeesShort } from '../lib/format';
import { TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';

/** Colours for categories in a chart, biggest first. The rest share a quiet grey. */
export const CAT_COLORS = ['rgb(var(--accent))', 'rgb(var(--ink) / .78)', '#E9A23B', 'rgb(var(--pos))', 'rgb(var(--ink3) / .8)'];
const REST_COLOR = 'rgb(var(--ink3) / .35)';

// ------------------------------------------------------------------
// Twelve monthly bars for one year. Tap a bar to pick that month.
// ------------------------------------------------------------------
export function MonthBars({ months, selected, onSelect, compact, avg }: { months: MonthStat[]; selected?: string; onSelect?: (m: string) => void; compact?: boolean; avg?: number }) {
  const max = Math.max(1, ...months.map((m) => m.spent));
  const h = compact ? 64 : 168;
  const room = compact ? 0 : 26; // space above the tallest bar for its amount
  const plot = h - room;
  const avgPct = avg && avg > 0 ? Math.min(1, avg / max) : 0;
  return (
    <div className="relative">
      <div className="relative flex items-end gap-[3px]" style={{ height: h }} role={onSelect ? 'radiogroup' : 'img'} aria-label={onSelect ? 'Months' : `Monthly spending: ${months.filter((m) => !m.future).map((m) => `${monthShort(m.month)} ${rupees(m.spent)}`).join(', ')}`}>
        {avgPct > 0 && !compact && (
          <div className="pointer-events-none absolute inset-x-0 z-[1] border-t border-dashed border-ink/25" style={{ bottom: avgPct * plot }} aria-hidden="true">
            <span className="absolute -top-[10px] left-0 rounded-full bg-surface px-1.5 text-[10.5px] font-semibold text-ink3 ring-1 ring-line">avg {rupeesShort(avg!)}</span>
          </div>
        )}
        {months.map((m, idx) => {
          const on = selected === m.month;
          const px = m.future ? 0 : Math.max(m.spent > 0 ? 4 : 2, (m.spent / max) * plot);
          const bar = (
            <span className="relative block w-full" style={{ height: px }}>
              <span
                className={`block h-full w-full origin-bottom animate-grow ${compact ? 'rounded-t-[3px]' : 'rounded-[6px]'} transition-colors ${on ? 'bg-accent' : m.current ? 'bar-hatch' : 'bg-ink/[.13] group-hover:bg-ink/[.2]'}`}
                style={{ animationDelay: `${idx * 35}ms` }}
              />
              {on && !compact && (
                <span data-testid="bar-label" className="num absolute bottom-full left-1/2 z-[2] mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2 py-[3px] text-[11px] font-semibold text-surface">
                  {rupeesShort(m.spent)}
                </span>
              )}
            </span>
          );
          return onSelect && !m.future ? (
            <button key={m.month} type="button" role="radio" aria-checked={on} aria-label={`${monthName(m.month)}: ${rupees(m.spent)} spent${m.current ? ' so far' : ''}`} onClick={() => onSelect(m.month)} className="group flex h-full flex-1 items-end focus-visible:outline-offset-1">
              {bar}
            </button>
          ) : (
            <span key={m.month} className="flex h-full flex-1 items-end" aria-hidden="true">
              {m.future ? <span className="mx-auto mb-0.5 block h-1 w-1 rounded-full bg-line" /> : bar}
            </span>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px]" aria-hidden="true">
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
// A ring of categories that draws itself in. Biggest first.
// ------------------------------------------------------------------
function Donut({ parts, size = 136, stroke = 20, center }: { parts: { key: string; value: number; color: string }[]; size?: number; stroke?: number; center: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(1));
    return () => cancelAnimationFrame(id);
  }, []);
  let at = 0;
  const gap = parts.length > 1 ? 2.5 : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-testid="cat-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--sunk))" strokeWidth={stroke} />
        {parts.map((p, i) => {
          const len = (p.value / total) * c;
          const start = at;
          at += len;
          return (
            <circle
              key={p.key}
              data-cat={p.key}
              className="donut-seg"
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - gap) * shown} ${c}`}
              strokeDashoffset={-start * shown}
              style={{ transition: `stroke-dasharray .9s cubic-bezier(.3,.7,.2,1) ${i * 70}ms, stroke-dashoffset .9s cubic-bezier(.3,.7,.2,1) ${i * 70}ms` }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{center}</div>
    </div>
  );
}

// ------------------------------------------------------------------
// Spending history: the year as a chart, where it went, and the last few months.
// ------------------------------------------------------------------
export function HistoryScreen({ year: initialYear }: { year?: number }) {
  const { state } = useStore();
  const ui = useUI();
  const years = activeYears(state);
  const thisYear = Number(state.today.slice(0, 4));
  const [year, setYear] = useState(initialYear && years.includes(initialYear) ? initialYear : thisYear);
  const [allCats, setAllCats] = useState(false);
  const [allMonths, setAllMonths] = useState(false);
  const y = useMemo(() => yearSummary(state, year), [state, year]);
  const started = y.months.filter((m) => !m.future);
  const defaultMonth = (year === thisYear ? state.today.slice(0, 8) + '01' : [...started].reverse().find((m) => m.spent > 0)?.month) ?? started[started.length - 1]?.month ?? `${year}-12-01`;
  const [picked, setPicked] = useState<string | null>(null);
  const sel = picked && picked.startsWith(String(year)) ? picked : defaultMonth;
  const selStat = y.months.find((m) => m.month === sel) ?? monthStat(state, sel);
  const selCats = useMemo(() => {
    if (selStat.future) return [];
    const end = selStat.current ? state.today : endOfMonth(sel);
    return spendByCategory(state, sel, end);
  }, [state, sel, selStat.future, selStat.current]);
  const idx = years.indexOf(year);
  const vsAvg = y.avgSpent && selStat.spent ? (selStat.spent - y.avgSpent) / y.avgSpent : 0;
  // Months before the first thing was logged are left out of the list, not shown as zero.
  const firstLogged = state.transactions.reduce<string>((m, t) => (t.date < m ? t.date : m), state.today).slice(0, 8) + '01';
  const history = [...started].reverse().filter((m) => m.month >= firstLogged || m.spent > 0 || m.income > 0);
  const maxMonth = Math.max(1, ...history.map((m) => m.spent));
  const monthsShown = allMonths ? history : history.slice(0, 3);

  // A category keeps the same colour everywhere on this page: its place in the year's top five.
  const colorOf = (cat: string) => {
    const i = y.categories.findIndex((c) => c.category === cat);
    return i >= 0 && i < 5 ? CAT_COLORS[i] : REST_COLOR;
  };
  // The picked month as one bar: its top four categories, then everything else.
  const top4 = selCats.slice(0, 4);
  const restSel = selCats.slice(4).reduce((a, c) => a + c.amount, 0);
  const selParts = [...top4.map((c) => ({ key: c.category, name: categoryName(state, c.category), value: c.amount, color: colorOf(c.category) })), ...(restSel > 0 ? [{ key: 'rest', name: 'Other', value: restSel, color: REST_COLOR }] : [])];
  const selTotal = selParts.reduce((a, p) => a + p.value, 0) || 1;

  // The year's donut: the top five, then the rest as one grey slice.
  const top5 = y.categories.slice(0, 5);
  const restYear = y.categories.slice(5).reduce((a, c) => a + c.amount, 0);
  const yearParts = [...top5.map((c, i) => ({ key: c.category, value: c.amount, color: CAT_COLORS[i] })), ...(restYear > 0 ? [{ key: 'rest', value: restYear, color: REST_COLOR }] : [])];
  const legend = allCats ? y.categories : top5;

  return (
    <div>
      <TopNavigation title="Spending history" onBack={ui.pop} />

      <section className="rounded-3xl border border-line bg-surface p-5" aria-labelledby="hist-year">
        <div className="flex items-center justify-between gap-3">
          <p id="hist-year" className="eyebrow">
            Spent in {year}
            {year === thisYear ? ' so far' : ''}
          </p>
          <div className="-mr-2 -mt-1 flex items-center">
            <button type="button" className="tap grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-sunk disabled:opacity-25" disabled={idx >= years.length - 1} onClick={() => setYear(years[idx + 1])} aria-label="Previous year">
              <Icon name="back" size={16} />
            </button>
            <span className="num w-11 text-center text-[14px] font-semibold" aria-live="polite">
              {year}
            </span>
            <button type="button" className="tap grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-sunk disabled:opacity-25" disabled={idx <= 0} onClick={() => setYear(years[idx - 1])} aria-label="Next year">
              <Icon name="chevron" size={16} />
            </button>
          </div>
        </div>
        <p className="num-hero mt-1 text-[38px] leading-none">{rupees(y.spent)}</p>
        <p className="mt-2 text-[13.5px] text-ink3">{y.avgSpent ? `${rupees(y.avgSpent)} a month on average` : 'Nothing logged this year yet.'}</p>

        <div className="mt-6">
          <MonthBars months={y.months} selected={sel} onSelect={setPicked} avg={y.avgSpent} />
        </div>

        <div className="mt-5 border-t border-line pt-4" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[15px] font-semibold" data-testid="sel-month">
              {monthName(sel)}
              {selStat.current ? <span className="ml-1.5 text-[12.5px] font-medium text-ink3">so far</span> : null}
            </p>
            <p className="num text-[18px] font-semibold">{rupees(selStat.spent)}</p>
          </div>
          {selStat.spent > 0 && y.avgSpent > 0 && !selStat.current && Math.abs(vsAvg) >= 0.01 && (
            <p className={`mt-0.5 text-right text-[12px] font-semibold ${vsAvg < 0 ? 'text-pos' : 'text-ink3'}`}>
              {Math.abs(Math.round(vsAvg * 100))}% {vsAvg < 0 ? 'below' : 'above'} average
            </p>
          )}
          {selParts.length > 0 && (
            <>
              <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full" data-testid="month-split" role="img" aria-label={selParts.map((p) => `${p.name} ${rupees(p.value)}`).join(', ')}>
                {selParts.map((p) => (
                  <span key={p.key} data-cat={p.key} className="h-full origin-left animate-grow-x first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / selTotal) * 100}%`, background: p.color }} />
                ))}
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px]" aria-hidden="true">
                {selParts.map((p) => (
                  <li key={p.key} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-ink2">{p.name}</span>
                    <span className="num font-semibold">{rupeesShort(p.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!selStat.future && (selStat.spent > 0 || selStat.income > 0) && (
            <button type="button" className="btn-quiet mt-4 min-h-[40px] w-full text-[14px]" onClick={() => ui.openSheet({ type: 'recap', month: sel })}>
              <Icon name="spark" size={16} /> {monthShort(sel)} recap
            </button>
          )}
        </div>
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2" aria-label={`${year} totals`}>
        {[
          { label: 'Came in', value: rupeesShort(y.income), icon: 'arrow-in' },
          { label: 'Plans & SIPs', value: rupeesShort(y.saved + y.invested), icon: 'piggy' },
          { label: 'Peak month', value: y.highest ? `${monthShort(y.highest.month).slice(0, 3)} · ${rupeesShort(y.highest.spent)}` : '—', icon: 'trend' },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-surface px-3 py-3">
            <Icon name={t.icon} size={15} className="text-ink3" />
            <p className="num mt-1.5 truncate text-[15px] font-semibold">{t.value}</p>
            <p className="truncate text-[11.5px] text-ink3">{t.label}</p>
          </div>
        ))}
      </section>

      {y.categories.length > 0 && (
        <section className="mt-6 rounded-3xl border border-line bg-surface p-5" aria-labelledby="hist-cats">
          <h2 id="hist-cats" className="eyebrow">
            Where it went
          </h2>
          <div className="mt-4 flex items-center gap-5">
            <Donut
              parts={yearParts}
              center={
                <span>
                  <span className="num block text-[17px] font-semibold leading-tight">{rupeesShort(y.spent)}</span>
                  <span className="block text-[11px] text-ink3">{year}</span>
                </span>
              }
            />
            {!allCats && (
              <ul className="flex min-w-0 flex-1 flex-col gap-2" data-testid="cat-legend">
                {legend.map((c, i) => (
                  <li key={c.category} className="flex items-center gap-2 text-[13.5px]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CAT_COLORS[i] }} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="num font-semibold">{Math.round(c.share * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {allCats && (
            <ul className="mt-4 flex flex-col gap-2.5 border-t border-line pt-4" data-testid="cat-legend">
              {legend.map((c, i) => (
                <li key={c.category} className="flex items-center gap-2.5 text-[14px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CAT_COLORS[i] ?? REST_COLOR }} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="num font-semibold">{rupees(c.amount)}</span>
                  <span className="num w-9 text-right text-[12.5px] text-ink3">{Math.round(c.share * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
          {y.categories.length > 5 && (
            <button type="button" className="mt-4 flex w-full items-center justify-center gap-1 text-[13.5px] font-semibold text-accent-ink" onClick={() => setAllCats((v) => !v)} aria-expanded={allCats}>
              {allCats ? 'Show less' : `All categories (${y.categories.length})`}
              <Icon name="down" size={15} className={allCats ? 'rotate-180' : ''} />
            </button>
          )}
        </section>
      )}

      <section className="mt-6" aria-labelledby="hist-months">
        <h2 id="hist-months" className="eyebrow mb-2 px-1">
          Month by month
        </h2>
        {history.length ? (
          <ul className="overflow-hidden rounded-3xl border border-line bg-surface">
            {monthsShown.map((m) => {
              const left = m.income - m.spent;
              return (
                <li key={m.month} className="border-b border-line last:border-b-0">
                  <button type="button" data-testid="month-row" className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-sunk/50" onClick={() => ui.openSheet({ type: 'recap', month: m.month })} aria-label={`${monthName(m.month)} ${year}: ${rupees(m.spent)} spent, ${rupees(m.income)} came in. Open recap`}>
                    <span className="w-[74px] shrink-0">
                      <span className="block text-[14.5px] font-semibold">{monthShort(m.month)}</span>
                      {m.current && <span className="block text-[11.5px] text-ink3">so far</span>}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
                      <span className="block h-full origin-left animate-grow-x rounded-full bg-accent" style={{ width: `${Math.max(m.spent ? 2 : 0, (m.spent / maxMonth) * 100)}%` }} />
                    </span>
                    <span className="w-[78px] shrink-0 text-right">
                      <span className="num block text-[14.5px] font-semibold">{rupeesShort(m.spent)}</span>
                      {m.income > 0 && <span className={`num block text-[11.5px] font-semibold ${left >= 0 ? 'text-pos' : 'text-ink3'}`}>{left >= 0 ? `+${rupeesShort(left)} left` : `${rupeesShort(left)} over`}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-1 text-[14px] text-ink3">Nothing logged in {year} yet.</p>
        )}
        {history.length > 3 && (
          <button type="button" className="mt-3 flex w-full items-center justify-center gap-1 text-[13.5px] font-semibold text-accent-ink" onClick={() => setAllMonths((v) => !v)} aria-expanded={allMonths}>
            {allMonths ? 'Show less' : `Show all ${history.length} months`}
            <Icon name="down" size={15} className={allMonths ? 'rotate-180' : ''} />
          </button>
        )}
      </section>

      {years.length > 1 && (
        <section className="mt-6" aria-labelledby="hist-years">
          <h2 id="hist-years" className="eyebrow mb-2 px-1">
            Every year
          </h2>
          <div className="flex flex-wrap gap-2">
            {years.map((yr) => {
              const s = yr === year ? y : yearSummary(state, yr);
              return (
                <button key={yr} type="button" className={`tap rounded-full border px-3.5 py-2 text-[13.5px] ${yr === year ? 'border-ink bg-ink text-surface' : 'border-line bg-surface'}`} onClick={() => setYear(yr)} aria-pressed={yr === year}>
                  <span className="font-semibold">{yr}</span> <span className="num opacity-75">· {rupeesShort(s.spent)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
