// Repair for one bug: a sync that landed while someone was looking at the demo mixed the demo
// (Aarav's sample month) into their own data, and that mix was then saved to their account.
// The demo's things all have fixed ids, so they can be taken out again without touching theirs.
import { createSeed } from '../data/seed';
import { merge3 } from './sync';
import type { State, User } from '../types';

const LISTS = ['accounts', 'cards', 'debts', 'transactions', 'budgets', 'plans', 'subscriptions', 'investments', 'insurance', 'incomes', 'people', 'groups', 'splits', 'settlements'] as const;
/** Ids a real setup also uses: never removed. */
const SHARED = new Set(['accounts:cash']);
/** How many of the demo's own expenses must be present before anything is called a mix. */
const ENOUGH = 20;

let seed: State | null = null;
const demo = () => (seed ??= createSeed());

/** True for the demo's own person (Aarav Sharma, @aarav). */
const isDemoUser = (u: User) => {
  const d = demo().user;
  return u.handle === d.handle && u.fullName === d.fullName;
};

function named(user: User, full: string): User {
  const fullName = full.trim();
  const name = fullName.split(/\s+/)[0] || 'Friend';
  return { ...user, name, fullName: fullName || '', handle: `@${name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'you'}` };
}

/**
 * The person's data with the demo taken back out, or null when there is nothing to fix.
 * `saved`: their own data from just before the mix (parked when they opened the demo), if this
 * phone still has it. The mix also dropped their older entries, and this is the only full copy.
 * `accountName`: the name on their account, used when there's no saved copy.
 */
export function cleanDemoMix(s: State, saved: State | null, accountName?: string): State | null {
  // A mix always carries the demo's own profile (the demo's name replaced theirs), plus its entries.
  if (s.mode !== 'personal' || !isDemoUser(s.user)) return null;
  const d = demo();
  const demoTx = new Map(d.transactions.map((t) => [t.id, t]));
  const found = s.transactions.filter((t) => {
    const x = demoTx.get(t.id);
    return x && x.merchant === t.merchant && x.amount === t.amount;
  }).length;
  if (found < ENOUGH) return null;

  const out = structuredClone(s);
  for (const k of LISTS) {
    const ids = new Set(((d[k] ?? []) as { id: string }[]).map((x) => x.id).filter((id) => !SHARED.has(`${k}:${id}`)));
    (out as unknown as Record<string, unknown>)[k] = ((s[k] ?? []) as { id: string }[]).filter((x) => !ids.has(x.id));
  }
  const demoPoints = new Set(d.netWorthHistory.map((p) => `${p.month}:${p.value}`));
  out.netWorthHistory = s.netWorthHistory.filter((p) => !demoPoints.has(`${p.month}:${p.value}`));
  const mine = saved && saved.mode === 'personal' && !isDemoUser(saved.user) ? saved : null;
  if (mine) {
    // Everything from both: the parked copy brings back what the mix dropped; newer changes stay.
    const both = merge3(null, out, mine, true);
    for (const k of SHARED) {
      const [list, id] = k.split(':') as ['accounts', string];
      const x = mine[list].find((a) => a.id === id);
      if (x) both[list] = both[list].map((a) => (a.id === id ? structuredClone(x) : a));
    }
    both.user = { ...s.user, name: mine.user.name, fullName: mine.user.fullName, handle: mine.user.handle };
    return both;
  }
  out.user = named(s.user, accountName && accountName.trim() !== d.user.fullName ? accountName : '');
  return out;
}
