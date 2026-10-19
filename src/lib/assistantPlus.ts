import type { CategoryId, ISODate, Person, State, Transaction } from '../types';
import { ex, scaled } from './currency';
import { categoryName, myCost, personBalances, planMetrics, safeToSpend, spendBetween } from './finance';
import { addDays, addMonths, daysBetween, fmtDate, monthName, parseDate, relDay, rupees } from './format';
import { guessCategory } from './parse';
import type { AIAnswer } from './assistant';

// PULSE AI, round 2: Hinglish, and the newer questions (how long the money lasts, what-ifs,
// plan deadlines, paying or reminding a friend, biggest spends, no-spend days, fixing the last
// entry). Everything is still worked out on the phone from the person's own data.

// ---------------------------------------------------------------------------------------------
// Hinglish → the English PULSE AI already understands
// ---------------------------------------------------------------------------------------------
const HINGLISH: [RegExp, string][] = [
  [/\b(?:mera|mere|apna)\s+/g, 'my '],
  [/\bpaisa\s+kahan\s+(?:gaya|gya|gaye)\b|\bpaise\s+kahan\s+(?:gaye|gye)\b/g, 'where did my money go'],
  [/\b(?:paisa|paise|money)?\s*kab\s+tak\s+chal(?:ega|egi|enge|egaa)\b/g, 'how long will my money last'],
  [/\b(?:kitna|kitne|kitni)\s+(?:paisa\s+|paise\s+|pese\s+|rupay[ae]?\s+)?(?:bacha|bache|bachi|bacha\s+hua)(?:\s+(?:hai|hain|he|h))?\b/g, 'how much can i spend'],
  [/\b(?:kitna|kitne)\s+(?:kharch|kharcha|spend)\s+(?:kar\s+)?sak(?:ta|ti|te|u|oon)\b/g, 'how much can i spend'],
  [/\b(?:kitna|kitne|kitni)\s+(?:kharch[ae]?|spend)\s+(?:hua|huwa|hue|kiya|kia|kiye|ho\s+gaya|ho\s+gya)\b/g, 'how much did i spend'],
  [/\b(?:kitna|kitne)\s+(?:uda|udaa|ud|udaye)\s*(?:diya|diye|dia|diye)\b/g, 'how much did i spend'],
  [/\bkitne\s+(?:gaye|gye)\b/g, 'how much did i spend'],
  [/\b(?:salary|sallary|paise|pay|payday|stipend)\s+kab\s+(?:aayegi|aaegi|ayegi|aayega|aaega|ayega|aayenge|aaenge|ayenge|milegi|milega|milenge)\b/g, 'when is payday'],
  [/\bmujhe\s+kaun\s+(?:kitna\s+)?dega\b|\bkis(?:ne|ko)\s+mujhe\s+dena\b|\bkaun\s+(?:kitna\s+)?dega\b|\bmy\s+paise\s+kis(?:ke|ne)\s+paas\b/g, 'who owes me'],
  [/\bkisko\s+(?:kitna\s+)?dena\s+(?:hai|h)\b|\bmujhe\s+(?:kitna\s+)?dena\s+(?:hai|h)\b/g, 'who do i owe'],
  [/\bko\s+kitna\s+dena\s+(?:hai|h)\b/g, 'how much do i owe'],
  [/\b(?:le|kharid|khareed|afford\s+kar)\s+sak(?:ta|ti|te|u|oon|unga|ungi)(?:\s+(?:hu|hoon|hun|kya))?\b/g, 'can i afford'],
  [/\b(?:bill|bills|emi|emis)\s+kab\s+(?:hai|hain|h|aayega|due)\b|\bkya\s+due\s+(?:hai|h)\b|\bkaun\s*se\s+bills?\b/g, 'what bills are due'],
  [/\bho\s+pay(?:ega|egi|enge)\b|\bpura\s+ho(?:ga|gi)\b/g, 'can i reach goal'],
  [/\bsabse\s+bad[aei]\s+(?:kharch[ae]?|expenses?)\b/g, 'biggest expenses'],
  [/\bbina\s+kharch[ae]?\s+(?:wale\s+)?din\b/g, 'no-spend days'],
  [/\b(?:na\s+(?:karu|karun|karoon|lu|lun|loon|mangau|mangaun)|chhod\s+(?:du|dun|doon|diya)|band\s+(?:karu|karun|kar\s+du))\b/g, 'skip'],
  [/\b(?:kitna|kitne)\s+(?:bachega|bachegi|bachenge|bachaunga|bacha\s+lunga)\b|\b(?:bachega|bachegi|bachenge)\b/g, 'how much will i save'],
  [/\bis\s+(?:mahin[ae]|month)\b/g, 'this month'],
  [/\bpichl[ae]\s+(?:mahin[ae]|month)\b/g, 'last month'],
  [/\bis\s+(?:hafte|week)\b/g, 'this week'],
  [/\bek\s+(?:hafte|hafta|week)\b/g, 'a week'],
  [/\b(?:hafte|hafta)\b/g, 'week'],
  [/\btak\b/g, 'by'],
  [/\baaj\b/g, 'today'],
];

