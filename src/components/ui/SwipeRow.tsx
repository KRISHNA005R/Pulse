import { useEffect, useRef, useState, type PointerEvent as RPE, type ReactNode } from 'react';
import { haptic } from '../../lib/format';
import { Icon } from './Icon';

// A list row that swipes left to show round buttons, like iPhone: an optional dark one (Split, Edit…)
// and a red Delete. A full swipe deletes. The same on Activity and in Splits.

// Round buttons: two 52px circles with a 10px gap and 8px either side.
const BTN = 52;
const GAP = 10;
const FULL_SWIPE = 0.62; // share of the row width that turns a swipe into delete

export type SwipeAction = { label: string; icon: string; run: () => void };

export function SwipeRow({
  id,
  onTap,
  action,
  onDelete,
  className = '',
  rowClassName = '',
  children,
}: {
  /** Unique per row: only one row is open at a time. */
  id: string;
  onTap: () => void;
  /** The dark button next to Delete. */
  action?: SwipeAction;
  /** Without it, the row doesn't swipe. */
  onDelete?: () => void;
  className?: string;
  rowClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const rowRef = useRef<HTMLButtonElement>(null);
  const liRef = useRef<HTMLLIElement>(null);
  const actRef = useRef<HTMLButtonElement>(null);
  const delRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; base: number; active: boolean; t: number; lastX: number; lastT: number; v: number; armed: boolean } | null>(null);
  const moved = useRef(false);
  const swipes = !!onDelete;
  const actionsW = action ? BTN * 2 + GAP + 16 : BTN + 16;

  // Paint a drag position straight onto the DOM: no React render per frame, so it tracks the finger.
  const paint = (x: number, animate: boolean) => {
    const row = rowRef.current;
    const sp = actRef.current;
    const del = delRef.current;
    const li = liRef.current;
    if (!row || !del || !li) return;
    const w = li.clientWidth;
    const ease = 'cubic-bezier(.2,.9,.25,1.12)';
    const t = animate ? `transform .42s ${ease}` : 'none';
    row.style.transition = t;
    row.style.transform = x ? `translate3d(${x}px,0,0)` : '';
    const reveal = Math.min(1, -x / actionsW);
    const full = -x > w * FULL_SWIPE;
    // Past the full-swipe point, delete stretches across the whole row.
    const a = Math.min(1, Math.max(0, (reveal - 0.05) / 0.5));
    const b = Math.min(1, Math.max(0, (reveal - 0.3) / 0.55));
    const tr = animate ? `transform .42s ${ease}, opacity .25s ease, width .28s ${ease}` : 'width .22s cubic-bezier(.2,.9,.25,1), transform .12s linear, opacity .12s linear';
    del.style.transition = tr;
    // Delete sits at the edge so it shows first; the other button follows it in.
    del.style.opacity = String(full ? 1 : a);
    del.style.transform = `scale(${full ? 1 : 0.55 + a * 0.45})`;
    if (sp) {
      sp.style.transition = tr;
      // A full swipe: the other button stays in place, dimmed, while Delete stretches toward it (like iPhone).
      sp.style.opacity = full ? '0.35' : String(b);
      sp.style.transform = `scale(${0.55 + b * 0.45}) translateX(${(1 - b) * 30}px)`;
    }
    // Delete grows from a circle into a long pill that fills the space the row leaves behind.
    const room = -x - 16 - (sp ? BTN + GAP : 0);
    del.style.width = full ? `${Math.max(BTN, room)}px` : `${BTN}px`;
    li.dataset.full = full ? '1' : '';
  };

  useEffect(() => {
    // Only one row open at a time, and a tap anywhere else closes it.
    if (!open) return;
    const onOther = (e: Event) => (e as CustomEvent).detail !== id && close();
    const onDownAway = (e: PointerEvent) => !liRef.current?.contains(e.target as Node) && close();
    window.addEventListener('pulse-swipe-open', onOther);
    window.addEventListener('pointerdown', onDownAway, true);
    return () => {
      window.removeEventListener('pulse-swipe-open', onOther);
      window.removeEventListener('pointerdown', onDownAway, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    paint(0, true);
  };
  const openRow = () => {
    setOpen(true);
    paint(-actionsW, true);
    window.dispatchEvent(new CustomEvent('pulse-swipe-open', { detail: id }));
  };
  const remove = () => {
    if (!onDelete) return;
    const li = liRef.current;
    const row = rowRef.current;
    haptic(18);
    setLeaving(true);
    if (!li || !row || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return onDelete();
    // Slide the row off, then fold the gap shut, then delete (the toast offers Undo).
    row.style.transition = 'transform .26s cubic-bezier(.5,0,.75,0)';
    row.style.transform = `translate3d(${-li.clientWidth - 40}px,0,0)`;
    li.style.height = `${li.offsetHeight}px`;
    window.setTimeout(() => {
      li.style.transition = 'height .26s cubic-bezier(.4,0,.2,1), opacity .26s ease, margin .26s ease';
      li.style.height = '0px';
      li.style.opacity = '0';
    }, 200);
    window.setTimeout(onDelete, 470);
  };

  const onClickRow = () => {
    if (moved.current) return;
    if (open) return close();
    onTap();
  };

  const onDown = (e: RPE) => {
    if (!swipes || e.pointerType === 'mouse' || leaving) return;
    const base = open ? -actionsW : 0;
    drag.current = { x: e.clientX, y: e.clientY, base, active: false, t: performance.now(), lastX: e.clientX, lastT: performance.now(), v: 0, armed: false };
    moved.current = false;
  };
  const onMove = (e: RPE) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (drag.current = null); // it's a scroll
      if (Math.abs(dx) < 8) return;
      d.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    moved.current = true;
    const now = performance.now();
    d.v = (e.clientX - d.lastX) / Math.max(1, now - d.lastT);
    d.lastX = e.clientX;
    d.lastT = now;
    let x = d.base + dx;
    const w = liRef.current?.clientWidth ?? 360;
    if (x > 0) x = x * 0.25; // rubber band to the right
    if (x < -w) x = -w + (x + w) * 0.2;
    paint(x, false);
    const full = -x > w * FULL_SWIPE;
    if (full !== d.armed) {
      d.armed = full;
      haptic(full ? 14 : 6); // a tick when full-swipe delete arms or disarms
    } else if (!open && -x > 60 && -x < 64) haptic(4);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    window.setTimeout(() => (moved.current = false), 60);
    if (!d || !d.active) return;
    const row = rowRef.current;
    const x = row ? new DOMMatrixReadOnly(getComputedStyle(row).transform).m41 : 0;
    if (d.armed) return remove();
    if (d.v < -0.45 || (d.v <= 0.3 && -x > actionsW * 0.42)) openRow();
    else close();
  };

  return (
    <li ref={liRef} className={`group/row relative overflow-hidden ${className}`}>
      {swipes && (
        // swipe actions (touch): revealed as the row slides left
        <div className="absolute inset-y-0 right-0 flex items-center justify-end gap-[10px] pr-2" aria-hidden={!open}>
          {action && (
            <button
              ref={actRef}
              type="button"
              tabIndex={open ? 0 : -1}
              aria-label={action.label}
              style={{ opacity: 0, transform: 'scale(.55)', width: BTN, height: BTN }}
              className="grid shrink-0 origin-right place-items-center rounded-full bg-ink text-bg active:brightness-90"
              onClick={() => {
                close();
                action.run();
              }}
            >
              <Icon name={action.icon} size={21} />
            </button>
          )}
          <button
            ref={delRef}
            type="button"
            tabIndex={open ? 0 : -1}
            aria-label="Delete"
            style={{ opacity: 0, transform: 'scale(.55)', width: BTN, height: BTN }}
            className="flex shrink-0 origin-right items-center justify-start overflow-hidden rounded-full bg-[#B83424] pl-[15.5px] text-white active:brightness-90"
            onClick={remove}
          >
            <Icon name="trash" size={21} className="shrink-0 group-data-[full='1']/row:animate-wiggle" />
          </button>
        </div>
      )}
      <button
        ref={rowRef}
        type="button"
        onClick={onClickRow}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ touchAction: 'pan-y' }}
        className={`relative flex w-full items-center gap-3 text-left will-change-transform ${rowClassName}`}
      >
        {children}
      </button>
    </li>
  );
}
