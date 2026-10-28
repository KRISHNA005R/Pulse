import { useLayoutEffect, useRef, useState } from 'react';
import { gsap, reducedMotion, rollTarget, rollTokens } from '../../lib/motion';

/**
 * An amount that rolls into place like a meter: every digit is a little wheel that spins to its
 * number, the ones digit first and the big digits last. The wheels and fixed characters are drawn
 * with CSS (not text), so the element's text is exactly the amount, for screen readers and copying.
 * With "reduce motion" it's just the number.
 */
export function RollingNumber({ text, className = '', testId }: { text: string; className?: string; testId?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const plain = reducedMotion();
  const tokens = rollTokens(text);

  // Once every wheel has landed, the wheels are swapped for the plain number. Some phones (Safari)
  // fail to clip a moving strip, so leaving the wheels on screen could show half-digits underneath.
  const [done, setDone] = useState(false);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || plain) return;
    const wheels = Array.from(root.querySelectorAll<HTMLElement>('[data-wheel]'));
    const n = wheels.length;
    const tl = gsap.timeline({ onComplete: () => setDone(true) });
    let moving = 0;
    wheels.forEach((el, i) => {
      const d = Number(el.dataset.wheel);
      const fromRaw = Number(el.dataset.at ?? '-1');
      const from = fromRaw < 0 ? 0 : fromRaw % 10;
      const to = rollTarget(d);
      el.dataset.at = String(to);
      if (fromRaw >= 0 && fromRaw % 10 === d) {
        gsap.set(el, { '--p': to });
        return;
      }
      gsap.killTweensOf(el);
      moving++;
      tl.fromTo(el, { '--p': from }, { '--p': to, duration: 1 + (n - i) * 0.09, ease: 'power3.out' }, (n - 1 - i) * 0.035);
    });
    if (moving) setDone(false);
    else {
      tl.kill();
      setDone(true);
    }
    return () => void tl.kill();
  }, [text, plain]);

  if (plain) {
    return (
      <span className={className} data-testid={testId}>
        {text}
      </span>
    );
  }
  return (
    <span ref={ref} className={`roll ${done ? 'roll-done' : ''} ${className}`} data-testid={testId}>
      <span className="sr-only">{text}</span>
      <span className="roll-final" data-text={text} aria-hidden="true" />
      {tokens.map((t) => (t.digit ? <span key={t.key} className="roll-wheel" data-wheel={t.ch} aria-hidden="true" /> : <span key={t.key + t.ch} className="roll-ch" data-ch={t.ch} aria-hidden="true" />))}
    </span>
  );
}
