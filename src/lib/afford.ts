import { billsUnknown } from './setup';
import type { CategoryId, State } from '../types';
import { AMOUNT_PREFIX } from './currency';
import { budgetFor, budgetState, categoryName, planMetrics, safeToSpend } from './finance';
import { guessCategory, parseAmount } from './parse';
import { rupees } from './format';

export type Verdict = 'comfortable' | 'yes' | 'affects-plans' | 'buffer' | 'tight' | 'not-now';

export interface AffordResult {
  amount: number;
  label: string;
  category: CategoryId | null;
  verdict: Verdict;
  headline: string;
  safeBefore: number;
  safeAfter: number;
  dailyBefore: number;
  dailyAfter: number;
  daysLeft: number;
  planImpacts: { planId: string; name: string; icon: string; days: number; amount: number }[];
  budget: { name: string; period: string; leftBefore: number; leftAfter: number } | null;
  explanation: string;
  /** No rent, bills or loans added yet: the answer may be too generous (lib/setup.ts). */
  billsMissing: boolean;
  /** The safety buffer, when this purchase comes out of it (or safe-to-spend is already used up). */
  buffer: { now: boolean; before: number; after: number; dailyBefore: number; dailyAfter: number } | null;
}

/**
 * "Can I afford this?" — works out what a purchase does to safe-to-spend,
 * plan contributions and the matching budget. Informative, never prescriptive.
 */
export function canIAfford(s: State, amount: number, what = ''): AffordResult {
  const sts = safeToSpend(s);
  // With no fixed payday PULSE plans 30 days ahead: say that, not "until payday".
  const until = sts.fixedPayday ? 'until payday' : `for the next ${sts.daysLeft} days`;
  const category = guessCategory(what, undefined, 'expense');
  const label = what.trim();
  const safeAfter = Math.max(0, sts.safe - amount);
  const dailyAfter = Math.floor(safeAfter / sts.daysLeft);

  // Past safe-to-spend, money comes out of the safety buffer first (that's what it's kept for), then
  // out of this cycle's plan savings (largest first).
  let overflow = Math.max(0, amount - sts.safe);
  const fromBuffer = Math.min(overflow, sts.bufferLeft);
  overflow -= fromBuffer;
  const planImpacts: AffordResult['planImpacts'] = [];
  const reserves = [...sts.goalItems].sort((a, b) => b.amount - a.amount);
  for (const g of reserves) {
    if (overflow <= 0) break;
    const take = Math.min(overflow, g.amount);
    overflow -= take;
    const m = planMetrics(s, g.plan);
    const perDay = Math.max(1, m.monthly / 30.44);
    planImpacts.push({ planId: g.plan.id, name: g.plan.name, icon: g.plan.icon, amount: take, days: Math.max(1, Math.round(take / perDay)) });
  }
  const fromPlans = planImpacts.reduce((a, p) => a + p.amount, 0);
  const shortBy = overflow; // would eat into bills money

  let budget: AffordResult['budget'] = null;
  if (category) {
    const b = budgetFor(s, category);
    if (b) {
      const st = budgetState(s, b);
      budget = { name: categoryName(s, category), period: b.period === 'weekly' ? 'this week' : b.period === 'monthly' ? 'this month' : 'this period', leftBefore: st.left, leftAfter: st.left - amount };
    }
  }

  let verdict: Verdict;
  let headline: string;
  let explanation: string;
  const pctOfSafe = sts.safe > 0 ? amount / sts.safe : Infinity;
  if (amount <= sts.safe && pctOfSafe <= 0.35) {
    verdict = 'comfortable';
    headline = 'Yes, comfortably.';
    explanation = `You'd still have ${rupees(safeAfter)} free ${until}, about ${rupees(dailyAfter)} a day.`;
  } else if (amount <= sts.safe) {
    verdict = 'yes';
    headline = 'Yes.';
    explanation = `It fits. You'd have ${rupees(safeAfter)} left for the next ${sts.daysLeft} days, so about ${rupees(dailyAfter)} a day instead of ${rupees(sts.daily)}.`;
  } else if (shortBy === 0 && fromPlans === 0) {
    verdict = 'buffer';
    headline = 'Yes, from your safety buffer.';
    explanation = `${sts.safe > 0 ? `Safe to spend covers ${rupees(sts.safe)}, and` : 'Safe to spend is used up, so'} ${rupees(fromBuffer)} comes from your buffer. ${rupees(sts.bufferLeft - fromBuffer)} would be left in it.`;
  } else if (shortBy === 0) {
    verdict = 'affects-plans';
    headline = 'Yes, but it affects your plans.';
    explanation = `It uses ${fromBuffer > 0 ? 'your safety buffer and ' : 'all your free money and '}${rupees(fromPlans)} you'd planned to save this cycle.`;
  } else if (amount <= sts.available) {
    verdict = 'tight';
    headline = 'Not before payday without touching bill money.';
    explanation = `You have the cash, but ${rupees(shortBy)} of it is already needed for bills due before payday.`;
  } else {
    verdict = 'not-now';
    headline = 'Not right now.';
    explanation = `That's ${rupees(amount - sts.available)} more than you have available today. Payday is in ${sts.daysLeft} days.`;
  }
  if (budget && budget.leftAfter < 0 && verdict !== 'not-now') {
    explanation += ` It would also put ${budget.name.toLowerCase()} ${rupees(-budget.leftAfter)} over budget ${budget.period}.`;
  }

  return {
    amount,
    label,
    category,
    verdict,
    headline,
    safeBefore: sts.safe,
    safeAfter,
    dailyBefore: sts.daily,
    dailyAfter,
    daysLeft: sts.daysLeft,
    planImpacts,
    budget,
    explanation,
    billsMissing: billsUnknown(s),
    buffer:
      sts.onBuffer || fromBuffer > 0
        ? { now: sts.onBuffer, before: sts.bufferLeft, after: sts.bufferLeft - fromBuffer, dailyBefore: sts.bufferDaily, dailyAfter: Math.floor((sts.bufferLeft - fromBuffer) / sts.daysLeft) }
        : null,
  };
}

export function parseAffordQuery(q: string): { amount: number | null; what: string } {
  const amount = parseAmount(q);
  const what = q
    .replace(/can i (afford|spend|buy|get)|is it ok(ay)? to (spend|buy)|should i (buy|spend)/gi, '')
    .replace(new RegExp(`${AMOUNT_PREFIX}?\\s*\\d[\\d,]*(?:\\.\\d+)?\\s*(k|l|m)?\\b`, 'i'), ' ')
    .replace(/\b(a|an|on|for|the)\b/gi, ' ')
    .replace(/[?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { amount, what };
}
