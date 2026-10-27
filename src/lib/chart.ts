// Geometry for small line charts (the net worth graph): a smooth line that goes through every point
// without inventing bumps above or below the data, and a zero line only when the data crosses zero.

export type Pt = { x: number; y: number };

const f = (n: number) => +n.toFixed(1);

/** A smooth SVG path through the points (monotone cubic: never overshoots between two points). */
export function smoothPath(p: Pt[]): string {
  if (!p.length) return '';
  if (p.length === 1) return `M${f(p[0].x)},${f(p[0].y)}`;
  const n = p.length;
  const d: number[] = []; // slope of each segment
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1].y - p[i].y) / (p[i + 1].x - p[i].x || 1));
  // Tangents (Fritsch–Carlson), flattened at peaks and dips so the curve stays inside the data.
  const m: number[] = p.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let out = `M${f(p[0].x)},${f(p[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (p[i + 1].x - p[i].x) / 3;
    out += ` C${f(p[i].x + dx)},${f(p[i].y + m[i] * dx)} ${f(p[i + 1].x - dx)},${f(p[i + 1].y - m[i + 1] * dx)} ${f(p[i + 1].x)},${f(p[i + 1].y)}`;
  }
  return out;
}

/** Where each month sits in a w × h box, plus the zero line (null when every value is on one side). */
export function chartGeometry(h: { month: string; value: number }[], w: number, height: number) {
  const left = 8;
  const right = w - 8;
  const top = 14;
  const bottom = height - 8;
  const vals = h.map((x) => x.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo;
  const y = (v: number) => (span ? top + ((hi - v) * (bottom - top)) / span : (top + bottom) / 2);
  const x = (i: number) => (h.length > 1 ? left + (i * (right - left)) / (h.length - 1) : (left + right) / 2);
  const points: Pt[] = h.map((p, i) => ({ x: f(x(i)), y: f(y(p.value)) }));
  const zeroY = lo < 0 && hi > 0 ? f(y(0)) : null;
  return { points, left, right, top, bottom, zeroY };
}
