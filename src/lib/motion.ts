// Motion helpers, built on GSAP: rolling numbers, cards that rise as you scroll, and a stamp for
// big wins. Everything checks "reduce motion" first and simply shows the finished state.
import { gsap } from 'gsap';

export { gsap };

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------- Rolling numbers ----------
export interface RollToken {
  ch: string;
  digit: boolean;
  /** Counted from the right, so the ones digit keeps its wheel when the number grows. */
  key: string;
}

export function rollTokens(text: string): RollToken[] {
  const chars = [...text];
  return chars.map((ch, i) => ({ ch, digit: ch >= '0' && ch <= '9', key: `r${chars.length - 1 - i}` }));
}

/** Each wheel has 0–9 twice; it always lands in the second band so it can roll forward to any digit. */
export const rollTarget = (d: number) => 10 + d;

// ---------- Cards rise in ----------
/**
 * Cards on a screen rise in one after another. Those already on screen go straight away; the ones
 * further down wait until you scroll to them. Returns a cleanup.
 */
export function revealIn(root: HTMLElement): () => void {
  // The screen's own blocks (everything under its root except the title bar) rise in, plus anything marked.
  const screen = root.firstElementChild;
  if (screen) for (const el of Array.from(screen.children)) if (el.tagName !== 'HEADER' && el instanceof HTMLElement) el.dataset.reveal = '';
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (!items.length) return () => {};
  if (reducedMotion() || typeof IntersectionObserver === 'undefined') {
    gsap.set(items, { clearProps: 'opacity,transform' });
    return () => {};
  }
  const h = window.innerHeight;
  const now = items.filter((el) => el.getBoundingClientRect().top < h - 24);
  const later = items.filter((el) => !now.includes(el));
  gsap.fromTo(now, { autoAlpha: 0, y: 26, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out', stagger: 0.07, clearProps: 'transform,visibility' });
  gsap.set(later, { opacity: 0, y: 36 });
  const io = new IntersectionObserver(
    (entries) => {
      const show = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
      if (!show.length) return;
      show.forEach((el) => io.unobserve(el));
      gsap.to(show, { opacity: 1, y: 0, duration: 0.65, ease: 'power3.out', stagger: 0.08, clearProps: 'transform' });
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  later.forEach((el) => io.observe(el));
  return () => {
    io.disconnect();
    gsap.killTweensOf(items);
    gsap.set(items, { clearProps: 'opacity,transform,visibility' });
  };
}

// ---------- The stamp ----------
/** A big round stamp slams onto the screen for a real win (loan closed, goal reached), then lifts away. */
export function stamp(text: string, sub?: string) {
  if (typeof document === 'undefined' || reducedMotion()) return;
  document.querySelectorAll('[data-stamp]').forEach((n) => n.remove());
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.dataset.stamp = text;
  if (sub) el.dataset.sub = sub;
  el.className = 'win-stamp';
  document.body.appendChild(el);
  const app = document.getElementById('main');
  const tl = gsap.timeline({ onComplete: () => el.remove() });
  tl.fromTo(el, { scale: 2.6, rotate: -28, opacity: 0 }, { scale: 1, rotate: -9, opacity: 1, duration: 0.42, ease: 'power4.in' })
    .add(() => {
      if (app) gsap.fromTo(app, { x: -7 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.2, 0.25)', clearProps: 'transform' });
    })
    .to(el, { scale: 1.06, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.out' })
    .to(el, { opacity: 0, y: -40, scale: 0.9, duration: 0.5, ease: 'power2.in', delay: 1.3 });
}
