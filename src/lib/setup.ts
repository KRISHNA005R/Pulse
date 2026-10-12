import type { State } from '../types';
import type { SheetSpec } from '../store/ui';

/**
 * "Finish setup": everything a person can fill in by hand that makes safe-to-spend more true.
 * Each item is done when the thing exists, or skipped when the person says "I don't have this"
 * (kept in settings.setupSkipped, so it follows them to every device). Money that is already
 * spoken for comes first.
 */
export interface SetupItem {
  id: string;
  title: string;
  why: string;
  icon: string;
  done: (s: State) => boolean;
  sheet: SheetSpec;
}

export const SETUP_ITEMS: SetupItem[] = [
  { id: 'bills', title: 'Rent & bills', why: 'Kept aside before they’re due', icon: 'receipt', done: (s) => s.subscriptions.some((x) => x.kind === 'bill'), sheet: { type: 'sub-form', kind: 'bill' } },
  { id: 'loans', title: 'Loans & EMIs', why: 'Each EMI comes off before payday', icon: 'bank', done: (s) => s.debts.length > 0, sheet: { type: 'debt-form' } },
  { id: 'cards', title: 'Credit cards', why: 'Card bills show up when they’re due', icon: 'card', done: (s) => s.cards.length > 0, sheet: { type: 'card-form' } },
  { id: 'subs', title: 'Subscriptions', why: 'Netflix, Spotify, gym, cloud storage', icon: 'repeat', done: (s) => s.subscriptions.some((x) => x.kind === 'subscription'), sheet: { type: 'sub-form', kind: 'subscription' } },
  { id: 'sips', title: 'SIPs & investments', why: 'Kept aside on their date', icon: 'trend', done: (s) => (s.investments ?? []).length > 0, sheet: { type: 'investment-form' } },
  { id: 'income', title: 'Other income', why: 'Freelance, allowance, side gigs', icon: 'briefcase', done: (s) => s.incomes.length > 1, sheet: { type: 'income-form' } },
  {
    id: 'accounts',
    title: 'Other accounts & wallets',
    why: 'Another bank, savings, Paytm',
    icon: 'wallet',
    done: (s) => s.accounts.filter((a) => a.type === 'bank').length > 1 || s.accounts.some((a) => a.type === 'wallet' || a.type === 'savings'),
    sheet: { type: 'account-form' },
  },
  { id: 'plan', title: 'Something you’re saving for', why: 'A trip, a phone, a safety net', icon: 'target', done: (s) => s.plans.length > 0, sheet: { type: 'plan-form' } },
  { id: 'budget', title: 'A spending limit', why: 'For food, shopping or anything else', icon: 'sliders', done: (s) => s.budgets.length > 0, sheet: { type: 'budget-form' } },
];

export function setupStatus(s: State) {
  const skipped = new Set(s.settings.setupSkipped ?? []);
  const items = SETUP_ITEMS.map((item) => ({ item, done: item.done(s), skipped: skipped.has(item.id) }));
  const pending = items.filter((x) => !x.done && !x.skipped).map((x) => x.item);
  return { pending, finished: items.length - pending.length, total: items.length };
}

/**
 * True when nothing regular is known yet (no rent or bills, no loans) and the person hasn't said
 * they have none: safe-to-spend may then be higher than it really is.
 */
export function billsUnknown(s: State): boolean {
  if (s.mode !== 'personal') return false;
  if ((s.settings.setupSkipped ?? []).includes('bills')) return false;
  return !s.subscriptions.some((x) => x.kind === 'bill' && x.status !== 'cancelled') && s.debts.length === 0;
}
