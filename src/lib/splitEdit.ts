import type { SplitExpense } from '../types';

/**
 * A split's shares after its total changes: everyone keeps the same part of it (equal stays equal,
 * 60/40 stays 60/40). The shares always add up to the new total.
 */
export function rescaleShares(sp: Pick<SplitExpense, 'amount' | 'shares'>, amount: number): SplitExpense['shares'] {
  if (!sp.shares.length) return [];
  const old = sp.shares.reduce((a, x) => a + x.amount, 0);
  if (!(old > 0)) return sp.shares.map((x) => ({ ...x, amount: amount / sp.shares.length }));
  return sp.shares.map((x) => ({ ...x, amount: (x.amount * amount) / old }));
}
