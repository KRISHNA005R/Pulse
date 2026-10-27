// Net worth by month: a smooth line that draws itself in, with today's dot popping in at the end.
// The latest month is picked to start; tap a month (or drag along the line) to see its value.
// A ₹0 line shows only when net worth crosses zero, labelled on the left, away from today's dot.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { chartGeometry, smoothPath } from '../lib/chart';
import { sym } from '../lib/currency';
import { monthName, rupees } from '../lib/format';

const W = 320;
const H = 132;

export function NetWorthChart({ history }: { history: { month: string; value: number }[] }) {
  const g = useMemo(() => chartGeometry(history, W, H), [history]);
  const line = useMemo(() => smoothPath(g.points), [g]);
  const area = `${line} L${g.right},${H} L${g.left},${H} Z`;
  const last = history.length - 1;
  const [sel, setSel] = useState(last);
  useEffect(() => setSel(last), [last]);
  const svg = useRef<SVGSVGElement>(null);
  const p = g.points[Math.min(sel, last)];
  const v = history[Math.min(sel, last)];
  const at = (p.x / W) * 100;
  const label = (m: string) => monthName(`${m}-01`).slice(0, 3);
  // Drag along the line: the nearest month follows the finger.
  const follow = (e: PointerEvent<SVGSVGElement>) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    g.points.forEach((q, i) => {
      if (Math.abs(q.x - x) < Math.abs(g.points[best].x - x)) best = i;
    });
    setSel(best);
  };

  return (
    <figure className="nw-chart mt-6" data-testid="nw-chart">
      <div className="relative">
        {/* The value for the picked month, above its dot */}
        <div
          data-testid="nw-readout"
          data-month={v.month}
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-xl bg-ink px-2.5 py-1.5 text-bg shadow-soft"
          style={{ left: `${at}%`, top: `${(p.y / H) * 100}%`, transform: `translate(${at < 18 ? '-12%' : at > 82 ? '-88%' : '-50%'}, calc(-100% - 12px))` }}
          aria-live="polite"
        >
          <span className="block text-[11px] font-semibold leading-tight opacity-70">{monthName(`${v.month}-01`)}</span>
          <span className="num block text-[14px] font-bold leading-tight">{rupees(v.value)}</span>
        </div>
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-pan-y overflow-visible"
          role="img"
          aria-label={`Net worth by month: ${history.map((x) => `${monthName(`${x.month}-01`)} ${rupees(x.value)}`).join(', ')}`}
          onPointerDown={follow}
          onPointerMove={(e) => e.buttons && follow(e)}
        >
          {g.zeroY !== null && (
            <g data-testid="nw-zero">
              <line x1={g.left} x2={g.right} y1={g.zeroY} y2={g.zeroY} stroke="rgb(var(--ink3) / .45)" strokeDasharray="3 4" />
              <text data-testid="nw-zero-label" x={g.left} y={g.zeroY - 5} fontSize="10" fill="rgb(var(--ink3))">
                {sym()}0
              </text>
            </g>
          )}
          <path className="nw-area" d={area} fill="rgb(var(--accent) / .12)" />
          <line x1={p.x} x2={p.x} y1={p.y} y2={H} stroke="rgb(var(--ink) / .14)" strokeWidth="1.5" />
          <path data-testid="nw-line" className="nw-draw" d={line} pathLength={1} fill="none" stroke="rgb(var(--accent))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {g.points.map((q, i) => (
            <circle key={history[i].month} className="nw-dot" style={{ animationDelay: `${0.25 + (i / Math.max(1, last)) * 0.85}s` }} cx={q.x} cy={q.y} r={i === sel ? 0 : 2.6} fill="rgb(var(--surface))" stroke="rgb(var(--accent))" strokeWidth="1.8" />
          ))}
          {sel === last && <circle className="nw-ring" cx={p.x} cy={p.y} r="6" fill="none" stroke="rgb(var(--accent))" strokeWidth="2" />}
          <circle className="nw-dot" style={{ animationDelay: '1.05s' }} cx={p.x} cy={p.y} r="6" fill="rgb(var(--accent))" stroke="rgb(var(--surface))" strokeWidth="2.5" />
        </svg>
      </div>
      {/* Months: tap one to see its value */}
      <div className="relative mt-2 h-7">
        {history.map((x, i) => {
          const left = (g.points[i].x / W) * 100;
          return (
            <button
              key={x.month}
              type="button"
              data-month={x.month}
              aria-pressed={i === sel}
              aria-label={`${monthName(`${x.month}-01`)}: ${rupees(x.value)}`}
              onClick={() => setSel(i)}
              className={`absolute top-0 grid h-7 min-w-[30px] place-items-center rounded-full px-1 text-[12px] ${i === sel ? 'bg-sunk font-semibold text-ink' : 'text-ink3'}`}
              style={{ left: `${left}%`, transform: `translateX(${i === 0 ? '-8%' : i === last ? '-92%' : '-50%'})` }}
            >
              {label(x.month)}
            </button>
          );
        })}
      </div>
      <figcaption className="sr-only">Net worth by month, from {monthName(`${history[0].month}-01`)} to now.</figcaption>
    </figure>
  );
}
