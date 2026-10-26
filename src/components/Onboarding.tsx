import { useEffect, useMemo, useRef, useState } from 'react';
import { inFrame, isIOS, isStandalone } from '../lib/pwa';
import { CURRENCIES, detectCurrency, setCurrency, sym, type CurrencyCode } from '../lib/currency';
import { useStore } from '../store/store';
import { useBackSteps } from '../store/ui';
import { createFresh, nextFirstOfMonth } from '../data/seed';
import { safeToSpend } from '../lib/finance';
import { addDays, fmtDate, ordinal, realToday, rupees } from '../lib/format';
import { Icon } from './ui/Icon';
import { MoneyInput } from './ui/bits';
import { JoinWithCode } from '../screens/Sync';
import { takeSyncLink } from '../lib/sync';
import { useAuth } from '../store/auth';
import { LoginLegal, LoginPanel } from './Auth';

const REASONS = ['Track spending', 'Save more', 'Control subscriptions', 'Plan a goal', 'Manage shared expenses', 'All of these'];
const PAY = ['Salary', 'Freelance', 'Allowance', 'Multiple sources', 'Other'];
// Monthly payments people forget to mention. Picked during setup, they're kept aside before they're due.
type BillPick = { key: string; name: string; emoji: string; category: string; kind: 'bill' | 'subscription'; day: number };
const BILL_PICKS: BillPick[] = [
  { key: 'rent', name: 'Rent / PG', emoji: '🏠', category: 'rent', kind: 'bill', day: 5 },
  { key: 'electricity', name: 'Electricity', emoji: '💡', category: 'bills', kind: 'bill', day: 15 },
  { key: 'wifi', name: 'Wi-Fi', emoji: '📶', category: 'bills', kind: 'bill', day: 10 },
  { key: 'phone', name: 'Phone recharge', emoji: '📱', category: 'bills', kind: 'bill', day: 20 },
  { key: 'netflix', name: 'Netflix', emoji: '📺', category: 'subscriptions', kind: 'subscription', day: 1 },
  { key: 'spotify', name: 'Spotify', emoji: '🎧', category: 'subscriptions', kind: 'subscription', day: 1 },
  { key: 'prime', name: 'Prime', emoji: '📦', category: 'subscriptions', kind: 'subscription', day: 1 },
  { key: 'gym', name: 'Gym', emoji: '🏋️', category: 'fitness', kind: 'subscription', day: 1 },
];
const PRIORITIES = ['Save for something', 'Reduce unnecessary spending', 'Build emergency savings', 'Understand spending', 'Manage social expenses'];

type Step = 'welcome' | 'trust' | 'join' | 'name' | 'reasons' | 'pay' | 'money' | 'bills' | 'priorities' | 'building' | 'done';
const FLOW: Step[] = ['name', 'reasons', 'pay', 'money', 'bills', 'priorities'];

