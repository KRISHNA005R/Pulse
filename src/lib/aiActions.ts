import type { BudgetPeriod, CategoryId, FundType, ISODate, State, Subscription } from '../types';
import { AMOUNT_PREFIX, roundMoney } from './currency';
import { FUND_TYPES } from './finance';
import { addDays, addMonths } from './format';
import { guessCategory, parseEntry } from './parse';
import { suggestEmoji } from './lexicon';

// PULSE AI actions: turn a plain sentence ("spent 450 on dinner", "add netflix 199 monthly",
// "start a SIP of 2000 on the 5th") into one concrete change the person confirms with a tap.

export type AIAction =
  | { kind: 'expense' | 'income'; amount: number; merchant: string; category: CategoryId; date: ISODate; plan?: string }
  | { kind: 'split'; text: string; amount: number; names: string[] }
  | { kind: 'contribute'; planId: string; planName: string; amount: number }
  | { kind: 'plan'; name: string; icon: string; target: number; targetDate: ISODate }
  | { kind: 'bill'; name: string; amount: number; cycle: Subscription['cycle']; nextDate: ISODate; category: CategoryId; subKind: Subscription['kind'] }
  | { kind: 'sip'; name: string; amount: number; nextDate: ISODate; fundType?: FundType; stepUp?: number; rate: number }
  | { kind: 'budget'; category: CategoryId; amount: number; period: BudgetPeriod; budgetId?: string }
  | { kind: 'settle'; personId: string; personName: string; from: string; to: string; amount: number };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+(20\d\d))?/;

const QUESTION = /\?\s*$|^(how|what|when|why|which|who|where|can|could|should|is|are|do|does|did|am|will|would|tell me|show me how)\b/;

/** The money amount in a sentence: prefers one with a currency sign, skips "5th", "10%" and years. */
export function amountIn(text: string): number | null {
  const re = new RegExp(`(${AMOUNT_PREFIX})?\\s*(\\d[\\d,]*(?:\\.\\d+)?)(?:\\s*(k|lakh|lac|l|m)\\b)?(?![\\d,.])`, 'gi');
  let best: { v: number; sign: boolean } | null = null;
  for (const m of text.matchAll(re)) {
    const after = text.slice((m.index ?? 0) + m[0].length);
    if (/^\s*(st|nd|rd|th|%|percent|days?|months?|years?|yrs?)\b/i.test(after) || /^%/.test(after.trim())) continue;
    let v = parseFloat(m[2].replace(/,/g, ''));
    const unit = m[3]?.toLowerCase();
    if (!unit && !m[1] && v >= 2000 && v <= 2100 && /\b(by|in|till|until|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*$/i.test(text.slice(0, m.index))) continue;
    if (unit === 'k') v *= 1000;
    if (unit && unit.startsWith('l')) v *= 100000;
    if (unit === 'm') v *= 1000000;
    if (!(v > 0)) continue;
    const sign = !!m[1];
    if (!best || (sign && !best.sign) || (sign === best.sign && v > best.v)) best = { v, sign };
  }
  return best ? roundMoney(best.v) : null;
}

/** "on the 5th", "5th of every month", "due 12th" → the next date with that day of month. */
function dayOfMonth(text: string, today: ISODate): ISODate | null {
  const m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/) ?? text.match(/\b(?:on|due|every)\s+(?:the\s+)?(\d{1,2})\b(?!\s*(?:k|%|,\d))/);
  if (!m) return null;
  const d = Number(m[1]);
  if (d < 1 || d > 31) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const onDay = (monthStart: ISODate) => {
    const last = Number(addDays(addMonths(monthStart, 1), -1).slice(8));
    return `${monthStart.slice(0, 8)}${pad(Math.min(d, last))}`;
  };
  const here = onDay(today.slice(0, 8) + '01');
  return here > today ? here : onDay(addMonths(today.slice(0, 8) + '01', 1));
}

