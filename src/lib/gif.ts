// A GIF as a profile photo. Any animated GIF becomes a small square loop that is cheap to keep and
// to send: up to 5 seconds (the person picks which), cut to a square from the middle, a couple of
// dozen frames, one shared palette, and only what changes between frames.
//
// It happens in two steps. First the GIF becomes a "timeline": every frame, cut down to a small
// square. Then the part the person picked is packed as a GIF again. The pixel work is typed arrays
// only (no canvas), so it runs the same in the app and in a test. Loaded on demand (it brings two
// small libraries), only when someone actually picks a GIF.
import { decompressFrame, parseGIF, type ParsedGif } from 'gifuct-js';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';

/** How much of the loop is kept. */
export const LOOP_MAX_MS = 5000;
/** The size the result should fit in, in bytes. */
export const LOOP_TARGET = 140_000;
/** Frames are first cut down to this many pixels a side, then to their final size. */
export const MID = 128;
/** A GIF longer than this is only read this far (the slider picks from it). */
const GIF_READ_MS = 60_000;
const GIF_READ_FRAMES = 400;
/** Tried in order until the result fits. */
const TRIES = [
  { size: 112, frames: 32, colors: 96 },
  { size: 96, frames: 26, colors: 64 },
  { size: 96, frames: 20, colors: 48 },
  { size: 80, frames: 16, colors: 32 },
  { size: 64, frames: 12, colors: 24 },
];

export const isGif = (b: Uint8Array) => b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;

export interface LoopFrame {
  rgba: Uint8ClampedArray;
  /** How long it shows, in milliseconds. */
  delay: number;
}
export interface Timeline {
  /** Each frame with the moment it starts. */
  frames: (LoopFrame & { t: number })[];
  /** How long all of it lasts. */
  ms: number;
  /** One frame only: it is a still picture. */
  still: boolean;
}
export interface Loop {
  bytes: Uint8Array;
  size: number;
  frames: number;
  ms: number;
}

