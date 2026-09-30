import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Icon } from './Icon';
import { haptic } from '../../lib/format';
import { burst } from '../../lib/celebrate';

const KNOB = 46;
const PAD = 6;

/**
 * Swipe the round knob to the end to confirm. The trail fills behind it, and
 * letting go early springs it back. Tapping or pressing Enter/Space slides it
 * across by itself, so it still works with a mouse, keyboard or screen reader.
 */
export function SwipeToConfirm({ label, disabled, disabledLabel, done, doneLabel, onConfirm }: { label: string; disabled?: boolean; disabledLabel?: string; done?: boolean; doneLabel?: string; onConfirm: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [locked, setLocked] = useState(false);
  const start = useRef<{ px: number; x: number; moved: boolean } | null>(null);
  const buzzed = useRef(false);

  const max = () => Math.max(1, (track.current?.clientWidth ?? 320) - KNOB - PAD * 2);

  useEffect(() => {
    if (disabled && !locked) setX(0);
  }, [disabled, locked]);

  const finish = () => {
    if (locked) return;
    setLocked(true);
    setX(max());
    haptic(16);
    // Pop from where the knob lands at the end of the track.
    const r = track.current?.getBoundingClientRect();
    window.setTimeout(() => r && burst({ kind: 'mini', x: r.right - KNOB / 2 - PAD, y: r.top + r.height / 2, power: 0.9 }), 180);
    window.setTimeout(onConfirm, 260);
  };

  const onDown = (e: PointerEvent) => {
    if (disabled || locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, x, moved: false };
    buzzed.current = false;
    setDragging(true);
  };
  const onMove = (e: PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.px;
    if (Math.abs(dx) > 4) s.moved = true;
    const nx = Math.min(max(), Math.max(0, s.x + dx));
    setX(nx);
    if (nx > max() * 0.8 && !buzzed.current) {
      buzzed.current = true;
      haptic(8);
    }
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s) return;
    if (!s.moved) {
      finish(); // a plain tap slides it across
      return;
    }
    if (x > max() * 0.7) finish();
    else setX(0);
  };
  const onKey = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      finish();
    }
  };

  const p = x / max();
  const text = done ? doneLabel ?? 'Done' : disabled ? disabledLabel ?? label : label;

  return (
    <div
      ref={track}
      className={`relative h-[58px] w-full select-none overflow-hidden rounded-full transition-colors duration-300 ${disabled ? 'bg-sunk' : 'bg-pill'}`}
      style={{ touchAction: 'pan-y' }}
    >
      {/* trail */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-accent"
        style={{
          width: x + KNOB + PAD * 2,
          opacity: disabled ? 0 : 0.18 + p * 0.82,
          transition: dragging ? 'none' : 'width 520ms cubic-bezier(.22,1.2,.36,1), opacity 400ms ease',
        }}
        aria-hidden="true"
      />
      {/* a light sweep across the track while it waits */}
      {!disabled && !done && !dragging && x === 0 && <div className="shine pointer-events-none absolute inset-0 animate-shimmer rounded-full opacity-60 mix-blend-overlay" aria-hidden="true" />}
      {/* label */}
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-2 pl-12 pr-5 text-[16px] font-semibold ${disabled ? 'text-ink3' : done ? 'text-on-accent' : 'text-pill-fg'}`}
        style={{ opacity: done ? 1 : Math.max(0, 1 - p * 1.4), transition: dragging ? 'none' : 'opacity 300ms ease, color 200ms' }}
        aria-hidden="true"
      >
        <span className="truncate">{text}</span>
        {!disabled && !done && (
          <span className="flex shrink-0 text-[15px] opacity-70">
            <span className="animate-nudge">›</span>
            <span className="animate-nudge [animation-delay:120ms]">›</span>
            <span className="animate-nudge [animation-delay:240ms]">›</span>
          </span>
        )}
      </div>
      {/* knob */}
      <button
        type="button"
        aria-label={disabled ? disabledLabel ?? label : `${label}. Swipe right, or press to confirm.`}
        aria-disabled={disabled || undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className={`absolute top-[6px] grid h-[46px] w-[46px] place-items-center rounded-full shadow-[0_6px_16px_-6px_rgb(0_0_0/0.45)] ${disabled ? 'cursor-not-allowed bg-line text-ink3 shadow-none' : `cursor-grab bg-accent text-on-accent active:cursor-grabbing ${!dragging && x === 0 && !done ? 'animate-ring' : ''}`}`}
        style={{
          left: PAD,
          transform: `translateX(${x}px)`,
          transition: dragging ? 'none' : 'transform 520ms cubic-bezier(.22,1.2,.36,1), background-color 200ms',
          touchAction: 'none',
        }}
      >
        <Icon name={done ? 'check' : 'arrow-right'} size={20} strokeWidth={2.4} className={done ? 'animate-pop' : ''} />
      </button>
    </div>
  );
}