/** Common Hinglish phrasings rewritten into the words PULSE AI matches. Lowercase in, lowercase out. */
export function fromHinglish(q: string): string {
  let out = ` ${q.toLowerCase()} `;
  // "kal" is yesterday when asking about spending (it can also mean tomorrow).
  if (/\b(kharch|kharcha|spend|spent|uda)\b/.test(out)) out = out.replace(/\bkal\b/g, 'yesterday');
  for (const [re, to] of HINGLISH) out = out.replace(re, to);
  return out.replace(/\s+/g, ' ').trim();
}

/** For "do something" sentences: "salary aa gayi 35000" → "got salary 35000", "kal" → yesterday. */
export function actionFromHinglish(text: string): string {
  return text
    .replace(/\b(salary|sallary|stipend|pocket money|paise|payment)\s+(?:aa|aayi|aai|mil|mili)\s*(?:gayi|gaya|gaye|gai|gya|gyi|gye)?\b/gi, 'got $1')
    .replace(/\bkal\b/gi, 'yesterday')
    .replace(/\baaj\b/gi, 'today');
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
/** Everyday spending: not rent, bills, EMIs, subscriptions or anything that repeats on its own. */
export const everyday = (t: Transaction) =>
  t.type === 'expense' && !t.recurring && !t.subscriptionId && !t.debtId && !t.insuranceId && t.category !== 'rent' && t.category !== 'bills';

const MERCHANTS = ['swiggy instamart', 'instamart', 'swiggy', 'zomato', 'zepto', 'blinkit', 'bigbasket', 'jiomart', 'flipkart minutes', 'amazon', 'flipkart', 'myntra', 'uber', 'ola', 'rapido', 'starbucks', 'netflix', 'spotify'];
const cap = (x: string) => x.replace(/\b\w/g, (c) => c.toUpperCase());

/** A merchant named in the question ("zomato"), else a category ("food", "shopping"). */
function target(s: State, q: string): { label: string; match: (t: Transaction) => boolean } | null {
  const m = MERCHANTS.find((x) => q.includes(x));
  if (m) return { label: cap(m), match: (t) => t.merchant.toLowerCase().includes(m) };
  if (/\bdelivery( apps?)?\b|\bordering\b/.test(q)) return { label: 'delivery apps', match: (t) => t.category === 'delivery' };
  const c = guessCategory(q, s.categories);
  if (c && c !== 'other') return { label: categoryName(s, c).toLowerCase(), match: (t) => t.category === c };
  return null;
}

function personIn(s: State, q: string): Person | undefined {
  return s.people.find((p) => {
    const names = [p.short, p.name.split(' ')[0]].map((n) => n.toLowerCase()).filter((n) => n.length > 1);
    return names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(q));
  });
}

/** The person's top delivery app this month, for the quick questions. */
export function topDeliveryApp(s: State): string | null {
  const from = addDays(s.today, -30);
  const sums = new Map<string, number>();
  for (const t of s.transactions) {
    if (t.type !== 'expense' || t.date < from) continue;
    const m = MERCHANTS.slice(0, 9).find((x) => t.merchant.toLowerCase().includes(x));
    if (m) sums.set(m, (sums.get(m) ?? 0) + myCost(s, t));
  }
  const top = [...sums.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? cap(top[0]) : null;
}

/** The end of the next month called by name ("december" → 31 Dec this year, or next year if it has passed). */
function monthEnd(q: string, today: ISODate): ISODate | null {
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const m = q.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+(20\d\d))?/);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].slice(0, 3));
  let y = m[2] ? Number(m[2]) : Number(today.slice(0, 4));
  let start = `${y}-${String(mi + 1).padStart(2, '0')}-01`;
  if (!m[2] && addDays(addMonths(start, 1), -1) < today) start = `${++y}-${String(mi + 1).padStart(2, '0')}-01`;
  return addDays(addMonths(start, 1), -1);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------------------------