/** Cut a square from the middle of `src` (w x h, RGBA) and scale it to n x n over white. */
export function square(src: Uint8ClampedArray, w: number, h: number, n: number): Uint8ClampedArray {
  const s = Math.min(w, h);
  const ox = (w - s) >> 1;
  const oy = (h - s) >> 1;
  const out = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    const y0 = oy + Math.floor((y * s) / n);
    const y1 = Math.max(y0 + 1, oy + Math.floor(((y + 1) * s) / n));
    for (let x = 0; x < n; x++) {
      const x0 = ox + Math.floor((x * s) / n);
      const x1 = Math.max(x0 + 1, ox + Math.floor(((x + 1) * s) / n));
      let r = 0;
      let g = 0;
      let b = 0;
      let c = 0;
      for (let yy = y0; yy < y1; yy++) {
        let p = (yy * w + x0) * 4;
        for (let xx = x0; xx < x1; xx++, p += 4) {
          const a = src[p + 3] / 255;
          r += src[p] * a + 255 * (1 - a);
          g += src[p + 1] * a + 255 * (1 - a);
          b += src[p + 2] * a + 255 * (1 - a);
          c++;
        }
      }
      const o = (y * n + x) * 4;
      out[o] = r / c;
      out[o + 1] = g / c;
      out[o + 2] = b / c;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Spread `want` picks evenly over the frames; each pick carries the time of the ones it stands for. */
function pick(delays: number[], want: number): { i: number; delay: number }[] {
  const have = delays.length;
  const k = Math.min(have, want);
  const at: number[] = [];
  for (let j = 0; j < k; j++) at.push(Math.floor((j * have) / k));
  return at.map((i, j) => ({ i, delay: delays.slice(i, j + 1 < k ? at[j + 1] : have).reduce((a, b) => a + b, 0) }));
}

function encode(frames: LoopFrame[], n: number, colors: number): Uint8Array {
  // One palette for the whole loop, learnt from a sample of every frame.
  const step = Math.max(1, Math.floor((frames.length * n * n) / 60_000));
  const sample = new Uint8Array(frames.length * Math.ceil((n * n) / step) * 4);
  let s = 0;
  for (const f of frames) for (let p = 0; p < n * n; p += step, s += 4) sample.set(f.rgba.subarray(p * 4, p * 4 + 4), s);
  const palette = quantize(sample.slice(0, s), colors - 1, { format: 'rgb565' });
  const clear = palette.length; // one spare slot: "same as the frame before"
  const table = [...palette, [0, 0, 0]];
  const gif = GIFEncoder();
  let prev: Uint8Array | null = null;
  frames.forEach((f, i) => {
    const idx = applyPalette(f.rgba, palette, 'rgb565');
    let out = idx;
    if (prev) {
      // Only what changed since the last frame is stored.
      out = new Uint8Array(idx.length);
      for (let p = 0; p < idx.length; p++) out[p] = idx[p] === prev[p] ? clear : idx[p];
    }
    gif.writeFrame(out, n, n, { palette: i === 0 ? table : undefined, delay: Math.max(20, Math.round(f.delay / 10) * 10), transparent: i > 0, transparentIndex: clear, dispose: 1, repeat: 0 });
    prev = idx;
  });
  gif.finish();
  return gif.bytes();
}

/** Every frame of a GIF, cut to MID x MID. Null when the bytes are not a GIF this can read. */
export function gifTimeline(buffer: ArrayBuffer): Timeline | null {
  let gif: ParsedGif;
  try {
    if (!isGif(new Uint8Array(buffer))) return null;
    gif = parseGIF(buffer);
  } catch {
    return null;
  }
  const W = gif.lsd?.width ?? 0;
  const H = gif.lsd?.height ?? 0;
  const imgs = (gif.frames ?? []).filter((f) => f.image);
  if (!W || !H || !imgs.length || W * H > 40_000_000) return null;
  // Play the GIF onto one screen, frame by frame, keeping a small copy of each.
  const screen = new Uint8ClampedArray(W * H * 4);
  let saved: Uint8ClampedArray | null = null;
  const frames: Timeline['frames'] = [];
  let t = 0;
  try {
    for (const img of imgs) {
      if (t >= GIF_READ_MS || frames.length >= GIF_READ_FRAMES) break;
      const f = decompressFrame(img, gif.gct, true);
      if (!f) continue;
      const d = (img.gce?.delay ?? 10) * 10;
      const delay = d < 20 ? 100 : d; // what browsers do with a GIF that says "no delay"
      const { top, left, width, height } = f.dims;
      if (f.disposalType === 3) saved = screen.slice();
      for (let y = 0; y < height; y++) {
        const sy = top + y;
        if (sy < 0 || sy >= H) continue;
        for (let x = 0; x < width; x++) {
          const sx = left + x;
          if (sx < 0 || sx >= W) continue;
          const p = (y * width + x) * 4;
          if (f.patch[p + 3] === 0) continue;
          const o = (sy * W + sx) * 4;
          screen[o] = f.patch[p];
          screen[o + 1] = f.patch[p + 1];
          screen[o + 2] = f.patch[p + 2];
          screen[o + 3] = 255;
        }
      }
      frames.push({ rgba: square(screen, W, H, MID), delay, t });
      t += delay;
      if (f.disposalType === 2) {
        for (let y = Math.max(0, top); y < Math.min(H, top + height); y++) screen.fill(0, (y * W + Math.max(0, left)) * 4, (y * W + Math.min(W, left + width)) * 4);
      } else if (f.disposalType === 3 && saved) screen.set(saved);
    }
  } catch {
    return null;
  }
  if (!frames.length) return null;
  return { frames, ms: t, still: frames.length < 2 };
}

/** The frames that show between `start` and `start + len` (ms), with the first and last trimmed to fit. */
export function windowOf(tl: Timeline, start: number, len = LOOP_MAX_MS): LoopFrame[] {
  const end = start + len;
  const out: LoopFrame[] = [];
  for (const f of tl.frames) {
    const from = Math.max(f.t, start);
    const to = Math.min(f.t + f.delay, end);
    if (to - from >= 10) out.push({ rgba: f.rgba, delay: to - from });
  }
  return out;
}

/** Pack frames (MID x MID) as the small loop. Null when it can't be made small enough. */
export function encodeLoop(frames: LoopFrame[], target = LOOP_TARGET): Loop | null {
  if (frames.length < 2) return null;
  let best: Loop | null = null;
  for (const tr of TRIES) {
    const sub = pick(frames.map((f) => f.delay), tr.frames).map((k) => ({ rgba: square(frames[k.i].rgba, MID, MID, tr.size), delay: k.delay }));
    const bytes = encode(sub, tr.size, tr.colors);
    best = { bytes, size: tr.size, frames: sub.length, ms: sub.reduce((a, f) => a + f.delay, 0) };
    if (bytes.length <= target) break;
  }
  return best && best.bytes.length <= target * 1.5 ? best : null;
}
