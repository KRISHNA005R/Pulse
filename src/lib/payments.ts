// Settle-ups ("paid" entries): finding the money that moved with one, and removing one that
// shouldn't be there. A payment involves two people, so either of them can say it didn't happen.
import type { Settlement, State, Transaction } from '../types';
import { applyMoney } from './finance';
import { daysBetween } from './format';

/** The money entry recorded with a settle-up: linked by id, or (older ones) matched by what it says. */
export function paymentTx(s: State, st: Settlement): Transaction | undefined {
  const linked = s.transactions.find((t) => t.settlementId === st.id);
  if (linked) return linked;
  const other = st.from === 'me' ? st.to : st.from;
  const dir = st.from === 'me' ? 'out' : 'in';
  if (st.from !== 'me' && st.to !== 'me') return undefined;
  if (st.remote && !st.banked) return undefined; // a friend's record that never touched my accounts
  return s.transactions.find(
    (t) => t.type === 'transfer' && t.direction === dir && !t.settlementId && Math.abs(t.amount - st.amount) < 0.01 && (t.people ?? []).includes(other) && (t.notes ?? '').startsWith('Settled up') && Math.abs(daysBetween(t.date, st.date)) <= 1,
  );
}

/**
 * Take a settle-up out, with the money it moved in my accounts. One a friend recorded is remembered,
 * so it doesn't come back and their phone is told to drop it too.
 */
export function removePayment(s: State, id: string): Settlement | undefined {
  const st = s.settlements.find((x) => x.id === id);
  if (!st) return undefined;
  const tx = paymentTx(s, st);
  if (tx) {
    applyMoney(s, tx, -1);
    s.transactions = s.transactions.filter((t) => t.id !== tx.id);
  }
  s.settlements = s.settlements.filter((x) => x.id !== id);
  if (st.remote) s.droppedPays = [...new Set([...(s.droppedPays ?? []), id])].slice(-300);
  return st;
}

/** A friend dropped one of my settle-ups (no money moved): take it out here too. */
export function dropMine(s: State, id: string, partyId: string): Settlement | undefined {
  const st = s.settlements.find((x) => x.id === id && !x.remote);
  if (!st || (st.from !== partyId && st.to !== partyId)) return undefined;
  return removePayment(s, id);
}
