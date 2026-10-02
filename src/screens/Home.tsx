import { useMemo } from 'react';
import { ex, scaled } from '../lib/currency';
import { BrandSignature } from '../components/ui/BrandSignature';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { buildInsights } from '../lib/insights';
import { detections, personBalances, socialTotals, upcoming } from '../lib/finance';
import { addDays, daysBetween, fmtDate, greeting, relDay, rupees } from '../lib/format';
import { firstSeen } from '../lib/stats';
import { InsightCard, PaydayCard, PlanProgress, SafeToSpendCard, TransactionRow } from '../components/money';
import { CategoryMark, EmptyState, PersonAvatar, SectionHeader } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';

export function HomeScreen() {
  const { state, updateSettings } = useStore();
  const ui = useUI();
  // Once, after about five days of real use: ask how it's going.
  const askFeedback = state.mode === 'personal' && state.onboarding.done && !state.settings.feedbackAsked && daysBetween(firstSeen(), state.today) >= 5;
  // Soon (next 3 days), payday, and any big payment in the next 10 days.
  const next = useMemo(() => {
    const all = upcoming(state, addDays(state.today, 10), true);
    const soon = addDays(state.today, 3);
    return all.filter((u) => u.date <= soon || u.kind === 'income' || u.kind === 'investment' || u.kind === 'insurance' || u.amount >= scaled(5000)).slice(0, 5);
  }, [state]);
  const plans = state.plans.filter((p) => p.status === 'active').slice(0, 3);
  const recent = useMemo(() => [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4), [state.transactions]);
  const insight = useMemo(() => buildInsights(state).find((i) => !i.id.startsWith('plan-')), [state]);
  const social = useMemo(() => socialTotals(state), [state]);
  const owe = [...social.balances.entries()].filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1])[0];
  const oweGroup = owe ? state.groups.find((g) => (personBalances(state, g.id).get(owe[0]) ?? 0) < 0) : undefined;
  const dup = useMemo(() => detections(state).find((d) => d.kind === 'duplicate'), [state]);

  return (
    <div className="stagger flex flex-col gap-8">
      <PaydayCard />
      <SafeToSpendCard greeting={`${greeting()}, ${state.user.name}`} />

      <section aria-labelledby="h-next">
        <SectionHeader id="h-next" title="Up next" action={{ label: 'All bills', onClick: () => ui.push({ name: 'subscriptions' }, 'you') }} />
        <ul className="flex flex-col">
          {next.map((u) => (
            <li key={u.id}>
              <button type="button" className="row-btn" onClick={() => (u.kind === 'income' ? ui.push({ name: 'income' }, 'you') : u.kind === 'investment' ? ui.push({ name: 'investments' }, 'you') : u.kind === 'insurance' ? ui.push({ name: 'insurance' }, 'you') : u.kind === 'card' ? ui.push({ name: 'cards' }, 'you') : ui.openSheet({ type: 'sub-form', subId: u.ref }))}>
                <CategoryMark state={state} category={u.kind === 'income' ? 'salary' : u.kind === 'investment' ? 'investments' : u.kind === 'insurance' ? 'insurance' : u.kind === 'subscription' ? 'subscriptions' : 'bills'} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{u.name}</span>
                  <span className="block text-[13px] text-ink3">{u.kind === 'insurance' && u.date < state.today ? `Was due ${fmtDate(u.date)}` : relDay(u.date, state.today)}{u.kind === 'investment' || u.auto ? ' · auto-debit' : ''}</span>
                </span>
                <span className={`num text-[15.5px] font-semibold ${u.kind === 'income' ? 'text-pos' : ''}`}>{u.kind === 'income' ? rupees(u.amount, { sign: true }) : rupees(u.amount)}</span>
              </button>
            </li>
          ))}
          {next.length === 0 && !owe && (
            <li>
              <button type="button" className="row-btn" onClick={() => ui.openSheet({ type: 'sub-form' })}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-dashed border-line text-ink3" aria-hidden="true">
                  <Icon name="plus" size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">Add rent, phone and subscriptions</span>
                  <span className="block text-[13px] text-ink3">They're set aside before payday, so safe-to-spend stays honest.</span>
                </span>
              </button>
            </li>
          )}
          {owe && (
            <li>
              <button type="button" className="row-btn" onClick={() => ui.openSheet({ type: 'settle', personId: owe[0], groupId: oweGroup?.id })}>
                <PersonAvatar person={state.people.find((p) => p.id === owe[0])} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">You owe {state.people.find((p) => p.id === owe[0])?.short} {rupees(-owe[1])}</span>
                  <span className="block text-[13px] text-ink3">{oweGroup ? `${oweGroup.name} · ` : ''}settle whenever</span>
                </span>
                <span className="rounded-full bg-sunk px-3 py-1.5 text-[13px] font-semibold">Settle</span>
              </button>
            </li>
          )}
        </ul>
      </section>

      {askFeedback && (
        <section aria-label="Feedback" className="-mt-2 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-[22px]" aria-hidden="true">
            💬
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-tight">Vibe check 👀 How's PULSE treating you?</p>
            <p className="mt-0.5 text-[13px] text-ink3">One tap is enough. Vote on what we build next.</p>
            <button type="button" className="btn-primary mt-3 min-h-[38px] px-4 text-[14px]" onClick={() => ui.push({ name: 'feedback' }, 'you')}>
              Spill the tea
            </button>
          </div>
          <button type="button" className="tap -mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center self-start rounded-full text-ink3 hover:bg-sunk" aria-label="Not now" onClick={() => updateSettings({ feedbackAsked: true })}>
            <Icon name="x" size={16} />
          </button>
        </section>
      )}

      <section aria-labelledby="h-plans">
        <SectionHeader id="h-plans" title="Your plans" action={{ label: 'See all', onClick: () => { ui.setPlansSegment('plans'); ui.resetTo('plans'); } }} />
        {plans.length ? (
          <div className="flex flex-col">
            {plans.map((p) => (
              <PlanProgress key={p.id} plan={p} onClick={() => ui.push({ name: 'plan', id: p.id })} />
            ))}
          </div>
        ) : (
          <EmptyState icon="target" title="No plans yet." body="Got something worth saving for?" action={{ label: 'Create a plan', onClick: () => ui.openSheet({ type: 'plan-form' }) }} />
        )}
      </section>

      <section aria-labelledby="h-recent">
        <SectionHeader id="h-recent" title="Recent" action={{ label: 'Activity', onClick: () => ui.resetTo('activity') }} />
        {recent.length ? (
          <ul className="flex flex-col">
            {recent.map((t) => (
              <TransactionRow key={t.id} tx={t} compact />
            ))}
          </ul>
        ) : (
          <EmptyState icon="plus" title="Nothing logged yet." body={`Tap + and type something like “${ex(180)} chai and samosa”. PULSE works out the rest.`} action={{ label: 'Add first expense', onClick: () => ui.openSheet({ type: 'composer' }) }} />
        )}
      </section>

      {!insight && state.transactions.length > 0 && state.transactions.length < 15 && (
        <section aria-labelledby="h-know">
          <SectionHeader id="h-know" title="One thing to know" />
          <p className="rounded-2xl bg-accent-soft/70 p-4 text-[15px] font-medium">Keep logging for a week or two. Patterns and tips show up here once there's enough to compare.</p>
        </section>
      )}
      {insight && (
        <section aria-labelledby="h-know">
          <SectionHeader id="h-know" title="One thing to know" />
          <InsightCard insight={insight} />
          {dup && (
            <button type="button" onClick={() => ui.push({ name: 'subscriptions' })} className="tap mt-2 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[13.5px] text-ink2 hover:bg-sunk">
              <Icon name="info" size={15} className="shrink-0 text-warn" /> {dup.text} <span className="ml-auto shrink-0 font-semibold text-ink">Check</span>
            </button>
          )}
        </section>
      )}

      <BrandSignature />
    </div>
  );
}
