// The demo (Aarav's sample month) must never end up in someone's own data. If it ever does, by any
// route, this takes it back out. Every demo item has a fixed id that real data never uses
// (real ids are random, like "t-k3x9q2a"), and is matched on its content too, so only the demo's
// own untouched items are removed. Nothing of the person's is ever removed here.
import { createSeed } from '../data/seed';
import { merge3 } from './sync';
import type { State, User } from '../types';

const LISTS = ['accounts', 'cards', 'debts', 'transactions', 'budgets', 'plans', 'subscriptions', 'investments', 'insurance', 'incomes', 'people', 'groups', 'splits', 'settlements'] as const;
type ListKey = (typeof LISTS)[number];
/** Ids a real setup also uses: never removed. */
const SHARED = new Set(['accounts:cash']);

let seed: State | null = null;
const demo = () => (seed ??= createSeed());

type Item = Record<string, unknown> & { id: string };
/** What makes an item the demo's own: its id plus the fields the demo filled in. */
const KEYS: Record<ListKey, string[]> = {
  accounts: ['name', 'institution'],
  cards: ['name', 'last4'],
  debts: ['name', 'lender'],
  transactions: ['merchant', 'amount'],
  budgets: ['category', 'period'],
  plans: ['name'],
  subscriptions: ['name'],
  investments: ['name'],
  insurance: ['name'],
  incomes: ['name'],
  people: ['name'],
  groups: ['name'],
  splits: ['description', 'amount'],
  settlements: ['from', 'to', 'amount'],
};
const sig = (k: ListKey, x: Item) => [x.id, ...KEYS[k].map((f) => JSON.stringify(x[f] ?? null))].join('|');

let sigs: Map<ListKey, Set<string>> | null = null;
function demoSigs() {
  if (sigs) return sigs;
  sigs = new Map();
  for (const k of LISTS) sigs.set(k, new Set(((demo()[k] ?? []) as unknown as Item[]).filter((x) => !SHARED.has(`${k}:${x.id}`)).map((x) => sig(k, x))));
  return sigs;
}
const isDemoItem = (k: ListKey, x: Item) => demoSigs().get(k)!.has(sig(k, x));

/** True for the demo's own person (Aarav Sharma, @aarav). */
export const isDemoUser = (u: User | undefined) => {
  const d = demo().user;
  return !!u && u.handle === d.handle && u.fullName === d.fullName;
};

/** Browser tests use the demo month as someone's own data on purpose; only they set this. */
function demoAsMine(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('pulse-e2e-demo-as-mine') === '1';
  } catch {
    return false;
  }
}

/** How many of the demo's own items are in this data. */
export function demoCount(s: State | null | undefined): number {
  if (!s) return 0;
  let n = 0;
  for (const k of LISTS) n += ((s[k] ?? []) as unknown as Item[]).filter((x) => isDemoItem(k, x)).length;
  return n;
}

/**
 * True when someone's own data has the demo in it. A real person who happens to be called Aarav
 * Sharma, with no demo items, is not a mix.
 */
export function looksMixed(s: State | null | undefined): boolean {
  if (!s || s.mode !== 'personal' || demoAsMine()) return false;
  // The demo's profile alone isn't enough (a real Aarav Sharma could exist); a few of its items are.
  return demoCount(s) >= 3;
}

/** The demo's items taken out. People the person's own entries still use are kept. */
export function stripDemo(s: State): State {
  const out = structuredClone(s);
  const rec = out as unknown as Record<ListKey, Item[]>;
  const gone = new Set<string>();
  for (const k of LISTS)
    if (rec[k])
      rec[k] = rec[k].filter((x) => {
        const d = isDemoItem(k, x);
        if (d && k !== 'transactions') gone.add(x.id);
        return !d;
      });
  // What PULSE recorded by itself from a demo bill, SIP, loan, policy or salary after it got in
  // ("due-sub-netflix-2026-11-14"), and anything marked paid against one, goes with it.
  const auto = /^(?:due|sip|emi|ins|pay)-(.+)-\d{4}-\d{2}-\d{2}$/;
  out.transactions = out.transactions.filter((t) => {
    const m = t.id.match(auto);
    if (m && gone.has(m[1])) return false;
    return ![t.subscriptionId, t.investmentId, t.debtId, t.insuranceId, t.incomeId].some((id) => id && gone.has(id));
  });
  // A demo friend that someone's own split or group was made with stays.
  const used = new Set<string>();
  for (const x of out.splits) {
    used.add(x.paidBy);
    for (const sh of x.shares) used.add(sh.person);
  }
  for (const g of out.groups) for (const m of g.members) used.add(m);
  for (const x of out.settlements) {
    used.add(x.from);
    used.add(x.to);
  }
  const keep = (s.people ?? []).filter((p) => isDemoItem('people', p as unknown as Item) && used.has(p.id));
  out.people = [...out.people, ...keep.map((p) => structuredClone(p))];
  const demoPoints = new Set(demo().netWorthHistory.map((p) => `${p.month}:${p.value}`));
  out.netWorthHistory = (s.netWorthHistory ?? []).filter((p) => !demoPoints.has(`${p.month}:${p.value}`));
  return out;
}

function named(user: User, full: string): User {
  const fullName = full.trim();
  const name = fullName.split(/\s+/)[0] || 'Friend';
  return { ...user, name, fullName: fullName || '', handle: `@${name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'you'}` };
}

/**
 * The person's data with the demo taken back out, or null when there is nothing to fix.
 * `copies`: other copies of their own data on this device (the one parked when they opened the
 * demo, the last synced one). A mix can also drop older entries; these bring them back. Nothing is
 * ever removed from what the person has: copies only add.
 * `accountName`: the name on their account, used when no copy has their profile.
 */
export function cleanDemoMix(s: State, copies: State | null | (State | null | undefined)[], accountName?: string): State | null {
  if (!looksMixed(s)) return null;
  let out = stripDemo(s);
  const list = (Array.isArray(copies) ? copies : [copies]).filter((c): c is State => !!c && c.mode === 'personal').map((c) => (looksMixed(c) || demoCount(c) ? stripDemo(c) : c));
  for (const c of list) {
    const both = merge3(null, out, c, true);
    // The shared Cash account: the person's own balance, not the demo's.
    for (const k of SHARED) {
      const [l, id] = k.split(':') as ['accounts', string];
      const mine = c[l].find((a) => a.id === id);
      const now = s[l].find((a) => a.id === id);
      const demoCash = demo()[l].find((a) => a.id === id);
      if (mine && now && demoCash && now.balance === demoCash.balance) both[l] = both[l].map((a) => (a.id === id ? structuredClone(mine) : a));
    }
    both.user = out.user;
    out = both;
  }
  if (isDemoUser(out.user)) {
    const own = list.map((c) => c.user).find((u) => !isDemoUser(u));
    if (own) out.user = { ...out.user, ...structuredClone(own) };
    else out.user = named(out.user, accountName && accountName.trim() !== demo().user.fullName ? accountName : '');
  }
  return out;
}
