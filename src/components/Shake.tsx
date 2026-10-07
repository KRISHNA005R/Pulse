import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { haptic } from '../lib/format';
import { askMotion, canShake, firstShake, motionAllowed, shakeOn, shakeRefused, watchShake } from '../lib/shake';

/** Shake the phone and the "add money" sheet opens. Call once from the app shell. */
export function useShakeToAdd() {
  const store = useStore();
  const ui = useUI();
  const ready = store.state.onboarding.done;
  const [on] = useState(() => canShake() && shakeOn());
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
      if (firstShake()) store.toast({ text: 'You shook your phone, so this opened. Shake any time to add an expense.', emoji: '📳' });
    };
    if (motionAllowed()) return watchShake(open);
    // iPhone: motion is only given when asked from a tap, so the first tap anywhere asks. The phone
    // shows its own question the first time (and no pop-up while the answer still stands). A "no" is
    // remembered, so nobody is asked twice.
    let stop = () => {};
    let live = true;
    const first = () => {
      window.removeEventListener('pointerup', first);
      void askMotion().then((ok) => {
        if (!live) return;
        if (ok) stop = watchShake(open);
        else shakeRefused();
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