/** "by december", "by march 2027", "in 6 months" → a date. */
function byDate(text: string, today: ISODate): ISODate | null {
  const inN = text.match(/\bin\s+(\d{1,2})\s+(months?|years?)\b/);
  if (inN) return addMonths(today, Number(inN[1]) * (inN[2].startsWith('y') ? 12 : 1));
  const m = text.match(MONTH_RE);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].slice(0, 3));
  let y = m[2] ? Number(m[2]) : Number(today.slice(0, 4));
  let d = `${y}-${String(mi + 1).padStart(2, '0')}-01`;
  if (!m[2] && d <= today) {
    y += 1;
    d = `${y}-${String(mi + 1).padStart(2, '0')}-01`;
  }
  // End of that month
  return addDays(addMonths(d, 1), -1);
}

/** A month the person names ("september", "last month") for reports. */
export function monthIn(text: string, today: ISODate): ISODate | null {
  if (/\blast month\b|\bprevious month\b/.test(text)) return addDays(today.slice(0, 8) + '01', -1).slice(0, 8) + '01';
  if (/\bthis month\b/.test(text)) return today.slice(0, 8) + '01';
  const m = text.match(MONTH_RE);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].slice(0, 3));
  let y = m[2] ? Number(m[2]) : Number(today.slice(0, 4));
  let d = `${y}-${String(mi + 1).padStart(2, '0')}-01`;
  if (!m[2] && d > today) {
    y -= 1;
    d = `${y}-${String(mi + 1).padStart(2, '0')}-01`;
  }
  return d;
}

const cap = (x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);

