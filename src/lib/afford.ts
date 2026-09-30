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
}

/**
 * "Can I afford this?" — works out what a purchase does to safe-to-spend,
 * plan contributions and the matching budget. Informative, never prescriptive.
 */
export function canIAfford(s: State, amount: number, what = ''): AffordResult {
  const sts = safeToSpend(s);
  const category = guessCategory(what);
  const label = what.trim();
  const safeAfter = Math.max(0, sts.safe - amount);
  const dailyAfter = Math.floor(safeAfter / sts.daysLeft);

  let overflow = Math.max(0, amount - sts.safe);
  const planImpacts: AffordResult['planImpacts'] = [];
  // Overflow first comes out of this cycle's planned contributions (largest first).
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
  const fromBuffer = Math.min(overflow, sts.buffer);
  overflow -= fromBuffer;
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
    explanation = `You'd still have ${rupees(safeAfter)} free until payday, about ${rupees(dailyAfter)} a day.`;
  } else if (amount <= sts.safe) {
    verdict = 'yes';
    headline = 'Yes.';
    explanation = `It fits. You'd have ${rupees(safeAfter)} left for the next ${sts.daysLeft} days, so about ${rupees(dailyAfter)} a day instead of ${rupees(sts.daily)}.`;
  } else if (fromBuffer === 0 && shortBy === 0) {
    verdict = 'affects-plans';
    headline = 'Yes, but it affects your plans.';
    explanation = `This purchase is possible, but it uses all of your free money until payday and ${rupees(fromPlans)} you'd planned to save this cycle.`;
  } else if (shortBy === 0) {
    verdict = 'buffer';
    headline = 'Possible, but it uses your safety buffer.';
    explanation = `This would skip this cycle's plan savings and dip ${rupees(fromBuffer)} into the cushion you keep for surprises.`;
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