// Screen 1: what PULSE gives you, before any questions.
const VALUE: { icon: 'wallet' | 'target' | 'users'; title: string; sub: string; accent?: boolean }[] = [
  { icon: 'wallet', title: 'Know what’s safe to spend', sub: 'After rent, bills and savings. Every day till payday.', accent: true },
  { icon: 'target', title: 'Plan goals that happen', sub: 'A trip, a phone, a gullak. PULSE keeps you on track.' },
  { icon: 'users', title: 'Split with friends', sub: 'Who owes who, settled in one tap. Bhisi too.' },
];
// Screen 2: only promises that are true in PULSE today (each one has a test).
// Screen 2: three short promises under the picture (the "60 seconds" line sits under the buttons).
const PROMISES: { icon: 'lock' | 'pencil' | 'trash'; title: string; accent?: boolean }[] = [
  { icon: 'lock', title: 'No bank login, ever', accent: true },
  { icon: 'pencil', title: 'Skip anything, guess the rest' },
  { icon: 'trash', title: 'Delete everything, any time' },
];

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
    if (auth.outcome !== 'new' || !auth.session || (step !== 'welcome' && step !== 'trust') || moved.current) return;
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
  const [bills, setBills] = useState<(BillPick & { amount: string })[]>([]);
  const [noBills, setNoBills] = useState(false);
  const [otherSeq, setOtherSeq] = useState(0);
  const [currency, setCur] = useState<CurrencyCode>(() => detectCurrency());
  // Amounts typed during setup are shown in the currency being chosen here.
  setCurrency(currency);

  // pulsemoney.in/?demo=1 opens the demo straight away (there's no demo button on the first screen).
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('demo') !== '1') return;
    q.delete('demo');
    const rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    startDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        bills: noBills ? [] : bills.map((b) => ({ name: b.name, amount: parseFloat(b.amount) || 0, day: b.day, kind: b.kind, category: b.category })),
        skipped: noBills ? ['bills'] : [],
      }),
    [name, reasons, pay, income, payday, banks, cash, prio, invested, sip, sipDate, currency, bills, noBills],
  );
  const preview = useMemo(() => safeToSpend(fresh), [fresh]);

  const idx = FLOW.indexOf(step);
  const next = () => setStep(idx < FLOW.length - 1 ? FLOW[idx + 1] : 'building');
  const back = () => setStep(step === 'trust' ? 'welcome' : step === 'join' ? 'trust' : idx > 0 ? FLOW[idx - 1] : 'trust');
  // The phone's back gesture goes back one step of setup rather than out of PULSE.
  const DEPTH: Record<Step, number> = { welcome: 0, trust: 1, join: 2, name: 2, reasons: 3, pay: 4, money: 5, bills: 6, priorities: 7, building: 8, done: 8 };
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
    bills: 'What do you pay every month?',
    priorities: 'Pick up to 3 priorities',
  };
  // Every question can be skipped ("You can skip anything" on screen 2). Setup fills sensible
  // defaults for anything left empty (a name becomes "Friend", and so on).
  const canNext: Record<string, boolean> = {
    name: true,
    reasons: true,
    pay: true,
    money: true,
    bills: noBills || bills.every((b) => b.name.trim() && parseFloat(b.amount) > 0),
    priorities: true,
  };
  const empty: Record<string, boolean> = {
    name: !name.trim(),
    reasons: reasons.length === 0,
    pay: !pay && !income,
    money: banks.every((b) => !b.balance) && !cash && !sip && !invested,
    bills: !noBills && bills.length === 0,
    priorities: false,
  };

  return (
    // A normal page (not an overlay), so on phones the keyboard just scrolls this form.
    <div className="min-h-[100svh] bg-bg" role="main" aria-labelledby="ob-title">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-[480px] flex-col px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
        <p className="display text-[20px] tracking-tight">
          PULSE<span className="text-accent-ink">.</span>
        </p>

        {step === 'welcome' && (
          <div className="flex flex-1 flex-col pt-8">
            <h1 id="ob-title" className="display text-[32px] leading-[1.06]">
              Know what you can spend, without the math.
            </h1>
            <p className="mt-3 text-[15.5px] text-ink2">Here’s what PULSE shows you every day:</p>
            <WelcomePreview />
            <ul className="mt-5 flex flex-col gap-3">
              {VALUE.map((v) => (
                <li key={v.title} className="flex items-start gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${v.accent ? 'bg-accent-soft text-accent-ink' : 'bg-sunk text-ink'}`} aria-hidden="true">
                    <Icon name={v.icon} size={19} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold leading-snug">{v.title}</span>
                    <span className="block text-[13px] leading-snug text-ink3">{v.sub}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-3 pt-8">
              {hasOwnData && (
                <p className="rounded-2xl bg-warn/15 p-3 text-[14px] text-ink" role="alert">
                  Setting up again replaces the money you've already entered on this device. Copy a backup first from You → Export data.
                </p>
              )}
              <button type="button" className="btn-accent w-full text-[16px]" onClick={() => setStep('trust')} data-autofocus>
                Get started
              </button>
              {hasOwnData && (
                <button type="button" className="btn-ghost w-full" onClick={closeOnboarding}>
                  Cancel, keep my data
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'trust' && (
          <div className="flex flex-1 flex-col pt-5">
            <p className="text-[12.5px] font-bold tracking-[.06em] text-accent-ink">BEFORE WE START</p>
            <h1 id="ob-title" className="display mt-1 text-[30px] leading-tight">
              Your money, your rules.
            </h1>
            {/* Decoration only. Sized so the sign-in buttons still fit on the first screen. */}
            <img src="/illustrations/onboarding-trust.webp" alt="" aria-hidden="true" width={800} height={1026} decoding="async" data-testid="trust-art" className="mx-auto mt-2 w-auto max-w-full object-contain" style={{ height: 'clamp(150px, calc(100svh - 510px), 300px)' }} />
            <ul className="mt-4 flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
              {PROMISES.map((v) => (
                <li key={v.title} className="flex items-center gap-3 px-4 py-2.5 text-[15px] font-bold">
                  <span className={v.accent ? 'text-accent-ink' : 'text-ink2'} aria-hidden="true">
                    <Icon name={v.icon} size={18} />
                  </span>
                  {v.title}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-3 pt-5">
              {auth.loading ? (
                <div className="grid min-h-[112px] place-items-center" role="status" aria-label="Loading">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden="true" />
                </div>
              ) : needLogin ? (
                <LoginPanel />
              ) : (
                <>
                  <button type="button" className="btn-accent w-full text-[16px]" onClick={() => setStep(auth.session?.account.name && name.trim() ? 'reasons' : 'name')} data-autofocus>
                    Continue
                  </button>
                </>
              )}
              {iosBrowser && !auth.on && (
                <p className="rounded-2xl bg-sunk p-3 text-[13.5px] leading-snug text-ink2">
                  <b className="text-ink">On iPhone?</b> Add PULSE to your Home Screen first (tap Share, then <b className="text-ink">Add to Home Screen</b>) and set up there. The home-screen app keeps its own data.
                </p>
              )}
              {auth.loading ? null : needLogin ? <LoginLegal /> : <p className="text-center text-[12.5px] text-ink3">Takes about 60 seconds. {auth.on ? 'Your money is saved to your PULSE account.' : 'Your numbers stay in this browser on this device.'}</p>}
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
                    onKeyDown={(e) => e.key === 'Enter' && next()}
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

              {step === 'bills' && (
                <>
                  <p className="-mt-2 mb-2 text-[15px] text-ink2">PULSE keeps these aside before they're due, so your safe-to-spend is real. Rough amounts are fine.</p>
                  {!noBills && (
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Pick what you pay">
                      {BILL_PICKS.map((p) => {
                        const on = bills.some((b) => b.key === p.key);
                        return (
                          <button key={p.key} type="button" className="chip" aria-pressed={on} onClick={() => setBills(on ? bills.filter((b) => b.key !== p.key) : [...bills, { ...p, amount: '' }])}>
                            <span aria-hidden="true">{p.emoji}</span> {p.name}
                          </button>
                        );
                      })}
                      <button type="button" className="chip" onClick={() => { setBills([...bills, { key: `other-${otherSeq}`, name: '', emoji: '🧾', category: 'bills', kind: 'bill', day: 1, amount: '' }]); setOtherSeq(otherSeq + 1); }}>
                        <Icon name="plus" size={15} /> Something else
                      </button>
                    </div>
                  )}
                  {!noBills &&
                    bills.map((b) => {
                      const set = (patch: Partial<BillPick & { amount: string }>) => setBills(bills.map((x) => (x.key === b.key ? { ...x, ...patch } : x)));
                      const custom = b.key.startsWith('other-');
                      return (
                        <div key={b.key} className="animate-rise rounded-3xl border border-line bg-surface p-4">
                          <div className="flex items-center gap-2">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sunk text-[18px]" aria-hidden="true">
                              {b.emoji}
                            </span>
                            {custom ? (
                              <input aria-label="What is it" autoFocus className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold placeholder:font-medium placeholder:text-ink3 focus:outline-none" placeholder="e.g. Maid, tuition, EMI" value={b.name} onChange={(e) => set({ name: e.target.value })} />
                            ) : (
                              <span className="min-w-0 flex-1 text-[15px] font-semibold">{b.name}</span>
                            )}
                            <button type="button" onClick={() => setBills(bills.filter((x) => x.key !== b.key))} className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label={`Remove ${b.name || 'this'}`}>
                              <Icon name="x" size={16} />
                            </button>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
                              A month
                              <input inputMode="decimal" className="field num" placeholder={sym().trim()} value={b.amount} autoFocus={!custom && !b.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, '') })} />
                            </label>
                            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
                              Due on
                              <select className="field" value={b.day} onChange={(e) => set({ day: Number(e.target.value) })}>
                                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                                  <option key={d} value={d}>
                                    {d === 31 ? 'Last day' : ordinal(d)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  <button type="button" role="checkbox" aria-checked={noBills} onClick={() => setNoBills(!noBills)} className={`tap mt-1 flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border px-4 text-left text-[15px] font-medium ${noBills ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:border-ink3/50'}`}>
                    I don't pay rent or bills (I live with family)
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${noBills ? 'border-bg bg-bg text-ink' : 'border-line'}`} aria-hidden="true">
                      {noBills && <Icon name="check" size={13} strokeWidth={3} />}
                    </span>
                  </button>
                  <p className="text-[12.5px] text-ink3">Loans, EMIs and credit cards can be added from Home after setup.</p>
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
                {step === 'priorities' ? 'Build my dashboard' : empty[step] ? 'Skip for now' : 'Continue'}
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
          <div className="flex flex-1 flex-col pt-4">
            <img src="/illustrations/onboarding-done.webp" alt="" aria-hidden="true" width={575} height={700} decoding="async" data-testid="done-art" className="mx-auto mb-2 w-auto object-contain" style={{ height: 'clamp(120px, calc(100svh - 600px), 210px)' }} />
            <h1 id="ob-title" className="display text-[30px] leading-tight">
              You're set, {fresh.user.name}.
            </h1>
            <div className="mt-6 rounded-3xl border border-line bg-surface p-5">
              <p className="num-hero text-[39px] leading-none">{rupees(preview.safe)}</p>
              <p className="eyebrow mt-2 text-ink2">Safe to spend</p>
              <dl className="mt-4 border-t border-line pt-3 text-[14px]">
                {[
                  ['In your accounts', rupees(preview.available)],
                  ...(preview.bills > 0 ? [[`Bills before ${fmtDate(preview.payday)}`, `−${rupees(preview.bills)}`]] : []),
                  ...(preview.invest > 0 ? [['SIPs before payday', `−${rupees(preview.invest)}`]] : []),
                  ...(preview.goals > 0 ? [['Plans', `−${rupees(preview.goals)}`]] : []),
                  ['Kept aside for surprises', `−${rupees(preview.buffer)}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 py-1">
                    <dt className="text-ink2">{k}</dt>
                    <dd className="num font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[14px] text-ink2">
                That's {rupees(preview.daily)} a day for {preview.daysLeft} {preview.daysLeft === 1 ? 'day' : 'days'}, until {fmtDate(preview.payday)}.
              </p>
              {!noBills && !fresh.subscriptions.some((x) => x.kind === 'bill') && (
                <p className="mt-3 rounded-2xl bg-sunk p-3 text-[13.5px] text-ink2">
                  No rent or bills added yet. If you pay some, this number is too high.{' '}
                  <button type="button" className="font-semibold text-accent-ink underline underline-offset-2" onClick={() => setStep('bills')}>
                    Add them
                  </button>
                </p>
              )}
            </div>
            <ul className="mb-6 mt-4 flex flex-col gap-2.5">
              {[
                ['receipt', fresh.subscriptions.length ? `${fresh.subscriptions.length} monthly ${fresh.subscriptions.length === 1 ? 'payment is' : 'payments are'} kept aside before ${fresh.subscriptions.length === 1 ? 'it’s' : 'they’re'} due` : 'Add rent, phone and subscriptions so they’re set aside before payday'],
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

/** Screen 1's example: a small picture of the Safe to spend card inside a phone. It's a picture, not
 *  something to tap: hidden from screen readers (the text around it says the same) and ignores taps. */
function WelcomePreview() {
  const today = realToday();
  return (
    <div data-testid="welcome-preview" aria-hidden="true" className="pointer-events-none mt-5 flex select-none flex-col items-center">
      <div className="w-[250px] rounded-t-[30px] border-[6px] border-b-0 border-line bg-sunk px-3 pt-4">
        <div className="origin-top scale-[.96] rounded-t-2xl bg-surface px-3 pb-2 pt-3 opacity-90">
          <p className="display text-[28px] leading-none">{rupees(8420)}</p>
          <p className="mt-1.5 text-[10px] font-bold tracking-[.16em] text-ink3">SAFE TO SPEND</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-sunk px-2.5 py-2">
              <p className="text-[10.5px] text-ink3">Per day</p>
              <p className="display whitespace-nowrap text-[13px]">{rupees(420)}/day</p>
            </div>
            <div className="rounded-xl bg-accent-soft px-2.5 py-2">
              <p className="text-[10.5px] text-accent-ink">Payday</p>
              <p className="display whitespace-nowrap text-[13px] text-accent-ink">in 20 days</p>
            </div>
          </div>
          <div className="relative mt-3 h-1.5 rounded-full bg-sunk">
            <span className="absolute left-0 top-0 h-1.5 w-[35%] rounded-full bg-accent/75" />
            <span className="absolute left-[35%] top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface" />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-semibold text-ink3">
            <span>{fmtDate(addDays(today, -11))}</span>
            <span className="text-accent-ink">{fmtDate(addDays(today, 20))}</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11.5px] font-semibold text-ink3">Preview · your numbers go here</p>
    </div>
  );
}
