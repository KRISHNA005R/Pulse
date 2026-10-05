import { useEffect, useMemo, useRef, useState } from 'react';
import { inFrame, isIOS, isStandalone } from '../lib/pwa';
import { CURRENCIES, detectCurrency, setCurrency, sym, type CurrencyCode } from '../lib/currency';
import { useStore } from '../store/store';
import { useBackSteps } from '../store/ui';
import { createFresh, nextFirstOfMonth } from '../data/seed';
import { safeToSpend } from '../lib/finance';
import { fmtDate, ordinal, realToday, rupees } from '../lib/format';
import { Icon } from './ui/Icon';
import { MoneyInput } from './ui/bits';
import { JoinWithCode } from '../screens/Sync';
import { takeSyncLink } from '../lib/sync';
import { useAuth } from '../store/auth';
import { LoginLegal, LoginPanel } from './Auth';

const REASONS = ['Track spending', 'Save more', 'Control subscriptions', 'Plan a goal', 'Manage shared expenses', 'All of these'];
const PAY = ['Salary', 'Freelance', 'Allowance', 'Multiple sources', 'Other'];
const PRIORITIES = ['Save for something', 'Reduce unnecessary spending', 'Build emergency savings', 'Understand spending', 'Manage social expenses'];

type Step = 'welcome' | 'join' | 'name' | 'reasons' | 'pay' | 'money' | 'priorities' | 'building' | 'done';
const FLOW: Step[] = ['name', 'reasons', 'pay', 'money', 'priorities'];

