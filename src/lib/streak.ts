import type { State } from '../types';
import { isAuto } from './auto';
import { addDays } from './format';

/**
 * Logging streak: how many days in a row the person has logged something themselves.
 * Entries PULSE records by itself (SIPs, EMIs, bills, paydays) don't count. If nothing is logged yet today the streak is still
 * alive (it counts up to yesterday) until the day ends.
 */
export function streak(s: State): { count: number; today: boolean; best: number } {
  const days = new Set<string>();
  for (const t of s.transactions) if (!t.investmentId && !isAuto(t) && t.date <= s.today) days.add(t.date);
  const today = days.has(s.today);
  let d = today ? s.today : addDays(s.today, -1);
  let count = 0;
  while (days.has(d) && count < 3650) {
    count++;
    d = addDays(d, -1);
  }
  // Longest run ever, for the "best" line.
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const x of sorted) {
    run = prev && addDays(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  return { count, today, best: Math.max(best, count) };
}
