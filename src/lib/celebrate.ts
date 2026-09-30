// Celebrations: a burst of confetti or coins drawn on a throwaway canvas over the app.
// Fire-and-forget, never blocks input, and does nothing for people who asked for reduced motion.

type Kind = 'confetti' | 'coins' | 'mini' | 'fire';

interface Opts {
  /** Where the burst starts, in viewport pixels. Defaults to the lower middle of the screen. */
  x?: number;
  y?: number;
  kind?: Kind;
  /** 0.5 for a small pop, 1 normal, 1.6 for a big win. */
  power?: number;
}

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  shape: 'rect' | 'coin' | 'dot' | 'flame';
  life: number;
  wob: number;
}

const COLORS = ['#EC5B2B', '#FF8A5B', '#FFD9C4', '#17140F', '#F6F5F2', '#2FA36B', '#FFC857'];

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let parts: P[] = [];
let raf = 0;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '2147482000' });
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function teardown() {
  cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('resize', resize);
  canvas?.remove();
  canvas = null;
  ctx = null;
  parts = [];
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function burst(opts: Opts = {}) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  ensureCanvas();
  const kind = opts.kind ?? 'confetti';
  const power = opts.power ?? 1;
  const x = opts.x ?? window.innerWidth / 2;
  const y = opts.y ?? window.innerHeight * 0.62;
  const n = Math.round((kind === 'mini' ? 26 : kind === 'coins' ? 34 : kind === 'fire' ? 30 : 90) * power);
  for (let i = 0; i < n; i++) {
    const a = kind === 'fire' ? rand(-Math.PI * 0.72, -Math.PI * 0.28) : rand(-Math.PI * 0.95, -Math.PI * 0.05);
    const sp = rand(kind === 'mini' ? 4 : 7, kind === 'mini' ? 9 : 15) * (0.75 + power * 0.25);
    const shape: P['shape'] = kind === 'coins' ? (i % 3 === 0 ? 'rect' : 'coin') : kind === 'fire' ? 'flame' : i % 5 === 0 ? 'dot' : 'rect';
    parts.push({
      x: x + rand(-8, 8),
      y: y + rand(-4, 4),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: rand(0, Math.PI * 2),
      vr: rand(-0.3, 0.3),
      w: shape === 'coin' ? rand(9, 13) : rand(5, 9),
      h: shape === 'coin' ? 0 : rand(8, 15),
      color: kind === 'fire' ? ['#FF6A2B', '#FFB347', '#FFD166', '#EC5B2B'][i % 4] : COLORS[i % COLORS.length],
      shape,
      life: 0,
      wob: rand(0, Math.PI * 2),
    });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const H = window.innerHeight;
  parts = parts.filter((p) => p.life < 150 && p.y < H + 40);
  for (const p of parts) {
    p.life++;
    p.vy += p.shape === 'flame' ? -0.02 : p.shape === 'coin' ? 0.42 : 0.3;
    p.vx *= 0.985;
    p.vy *= p.shape === 'rect' ? 0.985 : 0.99;
    p.wob += 0.18;
    p.x += p.vx + (p.shape === 'rect' ? Math.sin(p.wob) * 0.8 : 0);
    p.y += p.vy;
    p.r += p.vr;
    const fade = p.shape === 'flame' ? Math.max(0, 1 - p.life / 55) : Math.min(1, (150 - p.life) / 30);
    ctx.globalAlpha = fade;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    if (p.shape === 'coin') {
      // A spinning ₹ coin: squash the width to fake the spin.
      const sx = Math.abs(Math.cos(p.wob * 0.6)) * 0.85 + 0.15;
      ctx.scale(sx, 1);
      ctx.fillStyle = '#B9441B';
      ctx.beginPath();
      ctx.arc(0, 1.5, p.w, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#EC5B2B';
      ctx.beginPath();
      ctx.arc(0, 0, p.w, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#17140F';
      ctx.font = `700 ${p.w * 1.25}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('₹', 0, 1);
    } else if (p.shape === 'dot') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.w * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'flame') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.w * 0.6, p.w, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.wob)));
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  if (parts.length) raf = requestAnimationFrame(tick);
  else teardown();
}

/** Burst from the middle of an element, e.g. the button that was just pressed. */
export function burstFrom(el: Element | null | undefined, opts: Omit<Opts, 'x' | 'y'> = {}) {
  const r = el?.getBoundingClientRect();
  burst({ ...opts, x: r ? r.left + r.width / 2 : undefined, y: r ? r.top + r.height / 2 : undefined });
}