export function Onboarding() {
  const { startPersonal, startDemo, closeOnboarding, state } = useStore();
  const auth = useAuth();
  const hasOwnData = state.mode === 'personal' && (state.transactions.length > 0 || state.plans.length > 0);
  // With accounts on, setting up your own money starts with signing in. The demo stays open to everyone.
  const needLogin = auth.on && !auth.session;
  // Opened from a sync QR/link: go straight to linking this device (accounts replace sync codes).
  const [linkCode] = useState(() => takeSyncLink());
  const [step, setStep] = useState<Step>(linkCode && !auth.on ? 'join' : 'welcome');
  // On iPhone the home-screen app keeps its own data, so it's better to install before setting up.
  const iosBrowser = isIOS() && !isStandalone() && !inFrame();
  const [name, setName] = useState(state.mode === 'personal' ? state.user.fullName : (auth.session?.account.name ?? ''));
  // Just signed in and there's nothing saved anywhere yet: straight into setup. Google already told
  // us the name, so that question is skipped.
  const moved = useRef(false);
  useEffect(() => {
    if (auth.outcome !== 'new' || !auth.session || step !== 'welcome' || moved.current) return;
    moved.current = true;
    const known = auth.session.account.name;
    if (known && !name.trim()) setName(known);
    setStep(known || name.trim() ? 'reasons' : 'name');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.outcome, auth.session, step]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [pay, setPay] = useState('');
  const [income, setIncome] = useState('');
  const today = realToday();
  const [payday, setPayday] = useState(nextFirstOfMonth(today));
  const [banks, setBanks] = useState<{ name: string; balance: string }[]>([{ name: '', balance: '' }]);
  const [bankPicker, setBankPicker] = useState<number | null>(0);
  const [cash, setCash] = useState('');
  const [prio, setPrio] = useState<string[]>([]);
  const [invested, setInvested] = useState('');
  const [sip, setSip] = useState('');
  const [sipDate, setSipDate] = useState(nextFirstOfMonth(today).slice(0, 8) + '05');
  const [showInvest, setShowInvest] = useState(false);
  const [currency, setCur] = useState<CurrencyCode>(() => detectCurrency());
  // Amounts typed during setup are shown in the currency being chosen here.
  setCurrency(currency);

  // Each step starts at the top of the page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    if (step !== 'building') return;
    const t = window.setTimeout(() => setStep('done'), 1300);
    return () => window.clearTimeout(t);
  }, [step]);

  const fresh = useMemo(
    () =>
      createFresh({
        name,
        reasons,
        payType: pay,
        income: parseFloat(income) || 0,
        payday: pay === 'Freelance' ? null : payday,
        banks: banks.map((b) => ({ name: b.name, balance: parseFloat(b.balance) || 0 })),
        cash: parseFloat(cash) || 0,
        priorities: prio,
        invested: parseFloat(invested) || 0,
        sipAmount: parseFloat(sip) || 0,
        sipDate,
        currency,
      }),
    [name, reasons, pay, income, payday, banks, cash, prio, invested, sip, sipDate, currency],
  );
  const preview = useMemo(() => safeToSpend(fresh), [fresh]);

  const idx = FLOW.indexOf(step);
  const next = () => setStep(idx < FLOW.length - 1 ? FLOW[idx + 1] : 'building');
  const back = () => setStep(idx > 0 ? FLOW[idx - 1] : 'welcome');
  // The phone's back gesture goes back one step of setup rather than out of PULSE.
  const DEPTH: Record<Step, number> = { welcome: 0, join: 1, name: 1, reasons: 2, pay: 3, money: 4, priorities: 5, building: 6, done: 6 };
  useBackSteps(DEPTH[step], () => (step === 'building' || step === 'done' ? setStep('priorities') : back()));

  const Choice = ({ label, on, onClick, multi }: { label: string; on: boolean; onClick: () => void; multi?: boolean }) => (
    <button type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={on} onClick={onClick} className={`tap flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border px-4 text-left text-[15.5px] font-medium ${on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:border-ink3/50'}`}>
      {label}
      <span className={`grid h-5 w-5 shrink-0 place-items-center ${multi ? 'rounded-md' : 'rounded-full'} border ${on ? 'border-bg bg-bg text-ink' : 'border-line'}`} aria-hidden="true">
        {on && <Icon name="check" size={13} strokeWidth={3} />}
      </span>
    </button>
  );

  const titles: Record<string, string> = {
    name: 'First, what should we call you?',
    reasons: 'What are you here for?',
    pay: 'How do you usually get paid?',
    money: 'How much do you have right now?',
    priorities: 'Pick up to 3 priorities',
  };
  const canNext: Record<string, boolean> = {
    name: name.trim().length > 0,
    reasons: reasons.length > 0,
    pay: !!pay,
    money: true,
    priorities: prio.length > 0,
  };

  return (
    // A normal page (not an overlay), so on phones the keyboard just scrolls this form.
    <div className="min-h-[100svh] bg-bg" role="main" aria-labelledby="ob-title">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-[480px] flex-col px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
        <p className="display text-[20px] tracking-tight">
          PULSE<span className="text-accent-ink">.</span>
        </p>

        {step === 'welcome' && (
          <div className="flex flex-1 flex-col pt-12">
            <h1 id="ob-title" className="display text-[36px] leading-[1.05]">
              Know what you can spend, without doing the math.
            </h1>
            <p className="mt-4 text-[16px] text-ink2">PULSE works out what's safe to spend until payday, keeps your plans on track and splits costs with friends.</p>
            <div className="mt-auto flex flex-col gap-3 pt-10">
              {hasOwnData && (
                <p className="rounded-2xl bg-warn/15 p-3 text-[14px] text-ink" role="alert">
                  Either option replaces the money you've already entered on this device. Copy a backup first from You → Export data.
                </p>
              )}
              {auth.loading ? (
                <div className="grid min-h-[112px] place-items-center" role="status" aria-label="Loading">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden="true" />
                </div>
              ) : needLogin ? (
                <>
                  <LoginPanel />
                  {!auth.busy && (
                    <button type="button" className="btn-quiet w-full" onClick={startDemo}>
                      Explore a demo first
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" className="btn-accent w-full text-[16px]" onClick={() => setStep(auth.session?.account.name && name.trim() ? 'reasons' : 'name')} data-autofocus>
                    Start with my own money
                  </button>
                  <button type="button" className="btn-quiet w-full" onClick={startDemo}>
                    Explore a demo first
                  </button>
                  {!auth.on && (
                    <button type="button" className="btn-ghost w-full" onClick={() => setStep('join')}>
                      I use PULSE on another device
                    </button>
                  )}
                </>
              )}
              {hasOwnData && (
                <button type="button" className="btn-ghost w-full" onClick={closeOnboarding}>
                  Cancel, keep my data
                </button>
              )}
              {iosBrowser && !auth.on && (
                <p className="rounded-2xl bg-sunk p-3 text-[13.5px] leading-snug text-ink2">
                  <b className="text-ink">On iPhone?</b> Add PULSE to your Home Screen first (tap Share, then <b className="text-ink">Add to Home Screen</b>) and set up there. The home-screen app keeps its own data.
                </p>
              )}
              {auth.loading ? null : needLogin ? <LoginLegal /> : <p className="text-center text-[12.5px] text-ink3">{auth.on ? 'No bank login needed. Your money is saved to your PULSE account.' : 'Your numbers stay in this browser on this device. No bank login needed.'}</p>}
            </div>
          </div>
        )}

        {step === 'join' && (
          <div className="flex flex-1 flex-col pt-10">
            <h1 id="ob-title" className="display text-[30px] leading-tight">
              Link this device
            </h1>
            <p className="mt-3 text-[15.5px] text-ink2">On your other device, open You → Sync my devices and turn on sync. Then enter the code it shows. Everything comes across, and stays in sync.</p>
            <div className="mt-6 rounded-3xl border border-line bg-surface p-4">
              <JoinWithCode initial={linkCode ?? ''} />
            </div>
            <p className="mt-4 text-[13px] text-ink3">Have a backup code instead? Start with your own money, then paste it in You → Backup code &amp; export.</p>
            <button type="button" className="btn-ghost mt-auto w-full" onClick={() => setStep('welcome')}>
              Back
            </button>
          </div>
        )}

        {idx >= 0 && (
          <>
            <div className="mt-6 flex gap-1.5" aria-label={`Step ${idx + 1} of ${FLOW.length}`}>
              {FLOW.map((f, i) => (
                <span key={f} className={`h-1 flex-1 rounded-full ${i <= idx ? 'bg-accent' : 'bg-line'}`} />
              ))}
            </div>
            <h1 id="ob-title" className="display mt-8 text-[30px] leading-tight">
              {titles[step]}
            </h1>

            <div className="mt-6 flex flex-col gap-2.5">
              {step === 'name' && (
                <>
                  <label htmlFor="ob-name" className="sr-only">
                    Your name
                  </label>
                  <input
                    id="ob-name"
                    autoFocus
                    className="field py-4 text-[18px]"
                    placeholder="Your name"
                    value={name}
                    autoComplete="given-name"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && canNext.name && next()}
                  />
                  <p className="text-[13px] text-ink3">Used in your greeting. Nothing else.</p>
                </>
              )}

              {step === 'reasons' && (
                <div role="group" aria-labelledby="ob-title" className="flex flex-col gap-2.5">
                  {REASONS.map((r) => (
                    <Choice
                      key={r}
                      multi
                      label={r}
                      on={reasons.includes(r) || (r !== 'All of these' && reasons.includes('All of these'))}
                      onClick={() => setReasons(r === 'All of these' ? (reasons.includes(r) ? [] : [r]) : reasons.includes(r) ? reasons.filter((x) => x !== r) : [...reasons.filter((x) => x !== 'All of these'), r])}
                    />
                  ))}
                </div>
              )}

              {step === 'pay' && (
                <>
                  <div role="radiogroup" aria-labelledby="ob-title" className="flex flex-col gap-2.5">
                    {PAY.map((p) => (
                      <Choice key={p} label={p} on={pay === p} onClick={() => setPay(p)} />
                    ))}
                  </div>
                  {pay && (
                    <div className="mt-3 animate-rise rounded-3xl border border-line bg-surface p-4">
                      <label className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3 text-[14.5px]">
                        <span className="font-medium">Currency</span>
                        <select
                          id="ob-currency"
                          className="field w-auto max-w-[62%] py-2"
                          value={currency}
                          onChange={(e) => setCur(e.target.value as CurrencyCode)}
                        >
                          {CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.flag} {c.code} · {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-center text-[13.5px] font-semibold text-ink2">About how much comes in a month?</p>
                      <MoneyInput value={income} onChange={setIncome} label="Approximate monthly income" size="md" id="ob-income" />
                      {pay !== 'Freelance' && (
                        <label className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-3 text-[14.5px]">
                          <span className="font-medium">{pay === 'Multiple sources' ? 'Next main payday' : 'Next payday'}</span>
                          <input type="date" className="field w-auto py-2" value={payday} min={today} onChange={(e) => e.target.value && setPayday(e.target.value)} />
                        </label>
                      )}
                      <p className="mt-3 text-center text-[12.5px] text-ink3">A rough number is fine. {pay === 'Freelance' ? 'Freelance money is counted when it lands, never in advance.' : 'Safe-to-spend is worked out until this date.'}</p>
                    </div>
                  )}
                </>
              )}

              {step === 'money' && (
                <>
                  <p className="-mt-2 mb-2 text-[15px] text-ink2">What's in your account and wallet today. This is the starting point for safe-to-spend.</p>
                  {banks.map((b, i) => {
                    const set = (patch: Partial<{ name: string; balance: string }>) => setBanks(banks.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    return (
                      <div key={i} className="animate-rise rounded-3xl border border-line bg-surface p-4">
                        <div className="flex items-center gap-2">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-[13px] font-bold text-accent-ink" aria-hidden="true">
                            {bankInitials(b.name) || '🏦'}
                          </span>
                          <label htmlFor={`ob-bank-name-${i}`} className="sr-only">
                            Bank name {i + 1}
                          </label>
                          <input
                            id={`ob-bank-name-${i}`}
                            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold placeholder:font-medium placeholder:text-ink3 focus:outline-none"
                            placeholder={i === 0 ? 'Main bank (e.g. HDFC)' : 'Bank name'}
                            value={b.name}
                            onFocus={() => setBankPicker(i)}
                            onChange={(e) => set({ name: e.target.value })}
                            autoComplete="off"
                          />
                          {banks.length > 1 && (
                            <button type="button" onClick={() => { setBanks(banks.filter((_, j) => j !== i)); setBankPicker(null); }} className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label={`Remove ${b.name || `bank ${i + 1}`}`}>
                              <Icon name="x" size={16} />
                            </button>
                          )}
                        </div>
                        {bankPicker === i && !BANKS.includes(b.name) && (
                          <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="Pick your bank">
                            {BANKS.filter((n) => !banks.some((x, j) => j !== i && x.name === n)).filter((n) => !b.name || n.toLowerCase().includes(b.name.toLowerCase())).map((n) => (
                              <button key={n} type="button" className="chip shrink-0 text-[13px]" onClick={() => { set({ name: n }); setBankPicker(null); }}>
                                {n}
                              </button>
                            ))}
                          </div>
                        )}
                        <MoneyInput value={b.balance} onChange={(v) => set({ balance: v })} label={`${b.name || 'Bank'} balance`} size="md" autoFocus={i === 0 && !b.balance} id={`ob-bank-${i}`} />
                        <p className="-mt-1 text-center text-[12.5px] text-ink3">{i === 0 ? 'Main account · new expenses go here' : 'Balance today'}</p>
                      </div>
                    );
                  })}
                  {banks.length < 6 && (
                    <button type="button" className="chip self-start" onClick={() => { setBanks([...banks, { name: '', balance: '' }]); setBankPicker(banks.length); }}>
                      <Icon name="plus" size={15} /> Add another bank
                    </button>
                  )}
                  <div className="rounded-3xl border border-line bg-surface p-4">
                    <p className="text-center text-[13.5px] font-semibold text-ink2">Cash in hand</p>
                    <MoneyInput value={cash} onChange={setCash} label="Cash in hand" size="md" id="ob-cash" />
                  </div>
                  {showInvest ? (
                    <div className="animate-rise rounded-3xl border border-line bg-surface p-4">
                      <p className="text-[14px] font-semibold">Investments (optional)</p>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
                          Monthly SIP
                          <input id="ob-sip" inputMode="decimal" className="field num" placeholder={sym().trim()} value={sip} onChange={(e) => setSip(e.target.value.replace(/[^\d.]/g, ''))} />
                        </label>
                        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
                          SIP date
                          <input type="date" className="field px-2" value={sipDate} min={today} onChange={(e) => e.target.value && setSipDate(e.target.value)} />
                        </label>
                      </div>
                      <label className="mt-3 flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
                        What your investments are worth today
                        <input id="ob-invested" inputMode="decimal" className="field num" placeholder={`${sym()}0`} value={invested} onChange={(e) => setInvested(e.target.value.replace(/[^\d.]/g, ''))} />
                      </label>
                      <p className="mt-2 text-[12.5px] text-ink3">Your SIP is deducted automatically each month and kept aside before payday. Add more SIPs later in You → Investments.</p>
                    </div>
                  ) : (
                    <button type="button" className="chip self-start" onClick={() => setShowInvest(true)}>
                      <Icon name="plus" size={15} /> I have SIPs or investments
                    </button>
                  )}
                  <p className="text-[12.5px] text-ink3">You can add more accounts, cards and loans later in You → Accounts.</p>
                </>
              )}

              {step === 'priorities' && (
                <div role="group" aria-labelledby="ob-title" className="flex flex-col gap-2.5">
                  {PRIORITIES.map((p) => (
                    <Choice key={p} multi label={p} on={prio.includes(p)} onClick={() => setPrio(prio.includes(p) ? prio.filter((x) => x !== p) : prio.length >= 3 ? prio : [...prio, p])} />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-auto flex gap-2 pt-8">
              <button type="button" className="btn-quiet w-14 px-0" onClick={back} aria-label="Back">
                <Icon name="back" size={20} />
              </button>
              <button type="button" disabled={!canNext[step]} className="btn-primary flex-1 disabled:opacity-40" onClick={next}>
                {step === 'priorities' ? 'Build my dashboard' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {step === 'building' && (
          <div className="flex flex-1 flex-col items-center justify-center text-center" aria-live="polite">
            <span className="relative grid h-16 w-16 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/25 motion-reduce:hidden" />
              <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-on-accent">
                <Icon name="spark" size={22} />
              </span>
            </span>
            <h1 id="ob-title" className="display mt-6 text-[24px]">
              Setting up your money…
            </h1>
            <p className="mt-2 text-ink2">Working out what's safe to spend</p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-1 flex-col pt-10">
            <h1 id="ob-title" className="display text-[30px] leading-tight">
              You're set, {fresh.user.name}.
            </h1>
            <div className="mt-6 rounded-3xl border border-line bg-surface p-5">
              <p className="num-hero text-[39px] leading-none">{rupees(preview.safe)}</p>
              <p className="eyebrow mt-2 text-ink2">Safe to spend</p>
              <p className="mt-2 text-[14.5px] text-ink2">
                {rupees(preview.daily)} a day until {fmtDate(preview.payday)}, after keeping {rupees(preview.buffer)} aside for surprises.
              </p>
            </div>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[
                ['receipt', 'Add rent, phone and subscriptions so they’re set aside before payday'],
                ['target', fresh.plans.length ? 'An emergency fund plan is ready to top up' : 'Create a plan for something you’re saving for'],
                ...(fresh.investments.length ? [['trend', `Your ${rupees(fresh.investments[0].amount)} SIP is deducted on the ${ordinal(Number(fresh.investments[0].nextDate.slice(8)))} of every month`]] : []),
                ['users', 'Split costs with friends from the + button'],
              ].map(([i, t]) => (
                <li key={t} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">
                    <Icon name={i} size={18} />
                  </span>
                  <span className="text-[14.5px] font-medium">{t}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-accent mt-auto w-full"
              onClick={() => {
                auth.rename(fresh.user.fullName || fresh.user.name);
                startPersonal(fresh);
              }}
            >
              Open PULSE
            </button>
            <button type="button" className="btn-ghost mt-2 w-full" onClick={() => setStep('priorities')}>
              Go back and change something
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const BANKS = ['SBI', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak', 'Bank of Baroda', 'PNB', 'Canara Bank', 'Union Bank', 'IDFC FIRST', 'Yes Bank', 'IndusInd', 'AU Bank', 'Federal Bank', 'Paytm Payments', 'Airtel Payments', 'Jupiter', 'Fi Money'];

function bankInitials(name: string): string {
  const n = name.trim();
  if (!n) return '';
  const words = n.replace(/bank/i, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return n.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, words[0].length <= 3 ? 3 : 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
