import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { refresh } from '../src/store/store';
import { holdingAccounts, safeToSpend } from '../src/lib/finance';

// Holdings (investments) never count toward safe-to-spend, even ones saved as spendable before.
describe('holdings and safe-to-spend', () => {
  it('a holding saved as spendable stops counting, and safe-to-spend goes back to normal', () => {
    const s = createSeed();
    const before = safeToSpend(s).available;
    const bad = structuredClone(s);
    bad.accounts.push({ id: 'gold', name: 'Gold ETF', institution: 'Groww', type: 'investment', balance: 50000, spendable: true });
    expect(safeToSpend(bad).available).toBe(before + 50000); // the bug: it counted
    const fixed = refresh(bad);
    expect(fixed.accounts.find((a) => a.id === 'gold')!.spendable).toBe(false);
    expect(safeToSpend(fixed).available).toBe(before);
  });

  it('every holding ends up not spendable; bank accounts are untouched', () => {
    const s = createSeed();
    s.accounts.forEach((a) => (a.spendable = true));
    const fixed = refresh(s);
    for (const a of holdingAccounts(fixed)) expect(a.spendable, a.name).toBe(false);
    expect(fixed.accounts.find((a) => a.type === 'bank')!.spendable).toBe(true);
  });
});