// The new questions. Returns null when the question is for the older answers.
// `q` is already lowercased and passed through fromHinglish.
// ---------------------------------------------------------------------------------------------
export function askMore(s: State, q: string): AIAnswer | null {
  const today = s.today;
  const monthStart = today.slice(0, 8) + '01';

  // --- Fix or undo the last entry ---
  const last = [...s.transactions].filter((t) => t.type !== 'transfer' || !t.investmentId).sort((a, b) => (b.date === a.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)))[0];
  if (/\b(undo|delete|remove|hata\s+do|hatao)\b.*\blast\b|\blast\b.*\b(undo|delete|remove|hata\s+do|hatao)\b|^undo\b/.test(q)) {
    if (!last) return { text: 'There’s nothing logged yet, so nothing to undo.' };
    return { text: `This is the last thing you logged. Remove it?`, blocks: [{ type: 'action', action: { kind: 'undo-last', txId: last.id, merchant: last.merchant, amount: last.amount, date: last.date } }] };
  }
  const fix = q.match(/\b(?:change|edit|make|fix|update)\s+(?:the\s+)?last(?:\s+(?:one|entry|expense|spend|wala))?\s+(?:to|as|into)\s+(?:₹|rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)\b|\blast\s+wala\s+(?:₹|rs\.?\s*)?(\d[\d,]*)\s+kar(?:\s+do)?\b/);
  if (fix) {
    if (!last) return { text: 'There’s nothing logged yet to change.' };
    const amount = Number((fix[1] ?? fix[2]).replace(/,/g, ''));
    return { text: `I’ll change ${last.merchant} from ${rupees(last.amount)} to ${rupees(amount)}.`, blocks: [{ type: 'action', action: { kind: 'fix-last', txId: last.id, merchant: last.merchant, from: last.amount, amount, date: last.date } }] };
  }

  // --- Pay or remind a friend ---
  const payHit = q.match(/^(pay|remind)\b|\b(?:ko\s+)?(pay|remind)\s+kar(?:o|do|na)?\b/);
  if (payHit) {
    const p = personIn(s, q);
    if (p) {
      const bal = personBalances(s).get(p.id) ?? 0;
      if (bal < 0)
        return {
          text: `You owe ${p.short} ${rupees(-bal)}. Open Settle up to pay ${p.upi ? 'straight from your UPI app' : 'and add their UPI ID once'}.`,
          blocks: [{ type: 'link', label: `Pay ${p.short} ${rupees(-bal)}`, to: { kind: 'sheet', sheet: { type: 'settle', personId: p.id } } }],
          followups: ['Who owes me money?'],
        };
      if (bal > 0) {
        const msg = `Hey ${p.short}! Just a reminder: ${rupees(bal)} from our split on PULSE 🙂${s.user.upi ? ` My UPI: ${s.user.upi}` : ''}`;
        return {
          text: `${p.short} owes you ${rupees(bal)}. Here’s a friendly reminder you can send on WhatsApp.`,
          blocks: [
            { type: 'list', rows: [{ label: 'Message', value: '', sub: msg }] },
            { type: 'link', label: 'Send on WhatsApp', to: { kind: 'url', href: `https://wa.me/?text=${encodeURIComponent(msg)}` } },
          ],
          followups: s.user.upi ? ['Who owes me money?'] : ['Who owes me money?', 'Open profile'],
        };
      }
      return { text: `You and ${p.short} are all square. Nothing to pay or remind.` };
    }
    if (/^(pay|remind)\b/.test(q) && s.people.length) return { text: 'Who should I open? Say “Pay Rahul” or “Remind Jay”.', followups: s.people.slice(0, 3).map((x) => `Remind ${x.short}`) };
  }

  // --- How long the money lasts ---
  if (/how long will (?:my )?money last|\b(?:last|lasts) (?:till|until)\b|run out|runway|kab tak/.test(q)) {
    const sts = safeToSpend(s);
    const from = addDays(today, -13);
    const spent = s.transactions.filter((t) => everyday(t) && t.date >= from && t.date <= today).reduce((a, t) => a + myCost(s, t), 0);
    const pace = spent / 14;
    if (pace < 1) return { text: `You haven’t logged everyday spending in the last 2 weeks, so there’s no pace to go by yet. Your safe to spend is ${rupees(sts.safe)} until payday on ${fmtDate(sts.payday)}.`, followups: ['How much can I spend today?'] };
    const days = Math.floor(sts.safe / pace);
    const until = addDays(today, days);
    const before = daysBetween(until, sts.payday);
    const text =
      days >= sts.daysLeft
        ? `At your pace of about ${rupees(Math.round(pace))} a day, your money lasts past payday on ${fmtDate(sts.payday)}. You’re fine, with about ${rupees(Math.max(0, Math.round(sts.safe - pace * sts.daysLeft)))} to spare.`
        : `At your pace of about ${rupees(Math.round(pace))} a day, your safe-to-spend lasts till ${fmtDate(until)}, ${plural(before, 'day')} before payday. Keeping to ${rupees(sts.daily)} a day gets you there.`;
    return {
      text,
      blocks: [{ type: 'list', rows: [
        { label: 'Your pace (last 14 days)', value: `${rupees(Math.round(pace))}/day` },
        { label: 'Safe to spend', value: rupees(sts.safe) },
        { label: 'Lasts till', value: days >= sts.daysLeft ? `Past ${fmtDate(sts.payday)}` : fmtDate(until) },
        { label: 'To reach payday', value: `${rupees(sts.daily)}/day` },
      ] }],
      followups: ['Where did my money go?', 'Biggest expenses this month?'],
    };
  }

  // --- What if I skip something ---
  if (/\bskip\b|\bwithout\b|\bcut (?:out|down)\b|\bstop (?:ordering|buying)\b|\bno (?:zomato|swiggy|zepto|blinkit|instamart|shopping|delivery)\b/.test(q) && /save|bach|how much|kitna/.test(q)) {
    const t = target(s, q);
    if (!t) return { text: 'Tell me what you’d skip, like “Skip Zomato for a week, how much will I save?”', followups: ['Skip Zomato for a week, how much will I save?'] };
    const from = addDays(today, -27);
    const spent = s.transactions.filter((x) => x.type === 'expense' && x.date >= from && x.date <= today && t.match(x)).reduce((a, x) => a + myCost(s, x), 0);
    if (spent < 1) return { text: `You haven’t spent on ${t.label} in the last 4 weeks, so skipping it doesn’t change anything.` };
    const week = Math.round(spent / 4);
    const month = /\bmonth\b/.test(q);
    const save = month ? Math.round((spent / 28) * 30.4) : week;
    const plan = s.plans.filter((p) => p.status === 'active' && p.saved < p.target).sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0];
    let planLine = '';
    if (plan) {
      const elapsed = Math.max(1, daysBetween(plan.startDate, today));
      const pace = plan.saved / elapsed; // per day
      const left = plan.target - plan.saved;
      if (pace > 0) {
        // The money saved is a one-off top-up: it covers this many days of your usual saving.
        const sooner = Math.min(Math.round(save / pace), Math.round(left / pace));
        if (sooner > 0) planLine = ` Put it into ${plan.name} and you’d get there about ${plural(sooner, 'day')} sooner.`;
      } else planLine = ` That’s ${Math.round((save / left) * 100)}% of what’s left for ${plan.name}.`;
    }
    return {
      text: `Skipping ${t.label} for a ${month ? 'month' : 'week'} saves about ${rupees(save)}, going by your last 4 weeks.${planLine}`,
      blocks: [{ type: 'list', rows: [
        { label: `${cap(t.label)}, last 4 weeks`, value: rupees(Math.round(spent)) },
        { label: 'Per week', value: rupees(week) },
        { label: 'Per month', value: rupees(Math.round((spent / 28) * 30.4)) },
      ] }],
      followups: plan ? [`When will I reach my ${plan.name} goal?`, 'How long will my money last?'] : ['How long will my money last?'],
    };
  }

  // --- Can I reach a plan by a month ---
  const plan = s.plans.find((p) => p.status !== 'done' && p.name.length > 1 && q.includes(p.name.toLowerCase().split(' ')[0]));
  const by = monthEnd(q, today);
  if (plan && by && /\b(by|reach|can i|possible|ho)\b/.test(q)) {
    const m = planMetrics(s, plan);
    const left = Math.max(0, plan.target - plan.saved);
    if (!left) return { text: `${plan.name} is already fully funded 🎉` };
    const months = Math.max(0.5, daysBetween(today, by) / 30.4);
    const need = Math.ceil(left / months / 50) * 50;
    const elapsed = Math.max(1, daysBetween(plan.startDate, today));
    const paceMonth = Math.round((plan.saved / elapsed) * 30.4);
    const yes = m.projectedDate && m.projectedDate <= by;
    const text = yes
      ? `Yes. At your pace (about ${rupees(paceMonth)} a month) you’ll reach ${plan.name} around ${fmtDate(m.projectedDate!, true)}, before ${fmtDate(by, true)}.`
      : `Not at your current pace${paceMonth ? ` (about ${rupees(paceMonth)} a month)` : ''}. To reach ${plan.name} by ${fmtDate(by, true)}, add about ${rupees(need)} a month.`;
    return {
      text,
      blocks: [{ type: 'progress', label: `${plan.icon} ${plan.name}`, value: m.progress, sub: `${rupees(plan.saved)} of ${rupees(plan.target)}` }, { type: 'list', rows: [{ label: 'Left to save', value: rupees(left) }, { label: `Needed by ${monthName(by).split(' ')[0]}`, value: `${rupees(need)}/month` }, { label: 'Your pace', value: `${rupees(paceMonth)}/month` }] }],
      followups: [`Skip ${topDeliveryApp(s) ?? 'Zomato'} for a week, how much will I save?`, 'How much can I spend today?'],
    };
  }

  // --- No-spend days ---
  if (/no-?spend|no spend|zero[- ]?spend|didn'?t spend|days without spending/.test(q)) {
    const days = Math.max(1, daysBetween(monthStart, today) + 1);
    const spentOn = new Set(s.transactions.filter((t) => everyday(t) && t.date >= monthStart && t.date <= today).map((t) => t.date));
    let none = 0;
    for (let i = 0; i < days; i++) if (!spentOn.has(addDays(monthStart, i))) none++;
    let streak = 0;
    for (let d = today; d >= monthStart && !spentOn.has(d); d = addDays(d, -1)) streak++;
    return {
      text: none
        ? `${plural(none, 'no-spend day')} so far this month${streak > 1 ? `, and you’re on a ${streak}-day streak right now 🔥` : ' 🔥'}. Rent, bills and auto-debits don’t count.`
        : `No no-spend days yet this month. One day with no everyday spending starts the count. Rent, bills and auto-debits don’t count.`,
      blocks: [{ type: 'list', rows: [{ label: 'No-spend days', value: `${none} of ${days}` }, { label: 'Current streak', value: plural(streak, 'day') }] }],
      followups: ['Biggest expenses this month?', 'How long will my money last?'],
    };
  }

  // --- Biggest expenses / where the money went ---
  const lastMonth = /\blast month\b/.test(q);
  const [from, to] = lastMonth ? [addMonths(monthStart, -1), addDays(monthStart, -1)] : [monthStart, today];
  const label = lastMonth ? monthName(from) : 'this month';
  if (/\b(biggest|largest|top|costliest|most expensive)\b.*\b(expenses?|spends?|spending|purchases?|buys)\b/.test(q) && !/recurring|subscri|bill/.test(q)) {
    // Rent and bills are always the biggest and never a surprise: this is about everyday spending.
    const top = s.transactions.filter((t) => everyday(t) && t.date >= from && t.date <= to).map((t) => ({ t, v: myCost(s, t) })).sort((a, b) => b.v - a.v).slice(0, 5);
    if (!top.length) return { text: `No everyday spending logged ${lastMonth ? `in ${label}` : 'this month'} yet.` };
    return {
      text: `Your biggest ${lastMonth ? `in ${label}` : 'this month'}: ${top[0].t.merchant} at ${rupees(top[0].v)}. Rent, bills and auto-debits are left out.`,
      blocks: [{ type: 'list', rows: top.map(({ t, v }) => ({ label: t.merchant, value: rupees(v), sub: `${categoryName(s, t.category)} · ${relDay(t.date, today)}` })) }],
      followups: ['Where did my money go?', 'Why is this month more expensive?'],
    };
  }
  if (/where did (?:my |the )?money go|where is my money going/.test(q)) {
    const tx = s.transactions.filter((t) => t.type === 'expense' && t.date >= from && t.date <= to);
    const total = tx.reduce((a, t) => a + myCost(s, t), 0);
    if (!total) return { text: `Nothing logged ${lastMonth ? `in ${label}` : 'this month'} yet.` };
    const byCat = new Map<CategoryId, number>();
    for (const t of tx) byCat.set(t.category, (byCat.get(t.category) ?? 0) + myCost(s, t));
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      text: `${label.charAt(0).toUpperCase()}${label.slice(1)} you’ve spent ${rupees(Math.round(total))}. Most of it went to ${categoryName(s, cats[0][0]).toLowerCase()} (${Math.round((cats[0][1] / total) * 100)}%)${cats[1] ? ` and ${categoryName(s, cats[1][0]).toLowerCase()} (${Math.round((cats[1][1] / total) * 100)}%)` : ''}.`,
      blocks: [{ type: 'compare', rows: cats.map(([c, v]) => ({ label: categoryName(s, c), value: Math.round(v) })) }],
      followups: ['Biggest expenses this month?', 'How long will my money last?'],
    };
  }

  // --- Spending in a period, with no category named ("how much did I spend today / this week") ---
  if (/how much (?:did|have) i (?:spen[dt])|how much i spent|what did i spend|spent so far/.test(q) && !target(s, q)) {
    const dow = parseDate(today).getDay();
    const weekStart = addDays(today, -((dow + 6) % 7)); // Monday
    const period: [string, ISODate, ISODate] = /\btoday\b/.test(q)
      ? ['today', today, today]
      : /\byesterday\b/.test(q)
        ? ['yesterday', addDays(today, -1), addDays(today, -1)]
        : /\blast week\b/.test(q)
          ? ['last week', addDays(weekStart, -7), addDays(weekStart, -1)]
          : /\b(this|a) week\b|\bweek\b/.test(q)
            ? ['this week', weekStart, today]
            : lastMonth
              ? [`in ${label}`, from, to]
              : ['this month', monthStart, today];
    const [name, a, b] = period;
    const total = spendBetween(s, a, b);
    const items = s.transactions.filter((t) => t.type === 'expense' && t.date >= a && t.date <= b).sort((x, y) => myCost(s, y) - myCost(s, x)).slice(0, 4);
    return {
      text: total ? `You spent ${rupees(total)} ${name}.` : `Nothing spent ${name}${name === 'today' ? ' so far. Nice 🔥' : '.'}`,
      blocks: items.length ? [{ type: 'list', rows: items.map((t) => ({ label: t.merchant, value: rupees(myCost(s, t)), sub: `${categoryName(s, t.category)} · ${relDay(t.date, today)}` })) }] : undefined,
      followups: ['How much can I spend today?', 'Where did my money go?'],
    };
  }

  return null;
}

