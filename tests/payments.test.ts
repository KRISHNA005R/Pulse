import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { applyBox, applyGroup, buildBox, buildGroupBox } from '../src/lib/friends';
import { balanceFromPayments, personBalances } from '../src/lib/finance';
import { paymentTx, removePayment } from '../src/lib/payments';
import type { Group, Person, State, Transaction } from '../src/types';

// A "paid" entry that shouldn't be there (no money moved, or the expense it paid for changed or
// went): either of the two people can remove it, its money entry goes too, and it goes from both phones.
// Krishna's case: Chicken ₹1,305 (his half ₹653) → "You → saloni ₹653" → Chicken changed without
// him → "saloni owes you ₹653".

const T = '2026-11-15';
function world(people: Person[]): State {
  const s = createSeed();
  s.mode = 'personal';
  s.today = T;
  s.people = people;
  s.splits = [];
  s.settlements = [];
  s.groups = [];
  s.bhisis = [];
  s.transactions = [];
  s.accounts = [{ id: 'bank', name: 'HDFC', institution: 'HDFC', type: 'bank', balance: 10000, spendable: true }] as never;
  return s;
}
const bank = (s: State) => s.accounts[0].balance;
const payTx = (id: string, sid: string | undefined, dir: 'out' | 'in', amount: number, person: string): Transaction => ({ id, merchant: 'saloni', amount, type: 'transfer', direction: dir, category: 'transfer', date: T, account: 'bank', people: [person], notes: 'Settled up · Hum chaar', recurring: false, status: 'completed', ...(sid ? { settlementId: sid } : {}) });

describe('a balance that comes only from a payment', () => {
  it('Krishna’s case: the expense changed after he paid, so saloni "owes" him the payment', () => {
    const s = world([{ id: 'sal', name: 'saloni', short: 'saloni', hue: 1 }]);
    s.splits.push({ id: 'chicken', group: 'g', description: 'Chicken', amount: 1305, paidBy: 'sal', date: T, mode: 'equal', shares: [{ person: 'sal', amount: 652.5 }, { person: 'me', amount: 652.5 }], category: 'food' });
    s.settlements.push({ id: 'st1', group: 'g', from: 'me', to: 'sal', amount: 653, date: T });
    expect(balanceFromPayments(s, 'sal', 'g')).toEqual([]); // the payment is for a real expense
    s.splits[0].shares = [{ person: 'sal', amount: 1305 }]; // Chicken changed: Krishna's not in it
    expect(personBalances(s, 'g').get('sal')).toBe(653);
    expect(balanceFromPayments(s, 'sal', 'g').map((x) => x.id)).toEqual(['st1']);
  });
  it('a real expense still behind the balance: not flagged', () => {
    const s = world([{ id: 'sal', name: 'saloni', short: 'saloni', hue: 1 }]);
    s.splits.push({ id: 'x', group: 'g', description: 'Pizza', amount: 2000, paidBy: 'me', date: T, mode: 'equal', shares: [{ person: 'me', amount: 1000 }, { person: 'sal', amount: 1000 }], category: 'food' });
    s.settlements.push({ id: 'st1', group: 'g', from: 'me', to: 'sal', amount: 200, date: T });
    expect(balanceFromPayments(s, 'sal', 'g')).toEqual([]);
  });
});

describe('removing a payment', () => {
  it('one I recorded: it goes with its money, and the bank balance comes back', () => {
    const s = world([{ id: 'sal', name: 'saloni', short: 'saloni', hue: 1 }]);
    s.settlements.push({ id: 'st1', group: 'g', from: 'me', to: 'sal', amount: 653, date: T });
    s.transactions.push(payTx('t1', 'st1', 'out', 653, 'sal'));
    s.accounts[0].balance -= 653;
    removePayment(s, 'st1');
    expect(s.settlements).toEqual([]);
    expect(s.transactions).toEqual([]);
    expect(bank(s)).toBe(10000);
  });
  it('an older one with no link to its money: still found by what it says', () => {
    const s = world([{ id: 'sal', name: 'saloni', short: 'saloni', hue: 1 }]);
    const st = { id: 'st1', group: 'g', from: 'me', to: 'sal', amount: 653, date: T };
    s.settlements.push(st);
    s.transactions.push(payTx('t-other', undefined, 'out', 999, 'sal'), payTx('t1', undefined, 'out', 653, 'sal'));
    expect(paymentTx(s, st)?.id).toBe('t1');
  });
  it('one a friend recorded: remembered, so it doesn’t come back; my accounts untouched', () => {
    const s = world([{ id: 'sal', name: 'saloni', short: 'saloni', hue: 1 }]);
    s.settlements.push({ id: 'gr-x', group: 'g', from: 'me', to: 'sal', amount: 653, date: T, remote: 'gid' });
    removePayment(s, 'gr-x');
    expect(s.droppedPays).toEqual(['gr-x']);
    expect(bank(s)).toBe(10000);
  });
});

