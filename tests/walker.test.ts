import { describe, expect, it } from 'vitest';
import { walker } from '../src/lib/walker';

// The walking buddy on Home: where he stands on the payday line and which pose he's in.
// walker(daysSincePayday, daysLeft, progress)

describe('walker pose through the month', () => {
  it('payday: arms up, at the finish', () => {
    expect(walker(0, 30, 0)).toEqual({ pose: 'payday', at: 1 });
  });

  it('first 3 days after payday: fresh, with chai', () => {
    for (const d of [1, 2, 3]) expect(walker(d, 30 - d, d / 30).pose).toBe('fresh');
  });

  it('early month: hands in pockets', () => {
    expect(walker(5, 25, 5 / 30).pose).toBe('easy');
    expect(walker(10, 20, 10 / 30).pose).toBe('easy');
  });

  it('middle: checking his phone', () => {
    expect(walker(12, 18, 0.4).pose).toBe('phone');
    expect(walker(20, 10, 20 / 30).pose).toBe('phone');
  });

  it('last week: backpack on', () => {
    expect(walker(23, 7, 23 / 30).pose).toBe('focus');
    expect(walker(25, 3, 25 / 28).pose).toBe('focus');
  });

  it('last 2 days: jogging, almost there', () => {
    expect(walker(28, 2, 28 / 30).pose).toBe('almost');
    expect(walker(29, 1, 29 / 30).pose).toBe('almost');
  });

  it('stands where the line is, from far left to far right', () => {
    expect(walker(10, 20, 1 / 3).at).toBeCloseTo(1 / 3);
    expect(walker(29, 1, 29 / 30).at).toBeCloseTo(29 / 30);
    expect(walker(5, 25, -0.2).at).toBe(0);
    expect(walker(5, 25, 1.4).at).toBe(1);
  });

  it('a short month still goes fresh → … → almost in order', () => {
    const order = ['fresh', 'easy', 'phone', 'focus', 'almost'];
    let last = 0;
    for (let d = 1; d < 28; d++) {
      const i = order.indexOf(walker(d, 28 - d, d / 28).pose);
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });
});
