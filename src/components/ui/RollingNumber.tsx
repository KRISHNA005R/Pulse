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
    // Back to rolling: wheels show their full strip and size themselves again.
    delete root.dataset.done;
    wheels.forEach((w) => (w.style.width = ''));
    const n = wheels.length;
    // When every wheel has landed, each one keeps its exact width and shows only its own digit. The
    // box never changes size (no jump), and there's no strip left for Safari to show outside the box.
    const land = () => {
      wheels.forEach((w) => (w.style.width = `${w.getBoundingClientRect().width}px`));
      root.dataset.done = '';
    };
    const tl = gsap.timeline({ onComplete: land });
    let moving = 0;
    wheels.forEach((w, i) => {
      const strip = w.firstElementChild as HTMLElement;
      const d = Number(w.dataset.wheel);
      const fromRaw = Number(strip.dataset.at ?? '-1');
      const from = fromRaw < 0 ? 0 : fromRaw % 10;
      const to = rollTarget(d);
      strip.dataset.at = String(to);
      gsap.killTweensOf(strip);
      if (fromRaw >= 0 && fromRaw % 10 === d) {
        gsap.set(strip, { '--p': to });
        return;
      }
      moving++;
      tl.fromTo(strip, { '--p': from }, { '--p': to, duration: 1 + (n - i) * 0.09, ease: 'power3.out' }, (n - 1 - i) * 0.035);
    });
    if (!moving) {
      tl.kill();
      land();
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
    <span ref={ref} className={`roll ${className}`} data-testid={testId}>
      <span className="sr-only">{text}</span>
      {tokens.map((t) =>
        t.digit ? (
          <span key={t.key} className="roll-wheel" data-wheel={t.ch} aria-hidden="true">
            <span className="roll-strip" data-d={t.ch} />
          </span>
        ) : (
          <span key={t.key + t.ch} className="roll-ch" data-ch={t.ch} aria-hidden="true" />
        ),
      )}
    </span>
  );
}
