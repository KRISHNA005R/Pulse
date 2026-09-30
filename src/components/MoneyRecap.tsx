import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store/store';
import { buildRecap } from '../lib/insights';
import { monthName, rupees } from '../lib/format';
import { prevMonth } from '../lib/finance';
import { Icon } from './ui/Icon';

type Tone = 'accent' | 'ink' | 'plain';

export function MoneyRecapCard({ tone, eyebrow, children }: { tone: Tone; eyebrow: string; children: ReactNode }) {
  const cls = tone === 'accent' ? 'bg-accent text-on-accent' : tone === 'ink' ? 'bg-ink text-bg' : 'bg-surface text-ink border border-line';
  return (
    <div className={`flex h-full flex-col rounded-3xl p-6 md:p-8 ${cls}`}>
      <p className="eyebrow !text-current opacity-70">{eyebrow}</p>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function MoneyRecap({ onClose, month: initialMonth }: { onClose: () => void; month?: string }) {
  const { state } = useStore();
  const [month, setMonth] = useState(initialMonth && initialMonth <= state.today ? initialMonth : state.today);
  const r = useMemo(() => buildRecap(state, month), [state, month]);
  const [i, setI] = useState(0);

  const pages: { tone: Tone; eyebrow: string; body: ReactNode; label: string }[] = [
    {
      tone: 'accent',
      eyebrow: 'PULSE recap',
      label: 'Cover',
      body: (
        <div className="flex flex-1 flex-col justify-between">
          <div>
            <p className="display text-[22px] opacity-80">Your</p>
            <p className="num-hero text-[clamp(34px,10vw,52px)] leading-[0.95] [overflow-wrap:anywhere] md:text-[64px]">{r.monthLabel}</p>
            <p className="mt-4 max-w-[26ch] text-[16px] opacity-85">
              {r.partial ? `So far, through ${r.throughDate}. ` : ''}A quick look at where your money went and what it did for you.
            </p>
          </div>
          <div className="flex gap-2">
            {[prevMonth(state.today), state.today].map((m) => (
              <button key={m} type="button" onClick={(e) => { e.stopPropagation(); setMonth(m); setI(0); }} className={`tap min-h-[36px] rounded-full px-4 text-[13.5px] font-semibold ${month.slice(0, 7) === m.slice(0, 7) ? 'bg-on-accent text-accent' : 'bg-on-accent/15'}`}>
                {monthName(m)}
              </button>
            ))}
          </div>
        </div>
      ),
    },
    {
      tone: 'plain',
      eyebrow: 'Money in, money out',
      label: 'Totals',
      body: (
        <div className="flex flex-1 flex-col justify-center gap-5">
          {[
            ['Came in', r.income],
            ['Spent', r.spent],
            ['Saved to plans', r.saved],
            ...(r.invested > 0 ? [['Invested', r.invested]] : []),
          ].map(([l, v]) => (
            <div key={l as string}>
              <p className="text-[15px] text-ink2">{l}</p>
              <p className={`num-hero text-[34px] leading-none md:text-[43px] ${l === 'Saved to plans' || l === 'Invested' ? 'text-accent-ink' : ''}`}>{rupees(v as number)}</p>
            </div>
          ))}
          <p className="text-[14.5px] text-ink2">
            {r.vsLast !== 0 ? `Spending is ${Math.abs(Math.round(r.vsLast * 100))}% ${r.vsLast >= 0 ? 'higher' : 'lower'} than the month before. ` : ''}Group expenses count only your share.
          </p>
        </div>
      ),
    },
    {
      tone: 'ink',
      eyebrow: 'Your top category',
      label: 'Top category',
      body: (
        <div className="flex flex-1 flex-col justify-between gap-6">
          <div>
            <p className="num-hero text-[clamp(30px,9vw,46px)] leading-none [overflow-wrap:anywhere] md:text-[56px]">{r.topCategory?.name ?? 'Nothing yet'}</p>
            <p className="num mt-2 text-[20px] opacity-80">
              {rupees(r.topCategory?.amount ?? 0)} · {Math.round((r.topCategory?.share ?? 0) * 100)}% of spending
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {r.categories.slice(0, 5).map((c) => (
              <li key={c.name} className="flex items-center gap-3 text-[14px]">
                <span className="w-[92px] shrink-0 opacity-80">{c.name}</span>
                <span className="h-2 rounded-full bg-bg/70" style={{ width: `${Math.max(4, (c.amount / (r.categories[0]?.amount || 1)) * 60)}%` }} />
                <span className="num ml-auto opacity-80">{rupees(c.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-2xl bg-bg/10 p-4">
            <p className="text-[13px] opacity-70">Biggest purchase</p>
            <p className="text-[17px] font-semibold">
              {r.biggest ? <>{r.biggest.note ?? r.biggest.merchant} <span className="num opacity-80">· {rupees(r.biggest.amount)}</span></> : 'Nothing big this month'}
            </p>
            <p className="text-[13px] opacity-70">
              {r.biggest?.merchant}, {r.biggest?.date}
            </p>
          </div>
        </div>
      ),
    },
    {
      tone: 'plain',
      eyebrow: 'Plans that moved',
      label: 'Plans',
      body: (
        <div className="flex flex-1 flex-col justify-center gap-5">
          {r.planProgress.length ? (
            r.planProgress.map((p) => (
              <div key={p.name} className="flex items-baseline justify-between gap-3 border-b border-line pb-4">
                <p className="text-[18px] font-semibold">
                  {p.icon} {p.name}
                </p>
                <p className="num-hero text-[30px] text-accent-ink">+{Math.round(p.delta * 100)}%</p>
              </div>
            ))
          ) : (
            <p className="text-[16px] text-ink2">No plan contributions this month.</p>
          )}
          <p className="text-[14.5px] text-ink2">
            Recurring spend this month: <span className="num font-semibold text-ink">{rupees(r.recurring)}</span> on subscriptions and memberships.
          </p>
        </div>
      ),
    },
    {
      tone: 'accent',
      eyebrow: '3 things you did well',
      label: 'Wins',
      body: (
        <ol className="flex flex-1 flex-col justify-center gap-5">
          {r.wins.map((w, k) => (
            <li key={w} className="flex gap-4">
              <span className="num-hero text-[28px] leading-none opacity-60">{k + 1}</span>
              <p className="text-[18px] font-medium leading-snug">{w}</p>
            </li>
          ))}
        </ol>
      ),
    },
    {
      tone: 'plain',
      eyebrow: '3 things to notice',
      label: 'Notice',
      body: (
        <div className="flex flex-1 flex-col justify-between gap-5">
          <ul className="flex flex-col gap-4">
            {r.notice.map((w) => (
              <li key={w} className="flex gap-3 text-[16px] leading-snug">
                <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sunk text-ink2" aria-hidden="true">
                  <Icon name="info" size={14} />
                </span>
                {w}
              </li>
            ))}
          </ul>
          <div className="rounded-2xl bg-accent-soft p-4">
            <p className="eyebrow !text-accent-ink">One adjustment to try</p>
            <p className="mt-1 text-[16px] font-medium leading-snug">{r.adjustment}</p>
          </div>
        </div>
      ),
    },
  ];

  const empty = r.spent === 0 && r.income === 0 && r.saved === 0 && r.invested === 0;
  const visible = empty ? pages.slice(0, 1).map((pg) => ({ ...pg, body: (
    <div className="flex flex-1 flex-col justify-between">
      <div>
        <p className="display text-[22px] opacity-80">Your</p>
        <p className="num-hero text-[clamp(34px,10vw,52px)] leading-[0.95] [overflow-wrap:anywhere] md:text-[64px]">{r.monthLabel}</p>
        <p className="mt-4 max-w-[28ch] text-[16px] opacity-85">Nothing logged for this month yet. Add a few expenses and your recap fills itself in.</p>
      </div>
      <div className="flex gap-2">
        {[prevMonth(state.today), state.today].map((m) => (
          <button key={m} type="button" onClick={() => { setMonth(m); setI(0); }} className={`tap min-h-[36px] rounded-full px-4 text-[13.5px] font-semibold ${month.slice(0, 7) === m.slice(0, 7) ? 'bg-on-accent text-accent' : 'bg-on-accent/15'}`}>
            {monthName(m)}
          </button>
        ))}
      </div>
    </div>
  ) })) : pages;
  pages.splice(0, pages.length, ...visible);
  const next = () => setI((x) => Math.min(pages.length - 1, x + 1));
  const prev = () => setI((x) => Math.max(0, x - 1));
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  const p = pages[Math.min(i, pages.length - 1)];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex gap-1" role="tablist" aria-label="Recap pages">
        {pages.map((pg, k) => (
          <button key={pg.label} type="button" role="tab" aria-selected={k === i} aria-label={pg.label} onClick={() => setI(k)} className="h-5 flex-1 py-2">
            <span className={`block h-1 rounded-full ${k <= i ? 'bg-ink' : 'bg-line'}`} />
          </button>
        ))}
      </div>
      <div className="relative min-h-[460px] flex-1" key={`${i}-${month}`}>
        <div className="h-full animate-rise">
          <MoneyRecapCard tone={p.tone} eyebrow={p.eyebrow}>
            {p.body}
          </MoneyRecapCard>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={prev} disabled={i === 0} className="btn-quiet w-12 px-0 disabled:opacity-30" aria-label="Previous">
          <Icon name="back" size={20} />
        </button>
        {i < pages.length - 1 ? (
          <button type="button" onClick={next} className="btn-primary flex-1">
            Next
          </button>
        ) : (
          <button type="button" onClick={onClose} className="btn-primary flex-1">
            Done
          </button>
        )}
      </div>
    </div>
  );
}