/** Strip command words and the amount, leaving the thing itself: "add netflix 199 monthly" → "Netflix". */
function cleanName(text: string, extra: RegExp[] = []): string {
  let t = text
    .replace(/\b(?:on|due|every)\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\b/gi, ' ')
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\b/gi, ' ')
    .replace(new RegExp(`${AMOUNT_PREFIX}?\\s*\\d[\\d,]*(?:\\.\\d+)?(?:\\s*(k|lakh|lac|l|m)\\b)?(?![\\d,.])`, 'gi'), ' ')
    .replace(/\b(please|pls|plz|can you|could you|i want to|i wanna|i'd like to|for me|of|a|an|the|my|new|add|log|record|track|create|make|set up|setup|set|start|put|i|just|spent|spend|paid|pay|bought|buy|got|received|earned)\b/gi, ' ')
    .replace(/\b(every|each|per|a)\s+(month|week|year)\b|\b(monthly|weekly|yearly|annually|annual)\b/gi, ' ')
    .replace(/\b(today|yesterday|rupees?|rs\.?|inr)\b/gi, ' ');
  for (const re of extra) t = t.replace(re, ' ');
  t = t.replace(/[.,!]+/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(on|for|at|to|towards|in|into)\s+/i, '').replace(/\s+(on|for|at|to|in|into)$/i, '');
  return cap(t);
}

function planMatch(s: State, lower: string) {
  return s.plans.find((p) => {
    const name = p.name.toLowerCase();
    const first = name.split(' ')[0];
    return lower.includes(name) || (first.length > 2 && new RegExp(`\\b${first.replace(/[^\w]/g, '')}\\b`).test(lower));
  });
}

function personMatch(s: State, lower: string) {
  return s.people.find((p) => [p.short, p.name.split(' ')[0]].some((n) => n && new RegExp(`\\b${n.toLowerCase()}\\b`).test(lower)));
}

export function parseAction(s: State, input: string): AIAction | null {
  const raw = input.trim();
  const lower = raw.toLowerCase();
  if (!raw || QUESTION.test(lower)) return null;
  const amount = amountIn(raw);
  const today = s.today;
  const verbAdd = /\b(add|log|record|track|create|make|set ?up|set|start|new|put|save|saved|move|moved|transfer|top ?up|deposit|note)\b/.test(lower);

  // --- SIP ---
  if (/\bsips?\b|mutual fund/.test(lower) && amount && (verbAdd || /\bsip of\b/.test(lower))) {
    const ft = FUND_TYPES.find((f) => new RegExp(`\\b${f.value === 'index' ? 'index|nifty' : f.value === 'large' ? 'large ?cap|bluechip' : f.value === 'mid' ? 'mid ?cap' : f.value === 'small' ? 'small ?cap' : f.value === 'flexi' ? 'flexi ?cap|multi ?cap' : f.value === 'elss' ? 'elss|tax sav' : f.value}\\b`).test(lower));
    const step = lower.match(/step[\s-]?up\s*(?:of|by)?\s*(\d{1,2})\s*%|(\d{1,2})\s*%\s*step[\s-]?up/);
    const noStep = raw.replace(/\s*(with\s+)?(an?\s+)?(\d{1,2}\s*%\s*(yearly\s+|annual\s+)?step[\s-]?up|step[\s-]?up\s*(of|by)?\s*\d{1,2}\s*%)/i, ' ');
    const name = cleanName(noStep, [/\bsips?\b/gi, /\bmutual funds?\b/gi, /\bstep[\s-]?up\b.*$/gi, /\b\d{1,2}\s*%/g, /\bin\b/gi]) || (ft ? `${ft.label} fund` : 'Monthly SIP');
    return { kind: 'sip', name, amount, nextDate: dayOfMonth(lower, today) ?? addMonths(today, 1), fundType: ft?.value, stepUp: step ? Number(step[1] ?? step[2]) : undefined, rate: ft?.rate ?? 11 };
  }

  // --- Budget ---
  if (/\bbudget\b/.test(lower) && amount) {
    const rest = lower.replace(/\bbudget\b/g, '');
    const category = s.categories.find((c) => c.kind === 'expense' && new RegExp(`\\b${c.name.toLowerCase().split(/[ &]/)[0]}`).test(rest))?.id ?? guessCategory(rest, s.categories);
    if (category) {
      const period: BudgetPeriod = /\bweek(ly)?\b/.test(lower) ? 'weekly' : 'monthly';
      const existing = s.budgets.find((b) => b.category === category && b.period === period) ?? s.budgets.find((b) => b.category === category);
      return { kind: 'budget', category, amount, period, budgetId: existing?.id };
    }
  }

  // --- New plan / goal ---
  if (amount && (/\b(create|new|make|start|set ?up|add)\b.*\b(plan|goal|fund)\b/.test(lower) || /\bsave (up )?for\b.*\b(by|in)\b/.test(lower) || /\b(plan|goal) (for|of)\b/.test(lower))) {
    const existing = planMatch(s, lower);
    if (!existing || /\b(new|create|make|start)\b/.test(lower)) {
      const forName = raw.match(/\bfor\s+(?:a\s+|an\s+|my\s+)?([^₹$€£\d,]+?)(?:\s+(?:of|by|in|worth|target|for|with)\b|\s*[₹$€£\d]|$)/i)?.[1];
      const name = cap((forName ?? cleanName(raw, [/\b(plan|goal|fund|by|in)\b/gi, MONTH_RE, /\b\d+\s+(months?|years?)\b/gi])).trim()) || 'New plan';
      return { kind: 'plan', name, icon: suggestEmoji(name), target: amount, targetDate: byDate(lower, today) ?? addMonths(today, 6) };
    }
  }

  // --- Money into an existing plan ---
  const plan = planMatch(s, lower);
  if (plan && amount && /\b(add|put|move|moved|save|saved|transfer|top ?up|deposit|towards|into|to)\b/.test(lower) && !/\b(spent|paid|bought)\b/.test(lower)) {
    return { kind: 'contribute', planId: plan.id, planName: plan.name, amount };
  }

  // --- Settle up ---
  const person = personMatch(s, lower);
  if (person && amount && /\b(settle|settled|paid me|paid back|returned|gave me|sent me|i paid|i sent|i gave|i returned)\b/.test(lower)) {
    const theyPaid = new RegExp(`\\b(${person.short.toLowerCase()}|${person.name.split(' ')[0].toLowerCase()})\\b.*\\b(paid|returned|gave|sent)\\b`).test(lower) && !/\bi (paid|sent|gave|returned)\b/.test(lower);
    return { kind: 'settle', personId: person.id, personName: person.short, from: theyPaid ? person.id : 'me', to: theyPaid ? 'me' : person.id, amount };
  }

  // --- Recurring bill or subscription ---
  const recurringWord = /\b(every|each|per|a)\s+(month|week|year)\b|\b(monthly|weekly|yearly|annually|recurring|subscription|bill|emi)\b/.test(lower);
  if (amount && recurringWord && (verbAdd || /\b(due|renews?)\b/.test(lower)) && !/\b(spent|paid|bought)\b/.test(lower)) {
    const cycle: Subscription['cycle'] = /\b(week|weekly)\b/.test(lower) ? 'weekly' : /\b(year|yearly|annual|annually)\b/.test(lower) ? 'yearly' : 'monthly';
    const name = cleanName(raw, [/\b(recurring|subscription|bill|payment|due|renews?|on)\b/gi]) || 'Recurring payment';
    const isBill = /\b(rent|bill|emi|loan|electricity|power|water|gas|wifi|broadband|internet|recharge|phone|mobile|insurance|maid|society|maintenance)\b/.test(lower);
    const category: CategoryId = isBill ? 'bills' : 'subscriptions';
    const next = dayOfMonth(lower, today) ?? (cycle === 'weekly' ? addDays(today, 7) : cycle === 'yearly' ? addMonths(today, 12) : addMonths(today, 1));
    return { kind: 'bill', name, amount, cycle, nextDate: next, category, subKind: isBill ? 'bill' : 'subscription' };
  }

  if (!amount) return null;

  // --- Income ---
  const incomeWords = /\b(got paid|got|received|receive|earned|credited|salary|income|refund|cashback|freelance|stipend|allowance|bonus|client paid)\b/;
  if (incomeWords.test(lower) && !/\b(spent|paid for|bought)\b/.test(lower)) {
    const category: CategoryId = /\bsalary|stipend\b/.test(lower) ? 'salary' : /\bfreelance|client|project|gig\b/.test(lower) ? 'freelance' : 'income-other';
    const date = /\byesterday\b/.test(lower) ? addDays(today, -1) : today;
    const src = raw.match(/\bfrom\s+([a-z][\w .&'-]*?)(?:\s+(?:for|on|as|yesterday|today)\b|[.,!]|$)/i)?.[1]?.trim();
    const words = (x: string) => x.replace(/\b\w/g, (ch) => ch.toUpperCase());
    const base = category === 'salary' ? 'Salary' : category === 'freelance' ? 'Freelance' : '';
    const name = src ? (base ? `${base} · ${words(src)}` : words(src)) : cleanName(raw, [/\b(income|credited|from|as)\b/gi]) || base || 'Money in';
    return { kind: 'income', amount, merchant: name, category, date };
  }

  // --- Expense (the default for "450 dinner", "spent 200 on uber", "paid rent 12000") ---
  const expenseWords = /\b(spent|spend|paid|pay|bought|buy|add|log|record|expense|kharcha|kharch)\b/;
  const bare = raw.split(/\s+/).length <= 7; // "450 dinner with rahul" style entries
  if (!expenseWords.test(lower) && !bare) return null;
  const body = raw.replace(/^\s*(please\s+)?(add|log|record|note)\s+(an?\s+)?(expense\s+(of\s+)?)?/i, '').replace(/^\s*i\s+/i, '').replace(/^\s*(spent|paid|bought)\s+/i, '');
  const p = parseEntry(body, { people: s.people, plans: s.plans, today, categories: s.categories });
  if (p.people.length || p.newPeople.length) {
    const names = [...p.people.map((id) => s.people.find((x) => x.id === id)?.short ?? ''), ...p.newPeople].filter(Boolean);
    return { kind: 'split', text: body, amount, names };
  }
  let label = cleanName(p.label || p.merchant || '', [/\b(on|for|at|to)\b(?=\s*$)/gi]);
  if (p.merchant) label = cap(label.replace(new RegExp(`\\s*\\b(on|at|from|via|in)\\s+${p.merchant}\\b`, 'i'), '').trim());
  const category = p.category ?? 'other';
  const catName = s.categories.find((c) => c.id === category)?.name ?? 'Expense';
  const merchant = p.merchant && label && !label.toLowerCase().includes(p.merchant.toLowerCase()) ? `${p.merchant} · ${label}` : label || p.merchant || catName;
  return { kind: 'expense', amount, merchant, category, date: p.date ?? today, plan: p.plan ?? undefined };
}
