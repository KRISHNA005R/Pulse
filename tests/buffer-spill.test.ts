import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { safeToSpend, spendLine, spendNow } from '../src/lib/finance';
import { canIAfford } from '../src/lib/afford';
import { askPulse as ask } from '../src/lib/assistant';
import type { State } from '../src/types';

// When safe-to-spend runs out, the safety buffer (kept aside all month) is what's left to spend from,
// automatically, until it's used up too. Bank ₹10,000, electricity ₹1,500 due, buffer ₹2,000:
// safe to spend ₹6,500, then ₹2,000 of buffer.

function me(bank: number, over: Partial<State> = {}): State {
  const s = createSeed();
  s.mode = 'personal';
  s.today = '2026-11-21';
  s.accounts = [{ id: 'bank', name: 'HDFC', kind: 'bank', balance: bank, spendable: true }] as never;
  s.cards = [];
  s.plans = [];
  s.investments = [];
  s.insurance = [];
  s.debts = [];
  s.bhisis = [];
  s.incomes = [{ id: 'inc', name: 'Salary', kind: 'salary', expected: 60000, cycle: 'monthly', nextDate: '2026-12-01' }] as never;
  s.subscriptions = [{ id: 'elec', name: 'Electricity', amount: 1500, cycle: 'monthly', nextDate: '2026-11-25', category: 'bills', status: 'active', kind: 'bill', account: 'bank' }] as never;
  s.settings.buffer = 2000;
  return Object.assign(s, over);
}

describe('the safety buffer, once safe-to-spend is used up', () => {
  it('normal: safe to spend ₹6,500, the whole ₹2,000 buffer kept, not on the buffer', () => {
    const t = safeToSpend(me(10000));
    expect([t.safe, t.bufferLeft, t.onBuffer]).toEqual([6500, 2000, false]);
    expect(spendLine(t)).toBe('Safe to spend: ₹6,500');
  });

  it('spent past safe-to-spend: it shows what is left of the buffer, per day too', () => {
    const t = safeToSpend(me(2800)); // ₹2,800 − ₹1,500 bill = ₹1,300 free, all of it buffer
    expect([t.safe, t.bufferLeft, t.onBuffer]).toEqual([0, 1300, true]);
    expect(t.daysLeft).toBe(10);
    expect(t.bufferDaily).toBe(130);
    expect(spendLine(t)).toBe('Safety buffer left: ₹1,300');
    expect(spendNow(t)).toBe('Safe to spend is used up. ₹1,300 left in your buffer.');
  });

  it('exactly at the line: safe to spend ₹0 and the whole buffer to use', () => {
    const t = safeToSpend(me(3500));
    expect([t.safe, t.bufferLeft, t.onBuffer]).toEqual([0, 2000, true]);
  });

  it('buffer used up too: ₹0 everywhere, not on the buffer any more', () => {
    const t = safeToSpend(me(1000));
    expect([t.safe, t.bufferLeft, t.onBuffer]).toEqual([0, 0, false]);
    expect(spendLine(t)).toBe('Safe to spend: ₹0');
  });

  it('no buffer set: nothing changes', () => {
    const s = me(1000);
    s.settings.buffer = 0;
    const t = safeToSpend(s);
    expect([t.safe, t.bufferLeft, t.onBuffer]).toEqual([0, 0, false]);
  });

  it('Can I afford: past safe-to-spend it comes from the buffer first, then plans', () => {
    const r = canIAfford(me(10000), 7000);
    expect(r.verdict).toBe('buffer');
    expect(r.headline).toBe('Yes, from your safety buffer.');
    expect(r.explanation).toContain('₹500 comes from your buffer. ₹1,500 would be left in it.');
    // Already on the buffer: only what's left of it counts.
    const r2 = canIAfford(me(2800), 1000);
    expect(r2.verdict).toBe('buffer');
    expect(r2.explanation).toMatch(/^Safe to spend is used up, so ₹1,000 comes from your buffer\. ₹300 would be left/);
    expect(canIAfford(me(2800), 2000).verdict).toBe('tight');
  });

  it('PULSE AI says so', () => {
    expect(ask(me(2800), 'how much can i spend').text).toBe("Safe to spend is used up, so you're on your safety buffer: ₹1,300 left until payday, 1 Dec. About ₹130 a day.");
  });
});
