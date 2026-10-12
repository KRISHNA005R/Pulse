import type { State } from '../types';

/**
 * True when nothing regular is known yet (no rent or bills, no loans) and the person didn't say
 * during setup that they pay none (settings.setupSkipped has 'bills'): safe-to-spend may then be
 * higher than it really is.
 */
export function billsUnknown(s: State): boolean {
  if (s.mode !== 'personal') return false;
  if ((s.settings.setupSkipped ?? []).includes('bills')) return false;
  return !s.subscriptions.some((x) => x.kind === 'bill' && x.status !== 'cancelled') && s.debts.length === 0;
}
