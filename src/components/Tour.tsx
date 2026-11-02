import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { rupees } from '../lib/format';
import { reducedMotion } from '../lib/motion';

/**
 * A short tour for new people, on the real Home screen: the screen dims, one thing at a time is lit
 * up, and a small bubble says what it is in one line. Five steps, about 20 seconds. Skip any time;
 * finishing or skipping means it's not shown again (You → "Show the tour again" brings it back).
 */
export const TOUR_STEPS = [
  { key: 'safe', title: 'Safe to spend', text: 'What you can spend until payday, after bills, SIPs and savings.' },
  { key: 'add', title: 'Add a spend', text: "Log a spend in 2 taps. Try typing 'chai 20'." },
  { key: 'ai', title: 'PULSE AI', text: `Ask anything, like 'Can I afford a ${rupees(2000)} dinner?'` },
  { key: 'plans', title: 'Plans', text: 'Goals, splits with friends, bhisi and budgets.' },
  { key: 'you', title: 'You', text: 'Spending history, net worth, investments and settings.' },
] as const;

/** The first visible element marked for a step (the phone and desktop layouts each have their own). */
function findTarget(key: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`))) {
    // Size only: a card that's still rising in is briefly hidden, but it's there.
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

type Box = { top: number; left: number; width: number; height: number };
const PAD = 8;

export function Tour() {
  const { state, endTour } = useStore();
  const ui = useUI();
  const show = state.mode === 'personal' && !!state.settings.tourPending && ui.tab === 'home' && ui.depth === 0 && !ui.sheets.length;
  if (!show) return null;
  return <TourSteps onEnd={endTour} />;
}

function TourSteps({ onEnd }: { onEnd: () => void }) {
  const steps = TOUR_STEPS;
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [ready, setReady] = useState(false);
  const bubble = useRef<HTMLDivElement>(null);
  const still = reducedMotion();
  const step = steps[i];
  const last = i === steps.length - 1;

  // Find and measure this step's target; skip the step if it isn't on screen in this layout.
  const measure = useCallback(() => {
    const el = findTarget(step.key);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    return true;
  }, [step.key]);

  useLayoutEffect(() => {
    // The screen may still be opening: look for the target for up to ~1.5 s before skipping the step.
    let tries = 0;
    let timer = 0;
    const find = () => {
      const el = findTarget(step.key);
      if (!el) {
        if (++tries < 10) timer = window.setTimeout(find, 150);
        else if (last) onEnd();
        else setI((n) => n + 1);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 90) el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
      measure();
    };
    find();
    return () => window.clearTimeout(timer);
  }, [step.key, last, onEnd, measure, still]);

  // Keep the light on the target while the page scrolls or the window changes size.
  useEffect(() => {
    const on = () => measure();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    const t = window.setInterval(on, 250);
    const r = window.setTimeout(() => setReady(true), still ? 0 : 450);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
      window.clearInterval(t);
      window.clearTimeout(r);
    };
  }, [measure, still]);

  useEffect(() => {
    bubble.current?.focus({ preventScroll: true });
  }, [i, ready]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEnd();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onEnd]);

  if (!box) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const W = Math.min(320, vw - 32);
  // The bubble goes below the target when there's room, otherwise above it.
  const below = box.top + box.height + 190 < vh;
  const center = box.left + box.width / 2;
  const left = Math.max(16, Math.min(vw - W - 16, center - W / 2));
  const arrow = Math.max(18, Math.min(W - 18, center - left));
  const move = still ? '' : 'transition-all duration-300 ease-out';

  return (
    <div className="fixed inset-0 z-[80]" data-testid="tour">
      {/* Catches taps so nothing behind the tour is pressed by accident. */}
      <div className="absolute inset-0" aria-hidden="true" />
      <div
        aria-hidden="true"
        data-testid="tour-spot"
        className={`pointer-events-none absolute rounded-2xl ring-2 ring-[#EC5B2B] ${move}`}
        style={{ top: box.top, left: box.left, width: box.width, height: box.height, boxShadow: '0 0 0 9999px rgb(23 20 15 / 0.62)' }}
      />
      <div
        ref={bubble}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        data-testid="tour-bubble"
        className={`absolute rounded-2xl bg-[#17140F] p-4 text-[#FFFBF4] shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-white/15 outline-none ${move} ${ready ? 'opacity-100' : 'opacity-0'}`}
        style={below ? { top: box.top + box.height + 12, left, width: W } : { top: box.top - 12, left, width: W, transform: 'translateY(-100%)' }}
      >
        <span aria-hidden="true" className="absolute h-3 w-3 rotate-45 bg-[#17140F]" style={below ? { top: -6, left: arrow - 6 } : { bottom: -6, left: arrow - 6 }} />
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#FFFBF4]/60">
          {i + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="display mt-1 text-[18px] leading-tight">
          {step.title}
        </h2>
        <p id="tour-text" className="mt-1 text-[14.5px] leading-snug text-[#FFFBF4]/85">
          {step.text}
        </p>
        <div className="mt-3.5 flex items-center justify-between gap-2">
          {last ? (
            <span />
          ) : (
            <button type="button" onClick={onEnd} className="tap min-h-[40px] px-1 text-[14px] font-semibold text-[#FFFBF4]/70 hover:text-[#FFFBF4]">
              Skip
            </button>
          )}
          <button type="button" onClick={() => (last ? onEnd() : setI(i + 1))} className="tap min-h-[40px] rounded-full bg-[#EC5B2B] px-5 text-[14.5px] font-semibold text-[#17140F]">
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
