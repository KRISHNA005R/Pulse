// Sounds when something is logged (You → Appearance → Sounds). Off until the person turns them on.
//
// Each moment has a slot. When a sound file is listed in FILES (put it in public/sfx/), that file
// plays; otherwise a short sound made right here in code plays, so there's always something.
// Files must be short (under 2 s) and small (mp3 or m4a, a few KB).

export type Sfx = 'expense' | 'big' | 'huge' | 'income' | 'move';

/** Sound files in public/sfx/, by moment. Empty = use the built-in sound. */
const FILES: Partial<Record<Sfx, string>> = {
  expense: 'expense.mp3', // vine boom
  big: 'big.mp3', // FAAAH (₹2,000+)
  huge: 'huge.mp3', // dun dun dunnn (₹10,000+)
  income: 'income.mp3', // anime "wow"
  move: 'move.mp3', // punch
};

/** Load the clips ahead of time, so the first one plays without a delay. */
export function preloadSfx() {
  for (const f of Object.values(FILES)) if (f) clip(`/sfx/${f}`);
}

let ctx: AudioContext | null = null;
const audio = (): AudioContext | null => {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

const cache = new Map<string, HTMLAudioElement>();
function clip(src: string) {
  let a = cache.get(src);
  if (!a) {
    a = new Audio(src);
    a.preload = 'auto';
    cache.set(src, a);
  }
  return a;
}
function playFile(src: string) {
  const a = clip(src);
  a.currentTime = 0;
  a.volume = 0.9;
  void a.play().catch(() => {});
}

// ---- built-in sounds -------------------------------------------------------------------------
function tone(c: AudioContext, at: number, freq: number, dur: number, vol: number, type: OscillatorType = 'sine', to?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}
function noise(c: AudioContext, at: number, dur: number, vol: number, from: number, to: number) {
  const n = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(at);
}

const BUILT_IN: Record<Sfx, (c: AudioContext, t: number) => void> = {
  // Coin flick: two quick bright notes.
  expense: (c, t) => {
    tone(c, t, 988, 0.09, 0.32, 'triangle');
    tone(c, t + 0.07, 1319, 0.28, 0.3, 'triangle');
  },
  // Dramatic boom: a deep hit that drops in pitch, with a soft thud on top.
  big: (c, t) => {
    tone(c, t, 110, 1.1, 0.55, 'sine', 38);
    tone(c, t, 220, 0.25, 0.18, 'triangle', 60);
    noise(c, t, 0.12, 0.25, 900, 200);
  },
  huge: (c, t) => BUILT_IN.big(c, t),
  // Cha-ching: a brushed "cha", then a bright bell.
  income: (c, t) => {
    noise(c, t, 0.09, 0.35, 5000, 3000);
    tone(c, t + 0.1, 1568, 0.5, 0.22, 'sine');
    tone(c, t + 0.1, 2093, 0.6, 0.16, 'sine');
    tone(c, t + 0.1, 3136, 0.35, 0.06, 'sine');
  },
  // Whoosh: air sweeping past.
  move: (c, t) => noise(c, t, 0.38, 1.6, 300, 3200),
};

/** Play the sound for a moment, if sounds are on. Call it from a tap, so phones allow audio. */
export function playSfx(kind: Sfx, on: boolean | undefined) {
  if (!on) return;
  try {
    if (navigator.vibrate) navigator.vibrate(kind === 'huge' ? [20, 50, 20, 50, 40] : kind === 'big' ? [18, 40, 28] : 14);
  } catch {
    /* no vibration on this device */
  }
  const file = FILES[kind];
  if (file) return playFile(`/sfx/${file}`);
  const c = audio();
  if (c) BUILT_IN[kind](c, c.currentTime + 0.01);
}

/** Which sound a logged entry gets: big from ₹2,000, huge from ₹10,000 (scaled for other currencies). */
export const sfxFor = (type: 'expense' | 'income' | 'transfer', amount: number, big: number, huge: number): Sfx =>
  type === 'income' ? 'income' : type === 'transfer' ? 'move' : amount >= huge ? 'huge' : amount >= big ? 'big' : 'expense';
