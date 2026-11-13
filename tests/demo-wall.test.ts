import { describe, expect, it } from 'vitest';
import { createFresh, createSeed } from '../src/data/seed';
import { merge3 } from '../src/lib/sync';
import { cleanDemoMix, demoCount, looksMixed, stripDemo } from '../src/lib/demoMix';
import type { SplitExpense as Split, State, Transaction } from '../src/types';

// The wall between the demo and someone's own data: any demo item that gets in, by any route, is
// found and taken out, and nothing of theirs is ever lost doing it.

function mine(): State {
  const s = createFresh({ name: 'Krishna Rao', reasons: [], payType: 'Salary', income: 50000, payday: '2026-11-01', banks: [{ name: 'HDFC', balance: 20000 }], cash: 500, priorities: [], invested: 0, sipAmount: 0, sipDate: '2026-11-05', currency: 'INR', bills: [], skipped: [] } as Parameters<typeof createFresh>[0]);
  for (let i = 0; i < 5; i++) s.transactions.push({ id: `t-mine${i}`, merchant: `Chai ${i}`, amount: 40 + i, type: 'expense', category: 'food', date: '2026-10-2' + i, account: 'main', status: 'completed' } as Transaction);
  return s;
}
const demoIn = (s: State) => merge3(null, s, Object.assign(createSeed(), { mode: 'personal' as const }), true);

describe('finding the demo', () => {
  it('own data alone: not a mix', () => {
    expect(demoCount(mine())).toBe(0);
    expect(looksMixed(mine())).toBe(false);
  });
  it('the demo itself is never "mixed" (it is the demo)', () => {
    expect(looksMixed(createSeed())).toBe(false);
  });
  it('demo items inside own data: a mix, whatever the name says', () => {
    const s = demoIn(mine());
    expect(s.user.name).toBe('Krishna');
    expect(looksMixed(s)).toBe(true);
  });
  it('a demo item I edited is mine now: not counted', () => {
    const s = demoIn(mine());
    const n = demoCount(s);
    s.transactions.find((t) => t.id === 't1')!.amount += 1;
    expect(demoCount(s)).toBe(n - 1);
  });
});

describe('taking it out', () => {
  it('every demo item goes and all of mine stay', () => {
    const me = mine();
    const out = stripDemo(demoIn(me));
    expect(demoCount(out)).toBe(0);
    expect(out.transactions.map((t) => t.id).sort()).toEqual(me.transactions.map((t) => t.id).sort());
    expect(out.accounts.map((a) => a.id).sort()).toEqual(me.accounts.map((a) => a.id).sort());
  });
  it('payments PULSE recorded by itself from a demo bill or SIP after it got in go too', () => {
    const s = demoIn(mine());
    const sub = s.subscriptions.find((x) => x.id === 'sub-prime')!;
    s.transactions.push({ id: `due-${sub.id}-2026-11-14`, merchant: sub.name, amount: sub.amount, type: 'expense', category: 'subscriptions', date: '2026-11-14', account: 'hdfc', status: 'completed', subscriptionId: sub.id } as Transaction);
    s.transactions.push({ id: 'sip-inv-nifty-2026-11-15', merchant: 'SIP · UTI Nifty 50 Index', amount: 1000, type: 'transfer', category: 'investments', date: '2026-11-15', account: 'hdfc', status: 'completed', investmentId: 'inv-nifty' } as Transaction);
    s.transactions.push({ id: 't-handpaid', merchant: 'ACT Fibernet', amount: 1180, type: 'expense', category: 'bills', date: '2026-11-12', account: 'hdfc', status: 'completed', subscriptionId: 'bill-act' } as Transaction);
    const out = stripDemo(s);
    expect(out.transactions.map((t) => t.id).sort()).toEqual(mine().transactions.map((t) => t.id).sort());
  });

  it('a demo friend I really split with stays, so my split still has its person', () => {
    const s = demoIn(mine());
    s.splits.push({ id: 'sp-mine', description: 'Real lunch', amount: 600, paidBy: 'me', date: '2026-11-01', mode: 'equal', shares: [{ person: 'me', amount: 300 }, { person: 'rahul', amount: 300 }] } as Split);
    const out = stripDemo(s);
    expect(out.splits.map((x) => x.id)).toEqual(['sp-mine']);
    expect(out.people.map((p) => p.id)).toEqual(['rahul']);
  });
  it('copies on this phone bring back what the mix dropped, and add nothing of the demo', () => {
    const me = mine();
    const dropped = demoIn(me);
    dropped.transactions = dropped.transactions.filter((t) => t.id !== 't-mine0');
    const parkedButMixed = demoIn(me); // even a copy that has the demo in it is cleaned first
    const out = cleanDemoMix(dropped, [null, parkedButMixed, createSeed()])!;
    expect(out.transactions.map((t) => t.id).sort()).toEqual(me.transactions.map((t) => t.id).sort());
    expect(demoCount(out)).toBe(0);
    expect(out.user.fullName).toBe('Krishna Rao');
  });
  it('the demo profile is replaced by mine from a copy (photo, UPI and friend id too)', () => {
    const me = mine();
    me.user = { ...me.user, upi: 'krishna@okaxis', uid: 'u-krishna' };
    const s = merge3(null, Object.assign(createSeed(), { mode: 'personal' as const }), me, true);
    s.user = createSeed().user;
    const out = cleanDemoMix(s, [me])!;
    expect(out.user).toMatchObject({ name: 'Krishna', upi: 'krishna@okaxis', uid: 'u-krishna' });
  });
});
