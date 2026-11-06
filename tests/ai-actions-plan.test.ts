import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed';
import { parseAction } from '../src/lib/aiActions';

// PULSE AI: a spend is never tagged with a plan (that read like money went into it). Putting money
// into a plan is its own action ("add 4180 to Goa").
describe('PULSE AI and plans', () => {
  it('"spent 4180 on <plan> hotel" logs a plain spend, with no plan on it', () => {
    const s = createSeed();
    const plan = s.plans.find((p) => p.status === 'active')!;
    const a = parseAction(s, `spent 4180 on ${plan.name} hotel`);
    expect(a?.kind).toBe('expense');
    expect((a as { plan?: string }).plan).toBeUndefined();
  });
  it('"add 4180 to <plan>" still puts money into the plan', () => {
    const s = createSeed();
    const plan = s.plans.find((p) => p.status === 'active')!;
    const a = parseAction(s, `add 4180 to ${plan.name}`);
    expect(a?.kind).toBe('contribute');
  });
});
