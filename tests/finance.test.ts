import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { safeToSpend, upcoming } from '../src/lib/finance';
import { processDueSubscriptions } from '../src/store/store';
import type { State } from '../src/types';

const demo = (): State => createSeed();

describe('safe to spend', () => {
  it('still shows ₹2,840 in the demo', () => {
    expect(safeToSpend(demo()).safe).toBe(2840);
  });

  it('takes card spending off straight away', () => {
    const s = demo();
    const before = safeToSpend(s).safe;
    s.cards[0].balance += 500;
    expect(safeToSpend(s).safe).toBe(before - 500);
  });

  it('counts a card bill once, not as a bill on top of the card balance', () => {
    const s = demo();
    s.cards[0].dueDate = s.today; // due before payday
    s.cards[0].status = 'due';
    const sts = safeToSpend(s);
    expect(sts.billItems.some((b) => b.kind === 'card')).toBe(false);
    expect(sts.cards).toBe(s.cards.reduce((a, c) => a + c.balance, 0));
  });
});

describe('bills paid by hand', () => {
  const manualBill = (s: State, due: string) => {
    s.subscriptions.push({ id: 'rent', name: 'Rent', amount: 9000, cycle: 'monthly', nextDate: due, category: 'bills', status: 'active', kind: 'bill', account: s.accounts[0].id, autoDebit: false });
  };

  it('stay due, and counted, after the date passes', () => {
    const s = demo();
    manualBill(s, '2026-09-20'); // a week before the demo's today
    processDueSubscriptions(s);
    expect(s.subscriptions.find((x) => x.id === 'rent')!.nextDate).toBe('2026-09-20');
    expect(upcoming(s, safeToSpend(s).payday).some((u) => u.id === 'rent')).toBe(true);
  });

  it('move on once the payment was logged', () => {
    const s = demo();
    manualBill(s, '2026-09-20');
    s.transactions.unshift({ id: 'paid-rent', merchant: 'Rent', amount: 9000, type: 'expense', category: 'bills', date: '2026-09-21', account: s.accounts[0].id, recurring: false, status: 'completed' });
    processDueSubscriptions(s);
    expect(s.subscriptions.find((x) => x.id === 'rent')!.nextDate).toBe('2026-10-20');
  });
});
