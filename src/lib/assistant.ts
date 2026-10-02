import type { CategoryId, State } from '../types';
import { ex } from './currency';
import { INSURANCE_ON } from './features';
import { canIAfford, parseAffordQuery, type AffordResult } from './afford';
import {
  budgetState,
  categoryName,
  investedBetween,
  investmentMonthly,
  insuranceTotals,
  PREMIUM_LABEL,
  investmentTotals,
  sipProjection,
  monthRange,
  netWorth,
  nextPayday,
  personBalances,
  planMetrics,
  prevMonth,
  recurringTotals,
  safeToSpend,
  spendBetween,
  spendByCategory,
  upcoming,
} from './finance';
import { addDays, fmtDate, monthName, monthShort, parseDate, relDay, rupees } from './format';
import { guessCategory } from './parse';
import { monthIn, parseAction, type AIAction } from './aiActions';
import { buildRecap } from './insights';
import { yearSummary } from './history';

// PULSE AI: answers are computed from the app's own data, not generated text.

export type AIBlock =
  | { type: 'compare'; rows: { label: string; value: number; highlight?: boolean }[]; delta?: number }
  | { type: 'list'; rows: { label: string; value: string; sub?: string }[] }
  | { type: 'afford'; result: AffordResult }
  | { type: 'progress'; label: string; value: number; sub: string }
  | { type: 'action'; action: AIAction; status?: 'done' | 'cancelled' | 'opened'; note?: string; txId?: string }
  | { type: 'report'; month: string }
  | { type: 'year'; year: number }
  | { type: 'link'; label: string; to: AILink };

/** Where a link button in an answer goes. */
export type AILink =
  | { kind: 'route'; tab: 'home' | 'activity' | 'plans' | 'you'; route?: { name: string; [k: string]: unknown } }
  | { kind: 'sheet'; sheet: { type: string; [k: string]: unknown } };

export interface AIAnswer {
  text: string;
  blocks?: AIBlock[];
  followups?: string[];
}

/** Starter questions that fit this person's data. */
export function starterQuestions(s: State): string[] {
  const plan = s.plans.find((p) => p.status === 'active');
  const q = [
    `Add ${ex(450)} dinner`,
    'Show my monthly report',
    'How much did I spend on food this month?',
    `Can I afford a ${ex(5000)} dinner?`,
    ...(plan ? [`When will I reach my ${plan.name} goal?`] : []),
    'What subscriptions do I have?',
    'Why is this month more expensive?',
    'How much can I spend this weekend?',
    'What changed from last month?',
    'What are my biggest recurring expenses?',
    ...(s.investments?.length ? ['How much am I investing in SIPs?'] : []),
    'How did I spend this year?',
  ];
  if (!s.transactions.length) return [`Add ${ex(450)} dinner`, `Got salary ${ex(40000)}`, `Add Netflix ${ex(199)} monthly`, 'How much can I spend today?', `Can I afford ${ex(3000)}?`, 'How much can I spend this weekend?', ...(plan ? [`When will I reach my ${plan.name} goal?`] : [])];
  return q;
}

export const starterDefaults = (): string[] => [
  `Add ${ex(450)} dinner`,
  'Show my monthly report',
  'How much did I spend on food this month?',
  `Can I afford a ${ex(5000)} dinner?`,
  'When will I reach my Goa goal?',
  'What subscriptions do I have?',
  'Why is this month more expensive?',
  'How much can I spend this weekend?',
  'What changed from last month?',
  'What are my biggest recurring expenses?',
];

const CAT_WORDS: [CategoryId, RegExp][] = [
  ['food', /\b(food|eating|dining|swiggy|zomato|delivery|groceries|grocery)\b/],
  ['transport', /\b(transport|travel(l)?ing around|uber|cabs?|rides?|commute|rapido|metro)\b/],
  ['shopping', /\b(shopping|clothes|amazon|myntra|flipkart)\b/],
  ['entertainment', /\b(entertainment|movies?|going out|fun)\b/],
  ['bills', /\b(bills?|rent|utilities)\b/],
  ['subscriptions', /\b(subscriptions?|ott)\b/],
  ['health', /\b(health|gym|medicine|pharmacy)\b/],
  ['travel', /\b(travel|trips?|flights?)\b/],
  ['education', /\b(education|courses?|learning)\b/],
];

