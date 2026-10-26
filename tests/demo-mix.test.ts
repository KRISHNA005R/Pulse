import { describe, expect, it } from 'vitest';
import { createFresh, createSeed } from '../src/data/seed';
import { merge3 } from '../src/lib/sync';
import { cleanDemoMix } from '../src/lib/demoMix';
import type { State } from '../src/types';

// Someone's own data that got the demo (Aarav) mixed into it by a sync that landed while they were
// in the demo. The repair takes the demo's things out and gives them their name back.

function mine(): State {
  const s = createFresh({ name: 'Krishna Rao', reasons: [], payType: 'Salary', income: 50000, payday: '2026-11-01', banks: [{ name: 'HDFC', balance: 20000 }], cash: 500, priorities: [], invested: 0, sipAmount: 0, sipDate: '2026-11-05', currency: 'INR', bills: [], skipped: [] } as Parameters<typeof createFresh>[0]);
  s.transactions.push({ id: 'tx-me-1', merchant: 'Chai', amount: 40, type: 'expense', category: 'food', date: '2026-10-20', account: 'main', status: 'completed' } as State['transactions'][number]);
  s.plans.push({ ...structuredClone(createSeed().plans[0]), id: 'plan-me-1', name: 'Bike' });
  return s;
}

/** What the bug made: base = my data, local = the demo, remote = my data plus a new expense. */
function mixed(): { me: State; out: State } {
  const me = mine();
  const remote = structuredClone(me);
  remote.transactions.push({ ...remote.transactions[0], id: 'tx-me-2', merchant: 'Lunch', amount: 250 });
  const demo = createSeed();
  demo.onboarding.done = true;
  return { me, out: merge3(me, demo, remote, false) };
}

describe('cleanDemoMix', () => {
  it('the bug really mixes the demo in (so the test matches what happened)', () => {
    const { out } = mixed();
    expect(out.mode).toBe('personal');
    expect(out.user.name).toBe('Aarav');
    expect(out.transactions.length).toBeGreaterThan(90);
  });

  it('the bug also drops my own older entries and accounts (they were not in the demo)', () => {
    const { out } = mixed();
    expect(out.transactions.some((t) => t.id === 'tx-me-1')).toBe(false);
    expect(out.accounts.some((a) => a.id === 'main')).toBe(false);
  });

  it('takes every demo item out', () => {
    const { me, out } = mixed();
    for (const s of [cleanDemoMix(out, me)!, cleanDemoMix(out, null)!]) {
      const seed = createSeed();
      for (const k of ['cards', 'debts', 'transactions', 'budgets', 'plans', 'subscriptions', 'investments', 'incomes', 'people', 'groups', 'splits', 'settlements'] as const) {
        const demoIds = new Set((seed[k] as { id: string }[]).map((x) => x.id));
        expect((s[k] as { id: string }[]).filter((x) => demoIds.has(x.id)).map((x) => x.id), k).toEqual([]);
      }
      expect(s.accounts.some((a) => ['hdfc', 'groww', 'zerodha'].includes(a.id))).toBe(false);
      expect(s.mode).toBe('personal');
    }
  });

  it('with the copy this phone parked: everything of mine comes back, plus what came from my other phone', () => {
    const { me, out } = mixed();
    const s = cleanDemoMix(out, me)!;
    expect(s.transactions.map((t) => t.id).sort()).toEqual(['tx-me-1', 'tx-me-2']);
    expect(s.plans.map((p) => p.name)).toEqual(['Bike']);
    expect(s.accounts.map((a) => a.id).sort()).toEqual(me.accounts.map((a) => a.id).sort());
    expect(s.accounts.find((a) => a.id === 'cash')!.balance).toBe(me.accounts.find((a) => a.id === 'cash')!.balance); // my cash, not the demo's
    expect(s.user.name).toBe('Krishna');
    expect(s.user.fullName).toBe('Krishna Rao');
  });

  it('without that copy: what survived is kept, and the name comes from the account, or a neutral "Friend"', () => {
    const { out } = mixed();
    expect(cleanDemoMix(out, null)!.transactions.map((t) => t.id)).toEqual(['tx-me-2']);
    expect(cleanDemoMix(out, null, 'Krishna Rao')!.user).toMatchObject({ name: 'Krishna', fullName: 'Krishna Rao' });
    expect(cleanDemoMix(out, null, 'Aarav Sharma')!.user.name).toBe('Friend'); // the account name was overwritten too
    expect(cleanDemoMix(out, null)!.user.name).toBe('Friend');
  });

  it('a parked copy that is itself the demo is not used', () => {
    const { out } = mixed();
    expect(cleanDemoMix(out, createSeed())!.user.name).toBe('Friend');
  });

  it('leaves clean data alone: my own data, and a real person who happens to be called Aarav Sharma', () => {
    expect(cleanDemoMix(mine(), null)).toBeNull();
    const aarav = mine();
    aarav.user = { ...aarav.user, name: 'Aarav', fullName: 'Aarav Sharma', handle: '@aarav' };
    expect(cleanDemoMix(aarav, null)).toBeNull();
  });

  it("only the demo's own profile counts as a mix: demo entries under someone else's name are left alone", () => {
    const s = createSeed();
    s.mode = 'personal';
    s.user = { ...s.user, name: 'Krishna', fullName: 'Krishna Rao', handle: '@krishna' };
    expect(cleanDemoMix(s, null)).toBeNull();
  });

  it('never touches the demo itself', () => {
    expect(cleanDemoMix(createSeed(), null)).toBeNull();
  });

  it('running it twice changes nothing more', () => {
    const { me, out } = mixed();
    const once = cleanDemoMix(out, me)!;
    expect(cleanDemoMix(once, me)).toBeNull();
  });
});