describe('it goes from both phones', () => {
  const MK = '1'.repeat(16);
  const MS = '2'.repeat(16);
  const GID = 'abcdef0123456789';
  const share = (mid: string, other: string, otherId: string) => ({ gid: GID, key: 'k', mid, token: 't', refs: { [other]: otherId }, on: [other], since: T });
  function phones() {
    const K = world([{ id: 'sal', name: 'saloni', short: 'saloni', hue: 1 }]);
    K.groups.push({ id: 'g', name: 'Hum chaar', emoji: '🍜', members: ['me', 'sal'], shared: share(MK, MS, 'sal') } as unknown as Group);
    const S = world([{ id: 'kri', name: 'Krishna', short: 'Krishna', hue: 2 }]);
    S.groups.push({ id: 'g', name: 'Hum chaar', emoji: '🍜', members: ['me', 'kri'], shared: { ...share(MS, MK, 'kri'), owner: true } } as unknown as Group);
    return { K, S };
  }
  const view = (mid: string, box: unknown, owner = false) => ({ closed: false, members: [{ mid, box: box as never, gone: false, owner }] });

  it('saloni marked "Krishna paid me ₹653"; Krishna removes it; her phone drops it, with its money', () => {
    const { K, S } = phones();
    S.settlements.push({ id: 'st-s1', group: 'g', from: 'kri', to: 'me', amount: 653, date: T });
    S.transactions.push(payTx('t-s1', 'st-s1', 'in', 653, 'kri'));
    S.accounts[0].balance += 653;

    applyGroup(K, 'g', view(MS, buildGroupBox(S, S.groups[0]), true));
    const theirs = K.settlements.find((x) => x.from === 'me' && x.to === 'sal')!;
    expect(theirs.amount).toBe(653);
    expect(balanceFromPayments(K, 'sal', 'g').map((x) => x.id)).toEqual([theirs.id]);

    removePayment(K, theirs.id);
    // It doesn't come back from her box before her phone has caught up.
    applyGroup(K, 'g', view(MS, buildGroupBox(S, S.groups[0]), true));
    expect(K.settlements).toEqual([]);

    // Her phone reads Krishna's box: the payment and the ₹653 it added to her bank go.
    const news = applyGroup(S, 'g', view(MK, buildGroupBox(K, K.groups[0])));
    expect(S.settlements).toEqual([]);
    expect(S.transactions).toEqual([]);
    expect(bank(S)).toBe(10000);
    expect(news.some((n) => /removed a payment/.test(n.title))).toBe(true);
  });

  it('someone not in the payment can’t remove it from the writer’s phone', () => {
    const { S } = phones();
    S.people.push({ id: 'arn', name: 'Arnav', short: 'Arnav', hue: 3 });
    S.groups[0].shared!.refs['3'.repeat(16)] = 'arn';
    S.settlements.push({ id: 'st-s1', group: 'g', from: 'kri', to: 'me', amount: 653, date: T });
    applyGroup(S, 'g', { closed: false, members: [{ mid: '3'.repeat(16), box: { v: 1, uid: '', name: 'Arnav', g: { name: 'Hum chaar', emoji: '🍜' }, ghosts: [], items: [], pays: [], drop: [[MS.slice(0, 6), 'st-s1']] } as never, gone: false, owner: false }] });
    expect(S.settlements.map((x) => x.id)).toEqual(['st-s1']);
  });

  it('between two friends (no group), the same', () => {
    const chan = 'c'.repeat(32);
    const link = { chan, key: 'k', token: 't', status: 'linked' as const, since: T };
    const K = world([{ id: 'sal', name: 'saloni', short: 'saloni', hue: 1, link }]);
    const S = world([{ id: 'kri', name: 'Krishna', short: 'Krishna', hue: 2, link }]);
    S.settlements.push({ id: 'st-s1', from: 'kri', to: 'me', amount: 300, date: T });
    applyBox(K, 'sal', buildBox(S, 'kri'));
    const theirs = K.settlements[0];
    removePayment(K, theirs.id);
    applyBox(K, 'sal', buildBox(S, 'kri'));
    expect(K.settlements).toEqual([]);
    applyBox(S, 'kri', buildBox(K, 'sal'));
    expect(S.settlements).toEqual([]);
  });
});
