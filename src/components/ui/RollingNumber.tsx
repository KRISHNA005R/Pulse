import { useLayoutEffect, useRef } from 'react';
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

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || plain) return;
    const wheels = Array.from(root.querySelectorAll<HTMLElement>('[data-wheel]'));
    const n = wheels.length;
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
      gsap.fromTo(el, { '--p': from }, { '--p': to, duration: 1 + (n - i) * 0.09, delay: (n - 1 - i) * 0.035, ease: 'power3.out' });
    });
  }, [text, plain]);

  if (plain) {
    return (
      <span className={className} data-testid={testId}>
        {text}
      </span>
    );
  }
  return (
    <span ref={ref} className={`roll ${className}`} data-testid={testId}>
      <span className="sr-only">{text}</span>
      {tokens.map((t) => (t.digit ? <span key={t.key} className="roll-wheel" data-wheel={t.ch} aria-hidden="true" /> : <span key={t.key + t.ch} className="roll-ch" data-ch={t.ch} aria-hidden="true" />))}
    </span>
  );
}
