import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { budgetState, groupNet, groupSummary, personBalances, planMetrics, socialTotals } from '../lib/finance';
import { authorOf, groupSeat, inGroupOnPulse } from '../lib/friends';
import { fmtDate, relDay, rupees } from '../lib/format';
import { BudgetProgress, GoalCard, PlanCard, SplitCard, TransactionList } from '../components/money';
import { EmptyState, MoneyStat, PersonAvatar, ProgressBar, SectionHeader, Segmented, StatusPill, TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';
import { FriendConnect, FriendPayments, GroupShareCard } from '../components/Friends';

export function PlansScreen() {
  const ui = useUI();
  const seg = ui.plansSegment;
  const add = seg === 'plans' ? () => ui.openSheet({ type: 'plan-form' }) : seg === 'splits' ? () => ui.openSheet({ type: 'group-form' }) : () => ui.openSheet({ type: 'budget-form' });
  return (
    <div>
      <TopNavigation
        title="Plans"
        sub="What you're saving for, who you split with, and your budgets."
        right={
          <button type="button" onClick={add} className="btn-primary min-h-[40px] px-4 text-[14px]">
            <Icon name="plus" size={16} /> {seg === 'plans' ? 'Plan' : seg === 'splits' ? 'Group' : 'Budget'}
          </button>
        }
      />
      <Segmented label="Section" value={seg} onChange={ui.setPlansSegment} options={[{ value: 'plans', label: 'Plans' }, { value: 'splits', label: 'Splits' }, { value: 'budgets', label: 'Budgets' }]} />
      <div key={seg} className="mt-6 animate-toast">{seg === 'plans' ? <PlansList /> : seg === 'splits' ? <SplitsView /> : <BudgetsView />}</div>
    </div>
  );
}

function PlansList() {
  const { state } = useStore();
  const ui = useUI();
  const active = state.plans.filter((p) => p.status === 'active' && p.kind === 'plan');
  const goals = state.plans.filter((p) => p.kind === 'goal' && p.status !== 'paused');
  const done = state.plans.filter((p) => p.status === 'done' && p.kind === 'plan');
  const paused = state.plans.filter((p) => p.status === 'paused');
  if (!state.plans.length) return <EmptyState icon="target" title="No plans yet." body="Got something worth saving for?" action={{ label: 'Create a plan', onClick: () => ui.openSheet({ type: 'plan-form' }) }} />;
  const open = (id: string) => ui.push({ name: 'plan', id });
  return (
    <div className="flex flex-col gap-8">
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
                      <span className="block text-[15px] font-semibold">{v === 0 ? `You and ${p.short} are square` : v < 0 ? `You owe ${p.short} ${rupees(-v)}` : `${p.short} owes you ${rupees(v)}`}</span>
                      <span className="block text-[13px] text-ink3">
                        {p.name}
                        {p.link ? (p.link.status === 'linked' ? ' · on PULSE' : p.link.door ? ' · connecting' : ' · invite sent') : together(p.id) ? ' · in a group with you' : ''}
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
          <EmptyState icon="users" title="No groups yet." body="Split a dinner, trip or weekend plan with friends." action={{ label: 'Create a group', onClick: () => ui.openSheet({ type: 'group-form' }) }} />
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
      <section className="rounded-3xl border border-line bg-surface p-5 md:p-6" aria-label="Progress">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="num-hero text-[39px] leading-none">{rupees(plan.saved)}</p>
            <p className="num mt-1 text-[15px] text-ink3">of {rupees(plan.target)}</p>
          </div>
          <p className="num-hero text-[33px] leading-none text-accent-ink">{Math.round(m.progress * 100)}%</p>
        </div>
        <div className="mt-5">
          <ProgressBar value={m.progress} marker={m.tone !== 'done' && m.tone !== 'paused' ? m.expected / plan.target : undefined} label={`${Math.round(m.progress * 100)}% funded`} height={10} />
          {m.tone !== 'done' && m.tone !== 'paused' && <p className="mt-2 text-[12.5px] text-ink3">The tick marks where the schedule expects you today.</p>}
        </div>
        <p className={`mt-4 text-[16px] font-semibold ${m.tone === 'ahead' || m.tone === 'done' ? 'text-pos' : m.tone === 'behind' ? 'text-warn' : ''}`}>{m.status}</p>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
          <div>
            <dt className="text-[12.5px] text-ink3">Remaining</dt>
            <dd className="num text-[17px] font-semibold">{rupees(m.remaining)}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-ink3">Target</dt>
            <dd className="text-[17px] font-semibold">{fmtDate(plan.targetDate, true)}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-ink3">Recommended</dt>
            <dd className="num text-[17px] font-semibold">{m.monthly ? `${rupees(m.monthly)}/mo` : '—'}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-ink3">Held this cycle</dt>
            <dd className="num text-[17px] font-semibold">{rupees(plan.cycleReserve)}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          {plan.status !== 'done' && (
            <button type="button" className="btn-accent flex-1" onClick={() => ui.openSheet({ type: 'contribute', planId: plan.id })}>
              <Icon name="plus" size={17} /> Add money
            </button>
          )}
          <button type="button" className="btn-quiet" onClick={() => store.savePlan({ ...plan, status: plan.status === 'paused' ? 'active' : 'paused' })} disabled={plan.status === 'done'}>
            <Icon name={plan.status === 'paused' ? 'play' : 'pause'} size={16} /> {plan.status === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className="btn-quiet" onClick={() => ui.openSheet({ type: 'share-card', preset: 'plan' })} aria-label="Share a budget card">
            <Icon name="share" size={16} />
          </button>
        </div>
      </section>

      {plan.categories.length > 0 && (
        <p className="mt-5 flex flex-wrap items-center gap-2 px-1 text-[13.5px] text-ink3">
          Linked categories:
          {plan.categories.map((c) => (
            <span key={c} className="rounded-full bg-sunk px-2.5 py-0.5 font-medium text-ink2">
              {state.categories.find((x) => x.id === c)?.name}
            </span>
          ))}
        </p>
      )}

      {group && (
        <section className="mt-8" aria-labelledby="pg-h">
          <SectionHeader id="pg-h" title="Shared with" />
          <SplitCard group={group} onOpen={() => ui.push({ name: 'group', id: group.id })} />
          {groupSplits.length > 0 && <p className="mt-2 px-1 text-[13px] text-ink3">Group expenses paid by friends count toward this plan once you settle up.</p>}
        </section>
      )}

      <section className="mt-8" aria-labelledby="pt-h">
        <SectionHeader id="pt-h" title="Linked transactions" />
        <TransactionList txs={txs} emptyText="Nothing linked yet. Assign an expense to this plan from any transaction." />
      </section>

      <div className="mt-10 text-center">
        <button
          type="button"
          className="btn-ghost text-neg"
          onClick={() =>
            ui.openSheet({
              type: 'confirm',
              title: `Delete ${plan.name}?`,
              body: `The ${rupees(plan.saved)} you've saved stays in your history. Linked expenses keep their categories.`,
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
export function GroupDetail({ id }: { id: string }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const [friend, setFriend] = useState('');
  const group = state.groups.find((g) => g.id === id);
  if (!group) return <TopNavigation title="Group" onBack={ui.pop} />;
  const g = groupSummary(state, id);
  const plan = group.plan ? state.plans.find((p) => p.id === group.plan) : undefined;
  const settlements = state.settlements.filter((s) => s.group === id);
  const name = (pid: string) => (pid === 'me' ? 'You' : state.people.find((p) => p.id === pid)?.short ?? '?');
  const others = group.members.filter((m) => m !== 'me');
  // With three or more people, "who owes me" isn't the whole picture: show where everyone stands.
  const net = others.length > 1 ? [...groupNet(state, id)].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]) : [];
  return (
    <div>
      <TopNavigation title={`${group.name} ${group.emoji}`} onBack={ui.pop} sub={`${group.members.length} ${group.members.length === 1 ? 'person' : 'people'}${group.shared ? ' · shared' : ''}${plan ? ` · linked to ${plan.name}` : ''}`} />
      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-line bg-surface p-4">
        <MoneyStat label="Total spent" value={g.total} />
        <MoneyStat label="You owe" value={g.youOwe} />
        <MoneyStat label="You are owed" value={g.owedToYou} tone={g.owedToYou ? 'pos' : undefined} />
      </div>
      {others.length ? (
        <button type="button" className="btn-accent mt-4 w-full" onClick={() => ui.openSheet({ type: 'group-expense', groupId: id })}>
          <Icon name="plus" size={17} /> Add expense
        </button>
      ) : (
        <p className="mt-4 rounded-2xl bg-sunk px-4 py-3 text-[14px] text-ink2">It's just you here so far. Share the group link below, or add someone by name, then add the first expense.</p>
      )}
      <GroupShareCard group={group} />

      <section className="mt-8" aria-labelledby="gb-h">
        <SectionHeader id="gb-h" title="Balances" />
        <ul className="flex flex-col">
          {others.map((pid) => {
            const v = g.balances.get(pid) ?? 0;
            const p = state.people.find((x) => x.id === pid);
            return (
              <li key={pid} className="flex items-center gap-3 px-2 py-2">
                <PersonAvatar person={p} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">{v === 0 ? `${p?.short} · settled` : v < 0 ? `You owe ${p?.short} ${rupees(-v)}` : `${p?.short} owes you ${rupees(v)}`}</span>
                  {group.shared && <span className="block text-[12.5px] text-ink3">{{ on: 'Joined on PULSE', left: 'Left the group', name: 'Added by name · not joined yet' }[groupSeat(group, pid)]}</span>}
                </span>
                {v !== 0 && (
                  <button type="button" className="btn-quiet min-h-[36px] px-3.5 text-[13.5px]" onClick={() => ui.openSheet({ type: 'settle', personId: pid, groupId: id })}>
                    Settle
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!friend.trim()) return;
            store.addGroupMember(id, friend);
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
      </section>

      {net.length > 0 && (
        <section className="mt-8" aria-labelledby="gn-h">
          <SectionHeader id="gn-h" title="Whole group" />
          <ul className="flex flex-col gap-1 px-2">
            {net.map(([pid, v]) => (
              <li key={pid} className="flex items-center justify-between py-1.5 text-[14px] text-ink2">
                <span>{pid === 'me' ? (v > 0 ? 'You get back' : 'You owe in total') : `${name(pid)} ${v > 0 ? 'gets back' : 'owes'}`}</span>
                <span className={`num font-semibold ${v > 0 ? 'text-pos' : 'text-ink'}`}>{rupees(Math.abs(v))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8" aria-labelledby="ge-h">
        <SectionHeader id="ge-h" title="Expenses" />
        {g.expenses.length ? (
          <ul className="flex flex-col">
            {g.expenses
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((s) => {
                const mine = s.shares.find((x) => x.person === 'me')?.amount ?? 0;
                const lent = s.paidBy === 'me' ? s.amount - mine : 0;
                return (
                  <li key={s.id} className="flex items-center gap-3 px-2 py-2.5">
                    <span className="w-10 shrink-0 text-center">
                      <span className="block text-[11px] font-semibold uppercase text-ink3">{fmtDate(s.date).split(' ')[1]}</span>
                      <span className="num block text-[17px] font-semibold leading-none">{fmtDate(s.date).split(' ')[0]}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{s.description}</span>
                      <span className="block text-[13px] text-ink3">
                        {name(s.paidBy)} paid {rupees(s.amount)} · {s.remote ? `added by ${authorOf(state, group, s.id)?.short ?? 'a member'}` : s.mode === 'equal' ? 'split equally' : s.mode === 'exact' ? 'exact amounts' : s.mode === 'percent' ? 'by %' : 'by shares'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {s.paidBy === 'me' ? (
                        <>
                          <span className="num block text-[14.5px] font-semibold text-pos">{rupees(lent)}</span>
                          <span className="block text-[12px] text-ink3">you lent</span>
                        </>
                      ) : mine ? (
                        <>
                          <span className="num block text-[14.5px] font-semibold">{rupees(mine)}</span>
                          <span className="block text-[12px] text-ink3">your share</span>
                        </>
                      ) : (
                        <span className="text-[12.5px] text-ink3">not involved</span>
                      )}
                    </span>
                  </li>
                );
              })}
          </ul>
        ) : (
          <EmptyState icon="users" title="No expenses yet." body="Add the first one. Split it equally, by exact amounts, percentages or shares." />
        )}
      </section>

      {settlements.length > 0 && (
        <section className="mt-8" aria-labelledby="gs-h">
          <SectionHeader id="gs-h" title="Settlements" />
          <ul className="flex flex-col gap-1 px-2">
            {settlements.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-1.5 text-[14px] text-ink2">
                <span>
                  {name(s.from)} paid {name(s.to)} · {relDay(s.date, state.today)}
                </span>
                <span className="num font-semibold text-ink">{rupees(s.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        className="btn-quiet mt-10 w-full text-neg"
        onClick={() => {
          const n = g.expenses.length;
          const open = g.owedToYou || g.youOwe ? ` Not settled yet: ${[g.owedToYou ? `you're owed ${rupees(g.owedToYou)}` : '', g.youOwe ? `you owe ${rupees(g.youOwe)}` : ''].filter(Boolean).join(' and ')}. That is removed too.` : '';
          const shared = !group.shared || state.mode !== 'personal' ? '' : group.shared.owner ? ' Sharing stops for everyone; the others keep their own copy of the history.' : ' You leave the group; the others keep it, with what you added.';
          ui.openSheet({
            type: 'confirm',
            title: `Delete ${group.name}?`,
            body: `The group${n ? `, its ${n} ${n === 1 ? 'expense' : 'expenses'}` : ''} and who owes what in it are removed.${open}${shared} Money already recorded in your accounts stays in Activity. This can't be undone.`,
            confirm: 'Delete group',
            run: () => {
              store.deleteGroup(id);
              ui.pop();
            },
          });
        }}
      >
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
        <p className="display mt-4 text-[24px]">{v === 0 ? `You and ${p.short} are square` : v < 0 ? `You owe ${p.short} ${rupees(-v)}` : `${p.short} owes you ${rupees(v)}`}</p>
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