/** Quick questions that show what PULSE AI can do, made from this person's own data. */
export function quickQuestions(s: State): string[] {
  const plan = s.plans.find((p) => p.status === 'active' && p.saved < p.target);
  const app = topDeliveryApp(s) ?? 'Zomato';
  if (!s.transactions.length)
    return [`➕ Zomato ${scaled(349)}`, `💰 Salary aa gayi ${scaled(35000)}`, `📺 Netflix ${scaled(199)} monthly`, '💸 Kitna bacha hai?', `🤔 Can I afford ${ex(3000)}?`, '⏳ Paisa kab tak chalega?'];
  const owe = [...personBalances(s).entries()].sort((a, b) => a[1] - b[1]);
  const iOwe = owe[0] && owe[0][1] < 0 ? s.people.find((p) => p.id === owe[0][0]) : undefined;
  const owesMe = owe.length && owe[owe.length - 1][1] > 0 ? s.people.find((p) => p.id === owe[owe.length - 1][0]) : undefined;
  return [
    '💸 Kitna bacha hai?',
    '⏳ Paisa kab tak chalega?',
    `🛵 ${app} pe kitna uda diya?`,
    `🤔 Can I afford ${ex(3000)} shoes?`,
    ...(plan ? [`${plan.icon} ${plan.name} ho payega ${monthName(plan.targetDate).split(' ')[0]} tak?`] : []),
    `🎯 Skip ${app} for a week, kitna bachega?`,
    ...(iOwe ? [`💳 Pay ${iOwe.short}`] : owesMe ? [`👋 Remind ${owesMe.short}`] : []),
    '🏆 Biggest expenses this month?',
    '🔥 No-spend days this month?',
    '🧾 What’s due this week?',
    '📉 Why is this month more expensive?',
    '📊 Show my monthly report',
  ];
}
