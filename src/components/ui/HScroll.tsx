import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * A row that scrolls sideways. Touch and trackpads work as usual; on a laptop with a mouse, the wheel
 * scrolls it sideways, you can click and drag it, and small ‹ › arrows show when there's more to see.
 * `focusKey`: when it changes, the item matching `focusSelector` is scrolled into view (for a choice
 * the app made by itself, like a category picked from what you typed).
 */
export function HScroll({
  children,
  className = '',
  outerClassName = '',
  testId,
  focusKey,
  focusSelector = '[aria-pressed="true"], [aria-checked="true"]',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; outerClassName?: string; testId?: string; focusKey?: unknown; focusSelector?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ back: false, on: false });
  const still = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ back: el.scrollLeft > 2, on: el.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    // Mouse wheel: scroll sideways while the pointer is over the row (only if it can still move that way).
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || e.ctrlKey) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return;
      e.preventDefault();
      el.scrollLeft = next;
    };
    // Click and drag with a mouse. A drag doesn't count as a tap on the button under it.
    let start: { x: number; left: number; id: number } | null = null;
    let dragged = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      start = { x: e.clientX, left: el.scrollLeft, id: e.pointerId };
      dragged = false;
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      if (!dragged && Math.abs(dx) < 5) return;
      if (!dragged) {
        dragged = true;
        el.setPointerCapture?.(e.pointerId);
        el.style.cursor = 'grabbing';
      }
      el.scrollLeft = start.left - dx;
    };
    const up = () => {
      start = null;
      el.style.cursor = '';
    };
    const click = (e: MouseEvent) => {
      if (!dragged) return;
      e.preventDefault();
      e.stopPropagation();
      dragged = false;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
    };
  }, [measure]);

  // Bring the chosen item into view when the choice changes.
  useEffect(() => {
    const el = ref.current;
    if (!el || focusKey === undefined) return;
    const item = el.querySelector<HTMLElement>(focusSelector);
    if (!item) return;
    const a = item.offsetLeft;
    const b = a + item.offsetWidth;
    if (a >= el.scrollLeft && b <= el.scrollLeft + el.clientWidth) return;
    el.scrollTo({ left: Math.max(0, a - (el.clientWidth - item.offsetWidth) / 2), behavior: still ? 'auto' : 'smooth' });
  }, [focusKey, focusSelector, still]);

  const go = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: still ? 'auto' : 'smooth' });
  };
  const arrow = 'hscroll-arrow tap absolute top-1/2 z-[1] h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-ink shadow-soft hover:bg-sunk';

  return (
    <div className={`relative ${outerClassName}`}>
      <div ref={ref} data-testid={testId} className={`relative ${className}`} {...rest}>
        {children}
      </div>
      {edges.back && (
        <button type="button" aria-label="Scroll back" className={`${arrow} left-1`} onClick={() => go(-1)}>
          <Icon name="back" size={16} />
        </button>
      )}
      {edges.on && (
        <button type="button" aria-label="Scroll on" className={`${arrow} right-1`} onClick={() => go(1)}>
          <Icon name="chevron" size={16} />
        </button>
      )}
    </div>
  );
}
