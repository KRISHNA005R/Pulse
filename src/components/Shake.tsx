import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { haptic } from '../lib/format';
import { askMotion, canShake, firstShake, motionAllowed, setShake, shakeOn, watchShake } from '../lib/shake';
import { Icon } from './ui/Icon';

/** Shake the phone and the "add money" sheet opens. Call once from the app shell. */
export function useShakeToAdd() {
  const store = useStore();
  const ui = useUI();
  const ready = store.state.onboarding.done;
  const [on, setOn] = useState(() => canShake() && shakeOn());
  useEffect(() => {
    const sync = () => setOn(canShake() && shakeOn());
    window.addEventListener('pulse-shake', sync);
    return () => window.removeEventListener('pulse-shake', sync);
  }, []);
  // Whether a sheet is open, as of the moment of a shake.
  const sheetOpen = useRef(false);
  sheetOpen.current = ui.sheets.length > 0;
  useEffect(() => {
    if (!on || !ready) return;
    const open = () => {
      // Not while a sheet is open, not while the person is typing, not while PULSE is in the background.
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (document.visibilityState !== 'visible' || sheetOpen.current || typing) return;
      haptic(18);
      ui.openSheet({ type: 'composer' });
      if (firstShake()) store.toast({ text: 'You shook your phone, so this opened. Turn it off any time in You.', emoji: '📳' });
    };
    if (motionAllowed()) return watchShake(open);
    // iPhone: motion is only given from a tap. It was allowed when this was switched on; a fresh
    // start of the app may need it again, so the first tap anywhere asks (no pop-up if still allowed).
    let stop = () => {};
    let live = true;
    const first = () => {
      window.removeEventListener('pointerup', first);
      void askMotion().then((ok) => {
        if (!live) return;
        if (ok) stop = watchShake(open);
        else setShake(false);
      });
    };
    window.addEventListener('pointerup', first);
    return () => {
      live = false;
      window.removeEventListener('pointerup', first);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, ready]);
}

/** The switch in You. Hidden on devices that can't feel a shake. */
export function ShakeRow() {
  const store = useStore();
  const [on, setOn] = useState(shakeOn);
  if (!canShake()) return null;
  const flip = async () => {
    if (on) {
      setShake(false);
      return setOn(false);
    }
    // On iPhone this tap is what lets PULSE ask for motion.
    if (!(await askMotion())) return store.toast({ text: 'Your phone didn’t allow motion, so shake can’t work. Allow it when your phone asks, then try again.' });
    setShake(true);
    setOn(true);
    haptic(12);
    store.toast({ text: 'Shake is on. Shake your phone while PULSE is open to add an expense.', emoji: '📳' });
  };
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => void flip()} className="row-btn min-h-[56px]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sunk text-ink2" aria-hidden="true">
        <Icon name="zap" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">Shake to add</span>
        <span className="block truncate text-[13px] text-ink3">Shake your phone to log an expense</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line'}`} aria-hidden="true">
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-surface shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
    </button>
  );
}
