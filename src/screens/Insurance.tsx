import { useState } from 'react';
import type { Insurance, InsuranceKind, PremiumCycle } from '../types';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { defaultAccount, insuranceTotals, PREMIUM_LABEL, PREMIUM_MONTHS, premiumSetAside, safeToSpend } from '../lib/finance';
import { roundMoney, sym } from '../lib/currency';
import { addMonths, daysBetween, fmtDate, relDay, rupees, rupeesShort } from '../lib/format';
import { EmptyState, Field, ProgressBar, SectionHeader, TopNavigation, CategoryMark } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';

export const INSURANCE_KINDS: { id: InsuranceKind; label: string; emoji: string; hint: string }[] = [
  { id: 'health', label: 'Health', emoji: '🏥', hint: 'Star Health, Niva Bupa…' },
  { id: 'life', label: 'Term life', emoji: '🫶', hint: 'LIC, HDFC Life…' },
  { id: 'vehicle', label: 'Bike / car', emoji: '🛵', hint: 'Acko, ICICI Lombard…' },
  { id: 'travel', label: 'Travel', emoji: '✈️', hint: 'Trip or yearly travel cover' },
  { id: 'other', label: 'Other', emoji: '🛡️', hint: 'Phone, home, pet…' },
];
const CYCLES: PremiumCycle[] = ['monthly', 'quarterly', 'half-yearly', 'yearly'];
const kindOf = (k: InsuranceKind) => INSURANCE_KINDS.find((x) => x.id === k) ?? INSURANCE_KINDS[4];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------
// Screen
// ------------------------------------------------------------------
export function InsuranceScreen() {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const list = [...(state.insurance ?? [])].sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const t = insuranceTotals(state);
  const sts = safeToSpend(state);
  const recent = state.transactions.filter((x) => x.category === 'insurance' && x.type === 'expense').slice(0, 6);
  const add = () => ui.openSheet({ type: 'insurance-form' });

  return (
    <div>
      <TopNavigation
        title="Insurance"
        onBack={ui.pop}
        sub="Premiums kept aside before they're due."
        right={
          <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={add}>
            <Icon name="plus" size={16} /> Policy
          </button>
        }
      />

      {list.length === 0 ? (
        <EmptyState icon="shield" title="No policies yet." body="Add your health, term or vehicle insurance. PULSE keeps the premium aside, records it on the due date and tells you before it renews." action={{ label: 'Add a policy', onClick: add }} />
      ) : (
        <>
          <section className="rounded-3xl border border-line bg-surface p-5" aria-labelledby="ins-total">
            <p id="ins-total" className="eyebrow">
              You pay for insurance
            </p>
            <p className="num-hero mt-1 text-[36px] leading-none">
              {rupees(t.yearly)}
              <span className="text-[18px] font-medium text-ink3">/year</span>
            </p>
            <p className="mt-2 text-[14px] text-ink2">About {rupees(t.monthly)} a month.</p>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
              <div>
                <dt className="text-[12.5px] text-ink3">Total cover</dt>
                <dd className="num text-[18px] font-semibold">{t.cover > 0 ? rupeesShort(t.cover) : '—'}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink3">Kept aside</dt>
                <dd className="num text-[18px] font-semibold">{rupeesShort(sts.setAside)}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink3">{t.next && t.next.nextDate < state.today ? 'Overdue' : 'Next due'}</dt>
                <dd className={`text-[18px] font-semibold ${t.next && t.next.nextDate < state.today ? 'text-warn' : ''}`}>{t.next ? fmtDate(t.next.nextDate) : '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="mt-8" aria-labelledby="ins-list">
            <SectionHeader id="ins-list" title="Policies" />
            <ul className="flex flex-col gap-2">
              {list.map((p) => {
                const k = kindOf(p.kind);
                const overdue = p.nextDate < state.today || (p.nextDate === state.today && !p.autoDebit);
                const beforePayday = p.nextDate < sts.payday;
                const kept = premiumSetAside(p, sts.payday);
                const days = daysBetween(state.today, p.nextDate);
                return (
                  <li key={p.id} className="rounded-2xl border border-line bg-surface">
                    <button type="button" className="tap flex w-full items-center gap-3 p-3.5 text-left" onClick={() => ui.openSheet({ type: 'insurance-form', insuranceId: p.id })}>
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sunk text-[22px]" aria-hidden="true">
                        {k.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15.5px] font-semibold">{p.name}</span>
                        <span className="block truncate text-[13px] text-ink3">
                          {k.label}
                          {p.cover ? ` · ${rupeesShort(p.cover)} cover` : ''}
                          {p.covers ? ` · ${p.covers}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="num block text-[15.5px] font-semibold">{rupees(p.premium)}</span>
                        <span className="block text-[12.5px] text-ink3">{PREMIUM_LABEL[p.cycle]}</span>
                      </span>
                    </button>
                    <div className="border-t border-line px-3.5 py-3">
                      {overdue ? (
                        <div className="flex items-center gap-3">
                          <p className="min-w-0 flex-1 text-[13.5px] font-medium text-warn">{p.nextDate === state.today ? 'Due today' : `Was due ${fmtDate(p.nextDate)}`}</p>
                          <button type="button" className="btn-accent min-h-[38px] px-4 text-[14px]" onClick={() => store.payInsurance(p.id)}>
                            Mark as paid
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="flex items-baseline justify-between gap-3 text-[13.5px]">
                            <span className="text-ink2">
                              Due {fmtDate(p.nextDate)}
                              {days <= 30 ? ` · ${relDay(p.nextDate, state.today).toLowerCase()}` : ''}
                            </span>
                            <span className="shrink-0 text-ink3">{p.autoDebit ? 'Auto-debit' : 'Paid by you'}</span>
                          </p>
                          {beforePayday ? (
                            <p className="mt-1 text-[12.5px] text-ink3">Already counted in this cycle's bills.</p>
                          ) : kept > 0 ? (
                            <div className="mt-2">
                              <ProgressBar value={kept / p.premium} tone="pos" height={6} label={`${rupees(kept)} of ${rupees(p.premium)} kept aside`} />
                              <p className="mt-1 text-[12.5px] text-ink3">
                                {rupees(kept)} of {rupees(p.premium)} kept aside
                              </p>
                            </div>
                          ) : p.cycle !== 'monthly' && !p.spread ? (
                            <p className="mt-1 text-[12.5px] text-ink3">Counted in full in the month it's due.</p>
                          ) : null}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {recent.length > 0 && (
            <section className="mt-8" aria-labelledby="ins-paid">
              <SectionHeader id="ins-paid" title="Premiums paid" />
              <ul>
                {recent.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-2 py-2.5">
                    <CategoryMark state={state} category="insurance" size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{x.merchant}</span>
                      <span className="block text-[13px] text-ink3">{fmtDate(x.date)}</span>
                    </span>
                    <span className="num text-[15px] font-semibold">{rupees(x.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-8 px-1 text-[12.5px] text-ink3">PULSE only keeps track of your policies. It doesn't sell or recommend insurance.</p>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Form
// ------------------------------------------------------------------
export function InsuranceForm({ insuranceId, onDone }: { insuranceId?: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ex = (state.insurance ?? []).find((p) => p.id === insuranceId);
  const [kind, setKind] = useState<InsuranceKind>(ex?.kind ?? 'health');
  const [name, setName] = useState(ex?.name ?? '');
  const [premium, setPremium] = useState(ex ? String(ex.premium) : '');
  const [cycle, setCycle] = useState<PremiumCycle>(ex?.cycle ?? 'yearly');
  const [next, setNext] = useState(ex?.nextDate ?? addMonths(state.today, 1));
  const [account, setAccount] = useState(ex?.account ?? defaultAccount(state));
  const [cover, setCover] = useState(ex?.cover ? String(ex.cover) : '');
  const [covers, setCovers] = useState(ex?.covers ?? '');
  const [auto, setAuto] = useState(ex?.autoDebit ?? true);
  const [spread, setSpread] = useState(ex?.spread ?? true);
  const [removing, setRemoving] = useState(false);
  const amt = parseFloat(premium) || 0;
  const valid = name.trim().length > 0 && amt > 0 && !!next;
  const perMonth = roundMoney(amt / PREMIUM_MONTHS[cycle]);
  const big = cycle !== 'monthly';

  const Switch = ({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint: string }) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="tap flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium leading-snug">{label}</span>
        <span className="block truncate text-[12px] text-ink3">{hint}</span>
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );

  const save = () => {
    const data: Omit<Insurance, 'id' | 'since'> & { id?: string } = {
      id: ex?.id,
      name: name.trim(),
      kind,
      premium: roundMoney(amt),
      cycle,
      nextDate: next,
      account,
      autoDebit: auto,
      spread: big ? spread : false,
      cover: parseFloat(cover) > 0 ? roundMoney(parseFloat(cover)) : undefined,
      covers: covers.trim() || undefined,
    };
    store.saveInsurance(data);
    onDone();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="radiogroup" aria-label="Type of insurance">
        {INSURANCE_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            onClick={() => setKind(k.id)}
            className={`tap flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-2 text-[14px] font-semibold ${kind === k.id ? 'border-ink bg-ink text-bg' : 'border-line text-ink2'}`}
          >
            <span aria-hidden="true">{k.emoji}</span> {k.label}
          </button>
        ))}
      </div>
      <Field label="Policy or insurer" htmlFor="ins-name">
        <input id="ins-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={kindOf(kind).hint} />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Premium" htmlFor="ins-amt">
          <input id="ins-amt" inputMode="decimal" className="field num" value={premium} onChange={(e) => setPremium(e.target.value.replace(/[^\d.]/g, ''))} placeholder={sym().trim()} />
        </Field>
        <Field label="Paid" htmlFor="ins-cycle">
          <select id="ins-cycle" className="field px-2.5" value={cycle} onChange={(e) => setCycle(e.target.value as PremiumCycle)}>
            {CYCLES.map((c) => (
              <option key={c} value={c}>
                {cap(PREMIUM_LABEL[c])}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Next due date" htmlFor="ins-next">
          <input id="ins-next" type="date" className="field px-2.5" value={next} onChange={(e) => e.target.value && setNext(e.target.value)} />
        </Field>
        <Field label="Paid from" htmlFor="ins-acct">
          <select id="ins-acct" className="field px-2.5" value={account} onChange={(e) => setAccount(e.target.value)}>
            {state.accounts
              .filter((a) => a.type !== 'investment')
              .map((a) => (
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
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Cover (optional)" htmlFor="ins-cover">
          <input id="ins-cover" inputMode="decimal" className="field num" value={cover} onChange={(e) => setCover(e.target.value.replace(/[^\d.]/g, ''))} placeholder="500000" />
        </Field>
        <Field label="Who's covered (optional)" htmlFor="ins-who">
          <input id="ins-who" className="field" value={covers} onChange={(e) => setCovers(e.target.value)} placeholder="Me, parents…" maxLength={30} />
        </Field>
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-sunk/60">
        <Switch on={auto} set={setAuto} label="Record automatically on the due date" hint={auto ? 'Like a SIP: added by itself, no tap needed' : "Off: you tap “Mark as paid” when you've paid"} />
        {big && <Switch on={spread} set={setSpread} label="Keep a bit aside every month" hint={spread ? (amt > 0 ? `About ${rupees(perMonth)} a month, ready by the due date` : 'So the due date is never a shock') : 'Off: counted in full in the month it is due'} />}
      </div>
      {removing && ex ? (
        <div className="flex min-h-[48px] items-center gap-2 rounded-2xl bg-sunk py-1 pl-4 pr-1" role="alert">
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[14px] font-semibold">Remove {ex.name}?</span>
            <span className="block truncate text-[12px] text-ink3">Past premiums stay</span>
          </span>
          <button type="button" className="btn-ghost min-h-[40px] px-3" onClick={() => setRemoving(false)}>
            Keep
          </button>
          <button
            type="button"
            className="btn min-h-[40px] bg-neg px-4 text-white"
            onClick={() => {
              store.deleteInsurance(ex.id);
              onDone();
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className={`grid gap-2 ${ex ? 'grid-cols-[auto_1fr]' : 'grid-cols-1'}`}>
          {ex && (
            <button type="button" className="btn-quiet min-h-[48px] px-4 text-neg" onClick={() => setRemoving(true)} aria-label="Remove this policy">
              <Icon name="trash" size={18} />
            </button>
          )}
          <button type="button" disabled={!valid} className="btn-accent min-h-[48px] w-full disabled:opacity-40" onClick={save}>
            {ex ? 'Save changes' : 'Add policy'}
          </button>
        </div>
      )}
    </div>
  );
}
