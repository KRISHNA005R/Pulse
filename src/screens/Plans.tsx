import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { roundMoney } from '../lib/currency';
import { useUI } from '../store/ui';
import { budgetState, defaultAccount, monthlySaves, nextPayday, weeklySaves, groupNet, groupSummary, personBalances, planMetrics, socialTotals } from '../lib/finance';
import { authorOf, groupSeat, inGroupOnPulse } from '../lib/friends';
import { fmtDate, relDay, rupees } from '../lib/format';
import { BudgetProgress, GoalCard, PlanCard, SplitCard, TransactionList } from '../components/money';
import { EmptyState, MoneyStat, PersonAvatar, Ring, SectionHeader, Segmented, StatusPill, TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';
import { GROUP_EMOJI } from '../components/Forms';
import { BhisiList } from '../components/Bhisi';
import { GullakBanner, GullakCard, GullakHero } from '../components/Gullak';
import { FriendConnect, FriendPayments, GroupShareCard } from '../components/Friends';

export function PlansScreen() {
  const ui = useUI();
  const seg = ui.plansSegment;
  const add = seg === 'plans' ? () => ui.openSheet({ type: 'plan-form' }) : seg === 'splits' ? () => ui.openSheet({ type: 'group-form' }) : seg === 'bhisi' ? () => ui.openSheet({ type: 'bhisi-form' }) : () => ui.openSheet({ type: 'budget-form' });
  return (
    <div>
      <TopNavigation
        title="Plans"
        sub="What you're saving for, who you split with, your bhisi and budgets."
        right={
          <button type="button" onClick={add} className="btn-primary min-h-[40px] px-4 text-[14px]">
            <Icon name="plus" size={16} /> {seg === 'plans' ? 'Plan' : seg === 'splits' ? 'Group' : seg === 'bhisi' ? 'Bhisi' : 'Budget'}
          </button>
        }
      />
      <Segmented label="Section" value={seg} onChange={ui.setPlansSegment} options={[{ value: 'plans', label: 'Plans' }, { value: 'splits', label: 'Splits' }, { value: 'bhisi', label: 'Bhisi' }, { value: 'budgets', label: 'Budgets' }]} />
      <div key={seg} className="mt-6 animate-toast">{seg === 'plans' ? <PlansList /> : seg === 'splits' ? <SplitsView /> : seg === 'bhisi' ? <BhisiList /> : <BudgetsView />}</div>
    </div>
  );
}

function PlansList() {
  const { state } = useStore();
  const ui = useUI();
  const active = state.plans.filter((p) => p.status === 'active' && p.kind === 'plan');
  const gullaks = state.plans.filter((p) => p.gullak && (!p.gullak.broken || p.status !== 'done' || p.saved > 0));
  const goals = state.plans.filter((p) => p.kind === 'goal' && p.status !== 'paused' && !p.gullak);
  const done = state.plans.filter((p) => p.status === 'done' && p.kind === 'plan' && !p.gullak);
  const paused = state.plans.filter((p) => p.status === 'paused');
  if (!state.plans.length)
    return (
      <div className="flex flex-col gap-6">
        <EmptyState icon="target" art="/illustrations/empty-plans.webp" title="No plans yet." body="Got something worth saving for?" action={{ label: 'Create a plan', onClick: () => ui.openSheet({ type: 'plan-form' }) }} />
        <GullakBanner />
      </div>
    );
  const open = (id: string) => ui.push({ name: 'plan', id });
  return (
    <div className="flex flex-col gap-8">
      {!gullaks.some((g) => !g.gullak?.broken) && <GullakBanner />}
      {gullaks.length > 0 && (
        <section aria-labelledby="gullak-h">
          <SectionHeader id="gullak-h" title="Gullak" action={{ label: '+ New gullak', onClick: () => ui.openSheet({ type: 'gullak-form' }) }} />
          <div className="flex flex-col gap-3">
            {gullaks.map((p) => (
              <GullakCard key={p.id} plan={p} />
            ))}
          </div>
        </section>
      )}
      {active.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Active plans">
          {active.map((p) => (
            <PlanCard key={p.id} plan={p} onOpen={() => open(p.id)} />
          ))}
        </section>
      )}
      {goals.length > 0 && (
        <section aria-labelledby="goals-h">
          <SectionHeader id="goals-h" title="Savings goals" />
          <div className="flex flex-col gap-3">
            {goals.map((p) => (
              <GoalCard key={p.id} plan={p} onOpen={() => open(p.id)} />
            ))}
          </div>
        </section>
      )}
      {done.length > 0 && (
        <section aria-labelledby="done-h">
          <SectionHeader id="done-h" title="Funded 🎉" />
          <div className="flex flex-col gap-3">
            {done.map((p) => (
              <PlanCard key={p.id} plan={p} onOpen={() => open(p.id)} />
            ))}
          </div>
        </section>
      )}
      {paused.length > 0 && (
        <section aria-labelledby="paused-h">
          <SectionHeader id="paused-h" title="Paused" />
          <div className="flex flex-col gap-3">
            {paused.map((p) => (
              <PlanCard key={p.id} plan={p} onOpen={() => open(p.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SplitsView() {
  const { state } = useStore();
  const ui = useUI();
  const t = useMemo(() => socialTotals(state), [state]);
  const together = (pid: string) => state.groups.some((g) => inGroupOnPulse(g, pid));
  // Anyone with a balance, plus friends on PULSE (connected, or in a shared group with you) even when you're square.
  const everyone = state.people
    .filter((p) => (t.balances.get(p.id) ?? 0) !== 0 || p.link || together(p.id))
    .map((p) => [p.id, t.balances.get(p.id) ?? 0] as [string, number]);
  // With a lot of friends this page shows the few that matter most (the biggest balances). The rest are one tap away.
  const TOP = 5;
  const people = (everyone.length > TOP + 1 ? [...everyone].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, TOP) : everyone).sort((a, b) => a[1] - b[1]);
  const more = state.people.length - people.length;
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface p-4">
        <MoneyStat label="You owe" value={t.youOwe} />
        <MoneyStat label="You're owed" value={t.owedToYou} tone="pos" />
      </div>

      <section aria-labelledby="people-h">
        <SectionHeader id="people-h" title="People" action={{ label: 'Split an expense', onClick: () => ui.openSheet({ type: 'group-expense' }) }} />
        {people.length ? (
          <ul className="flex flex-col">
            {people.map(([id, v]) => {
              const p = state.people.find((x) => x.id === id)!;
              return (
                <li key={id} className="flex items-center gap-1">
                  <button type="button" className="row-btn flex-1" onClick={() => ui.push({ name: 'person', id })}>
                    <PersonAvatar person={p} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                      <span className="block truncate text-[13px] text-ink3">
                        {v !== 0 && <span className={v > 0 ? 'font-medium text-pos' : 'font-medium text-ink2'}>{v < 0 ? `You owe ${rupees(-v)}` : `Owes you ${rupees(v)}`}</span>}
                        {v !== 0 && (p.link || together(p.id)) ? ' · ' : ''}
                        {p.link ? (p.link.status === 'linked' ? 'on PULSE' : p.link.door ? 'connecting' : 'invite sent') : together(p.id) ? 'in a group with you' : ''}
                      </span>
                    </span>
                  </button>
                  {v !== 0 && (
                    <button type="button" className="btn-quiet min-h-[38px] shrink-0 px-4 text-[13.5px]" onClick={() => ui.openSheet({ type: 'settle', personId: id })}>
                      {v < 0 ? 'Settle' : 'Record'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-1 text-[14.5px] text-ink3">Everyone's square. Nice.</p>
        )}
        {more > 0 && (
          <button type="button" className="row-btn mt-1 w-full" onClick={() => ui.push({ name: 'people' })}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunk text-ink2">
              <Icon name="users" size={18} />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[15px] font-semibold">See all {state.people.length} people</span>
              <span className="block text-[13px] text-ink3">Search, or see who owes what</span>
            </span>
            <Icon name="chevron" size={18} className="shrink-0 text-ink3" />
          </button>
        )}
        {state.mode === 'personal' && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn-quiet min-h-[42px] text-[14px]" onClick={() => ui.openSheet({ type: 'friend-invite' })}>
              <Icon name="users" size={16} /> Invite friends
            </button>
            <button type="button" className="btn-quiet min-h-[42px] text-[14px]" onClick={() => ui.openSheet({ type: 'friend-join' })}>
              I have a link
            </button>
          </div>
        )}
      </section>

      <section aria-labelledby="groups-h">
        <SectionHeader id="groups-h" title="Groups" action={{ label: 'New group', onClick: () => ui.openSheet({ type: 'group-form' }) }} />
        {state.groups.length ? (
          <div className="flex flex-col gap-3">
            {state.groups.map((g) => (
              <SplitCard key={g.id} group={g} onOpen={() => ui.push({ name: 'group', id: g.id })} />
            ))}
          </div>
        ) : (
          <EmptyState icon="users" art="/illustrations/splits.webp" title="No groups yet." body="Split a dinner, trip or weekend plan with friends." action={{ label: 'Create a group', onClick: () => ui.openSheet({ type: 'group-form' }) }} />
        )}
      </section>
    </div>
  );
}

function BudgetsView() {
  const { state } = useStore();
  const ui = useUI();
  const states = state.budgets.map((b) => budgetState(state, b));
  const healthy = states.filter((s) => s.status === 'healthy').length;
  if (!state.budgets.length)
    return <EmptyState icon="sliders" title="Budgets are optional." body="Set one for a category you want to keep an eye on. Safe-to-spend works without them." action={{ label: 'Create a budget', onClick: () => ui.openSheet({ type: 'budget-form' }) }} />;
  return (
    <div>
      <p className="mb-4 px-1 text-[15px] text-ink2">
        {healthy === state.budgets.length ? 'All budgets are healthy.' : `${healthy} of ${state.budgets.length} budgets are healthy.`} The thin line shows how far through the period you are.
      </p>
      <div className="flex flex-col">
        {state.budgets.map((b) => (
          <BudgetProgress key={b.id} budget={b} onClick={() => ui.openSheet({ type: 'budget-form', budgetId: b.id })} />
        ))}
      </div>
      <button type="button" className="btn-quiet mt-4 w-full" onClick={() => ui.openSheet({ type: 'budget-form' })}>
        <Icon name="plus" size={16} /> Add a budget
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// Plan detail
// ------------------------------------------------------------------
/** The one big line on a plan: friendly, never shaming. */
function vibe(m: ReturnType<typeof planMetrics>, saved: number) {
  if (m.tone === 'done') return 'Fully funded. Go enjoy it.';
  if (m.tone === 'paused') return 'On pause. No pressure.';
  if (saved <= 0 && m.tone !== 'behind') return 'Day one. Every big plan starts at ₹0.';
  if (m.tone === 'ahead') return 'Ahead of schedule. Future you says thanks.';
  if (m.tone === 'behind') return 'A little behind. Easy to catch up.';
  return 'Right on track. Keep it steady.';
}

const MILESTONES = [
  { at: 0.25, name: 'Started' },
  { at: 0.5, name: 'Halfway' },
  { at: 0.75, name: 'Almost' },
  { at: 1, name: 'Done' },
];

export function PlanDetail({ id }: { id: string }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const plan = state.plans.find((p) => p.id === id);
  if (!plan)
    return (
      <div>
        <TopNavigation title="Plan" onBack={ui.pop} />
        <p className="text-ink3">This plan was deleted.</p>
      </div>
    );
  const m = planMetrics(state, plan);
  const group = plan.groupId ? state.groups.find((g) => g.id === plan.groupId) : undefined;
  const txs = state.transactions.filter((t) => t.plan === plan.id);
  const groupSplits = group ? state.splits.filter((s) => s.group === group.id && s.paidBy !== 'me') : [];
  const live = plan.status === 'active' && m.tone !== 'done';
  const pct = Math.round(m.progress * 100);
  // What it takes from today, in three sizes.
  const perDay = m.daysLeft > 0 ? m.remaining / m.daysLeft : m.remaining;
  const months = monthlySaves(state.today, plan.targetDate);
  const weeks = weeklySaves(state.today, plan.targetDate);
  const pace = [
    months >= 2 && { label: `a month × ${months}`, value: m.monthly },
    weeks >= 2 && { label: `a week × ${weeks}`, value: roundMoney(m.remaining / weeks) },
    { label: `a day × ${Math.max(1, m.daysLeft)}`, value: roundMoney(perDay) },
  ].filter(Boolean) as { label: string; value: number }[];
  const quick = [100, 500, 1000].filter((v) => v < m.remaining);
  const finish = m.remaining > 0 && m.remaining <= 5000 ? m.remaining : 0;
  const every = plan.reserveEvery ?? plan.cycleReserve;
  const suggestEvery = m.monthly || m.remaining;
  const payday = nextPayday(state);
  return (
    <div>
      <TopNavigation
        title={`${plan.name} ${plan.icon}`}
        onBack={ui.pop}
        right={
          <button type="button" className="tap grid h-10 w-10 place-items-center rounded-full hover:bg-sunk" aria-label="Edit plan" onClick={() => ui.openSheet({ type: 'plan-form', planId: plan.id })}>
            <Icon name="pencil" size={18} />
          </button>
        }
      />
      {plan.gullak ? (
        <>
          <GullakHero plan={plan} />
          {plan.saved > 0 && (
            <button type="button" className="btn-quiet mt-3 w-full" onClick={() => ui.openSheet({ type: 'withdraw', planId: plan.id })}>
              Take money out
            </button>
          )}
        </>
      ) : (
      <>
      {plan.status === 'done' && <img src="/illustrations/goal-reached.webp" alt="" aria-hidden="true" width={700} height={697} decoding="async" data-testid="goal-art" className="mx-auto mb-2 h-[200px] w-auto" />}
      <section className="rounded-3xl border border-line bg-surface p-5 md:p-6" aria-label="Progress">
        <div className="flex items-center gap-5">
          <Ring value={m.progress} size={116} stroke={11} label={`${pct}% funded`}>
            <span className="text-center leading-none">
              <span className="num-hero block text-[28px]">{pct}%</span>
              <span className="mt-1 block text-[11.5px] text-ink3">funded</span>
            </span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="num-hero text-[30px] leading-none sm:text-[36px]">{rupees(plan.saved)}</p>
            <p className="num mt-1.5 text-[14.5px] text-ink3">of {rupees(plan.target)}</p>
            {m.remaining > 0 && <p className="num mt-0.5 text-[14.5px] font-semibold text-accent-ink">{rupees(m.remaining)} to go</p>}
          </div>
        </div>

        <p className="display mt-5 text-[18px] leading-snug">{vibe(m, plan.saved)}</p>
        <p className="mt-1 text-[14px] text-ink2">
          {m.tone === 'behind' || m.tone === 'ahead' ? `${m.status} ` : ''}
          {m.tone === 'done' ? `You hit ${rupees(plan.target)}.` : `Target ${fmtDate(plan.targetDate, true)} · ${m.daysLeft} ${m.daysLeft === 1 ? 'day' : 'days'} left.`}
        </p>

        {live && m.remaining > 0 && (
          <div className="mt-4 grid rounded-2xl bg-sunk p-3" style={{ gridTemplateColumns: `repeat(${pace.length}, minmax(0, 1fr))` }}>
            {pace.map((x, i) => (
              <div key={x.label} className={`px-2 text-center ${i ? 'border-l border-line' : ''}`}>
                <p className="num text-[16px] font-semibold">{rupees(x.value)}</p>
                <p className="text-[12px] text-ink3">{x.label}</p>
              </div>
            ))}
          </div>
        )}

        {live && (quick.length > 0 || finish > 0) && (
          <div className="mt-4">
            <p className="mb-2 text-[12.5px] font-semibold text-ink3">Quick add</p>
            <div className="flex flex-wrap gap-2">
              {quick.map((v) => (
                <button key={v} type="button" className="chip num" onClick={() => store.contribute(plan.id, v, defaultAccount(state))}>
                  +{rupees(v)}
                </button>
              ))}
              {finish > 0 && (
                <button type="button" className="chip num font-semibold" onClick={() => store.contribute(plan.id, finish, defaultAccount(state))}>
                  Finish it · {rupees(finish)}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {plan.status !== 'done' && (
            <button type="button" className="btn-accent flex-1 whitespace-nowrap" onClick={() => ui.openSheet({ type: 'contribute', planId: plan.id })}>
              <Icon name="plus" size={17} className="shrink-0" /> Add money
            </button>
          )}
          {plan.saved > 0 && (
            <button type="button" className={`btn-quiet whitespace-nowrap ${plan.status === 'done' ? 'flex-1' : ''}`} onClick={() => ui.openSheet({ type: 'withdraw', planId: plan.id })}>
              Take out
            </button>
          )}
          {plan.status !== 'done' && (
            <button
              type="button"
              className="btn-quiet shrink-0 px-3"
              aria-label={plan.status === 'paused' ? 'Resume plan' : 'Pause plan'}
              title={plan.status === 'paused' ? 'Resume' : 'Pause'}
              onClick={() => store.savePlan({ ...plan, status: plan.status === 'paused' ? 'active' : 'paused' })}
            >
              <Icon name={plan.status === 'paused' ? 'play' : 'pause'} size={16} />
            </button>
          )}
        </div>
      </section>
      </>
      )}

      <section className="mt-4 rounded-3xl border border-line bg-surface p-5" aria-labelledby="pm-h">
        <h2 id="pm-h" className="text-[13px] font-semibold text-ink3">
          Milestones
        </h2>
        <ol className="mt-3 grid grid-cols-4 gap-2">
          {MILESTONES.map((x) => {
            const hit = m.progress >= x.at;
            return (
              <li key={x.at} className={`rounded-2xl px-1 py-2.5 text-center ${hit ? 'bg-accent-soft' : 'bg-sunk'}`}>
                <span className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold ${hit ? 'bg-accent text-[#17140F]' : 'border border-line text-ink3'}`}>
                  {hit ? <Icon name="check" size={14} /> : `${x.at * 100}`}
                </span>
                <p className={`mt-1.5 text-[12.5px] font-semibold ${hit ? '' : 'text-ink3'}`}>{x.name}</p>
                <p className="num text-[11.5px] text-ink3">{rupees(Math.round(plan.target * x.at))}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {live && !plan.gullak && (
        <section className="mt-4 rounded-3xl border border-line bg-surface p-5" aria-labelledby="pa-h">
          <div className="flex items-start gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${every ? 'bg-accent-soft text-accent-ink' : 'bg-sunk text-ink3'}`} aria-hidden="true">
              <Icon name="repeat" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="pa-h" className="text-[15.5px] font-semibold">
                {every ? `${rupees(every)} kept aside every payday` : 'Keep aside every payday'}
              </h2>
              <p className="mt-0.5 text-[13.5px] text-ink2">
                {every
                  ? `PULSE holds it back from safe-to-spend, so you don't spend it by accident. Held now: ${rupees(plan.cycleReserve)}. Refills ${fmtDate(payday)}.`
                  : `Set it once and this plan fills itself. ${rupees(suggestEvery)} each payday gets you there on time.`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {every ? (
                  <>
                    <button type="button" className="chip" onClick={() => ui.openSheet({ type: 'plan-form', planId: plan.id })}>
                      Change amount
                    </button>
                    <button type="button" className="chip" onClick={() => store.setPlanAutoSave(plan.id, 0)}>
                      Turn off
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={() => store.setPlanAutoSave(plan.id, suggestEvery)}>
                    Turn on · {rupees(suggestEvery)}/payday
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {group && (
        <section className="mt-8" aria-labelledby="pg-h">
          <SectionHeader id="pg-h" title="Shared with" />
          <SplitCard group={group} onOpen={() => ui.push({ name: 'group', id: group.id })} />
          {groupSplits.length > 0 && <p className="mt-2 px-1 text-[13px] text-ink3">Group expenses paid by friends count toward this plan once you settle up.</p>}
        </section>
      )}

      <section className="mt-8" aria-labelledby="pt-h">
        <SectionHeader id="pt-h" title="History" />
        {txs.length ? (
          <TransactionList txs={txs} />
        ) : (
          <div className="rounded-3xl border border-dashed border-line px-5 py-8 text-center">
            <p className="text-[28px]" aria-hidden="true">
              {plan.icon}
            </p>
            <p className="mt-2 text-[15px] font-semibold">No top-ups yet</p>
            <p className="mt-1 text-[13.5px] text-ink3">Every rupee you add or take out shows up here.</p>
          </div>
        )}
      </section>

      <div className="mt-10 text-center">
        <button
          type="button"
          className="btn-ghost text-neg"
          onClick={() =>
            ui.openSheet({
              type: 'confirm',
              title: `Delete ${plan.name}?`,
              body: `The ${rupees(plan.saved)} you've saved stays in your history.`,
              confirm: 'Delete plan',
              run: () => {
                store.deletePlan(plan.id);
                ui.pop();
              },
            })
          }
        >
          <Icon name="trash" size={16} /> Delete plan
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Group detail
// ------------------------------------------------------------------
/** Overlapping faces for the top of a group. */
function Faces({ ids, max = 5 }: { ids: string[]; max?: number }) {
  const { state } = useStore();
  const shown = ids.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((pid, i) => (
        <span key={pid} className={`relative rounded-full bg-surface p-[2.5px] ${i ? '-ml-2' : ''}`} style={{ zIndex: max - i }}>
          <PersonAvatar person={state.people.find((p) => p.id === pid)} me={pid === 'me'} size={32} />
        </span>
      ))}
      {ids.length > max && (
        <span className="-ml-2 rounded-full bg-surface p-[2.5px]">
          <span className="grid h-8 min-w-8 place-items-center rounded-full bg-sunk px-1.5 text-[12px] font-semibold">+{ids.length - max}</span>
        </span>
      )}
    </span>
  );
}

type GroupTab = 'expenses' | 'balances' | 'settled';

export function GroupDetail({ id }: { id: string }) {
  const { state } = useStore();
  const ui = useUI();
  const [tab, setTab] = useState<GroupTab>('expenses');
  const group = state.groups.find((g) => g.id === id);
  if (!group) return <TopNavigation title="Group" onBack={ui.pop} />;
  const g = groupSummary(state, id);
  const plan = group.plan ? state.plans.find((p) => p.id === group.plan) : undefined;
  const settlements = state.settlements.filter((s) => s.group === id).sort((a, b) => b.date.localeCompare(a.date));
  const name = (pid: string) => (pid === 'me' ? 'You' : state.people.find((p) => p.id === pid)?.short ?? '?');
  const others = group.members.filter((m) => m !== 'me');
  const open = others.filter((pid) => (g.balances.get(pid) ?? 0) !== 0);
  // With three or more people, "who owes me" isn't the whole picture: show where everyone stands.
  const net = others.length > 1 ? [...groupNet(state, id)].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]) : [];
  // One number up top: overall, in this group. The split by person is under Balances.
  const overall = g.owedToYou - g.youOwe;
  const head = overall > 0 ? `You get back ${rupees(overall)}` : overall < 0 ? `You owe ${rupees(-overall)}` : g.youOwe ? 'You’re even overall' : 'All square';
  const vibe =
    g.youOwe && g.owedToYou
      ? `You owe ${rupees(g.youOwe)}, and you’re owed ${rupees(g.owedToYou)}.`
      : g.youOwe
        ? 'Pay back whenever you’re ready.'
        : g.owedToYou
          ? 'Your friends will sort it. Or settle it here.'
          : g.expenses.length
            ? 'Nobody owes anybody. Love that.'
            : 'Add the first expense to get going.';
  const settle = () => (open.length === 1 ? ui.openSheet({ type: 'settle', personId: open[0], groupId: id }) : setTab('balances'));
  const expenses = g.expenses.slice().sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <TopNavigation
        title={`${group.name} ${group.emoji}`}
        onBack={ui.pop}
        right={
          <button type="button" className="tap grid h-10 w-10 place-items-center rounded-full hover:bg-sunk" aria-label="Edit group" onClick={() => ui.openSheet({ type: 'group-people', groupId: id })}>
            <Icon name="pencil" size={18} />
          </button>
        }
      />

      <section className="rounded-3xl border border-line bg-surface p-5" aria-label="Where you stand">
        <button type="button" className="tap -m-1 flex items-center gap-2.5 rounded-full p-1 text-left" onClick={() => ui.openSheet({ type: 'group-people', groupId: id })} aria-label={`${group.members.length} people. Manage`}>
          <Faces ids={['me', ...others]} />
          <span className="text-[13px] text-ink3">
            {group.members.length} {group.members.length === 1 ? 'person' : 'people'}
            {plan ? ` · ${plan.name}` : ''}
          </span>
        </button>
        <p className={`display mt-4 text-[26px] leading-tight ${overall > 0 ? 'text-pos' : ''}`}>{head}</p>
        <p className="mt-1 text-[14px] text-ink2">{vibe}</p>
        <p className="num mt-3 text-[13px] text-ink3">
          {rupees(g.total)} spent together · {g.expenses.length} {g.expenses.length === 1 ? 'expense' : 'expenses'}
        </p>
        {others.length > 0 ? (
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-accent flex-1 whitespace-nowrap" onClick={() => ui.openSheet({ type: 'group-expense', groupId: id })}>
              <Icon name="plus" size={17} className="shrink-0" /> Add expense
            </button>
            {open.length > 0 && (
              <button type="button" className="btn-quiet whitespace-nowrap" onClick={settle}>
                Settle up
              </button>
            )}
          </div>
        ) : (
          <button type="button" className="btn-accent mt-4 w-full" onClick={() => ui.openSheet({ type: 'group-people', groupId: id })}>
            <Icon name="user-plus" size={17} className="shrink-0" /> Add your people
          </button>
        )}
      </section>

      {others.length > 0 && (
        <>
          <div className="mt-5">
            <Segmented
              label="Show"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'expenses', label: `Expenses${g.expenses.length ? ` · ${g.expenses.length}` : ''}` },
                { value: 'balances', label: 'Balances' },
                ...(settlements.length ? [{ value: 'settled' as const, label: `Paid · ${settlements.length}` }] : []),
              ]}
            />
          </div>

          <div key={tab} className="mt-3 animate-toast">
            {tab === 'expenses' &&
              (expenses.length ? (
                <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface px-1">
                  {expenses.map((s) => {
                    const mine = s.shares.find((x) => x.person === 'me')?.amount ?? 0;
                    const lent = s.paidBy === 'me' ? s.amount - mine : 0;
                    const by = s.remote ? authorOf(state, group, s.id)?.short : undefined;
                    return (
                      <li key={s.id} className="flex items-center gap-3 px-3 py-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sunk text-center leading-none">
                          <span>
                            <span className="num block text-[15px] font-semibold">{fmtDate(s.date).split(' ')[0]}</span>
                            <span className="block text-[9.5px] font-semibold uppercase text-ink3">{fmtDate(s.date).split(' ')[1]}</span>
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{s.description}</span>
                          <span className="block truncate text-[12.5px] text-ink3">
                            {name(s.paidBy)} paid {rupees(s.amount)}
                            {by && by !== name(s.paidBy) ? ` · by ${by}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          {s.paidBy === 'me' ? (
                            <>
                              <span className="num block text-[14.5px] font-semibold text-pos">+{rupees(lent)}</span>
                              <span className="block text-[11.5px] text-ink3">you lent</span>
                            </>
                          ) : mine ? (
                            <>
                              <span className="num block text-[14.5px] font-semibold">{rupees(mine)}</span>
                              <span className="block text-[11.5px] text-ink3">your share</span>
                            </>
                          ) : (
                            <span className="text-[12px] text-ink3">not in it</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState icon="users" title="No expenses yet." body="Add the first one. Split it equally, by exact amounts, percentages or shares." />
              ))}

            {tab === 'balances' && (
              <>
                <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface px-1">
                  {others.map((pid) => {
                    const v = g.balances.get(pid) ?? 0;
                    const p = state.people.find((x) => x.id === pid);
                    const seat = group.shared ? groupSeat(group, pid) : 'on';
                    return (
                      <li key={pid} className="flex items-center gap-3 px-3 py-2.5">
                        <PersonAvatar person={p} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{p?.short}</span>
                          <span className={`block text-[13px] ${v > 0 ? 'text-pos' : v < 0 ? 'text-ink2' : 'text-ink3'}`}>
                            {v === 0 ? 'Settled' : v < 0 ? `You owe ${rupees(-v)}` : `Owes you ${rupees(v)}`}
                            {seat === 'name' ? ' · not on PULSE yet' : seat === 'left' ? ' · left' : ''}
                          </span>
                        </span>
                        {v !== 0 ? (
                          <button type="button" className="btn-quiet min-h-[36px] px-3.5 text-[13.5px]" onClick={() => ui.openSheet({ type: 'settle', personId: pid, groupId: id })}>
                            Settle
                          </button>
                        ) : (
                          <Icon name="check" size={18} className="text-ink3" />
                        )}
                      </li>
                    );
                  })}
                </ul>
                {net.length > 0 && (
                  <div className="mt-3 rounded-3xl bg-sunk px-4 py-3">
                    <p className="text-[12.5px] font-semibold text-ink3">Whole group</p>
                    <ul className="mt-1 flex flex-col">
                      {net.map(([pid, v]) => (
                        <li key={pid} className="flex items-center justify-between py-1 text-[14px] text-ink2">
                          <span>{pid === 'me' ? (v > 0 ? 'You get back' : 'You owe in total') : `${name(pid)} ${v > 0 ? 'gets back' : 'owes'}`}</span>
                          <span className={`num font-semibold ${v > 0 ? 'text-pos' : 'text-ink'}`}>{rupees(Math.abs(v))}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {tab === 'settled' && (
              <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface px-1">
                {settlements.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-[14px]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {name(s.from)} → {name(s.to)}
                      </span>
                      <span className="block text-[12.5px] text-ink3">{relDay(s.date, state.today)}</span>
                    </span>
                    <span className="num font-semibold">{rupees(s.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Sheet: who's in the group, the invite link, adding by name, and deleting the group. */
export function GroupPeople({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const [friend, setFriend] = useState('');
  const group = state.groups.find((g) => g.id === groupId);
  const [title, setTitle] = useState(group?.name ?? '');
  const [emoji, setEmoji] = useState(group?.emoji ?? '🍜');
  if (!group) return null;
  const g = groupSummary(state, groupId);
  // In a shared group the name comes from whoever made it, so only they can change it.
  const canRename = !group.shared || group.shared.owner;
  const changed = title.trim() !== group.name || emoji !== group.emoji;
  const icons = GROUP_EMOJI.includes(group.emoji) ? GROUP_EMOJI : [group.emoji, ...GROUP_EMOJI];
  // People added by name (not joined on PULSE). Joined people are listed in the share card.
  const byName = group.members.filter((m) => m !== 'me' && (!group.shared || groupSeat(group, m) !== 'on'));
  const joined = group.shared ? group.members.filter((m) => m !== 'me' && groupSeat(group, m) === 'on') : [];
  const del = () => {
    const n = g.expenses.length;
    const open = g.owedToYou || g.youOwe ? ` Not settled yet: ${[g.owedToYou ? `you're owed ${rupees(g.owedToYou)}` : '', g.youOwe ? `you owe ${rupees(g.youOwe)}` : ''].filter(Boolean).join(' and ')}. That is removed too.` : '';
    const shared = !group.shared || state.mode !== 'personal' ? '' : group.shared.owner ? ' Sharing stops for everyone; the others keep their own copy of the history.' : ' You leave the group; the others keep it, with what you added.';
    onDone();
    ui.openSheet({
      type: 'confirm',
      title: `Delete ${group.name}?`,
      body: `The group${n ? `, its ${n} ${n === 1 ? 'expense' : 'expenses'}` : ''} and who owes what in it are removed.${open}${shared} Money already recorded in your accounts stays in Activity. This can't be undone.`,
      confirm: 'Delete group',
      run: () => {
        store.deleteGroup(groupId);
        ui.pop();
      },
    });
  };
  return (
    <div>
      {canRename ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!changed || !title.trim()) return;
            store.renameGroup(groupId, title, emoji);
          }}
        >
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Group icon">
            {icons.map((e) => (
              <button key={e} type="button" role="radio" aria-checked={emoji === e} aria-label={e} onClick={() => setEmoji(e)} className={`tap grid h-10 w-10 place-items-center rounded-xl text-[20px] ${emoji === e ? 'bg-ink' : 'bg-sunk'}`}>
                {e}
              </button>
            ))}
          </div>
          <label htmlFor="group-rename" className="mb-1.5 mt-4 block text-[13px] font-semibold text-ink2">
            Group name
          </label>
          <div className="flex gap-2">
            <input id="group-rename" className="field min-w-0 flex-1" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
            <button type="submit" className="btn-primary min-h-[46px] shrink-0 px-4 disabled:opacity-40" disabled={!changed || !title.trim()}>
              Save
            </button>
          </div>
          {group.shared && <p className="mt-1.5 text-[12.5px] text-ink3">Everyone in the group sees the new name.</p>}
        </form>
      ) : (
        <p className="rounded-2xl bg-sunk px-4 py-3 text-[13.5px] text-ink2">Only the person who made {group.name} can rename it.</p>
      )}
      <GroupShareCard group={group} />
      {joined.length > 0 && !group.shared?.owner && (
        <div className="mt-4">
          <p className="mb-1 px-1 text-[12.5px] font-semibold text-ink3">On PULSE</p>
          <ul className="flex flex-col">
            {joined.map((pid) => (
              <li key={pid} className="flex items-center gap-3 px-1 py-1.5">
                <PersonAvatar person={state.people.find((p) => p.id === pid)} size={28} />
                <span className="text-[14.5px]">{state.people.find((p) => p.id === pid)?.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5">
        <p className="mb-1 px-1 text-[12.5px] font-semibold text-ink3">{group.shared ? 'Added by name' : 'In this group'}</p>
        {byName.length > 0 && (
          <ul className="mb-2 flex flex-col">
            {byName.map((pid) => (
              <li key={pid} className="flex items-center gap-3 px-1 py-1.5">
                <PersonAvatar person={state.people.find((p) => p.id === pid)} size={28} />
                <span className="min-w-0 flex-1 truncate text-[14.5px]">{state.people.find((p) => p.id === pid)?.name}</span>
                {group.shared && groupSeat(group, pid) === 'left' && <span className="text-[12.5px] text-ink3">left</span>}
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!friend.trim()) return;
            store.addGroupMember(groupId, friend);
            setFriend('');
          }}
        >
          <label htmlFor="gm-name" className="sr-only">
            Add someone by name
          </label>
          <input id="gm-name" className="field py-2" placeholder="Add someone by name" value={friend} onChange={(e) => setFriend(e.target.value)} autoComplete="off" />
          <button type="submit" className="btn-quiet min-h-[42px] shrink-0 px-4">
            <Icon name="user-plus" size={16} /> Add
          </button>
        </form>
        <p className="mt-1.5 px-1 text-[12.5px] text-ink3">For friends who aren’t on PULSE. You track their share for them.</p>
      </div>
      <button type="button" className="btn-ghost mt-6 w-full text-neg" onClick={del}>
        <Icon name="trash" size={16} /> Delete group
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// Person
// ------------------------------------------------------------------
export function PersonDetail({ id }: { id: string }) {
  const { state } = useStore();
  const ui = useUI();
  const p = state.people.find((x) => x.id === id);
  if (!p) return <TopNavigation title="Person" onBack={ui.pop} />;
  const v = personBalances(state).get(id) ?? 0;
  const groups = state.groups.filter((g) => g.members.includes(id));
  const shared = state.splits.filter((s) => s.paidBy === id || s.shares.some((x) => x.person === id)).sort((a, b) => b.date.localeCompare(a.date));
  /** Whose PULSE an entry came from: this friend's, or a member of a shared group. */
  const addedBy = (s: (typeof shared)[number]) => {
    if (s.remote === p.link?.chan) return p.short;
    const g = state.groups.find((x) => x.id === s.group);
    return (g && authorOf(state, g, s.id)?.short) || 'a friend';
  };
  return (
    <div>
      <TopNavigation title={p.name} onBack={ui.pop} />
      <div className="flex flex-col items-center rounded-3xl border border-line bg-surface p-6 text-center">
        <PersonAvatar person={p} size={64} />
        <p className="display mt-4 text-[24px]">{v === 0 ? 'All settled' : v < 0 ? `You owe ${p.short} ${rupees(-v)}` : `${p.short} owes you ${rupees(v)}`}</p>
        <div className="mt-4 flex gap-2">
          {v !== 0 && (
            <button type="button" className="btn-accent" onClick={() => ui.openSheet({ type: 'settle', personId: id })}>
              Settle up
            </button>
          )}
          <button type="button" className="btn-quiet" onClick={() => ui.openSheet({ type: 'group-expense', personId: id })}>
            <Icon name="split" size={16} /> Split something
          </button>
        </div>
      </div>
      <FriendPayments person={p} />
      <FriendConnect person={p} />
      {groups.length > 0 && (
        <section className="mt-8" aria-labelledby="pp-g">
          <SectionHeader id="pp-g" title="Groups together" />
          <div className="flex flex-col gap-3">
            {groups.map((g) => {
              const gv = personBalances(state, g.id).get(id) ?? 0;
              return (
                <button key={g.id} type="button" className="row-btn" onClick={() => ui.push({ name: 'group', id: g.id })}>
                  <span className="text-[22px]" aria-hidden="true">
                    {g.emoji}
                  </span>
                  <span className="flex-1 text-[15px] font-semibold">{g.name}</span>
                  {gv === 0 ? <StatusPill status="neutral">Settled</StatusPill> : <span className="num text-[14px]">{gv < 0 ? `you owe ${rupees(-gv)}` : `owes you ${rupees(gv)}`}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section className="mt-8" aria-labelledby="pp-s">
        <SectionHeader id="pp-s" title="Shared expenses" />
        <ul className="flex flex-col">
          {shared.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-2 py-2 text-[14.5px]">
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.description}</span>
                <span className="block text-[13px] text-ink3">
                  {fmtDate(s.date)} · {s.paidBy === 'me' ? 'you paid' : s.paidBy === id ? `${p.short} paid` : 'someone else paid'}
                  {s.remote ? ` · added by ${addedBy(s)}` : ''}
                </span>
              </span>
              <span className="num shrink-0">{rupees(s.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
      {state.mode === 'personal' && state.people.length > 1 && (
        <button type="button" className="btn-ghost mt-6 min-h-[40px] px-1 text-[13.5px] text-ink3" onClick={() => ui.openSheet({ type: 'person-merge', personId: id })}>
          Is {p.short} in your list twice? Merge the two names
        </button>
      )}
    </div>
  );
}