export function askPulse(s: State, question: string): AIAnswer {
  const q = question.toLowerCase().trim();
  const today = s.today;
  const [mStart] = monthRange(today);
  const [pStart, pEnd] = monthRange(prevMonth(today));
  const thisM = monthName(today);
  const lastM = monthName(pStart);

  // --- Insurance ---
  if (INSURANCE_ON && /\b(insurance|premiums?|polic(y|ies))\b/.test(q) && !/^(add|log|spent|paid|pay|got|record)\b/.test(q)) {
    const list = [...(s.insurance ?? [])].sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    const link: AIBlock = { type: 'link', label: list.length ? 'Open insurance' : 'Add a policy', to: { kind: 'route', tab: 'you', route: { name: 'insurance' } } };
    if (!list.length) return { text: "You haven't added any insurance yet. Add your health, term or vehicle policy and I'll keep the premium aside and remind you before it's due.", blocks: [link] };
    const t = insuranceTotals(s);
    const sts = safeToSpend(s);
    const n = list[0];
    return {
      text: `You pay ${rupees(t.yearly)} a year for insurance (about ${rupees(t.monthly)} a month) across ${list.length} ${list.length === 1 ? 'policy' : 'policies'}. Next up: ${n.name}, ${rupees(n.premium)} on ${fmtDate(n.nextDate)}.${sts.setAside > 0 ? ` ${rupees(sts.setAside)} is kept aside for premiums right now.` : ''}`,
      blocks: [{ type: 'list', rows: list.map((p) => ({ label: p.name, value: rupees(p.premium), sub: `${PREMIUM_LABEL[p.cycle]} · due ${fmtDate(p.nextDate)}${p.autoDebit ? ' · auto-debit' : ''}` })) }, link],
      followups: ['What bills are coming up?', 'How much can I spend today?'],
    };
  }

  // --- Monthly / yearly report ---
  if (/\b(report|recap|summary|review|wrapped|overview|breakdown)\b|how did i do|how was my (month|year)|spend(ing)? history|this year|yearly|annual|whole year/.test(q) && !/\bafford\b/.test(q)) {
    const yearMatch = q.match(/\b(20\d\d)\b/);
    if (/\byear(ly)?\b|\bannual\b|spend(ing)? history|\b20\d\d\b(?!.*\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/.test(q)) {
      const year = yearMatch ? Number(yearMatch[1]) : Number(today.slice(0, 4));
      const y = yearSummary(s, year);
      if (!y.spent && !y.income) return { text: `There's nothing recorded for ${year} yet. Once you log a few expenses, your year shows up here month by month.`, blocks: [{ type: 'link', label: 'Open spending history', to: { kind: 'route', tab: 'you', route: { name: 'history', year } } }] };
      const top = y.categories[0];
      return {
        text: `In ${year} so far you've spent ${rupees(y.spent)} across ${y.monthsSoFar} month${y.monthsSoFar === 1 ? '' : 's'}, about ${rupees(y.avgSpent)} a month. ${rupees(y.income)} came in and ${rupees(y.saved + y.invested)} went into plans and investments.${top ? ` Your biggest category is ${top.name.toLowerCase()} at ${rupees(top.amount)}.` : ''}${y.highest ? ` The most expensive month was ${monthName(y.highest.month)} (${rupees(y.highest.spent)}).` : ''}`,
        blocks: [{ type: 'year', year }, { type: 'link', label: 'Open full spending history', to: { kind: 'route', tab: 'you', route: { name: 'history', year } } }],
        followups: ['Show my monthly report', 'What changed from last month?'],
      };
    }
    const month = monthIn(q, today) ?? today.slice(0, 8) + '01';
    const r = buildRecap(s, month);
    if (!r.spent && !r.income && !r.saved && !r.invested) return { text: `Nothing is recorded for ${r.monthLabel} yet, so there's no report to show.`, followups: ['Show my monthly report'] };
    const vs = r.vsLast ? ` That's ${Math.abs(Math.round(r.vsLast * 100))}% ${r.vsLast > 0 ? 'more' : 'less'} than the month before.` : '';
    const prevLabel = monthName(prevMonth(month));
    return {
      text: `${r.monthLabel}${r.partial ? ` so far (through ${r.throughDate})` : ''}: you spent ${rupees(r.spent)}, ${rupees(r.income)} came in, and ${rupees(r.saved + r.invested)} went into plans and investments.${vs}`,
      blocks: [{ type: 'report', month }],
      followups: [`Report for ${prevLabel}`, 'How did I spend this year?', 'Why is this month more expensive?'],
    };
  }

  // --- Open a screen ---
  const openHit = q.match(/^(?:open|go to|take me to|show|show me)\s+(?:my\s+|the\s+)?(.+)$/);
  if (openHit) {
    const t = openHit[1];
    const map: [RegExp, string, AILink][] = [
      [/invest|sip/, 'Investments & SIPs', { kind: 'route', tab: 'you', route: { name: 'investments' } }],
      [/feedback/, 'Send feedback', { kind: 'route', tab: 'you', route: { name: 'feedback' } }],
      [/subscri|bills?|recurring/, 'Subscriptions & bills', { kind: 'route', tab: 'you', route: { name: 'subscriptions' } }],
      [/net ?worth/, 'Net worth', { kind: 'route', tab: 'you', route: { name: 'networth' } }],
      [/history|year/, 'Spending history', { kind: 'route', tab: 'you', route: { name: 'history' } }],
      [/income|salary/, 'Income', { kind: 'route', tab: 'you', route: { name: 'income' } }],
      [/accounts?|banks?/, 'Accounts', { kind: 'route', tab: 'you', route: { name: 'accounts' } }],
      [/cards?/, 'Credit cards', { kind: 'route', tab: 'you', route: { name: 'cards' } }],
      [/loans?|debts?|emi/, 'Loans', { kind: 'route', tab: 'you', route: { name: 'debt' } }],
      [/currenc/, 'Currency', { kind: 'route', tab: 'you', route: { name: 'settings', section: 'currency' } }],
      [/plans?|goals?|budgets?|splits?/, 'Plans', { kind: 'route', tab: 'plans' }],
      [/activity|transactions?|expenses?/, 'Activity', { kind: 'route', tab: 'activity' }],
      [/recap/, 'Monthly recap', { kind: 'sheet', sheet: { type: 'recap' } }],
    ];
    const hit = map.find(([re]) => re.test(t));
    if (hit) return { text: `Here you go.`, blocks: [{ type: 'link', label: `Open ${hit[1]}`, to: hit[2] }] };
  }

  // --- Do something: add an expense, income, bill, SIP, plan, budget or settle up ---
  const action = parseAction(s, question);
  if (action) {
    const text =
      action.kind === 'split'
        ? `Splitting ${rupees(action.amount)} with ${action.names.join(', ')}. I'll open the split so you can check who owes what.`
        : action.kind === 'settle'
          ? 'Got it. Check this and tap Save.'
          : "Here's what I'll add. Tap Add to save it, or change anything first.";
    return { text, blocks: [{ type: 'action', action }] };
  }

  // --- Can I afford ---
  const affordish = /afford/.test(q) || (/can i (spend|buy|get)|should i (buy|spend)|is it ok/.test(q) && /\d/.test(q));
  if (affordish && !/weekend/.test(q)) {
    const { amount, what } = parseAffordQuery(question);
    if (!amount) return { text: `Tell me the amount and I'll check it against your week. For example: "Can I afford ${ex(3000)} on shoes?"`, followups: [`Can I afford ${ex(3000)}?`, `Can I afford ${ex(6000)} on shoes?`] };
    const r = canIAfford(s, amount, what);
    return { text: `${r.headline} ${r.explanation}`, blocks: [{ type: 'afford', result: r }], followups: ['How much can I spend this weekend?', ...(s.plans.some((p) => p.status === 'active') ? [`When will I reach my ${s.plans.find((p) => p.status === 'active')!.name} goal?`] : [])] };
  }

  // --- Weekend ---
  if (/weekend/.test(q)) {
    const sts = safeToSpend(s);
    const dow = parseDate(today).getDay();
    const daysToWeekendEnd = dow === 0 ? 1 : dow === 6 ? 2 : 2;
    const weekendAllowance = Math.min(sts.safe, sts.daily * daysToWeekendEnd);
    const ent = s.budgets.find((b) => b.category === 'entertainment');
    const entLeft = ent ? budgetState(s, ent).left : null;
    const when = dow === 0 ? 'today' : dow === 6 ? 'this weekend' : 'this coming weekend';
    return {
      text: `About ${rupees(weekendAllowance)} for ${when} keeps you on pace until payday.${entLeft != null ? ` Your going-out budget has ${rupees(Math.max(0, entLeft))} left this week.` : ''}`,
      blocks: [{ type: 'list', rows: [
        { label: 'Daily allowance', value: `${rupees(sts.daily)}/day` },
        { label: 'Weekend days left', value: String(daysToWeekendEnd) },
        { label: 'Safe to spend until payday', value: rupees(sts.safe) },
      ] }],
      followups: [`Can I afford ${ex(1500)}?`, 'Make a weekend budget card'],
    };
  }

  // --- SIPs / investments ---
  if (/\bsips?\b|invest|mutual fund|\bmf\b|\brd\b|\bppf\b|\bnps\b/.test(q)) {
    const t = investmentTotals(s);
    const list = (s.investments ?? []).filter((i) => i.status === 'active');
    if (!list.length) return { text: "You haven't set up any SIPs yet. Add one in You → Investments & SIPs and I'll deduct it every month and keep it aside before payday." };
    const rate = list.reduce((a, i) => a + i.expectedReturn * investmentMonthly(i), 0) / Math.max(1, t.monthly);
    const p10 = sipProjection(t.monthly, 10, rate, t.holdings);
    const thisMonth = investedBetween(s, mStart, today);
    return {
      text: `You invest ${rupees(t.monthly)} a month across ${list.length} SIP${list.length > 1 ? 's' : ''}. ${rupees(thisMonth)} has gone in this month. Next debit: ${rupees(t.next!.amount)} for ${t.next!.name} on ${fmtDate(t.next!.nextDate)}. Keep it up for 10 years at about ${Math.round(rate * 10) / 10}% a year and it could be worth around ${rupees(p10.value)} (an estimate, not a promise).`,
      blocks: [{ type: 'list', rows: [...list.map((i) => ({ label: i.name, value: `${rupees(i.amount)}/${i.cycle === 'monthly' ? 'mo' : i.cycle === 'quarterly' ? 'qtr' : 'yr'}`, sub: `${i.platform ? `${i.platform} · ` : ''}next ${relDay(i.nextDate, today).toLowerCase()}` })), { label: 'Current value of holdings', value: rupees(t.holdings) }] }],
      followups: ['How much can I spend this weekend?', 'What is my net worth?'],
    };
  }

  // --- Who owes whom ---
  if (/\bowe|owed|settle|split/.test(q)) {
    const bal = personBalances(s);
    const person = s.people.find((p) => q.includes(p.short.toLowerCase()) || q.includes(p.name.split(' ')[0].toLowerCase()));
    if (person) {
      const v = bal.get(person.id) ?? 0;
      const text = v < 0 ? `You owe ${person.short} ${rupees(-v)}.` : v > 0 ? `${person.short} owes you ${rupees(v)}.` : `You and ${person.short} are all square.`;
      const groups = s.groups.filter((g) => g.members.includes(person.id)).map((g) => {
        const gv = personBalances(s, g.id).get(person.id) ?? 0;
        return { label: `${g.emoji} ${g.name}`, value: gv === 0 ? 'Settled' : gv < 0 ? `You owe ${rupees(-gv)}` : `Owes you ${rupees(gv)}` };
      });
      return { text, blocks: groups.length ? [{ type: 'list', rows: groups }] : undefined, followups: ['Who owes me money?'] };
    }
    const rows = [...bal.entries()].filter(([, v]) => v !== 0).sort((a, b) => a[1] - b[1]).map(([id, v]) => {
      const p = s.people.find((x) => x.id === id)!;
      return { label: p.short, value: v < 0 ? `You owe ${rupees(-v)}` : `Owes you ${rupees(v)}` };
    });
    const owe = [...bal.values()].filter((v) => v < 0).reduce((a, v) => a - v, 0);
    const owed = [...bal.values()].filter((v) => v > 0).reduce((a, v) => a + v, 0);
    return { text: `You owe ${rupees(owe)} in total and you're owed ${rupees(owed)}.`, blocks: [{ type: 'list', rows }] };
  }

  // --- Subscriptions / recurring ---
  if (/subscri|recurring|renew|ott/.test(q)) {
    const subs = s.subscriptions.filter((x) => x.status !== 'cancelled' && (/biggest|largest|most|expensive/.test(q) ? true : x.kind === 'subscription'));
    const sorted = [...subs].sort((a, b) => b.amount - a.amount);
    if (!sorted.length) return { text: "You haven't added any recurring payments yet. Add rent, your phone bill and subscriptions in You → Subscriptions & bills so they're set aside before payday." };
    const tot = recurringTotals(s, /biggest|largest|most|expensive/.test(q) ? undefined : 'subscription');
    if (/biggest|largest|most|expensive/.test(q)) {
      const top = sorted.slice(0, 5);
      return {
        text: `Your biggest recurring cost is ${top[0].name} at ${rupees(top[0].amount)} a month. All recurring payments add up to ${rupees(tot.monthly)} a month.`,
        blocks: [{ type: 'compare', rows: top.map((x) => ({ label: x.name, value: x.amount })) }],
        followups: ['What subscriptions do I have?'],
      };
    }
    return {
      text: `You have ${sorted.length} subscriptions costing ${rupees(tot.monthly)} a month, or ${rupees(tot.yearly)} a year.`,
      blocks: [{ type: 'list', rows: sorted.map((x) => ({ label: x.name, value: rupees(x.amount), sub: x.status === 'unknown' ? 'Not sure you use this' : x.status === 'paused' ? 'Paused' : `Renews ${relDay(x.nextDate, today)}` })) }],
      followups: ['What are my biggest recurring expenses?'],
    };
  }

  // --- Plans / goals ---
  const plan = s.plans.find((p) => q.includes(p.name.toLowerCase().split(' ')[0]) || (/emergency/.test(q) && p.id === 'ef'));
  if (plan || /\b(goal|plan|reach|save for)\b/.test(q)) {
    const target = plan ?? s.plans.filter((p) => p.status === 'active').sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0];
    if (!target) return { text: "You don't have a plan yet. Create one in the Plans tab and I can tell you when you'll get there." };
    if (target) {
      const m = planMetrics(s, target);
      const eta = m.projectedDate ? fmtDate(m.projectedDate, true) : 'not yet clear';
      const text =
        m.tone === 'done'
          ? `${target.name} is fully funded. ${rupees(target.saved)} is ready to spend.`
          : m.projectedDate
            ? `At your current pace you'll reach ${target.name} around ${eta}. Your target is ${fmtDate(target.targetDate, true)}. ${m.status}`
            : `Nothing's been added to ${target.name} yet. Saving ${rupees(m.monthly)} a month gets you there by ${fmtDate(target.targetDate, true)}.`;
      return {
        text,
        blocks: [
          { type: 'progress', label: `${target.icon} ${target.name}`, value: m.progress, sub: `${rupees(target.saved)} of ${rupees(target.target)}` },
          ...(m.tone !== 'done' ? [{ type: 'list' as const, rows: [{ label: 'Left to save', value: rupees(m.remaining) }, { label: 'Suggested', value: `${rupees(m.monthly)}/month` }, { label: 'Days to target', value: String(m.daysLeft) }] }] : []),
        ],
        followups: [`Can I afford ${ex(3000)}?`, 'How much can I spend this weekend?'],
      };
    }
  }

  // --- Why more expensive / what changed ---
  if (/why|changed|compare|difference|vs|versus|more expensive|last month/.test(q) && !/how much.*(on|for)/.test(q)) {
    const now = new Map(spendByCategory(s, mStart, today).map((c) => [c.category, c.amount]));
    const prev = new Map(spendByCategory(s, pStart, pEnd).map((c) => [c.category, c.amount]));
    const cats = new Set([...now.keys(), ...prev.keys()]);
    const deltas = [...cats].map((c) => ({ c, d: (now.get(c) ?? 0) - (prev.get(c) ?? 0) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const totNow = spendBetween(s, mStart, today);
    const totPrev = spendBetween(s, pStart, pEnd);
    if (totPrev === 0) return { text: `There's no ${lastM} spending to compare with yet. So far this month you've spent ${rupees(totNow)}. Check back next month.` };
    const up = deltas.filter((x) => x.d > 0).slice(0, 2);
    const down = deltas.filter((x) => x.d < 0).slice(0, 2);
    const lead =
      totNow > totPrev
        ? `${thisM} is ${rupees(totNow - totPrev)} more expensive than ${lastM} so far.`
        : `${thisM} is actually ${rupees(totPrev - totNow)} lighter than ${lastM} so far.`;
    const detail = up.length ? ` The biggest increases are ${up.map((x) => `${categoryName(s, x.c).toLowerCase()} (+${rupees(x.d)})`).join(' and ')}.` : '';
    const down1 = down.length ? ` ${categoryName(s, down[0].c)} spending is down ${rupees(-down[0].d)}.` : '';
    return {
      text: lead + detail + down1,
      blocks: [{ type: 'list', rows: deltas.slice(0, 6).map((x) => ({ label: categoryName(s, x.c), value: `${x.d >= 0 ? '+' : '−'}${rupees(Math.abs(x.d))}`, sub: `${rupees(prev.get(x.c) ?? 0)} → ${rupees(now.get(x.c) ?? 0)}` })) }],
      followups: ['How much did I spend on food this month?'],
    };
  }

  // --- Category or merchant spend ---
  const catHit = CAT_WORDS.find(([, re]) => re.test(q))?.[0] ?? (/(spend|spent)/.test(q) ? guessCategory(q) : null);
  if (catHit && /(how much|spent|spend|spending)/.test(q)) {
    const lastMonth = /last month/.test(q);
    const merchant = ['swiggy', 'zomato', 'uber', 'rapido', 'amazon', 'myntra', 'flipkart', 'zepto', 'blinkit'].find((m) => q.includes(m));
    if (merchant) {
      const sum = (a: string, b: string) => s.transactions.filter((t) => t.type === 'expense' && t.merchant.toLowerCase().includes(merchant) && t.date >= a && t.date <= b).reduce((x, t) => x + t.amount, 0);
      const now = sum(mStart, today);
      const prev = sum(pStart, pEnd);
      const name = merchant.charAt(0).toUpperCase() + merchant.slice(1);
      return { text: `You've spent ${rupees(now)} on ${name} this month. Last month it was ${rupees(prev)}.`, blocks: [{ type: 'compare', rows: [{ label: monthShort(pStart), value: prev }, { label: monthShort(today), value: now, highlight: true }], delta: prev ? (now - prev) / prev : undefined }] };
    }
    const now = spendBetween(s, mStart, today, [catHit]);
    const prev = spendBetween(s, pStart, pEnd, [catHit]);
    const name = categoryName(s, catHit).toLowerCase();
    const diff = now - prev;
    const text = lastMonth
      ? `You spent ${rupees(prev)} on ${name} in ${lastM}.`
      : `You've spent ${rupees(now)} on ${name} this month${prev ? `, ${rupees(Math.abs(diff))} ${diff >= 0 ? 'more' : 'less'} than ${lastM}` : ''}.`;
    return {
      text,
      blocks: [{ type: 'compare', rows: [{ label: lastM, value: prev }, { label: thisM, value: now, highlight: true }], delta: prev ? diff / prev : undefined }],
      followups: ['Why is this month more expensive?', `Can I afford a ${ex(5000)} dinner?`],
    };
  }

  // --- Budgets ---
  if (/budget/.test(q)) {
    if (!s.budgets.length) return { text: "You haven't set any budgets. They're optional. Add one in Plans → Budgets if you want to keep an eye on a category." };
    const rows = s.budgets.map((b) => {
      const st = budgetState(s, b);
      return { label: categoryName(s, b.category), value: st.label, sub: `${rupees(st.spent)} of ${rupees(b.amount)} ${b.period === 'weekly' ? 'this week' : 'this month'}` };
    });
    return { text: `You have ${s.budgets.length} budgets. Here's where each one stands.`, blocks: [{ type: 'list', rows }] };
  }

  // --- Net worth ---
  if (/net worth|worth|assets/.test(q)) {
    const nw = netWorth(s);
    const first = nw.history[0];
    const change = nw.total - first.value;
    return {
      text: nw.history.length < 2 ? `Your net worth is ${rupees(nw.total)}. A trend appears after your first full month.` : `Your net worth is ${rupees(nw.total)}, ${change >= 0 ? 'up' : 'down'} ${rupees(Math.abs(change))} since ${monthName(first.month + '-01')}.`,
      blocks: [{ type: 'list', rows: nw.rows.map((r) => ({ label: r.label, value: rupees(r.value) })) }],
    };
  }

  // --- Bills / upcoming ---
  if (/bill|due|upcoming|coming up|this week/.test(q)) {
    const items = upcoming(s, addDays(today, 14));
    return {
      text: `${items.length} payments are due in the next two weeks, ${rupees(items.reduce((a, i) => a + i.amount, 0))} in total. The ones before payday are already set aside.`,
      blocks: [{ type: 'list', rows: items.map((i) => ({ label: i.name, value: rupees(i.amount), sub: relDay(i.date, today) })) }],
    };
  }

  // --- Income / payday ---
  if (/income|salary|payday|get paid|paid next/.test(q)) {
    const pd = nextPayday(s);
    return { text: `Your next salary is due ${relDay(pd, today).toLowerCase()} (${fmtDate(pd)}). Freelance income this month: ${rupees(s.transactions.filter((t) => t.category === 'freelance' && t.date >= mStart).reduce((a, t) => a + t.amount, 0))}.` };
  }

  // --- Safe to spend ---
  if (/(how much|what).*(spend|left|free)|safe|today/.test(q)) {
    const sts = safeToSpend(s);
    return {
      text: `You can safely spend ${rupees(sts.safe)} until payday, about ${rupees(sts.daily)} a day for ${sts.daysLeft} days.`,
      blocks: [{ type: 'list', rows: [
        { label: 'Available now', value: rupees(sts.available) },
        { label: 'Upcoming bills', value: `−${rupees(sts.bills)}` },
        { label: 'SIPs & investments', value: `−${rupees(sts.invest)}` },
        { label: 'Plans', value: `−${rupees(sts.goals)}` },
        { label: 'Safety buffer', value: `−${rupees(sts.buffer)}` },
      ] }],
    };
  }

  return {
    text: `I can answer questions about your money and do things for you: add expenses and income ("${ex(450)} dinner", "got salary ${ex(40000)}"), add bills ("Netflix ${ex(199)} monthly"), start a SIP, put money into a plan, set a budget, or show your monthly report.`,
    followups: starterDefaults().slice(0, 4),
  };
}
