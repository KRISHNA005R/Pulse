import type { Category, CategoryId, ISODate, Person, Plan, Transaction, TxType } from '../types';
import { AMOUNT_PREFIX, roundMoney } from './currency';
import { categoryFor } from './lexicon';
import { addDays } from './format';
import { isAuto } from './auto';

// Lightweight natural-language understanding for the composer and command bar.
// "₹450 dinner with Rahul" (or "$12 dinner with Rahul") -> amount 450, food, people [rahul], split equally.

const MERCHANTS = ['Swiggy Instamart', 'Instamart', 'Swiggy', 'Zomato', 'Zepto', 'Blinkit', 'Flipkart Minutes', 'Amazon Now', 'Amazon Fresh', 'JioMart', 'BB Now', 'EatSure', 'Magicpin', 'Licious', 'Country Delight', 'Box8', 'Faasos', 'Uber', 'Ola', 'Rapido', 'Netflix', 'Spotify', 'Amazon', 'Flipkart', 'Myntra', 'BookMyShow', 'Nykaa', 'Apollo', 'Starbucks', 'Blue Tokai', 'Third Wave', 'Chai Point', 'IndiGo', 'Airbnb', 'Udemy', 'Cult.fit', 'Dunzo', 'BigBasket'];

export function guessCategory(text: string, categories?: Category[], kind?: 'expense' | 'income'): CategoryId | null {
  return categoryFor(text, categories, kind);
}

export function parseAmount(text: string): number | null {
  const t = text.replace(/,/g, '');
  // ₹450, rs 450, $12, 12 aed, 4.5k, 1.2L, 2m, 3000
  const m = t.match(new RegExp(`${AMOUNT_PREFIX}?\\s*(\\d+(?:\\.\\d+)?)\\s*(k|l|lakh|lac|m)?\\b`, 'i'));
  if (!m) return null;
  let v = parseFloat(m[1]);
  const unit = m[2]?.toLowerCase();
  if (unit === 'k') v *= 1000;
  if (unit && unit.startsWith('l')) v *= 100000;
  if (unit === 'm') v *= 1000000;
  return Number.isFinite(v) && v > 0 ? roundMoney(v) : null;
}

/** Just the words, for comparing names: "Swiggy · Biryani" and "swiggy biryani" are the same. */
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}]+/gu, ' ').trim();

export interface Parsed {
  amount: number | null;
  category: CategoryId | null;
  merchant: string | null;
  people: string[];
  newPeople: string[];
  plan: string | null;
  date: ISODate | null;
  type: TxType | null;
  split: boolean;
  label: string;
}

export function parseEntry(text: string, ctx: { people: Person[]; plans: Plan[]; today: ISODate; categories?: Category[]; history?: Transaction[] }): Parsed {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  const amount = parseAmount(raw);
  const merchant = MERCHANTS.find((m) => lower.includes(m.toLowerCase())) ?? null;

  // People: known names anywhere, or "with X", "w/ X", "and Y"
  const people: string[] = [];
  const newPeople: string[] = [];
  for (const p of ctx.people) {
    const names = [p.short, p.name.split(' ')[0]].map((n) => n.toLowerCase());
    if (names.some((n) => new RegExp(`\\b${n}\\b`).test(lower))) people.push(p.id);
  }
  const withMatch = raw.match(/\b(?:with|w\/)\s+([A-Z][a-z]+(?:\s*(?:,|and|&)\s*[A-Z][a-z]+)*)/);
  if (withMatch) {
    withMatch[1].split(/\s*(?:,|and|&)\s*/).forEach((n) => {
      const known = ctx.people.find((p) => p.short.toLowerCase() === n.toLowerCase() || p.name.toLowerCase().startsWith(n.toLowerCase()));
      if (!known && n && !newPeople.includes(n)) newPeople.push(n);
    });
  }

  const plan =
    ctx.plans.find((p) => {
      const first = p.name.toLowerCase().split(' ')[0];
      return first.length > 2 && lower.includes(first);
    })?.id ?? null;

  let date: ISODate | null = null;
  if (/\byesterday\b/.test(lower)) date = addDays(ctx.today, -1);
  else if (/\btoday\b/.test(lower)) date = ctx.today;

  let type: TxType | null = null;
  if (/\b(salary|got paid|received|income|freelance|refund|cashback|stipend|allowance)\b/.test(lower)) type = 'income';
  else if (/\b(transfer|moved|move)\b/.test(lower)) type = 'transfer';

  const split = people.length + newPeople.length > 0 || /\bsplit\b/.test(lower);

  // A readable label: strip amount + "with ..." bits
  let label = raw
    .replace(new RegExp(`${AMOUNT_PREFIX}?\\s*\\d[\\d,]*(?:\\.\\d+)?\\s*(k|l|lakh|m)?\\b`, 'i'), ' ')
    .replace(/\b(?:with|w\/)\s+.+$/i, '')
    .replace(/\b(yesterday|today|split)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (merchant && label.toLowerCase() === merchant.toLowerCase()) label = merchant;
  label = label ? label.charAt(0).toUpperCase() + label.slice(1) : '';

  // The category this person picked last time for the same words beats any guess, so PULSE learns their own way of naming things.
  const kind = type === 'income' ? 'income' : type === 'transfer' ? undefined : 'expense';
  const key = words(label);
  const learned = key ? ctx.history?.find((t) => !isAuto(t) && (kind ? t.type === kind : true) && words(t.merchant) === key)?.category : undefined;
  const category = learned && (!ctx.categories || ctx.categories.some((c) => c.id === learned)) ? learned : guessCategory(raw, ctx.categories, kind);

  return { amount, category, merchant, people, newPeople, plan, date, type, split, label };
}
