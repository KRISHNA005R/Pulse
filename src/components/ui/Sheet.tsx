import { useEffect, useId, useRef, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Sheet: a bottom sheet on phones, a centred modal on wider screens.
 * Accessible dialog: labelled, focus moves in and is trapped, Esc closes,
 * focus returns to the opener.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  size = 'md',
  hideTitle,
  tone = 'surface',
  z = 0,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  hideTitle?: boolean;
  tone?: 'surface' | 'bg';
  z?: number;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('input, button, textarea, select, [tabindex]:not([tabindex="-1"])');
    window.setTimeout(() => first?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (!el || dialogs[dialogs.length - 1] !== el) return; // only the top-most sheet reacts
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const f = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const a = f[0];
        const b = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
      (opener.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag to dismiss: pull the grab bar (or the title row) down to close, or tap the bar.
  const drag = useRef<{ y: number; t: number; dy: number; id: number; fromHandle: boolean } | null>(null);
  const closing = useRef(false);
  const animateOut = () => {
    const el = ref.current;
    if (!el || closing.current) return;
    closing.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return onClose();
    el.style.transition = 'transform .2s cubic-bezier(.4,0,1,1)';
    el.style.transform = 'translateY(105%)';
    const backdrop = el.previousElementSibling as HTMLElement | null;
    if (backdrop) {
      backdrop.style.transition = 'opacity .2s';
      backdrop.style.opacity = '0';
    }
    window.setTimeout(onClose, 190);
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button:not([data-grab]), a, input, select, textarea')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, id: e.pointerId, fromHandle: !!(e.target as HTMLElement).closest('[data-grab]') };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (ref.current) ref.current.style.transition = 'none';
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !ref.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    ref.current.style.transform = d.dy ? `translateY(${d.dy}px)` : '';
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    const el = ref.current;
    if (!d || !el) return;
    const speed = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > Math.min(140, el.offsetHeight * 0.25) || (d.dy > 24 && speed > 0.6) || (d.fromHandle && d.dy < 6 && e.type === 'pointerup')) {
      animateOut();
    } else {
      el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
      el.style.transform = '';
    }
  };
  const grab = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  // On touch screens, pulling down on the content when it is already scrolled to the top
  // drags the whole sheet, like native bottom sheets.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sc = body.current;
    const el = ref.current;
    if (!sc || !el) return;
    let start: { y: number; x: number; t: number } | null = null;
    let dy = 0;
    let active = false;
    const ts = (e: TouchEvent) => {
      const tg = e.target as HTMLElement;
      if (e.touches.length !== 1 || sc.scrollTop > 0 || tg.closest('input[type=range], textarea, [data-no-drag]')) return (start = null);
      // A scrolled list inside the sheet (like the chat) scrolls first.
      for (let n: HTMLElement | null = tg; n && n !== sc; n = n.parentElement) if (n.scrollTop > 0) return (start = null);
      start = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: performance.now() };
      dy = 0;
      active = false;
    };
    const tm = (e: TouchEvent) => {
      if (!start) return;
      const d = e.touches[0].clientY - start.y;
      const dx = Math.abs(e.touches[0].clientX - start.x);
      if (!active) {
        if (d > 8 && d > dx && sc.scrollTop <= 0) {
          active = true;
          start.y = e.touches[0].clientY;
          el.style.transition = 'none';
        } else if (d < -4 || dx > 10) {
          start = null;
          return;
        } else return;
      }
      e.preventDefault();
      dy = Math.max(0, e.touches[0].clientY - start.y);
      el.style.transform = dy ? `translateY(${dy}px)` : '';
    };
    const te = () => {
      if (start && active) {
        const speed = dy / Math.max(1, performance.now() - start.t);
        if (dy > Math.min(160, el.offsetHeight * 0.28) || (dy > 30 && speed > 0.6)) animateOut();
        else {
          el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
          el.style.transform = '';
        }
      }
      start = null;
      active = false;
    };
    sc.addEventListener('touchstart', ts, { passive: true });
    sc.addEventListener('touchmove', tm, { passive: false });
    sc.addEventListener('touchend', te);
    sc.addEventListener('touchcancel', te);
    return () => {
      sc.removeEventListener('touchstart', ts);
      sc.removeEventListener('touchmove', tm);
      sc.removeEventListener('touchend', te);
      sc.removeEventListener('touchcancel', te);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const width = size === 'sm' ? 'md:max-w-[420px]' : size === 'lg' ? 'md:max-w-[640px]' : size === 'full' ? 'md:max-w-[760px]' : 'md:max-w-[520px]';
  const height = size === 'full' ? 'h-[94dvh] md:h-[86vh]' : 'max-h-[92dvh] md:max-h-[86vh]';

  return (
    <div className="fixed inset-0 flex items-end justify-center md:items-center md:p-6" style={{ zIndex: 60 + z }}>
      <div className="absolute inset-0 animate-fade bg-[rgb(24_14_6/0.45)]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`relative flex w-full ${width} ${height} animate-sheet flex-col overflow-hidden rounded-t-3xl md:animate-rise md:rounded-3xl ${tone === 'bg' ? 'bg-bg' : 'bg-surface'} shadow-lift`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div {...grab} className="shrink-0 touch-none select-none md:cursor-grab">
          <button type="button" data-grab tabIndex={-1} aria-hidden="true" onClick={(e) => e.preventDefault()} className="mx-auto flex h-6 w-24 cursor-grab items-center justify-center md:hidden">
            <span className="h-1 w-10 rounded-full bg-line" />
          </button>
        </div>
        <div {...grab} className={`flex shrink-0 touch-none items-center gap-2 px-5 pb-2 pt-1 ${hideTitle ? 'absolute right-0 top-1 z-10' : ''}`}>
          <h2 id={id} className={hideTitle ? 'sr-only' : 'display flex-1 text-[19px] leading-tight'}>
            {title}
          </h2>
          <button type="button" onClick={onClose} className="tap -mr-2 grid h-10 w-10 place-items-center rounded-full text-ink2 hover:bg-sunk" aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="shrink-0 border-t border-line bg-inherit px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
