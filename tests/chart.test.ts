import { describe, expect, it } from 'vitest';
import { chartGeometry, smoothPath } from '../src/lib/chart';

// The net worth graph: a smooth line through every month, a clean zero line only when it matters.
describe('smoothPath', () => {
  const pts = [
    { x: 0, y: 100 },
    { x: 50, y: 40 },
    { x: 100, y: 70 },
    { x: 150, y: 10 },
  ];

  it('starts at the first point and passes through every point', () => {
    const d = smoothPath(pts);
    expect(d.startsWith('M0,100')).toBe(true);
    for (const p of pts.slice(1)) expect(d).toContain(`${p.x},${p.y}`);
  });

  it('never overshoots between two points (no fake bumps above or below the data)', () => {
    const d = smoothPath(pts);
    const ys = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });

  it('a single point or two points still draw', () => {
    expect(smoothPath([{ x: 5, y: 5 }])).toBe('M5,5');
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toContain('10,10');
  });
});

describe('chartGeometry', () => {
  const months = ['2026-04', '2026-05', '2026-06'];
  const g = (vals: number[]) => chartGeometry(months.map((m, i) => ({ month: m, value: vals[i] })), 300, 120);

  it('puts the first month at the left edge and the last at the right edge', () => {
    const r = g([10, 20, 30]);
    expect(r.points[0].x).toBe(r.left);
    expect(r.points[2].x).toBe(r.right);
  });

  it('higher values sit higher up', () => {
    const r = g([10, 20, 30]);
    expect(r.points[2].y).toBeLessThan(r.points[0].y);
  });

  it('no zero line when everything is above zero; a zero line when the line crosses it', () => {
    expect(g([10, 20, 30]).zeroY).toBeNull();
    const r = g([-50, 20, 30]);
    expect(r.zeroY).not.toBeNull();
    expect(r.zeroY!).toBeGreaterThan(r.points[1].y);
    expect(r.zeroY!).toBeLessThan(r.points[0].y);
  });

  it('a flat line sits in the middle instead of dividing by zero', () => {
    const r = g([5, 5, 5]);
    for (const p of r.points) expect(Number.isFinite(p.y)).toBe(true);
  });
});
