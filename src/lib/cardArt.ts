import { BRAND } from './brand';
import { rupees } from './format';

// Share-card artwork, drawn on a canvas so the preview is exactly the PNG that gets shared.
// Four looks: a gig ticket, a thermal receipt, a sunset postcard and a die-cut sticker.

export type CardStyle = 'ticket' | 'receipt' | 'postcard' | 'sticker';
export type CardFormat = 'story' | 'post';

export interface CardSpec {
  style: CardStyle;
  format: CardFormat;
  title: string;
  amount: number;
  suffix: string;
  line: string;
  emoji: string;
  progress?: number | null; // 0..1, postcard only
  dateLabel: string; // e.g. "SAT · 27 SEP"
  badge: string; // two short words for the sticker badge, e.g. "NO FOMO"
}

export const SIZES: Record<CardFormat, [number, number]> = { story: [1080, 1920], post: [1080, 1350] };

type Ctx = CanvasRenderingContext2D;

// ---------- small helpers ----------
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const money = (n: number) => rupees(n);

function hexRgb(h: string): [number, number, number] {
  const x = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)) as [number, number, number];
}
export function mix(a: string, b: string, t: number): string {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
export function font(ctx: Ctx, weight: number | string, size: number, fam: string) {
  ctx.font = `${weight} ${size}px ${fam}`;
}
export function spacing(ctx: Ctx, px: number) {
  const c = ctx as Ctx & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
}
function wrap(ctx: Ctx, text: string, maxW: number, maxLines = 4): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxW && last.length > 1) last = last.slice(0, -1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return lines;
}
/** Shrink the font until the text fits. Returns the size used. */
export function fit(ctx: Ctx, text: string, weight: number, start: number, fam: string, maxW: number, min = 36): number {
  let s = start;
  font(ctx, weight, s, fam);
  while (ctx.measureText(text).width > maxW && s > min) {
    s -= 4;
    font(ctx, weight, s, fam);
  }
  return s;
}
export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function grain(ctx: Ctx, w: number, h: number, r: () => number, color: string, alpha: number, count: number) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) ctx.fillRect(r() * w, r() * h, 2, 2);
  ctx.restore();
}
export function barcode(ctx: Ctx, x: number, y: number, w: number, h: number, r: () => number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  let cx = x;
  while (cx < x + w) {
    const bw = [3, 4, 6, 9][Math.floor(r() * 4)];
    if (r() > 0.3) ctx.fillRect(cx, y, Math.min(bw, x + w - cx), h);
    cx += bw + [4, 5, 7][Math.floor(r() * 3)];
  }
  ctx.restore();
}
export function sparkle(ctx: Ctx, cx: number, cy: number, s: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.quadraticCurveTo(cx, cy, cx + s, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + s);
  ctx.quadraticCurveTo(cx, cy, cx - s, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - s);
  ctx.fill();
  ctx.restore();
}
export function circleText(ctx: Ctx, text: string, cx: number, cy: number, radius: number, fontStr: string, color: string, start = -Math.PI / 2) {
  ctx.save();
  ctx.font = fontStr;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const total = ctx.measureText(text).width;
  const scale = (2 * Math.PI * radius) / total; // stretch to close the ring
  let a = start;
  for (const ch of text) {
    const ang = (ctx.measureText(ch).width * scale) / radius;
    ctx.save();
    ctx.translate(cx + radius * Math.cos(a + ang / 2), cy + radius * Math.sin(a + ang / 2));
    ctx.rotate(a + ang / 2 + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += ang;
  }
  ctx.restore();
}
export function starPath(ctx: Ctx, cx: number, cy: number, spikes: number, outer: number, inner: number, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / spikes;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
export function wordmark(ctx: Ctx, x: number, y: number, size: number, color: string, align: 'left' | 'right' | 'center' = 'left', dot: string = BRAND.accent) {
  font(ctx, 800, size, BRAND.display);
  spacing(ctx, 0);
  const w1 = ctx.measureText('PULSE').width;
  const w2 = ctx.measureText('.').width;
  const start = align === 'left' ? x : align === 'right' ? x - w1 - w2 : x - (w1 + w2) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  ctx.fillText('PULSE', start, y);
  ctx.fillStyle = dot;
  ctx.fillText('.', start + w1, y);
}

// ---------- 1. Ticket ----------
function drawTicket(ctx: Ctx, W: number, H: number, c: CardSpec, r: () => number) {
  const { accent, onAccent, ink, paper } = BRAND;
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, r, paper, 0.05, 6000);
  for (let i = 0; i < 7; i++) sparkle(ctx, 60 + r() * (W - 120), r() < 0.5 ? 40 + r() * 120 : H - 160 + r() * 120, 10 + r() * 16, i % 3 ? accent : paper);

  const tx = 90;
  const tw = W - 180;
  const th = c.format === 'story' ? 1260 : 1080;
  const ty = (H - th) / 2;
  const split = ty + th * 0.63;

  ctx.save();
  rr(ctx, tx, ty, tw, th, 44);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(tx, ty, tw, split - ty);
  ctx.fillStyle = paper;
  ctx.fillRect(tx, split, tw, ty + th - split);
  // faint lines on the stub, like ruled card stock
  ctx.strokeStyle = mix(paper, ink, 0.07);
  ctx.lineWidth = 2;
  for (let y = split + 40; y < ty + th; y += 40) {
    ctx.beginPath();
    ctx.moveTo(tx, y);
    ctx.lineTo(tx + tw, y);
    ctx.stroke();
  }
  ctx.restore();

  // notches
  ctx.fillStyle = ink;
  for (const x of [tx, tx + tw]) {
    ctx.beginPath();
    ctx.arc(x, split, 40, 0, Math.PI * 2);
    ctx.fill();
  }
  // perforation
  ctx.save();
  ctx.strokeStyle = mix(paper, ink, 0.35);
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(tx + 60, split);
  ctx.lineTo(tx + tw - 60, split);
  ctx.stroke();
  ctx.restore();

  const px = tx + 70;
  const inner = tw - 140;
  ctx.textBaseline = 'alphabetic';
  // header row
  font(ctx, 700, 28, BRAND.body);
  spacing(ctx, 6);
  ctx.fillStyle = onAccent;
  ctx.globalAlpha = 0.85;
  ctx.textAlign = 'left';
  ctx.fillText('ADMIT ONE', px, ty + 92);
  ctx.textAlign = 'right';
  ctx.fillText(`Nº ${String((hash(c.title + c.amount) % 90000) + 10000)}`, tx + tw - 70, ty + 92);
  ctx.globalAlpha = 1;
  spacing(ctx, 0);

  // circular "valid till payday" stamp
  const sx = tx + tw - 160;
  const sy = ty + 270;
  ctx.save();
  ctx.strokeStyle = onAccent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sx, sy, 106, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx, sy, 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  circleText(ctx, 'VALID TILL PAYDAY ✦ VALID TILL PAYDAY ✦ ', sx, sy, 88, `700 22px ${BRAND.body}`, onAccent);
  font(ctx, 400, 70, 'sans-serif');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.emoji || '✦', sx, sy + 4);
  ctx.textBaseline = 'alphabetic';

  // title
  ctx.textAlign = 'left';
  ctx.fillStyle = onAccent;
  let titleSize = c.format === 'story' ? 84 : 72;
  font(ctx, 800, titleSize, BRAND.display);
  let tl = wrap(ctx, c.title.toUpperCase(), inner - 250, 3);
  while (tl.some((l) => ctx.measureText(l).width > inner - 250) && titleSize > 44) {
    titleSize -= 4;
    font(ctx, 800, titleSize, BRAND.display);
    tl = wrap(ctx, c.title.toUpperCase(), inner - 250, 3);
  }
  tl.forEach((l, i) => ctx.fillText(l, px, ty + 150 + titleSize + i * titleSize * 1.02));

  // amount
  const amt = money(c.amount);
  const aSize = fit(ctx, amt, 800, 250, BRAND.display, inner, 90);
  ctx.fillText(amt, px - 6, split - (c.suffix ? 120 : 70));
  if (c.suffix) {
    font(ctx, 600, 56, BRAND.display);
    ctx.globalAlpha = 0.9;
    ctx.fillText(c.suffix, px, split - 52);
    ctx.globalAlpha = 1;
  }
  void aSize;

  // stub
  ctx.fillStyle = ink;
  font(ctx, 500, 44, BRAND.body);
  wrap(ctx, c.line, inner, 3).forEach((l, i) => ctx.fillText(l, px, split + 100 + i * 58));
  const by = ty + th - 150;
  barcode(ctx, px, by, 340, 84, r, ink);
  font(ctx, 600, 24, BRAND.body);
  spacing(ctx, 4);
  ctx.globalAlpha = 0.6;
  ctx.textAlign = 'right';
  ctx.fillText(c.dateLabel, tx + tw - 70, by + 22);
  ctx.globalAlpha = 1;
  spacing(ctx, 0);
  wordmark(ctx, tx + tw - 70, by + 84, 50, ink, 'right');
}

// ---------- 2. Receipt ----------
function drawReceipt(ctx: Ctx, W: number, H: number, c: CardSpec, r: () => number) {
  const { accent, onAccent, ink, paper } = BRAND;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.strokeStyle = onAccent;
  ctx.globalAlpha = 0.07;
  ctx.lineWidth = 26;
  for (let i = -H; i < W + H; i += 92) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }
  ctx.restore();
  grain(ctx, W, H, r, ink, 0.05, 5000);

  const pw = 780;
  const pad = 60;
  const inner = pw - pad * 2;
  const rows: [string, string][] = [
    ['LIMIT', `${money(c.amount)}${c.suffix ? ` ${c.suffix.toUpperCase()}` : ''}`],
    ...(c.format === 'story' ? ([['SPLURGES', '0'], ['FOMO', '0%']] as [string, string][]) : []),
    ['MOOD', c.emoji || '✦'],
  ];
  font(ctx, 400, 30, BRAND.mono);
  const lines = wrap(ctx, c.line, inner, c.format === 'story' ? 4 : 3);
  const ph = 250 + 70 + rows.length * 62 + 40 + 210 + 40 + lines.length * 46 + 40 + 200 + 40;
  const px = (W - pw) / 2;
  const py = (H - ph) / 2;

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((-2.5 * Math.PI) / 180);
  ctx.translate(-W / 2, -H / 2);

  // paper with zig-zag tear on both ends
  const tooth = 30;
  ctx.beginPath();
  ctx.moveTo(px, py + 14);
  for (let x = px; x < px + pw; x += tooth) {
    ctx.lineTo(x + tooth / 2, py);
    ctx.lineTo(Math.min(x + tooth, px + pw), py + 14);
  }
  ctx.lineTo(px + pw, py + ph - 14);
  for (let x = px + pw; x > px; x -= tooth) {
    ctx.lineTo(x - tooth / 2, py + ph);
    ctx.lineTo(Math.max(x - tooth, px), py + ph - 14);
  }
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = paper;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  const cx = W / 2;
  const left = px + pad;
  const right = px + pw - pad;
  let y = py + 110;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  font(ctx, 700, 40, BRAND.mono);
  spacing(ctx, 4);
  ctx.fillText('PULSE MONEY CO.', cx, y);
  spacing(ctx, 0);
  font(ctx, 400, 25, BRAND.mono);
  ctx.globalAlpha = 0.7;
  ctx.fillText('BUDGETING OUT LOUD', cx, (y += 48));
  ctx.fillText(c.dateLabel, cx, (y += 40));
  ctx.globalAlpha = 1;

  const dash = (yy: number) => {
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.stroke();
    ctx.restore();
  };
  dash((y += 50));

  ctx.textAlign = 'left';
  font(ctx, 700, 34, BRAND.mono);
  ctx.fillText(wrap(ctx, c.title.toUpperCase(), inner, 1)[0], left, (y += 70));

  for (const [k, v] of rows) {
    y += 62;
    font(ctx, 400, 30, BRAND.mono);
    ctx.textAlign = 'left';
    ctx.fillText(k, left, y);
    const kw = ctx.measureText(k).width;
    font(ctx, 700, 30, BRAND.mono);
    ctx.textAlign = 'right';
    const vFit = wrap(ctx, v, inner - kw - 60, 1)[0];
    ctx.fillText(vFit, right, y);
    const vw = ctx.measureText(vFit).width;
    // dotted leader
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let dx = left + kw + 14; dx < right - vw - 14; dx += 16) ctx.fillRect(dx, y - 6, 4, 4);
    ctx.restore();
  }
  dash((y += 40));

  y += 60;
  ctx.textAlign = 'left';
  font(ctx, 700, 30, BRAND.mono);
  ctx.fillText('TOTAL LEFT', left, y);
  ctx.textAlign = 'center';
  ctx.fillStyle = BRAND.accentInk;
  fit(ctx, money(c.amount), 800, 150, BRAND.display, inner, 70);
  ctx.fillText(money(c.amount), cx, (y += 150));
  ctx.fillStyle = ink;
  dash((y += 40));

  font(ctx, 400, 30, BRAND.mono);
  y += 20;
  lines.forEach((l) => ctx.fillText(l, cx, (y += 46)));

  y += 40;
  barcode(ctx, cx - 250, y, 500, 96, r, ink);
  font(ctx, 400, 22, BRAND.mono);
  spacing(ctx, 3);
  ctx.globalAlpha = 0.7;
  ctx.fillText('THANK YOU · SEE YOU NEXT PAYDAY', cx, y + 140);
  ctx.globalAlpha = 1;
  spacing(ctx, 0);
  ctx.restore();

  wordmark(ctx, W / 2, H - (c.format === 'story' ? 110 : 50), 46, onAccent, 'center', paper);
}

// ---------- 3. Postcard ----------
function drawPostcard(ctx: Ctx, W: number, H: number, c: CardSpec, r: () => number) {
  const { accent, accentInk, ink, paper } = BRAND;
  ctx.fillStyle = mix(accent, '#FFFFFF', 0.78);
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, r, ink, 0.04, 6000);

  const story = c.format === 'story';
  const cw = W - 120;
  const ch = story ? 1560 : 1230;
  const cx0 = 60;
  const cy0 = (H - ch) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(40,20,5,0.22)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  rr(ctx, cx0, cy0, cw, ch, 28);
  ctx.fillStyle = paper;
  ctx.fill();
  ctx.restore();

  // illustration
  const ix = cx0 + 40;
  const iy = cy0 + 40;
  const iw = cw - 80;
  const ih = story ? 820 : 600;
  const sky = mix(accent, paper, 0.8);
  ctx.save();
  rr(ctx, ix, iy, iw, ih, 20);
  ctx.clip();
  ctx.fillStyle = sky;
  ctx.fillRect(ix, iy, iw, ih);
  const sunR = iw * 0.24;
  const sunX = ix + iw * 0.42;
  const sunY = iy + ih * 0.62;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = sky; // retro sunset stripes
  for (let k = 0; k < 6; k++) {
    const yy = sunY - sunR * 0.1 + k * sunR * 0.2;
    ctx.fillRect(sunX - sunR - 4, yy, sunR * 2 + 8, 5 + k * 4);
  }
  // birds
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const [bx, by, s] of [
    [ix + iw * 0.14, iy + ih * 0.18, 26],
    [ix + iw * 0.24, iy + ih * 0.26, 18],
    [ix + iw * 0.7, iy + ih * 0.16, 22],
  ]) {
    ctx.beginPath();
    ctx.moveTo(bx - s, by);
    ctx.quadraticCurveTo(bx - s / 2, by - s * 0.6, bx, by);
    ctx.quadraticCurveTo(bx + s / 2, by - s * 0.6, bx + s, by);
    ctx.stroke();
  }
  // waves
  const waveCols = [mix(accent, paper, 0.45), mix(accent, ink, 0.2), mix(accent, ink, 0.45), ink];
  waveCols.forEach((col, k) => {
    const base = iy + ih * (0.7 + k * 0.08);
    const amp = 14 + k * 4;
    const len = 190 + r() * 90;
    const ph = r() * Math.PI * 2;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ix, iy + ih);
    for (let x = ix; x <= ix + iw + 10; x += 10) ctx.lineTo(x, base + Math.sin((x - ix) / len * Math.PI * 2 + ph) * amp);
    ctx.lineTo(ix + iw, iy + ih);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();

  // stamp
  const sw = 200;
  const sh = 240;
  const sx = ix + iw - sw - 30;
  const sy = iy + 30;
  ctx.save();
  ctx.translate(sx + sw / 2, sy + sh / 2);
  ctx.rotate((5 * Math.PI) / 180);
  ctx.translate(-sw / 2, -sh / 2);
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, sw, sh);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = sky;
  for (let x = 0; x <= sw; x += 25) {
    for (const yy of [0, sh]) {
      ctx.beginPath();
      ctx.arc(x, yy, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let yy = 0; yy <= sh; yy += 25) {
    for (const x of [0, sw]) {
      ctx.beginPath();
      ctx.arc(x, yy, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = mix(accent, paper, 0.75);
  ctx.fillRect(22, 22, sw - 44, sh - 44);
  font(ctx, 400, 96, 'sans-serif');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.emoji || '✈️', sw / 2, sh / 2 - 12);
  ctx.textBaseline = 'alphabetic';
  font(ctx, 700, 22, BRAND.mono);
  ctx.fillStyle = ink;
  ctx.fillText('PULSE ✦ POST', sw / 2, sh - 38);
  ctx.restore();

  // postmark + cancellation waves
  const pmx = sx - 30;
  const pmy = sy + sh + 20;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(pmx, pmy, 84, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pmx, pmy, 58, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    for (let x = pmx - 330; x <= pmx - 96; x += 6) {
      const yy = pmy - 36 + k * 24 + Math.sin((x / 30) * Math.PI) * 6;
      if (x === pmx - 330) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.55;
  circleText(ctx, `${c.title.toUpperCase().slice(0, 18)} ✦ SAVING ✦ `, pmx, pmy, 71, `700 18px ${BRAND.mono}`, ink);
  font(ctx, 800, 30, BRAND.display);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.dateLabel.split('·').pop()?.trim().slice(0, 6) || '', pmx, pmy + 2);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  // text
  const tx = ix;
  const tw = iw;
  let y = iy + ih + (story ? 120 : 96);
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  fit(ctx, c.title.toUpperCase(), 800, story ? 84 : 70, BRAND.display, tw, 44);
  ctx.fillText(c.title.toUpperCase(), tx, y);

  const amt = money(c.amount);
  ctx.fillStyle = accentInk;
  const aSize = fit(ctx, amt, 800, story ? 220 : 170, BRAND.display, tw * (c.suffix ? 0.68 : 1), 80);
  y += aSize * 0.95 + 10;
  ctx.fillText(amt, tx - 4, y);
  const aW = ctx.measureText(amt).width;
  if (c.suffix) {
    ctx.fillStyle = ink;
    font(ctx, 600, story ? 64 : 54, BRAND.display);
    ctx.globalAlpha = 0.85;
    ctx.fillText(c.suffix, tx + aW + 20, y);
    ctx.globalAlpha = 1;
  }

  if (c.progress != null) {
    y += 56;
    ctx.fillStyle = mix(paper, ink, 0.1);
    rr(ctx, tx, y, tw, 20, 10);
    ctx.fill();
    ctx.fillStyle = accent;
    rr(ctx, tx, y, Math.max(20, tw * Math.min(1, c.progress)), 20, 10);
    ctx.fill();
    font(ctx, 700, 28, BRAND.body);
    ctx.fillStyle = ink;
    ctx.fillText(`${Math.round(c.progress * 100)}% saved`, tx, y + 64);
    y += 64;
  }

  ctx.fillStyle = ink;
  font(ctx, 500, story ? 42 : 36, BRAND.body);
  const lh = story ? 56 : 48;
  y += story ? 80 : 64;
  wrap(ctx, c.line, tw, story ? 3 : 2).forEach((l, i) => ctx.fillText(l, tx, y + i * lh));

  const fy = cy0 + ch - 50;
  font(ctx, 500, 24, BRAND.mono);
  spacing(ctx, 3);
  ctx.globalAlpha = 0.6;
  ctx.fillText('WISH YOU WERE HERE ✦', tx, fy);
  ctx.globalAlpha = 1;
  spacing(ctx, 0);
  wordmark(ctx, tx + tw, fy + 4, 44, ink, 'right');
}

// ---------- 4. Sticker ----------
function drawSticker(ctx: Ctx, W: number, H: number, c: CardSpec, r: () => number) {
  const { accent, onAccent, ink, paper } = BRAND;
  const story = c.format === 'story';
  ctx.fillStyle = mix(accent, '#FFFFFF', 0.82);
  ctx.fillRect(0, 0, W, H);
  // halftone from two corners
  ctx.fillStyle = accent;
  for (let y = 18; y < H; y += 34) {
    for (let x = 18 + ((y / 34) % 2) * 17; x < W; x += 34) {
      const d = Math.min(Math.hypot(x, y), Math.hypot(W - x, H - y));
      const rad = 10 * (1 - d / 760);
      if (rad > 0.6) {
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  grain(ctx, W, H, r, ink, 0.04, 4000);

  // washi tape headline
  const tapeY = story ? 250 : 150;
  ctx.save();
  ctx.translate(W / 2, tapeY);
  ctx.rotate((-4 * Math.PI) / 180);
  const tw = 760;
  ctx.beginPath();
  ctx.moveTo(-tw / 2, -54);
  ctx.lineTo(tw / 2, -54);
  for (let k = 0; k <= 6; k++) ctx.lineTo(tw / 2 + (k % 2 ? 14 : 0), -54 + (108 * k) / 6);
  ctx.lineTo(-tw / 2, 54);
  for (let k = 6; k >= 0; k--) ctx.lineTo(-tw / 2 - (k % 2 ? 14 : 0), -54 + (108 * k) / 6);
  ctx.closePath();
  ctx.fillStyle = paper;
  ctx.globalAlpha = 0.94;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  font(ctx, 800, 44, BRAND.display);
  spacing(ctx, 5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BUDGETING OUT LOUD', 0, 2);
  spacing(ctx, 0);
  ctx.restore();

  // die-cut sunburst
  const cx = W / 2;
  const cy = story ? 920 : 680;
  const R = story ? 400 : 330;
  const rot = r() * 0.3;
  ctx.save();
  starPath(ctx, cx + 20, cy + 26, 20, R, R * 0.86, rot);
  ctx.fillStyle = ink;
  ctx.fill();
  starPath(ctx, cx, cy, 20, R, R * 0.86, rot);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 34;
  ctx.strokeStyle = paper;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-5 * Math.PI) / 180);
  ctx.fillStyle = onAccent;
  ctx.textAlign = 'center';
  font(ctx, 700, story ? 36 : 30, BRAND.body);
  spacing(ctx, 5);
  const tl = wrap(ctx, c.title.toUpperCase(), R * 1.25, 2);
  tl.forEach((l, i) => ctx.fillText(l, 0, -R * 0.42 + i * 44));
  spacing(ctx, 0);
  const amt = money(c.amount);
  const aSize = fit(ctx, amt, 800, story ? 220 : 180, BRAND.display, R * 1.45, 70);
  ctx.fillText(amt, 0, aSize * 0.36 + (c.suffix ? -10 : 10));
  if (c.suffix) {
    font(ctx, 600, story ? 58 : 48, BRAND.display);
    ctx.fillText(c.suffix, 0, aSize * 0.36 + (story ? 80 : 66));
  }
  ctx.restore();

  // round badge
  const bx = story ? 170 : 150;
  const by = cy - R * 0.78;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate((12 * Math.PI) / 180);
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(0, 0, 92, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = paper;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, 76, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = paper;
  ctx.textAlign = 'center';
  const [b1, ...rest] = (c.badge || 'NO FOMO').toUpperCase().split(' ');
  font(ctx, 800, 34, BRAND.display);
  ctx.fillText(b1, 0, rest.length ? -4 : 12);
  if (rest.length) ctx.fillText(rest.join(' ').slice(0, 8), 0, 34);
  ctx.restore();
  sparkle(ctx, W - 160, cy - R * 0.9, 34, ink);
  sparkle(ctx, W - 110, cy - R * 0.62, 18, accent);
  sparkle(ctx, 130, cy + R * 0.7, 24, ink);

  // speech bubble with the line
  font(ctx, 600, story ? 42 : 36, BRAND.body);
  const bw = 820;
  const lines = wrap(ctx, c.line, bw - 90, 3);
  const lh = story ? 54 : 46;
  const bh = lines.length * lh + 70;
  const bxL = (W - bw) / 2;
  const byT = cy + R + (story ? 110 : 70);
  ctx.save();
  ctx.fillStyle = paper;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  rr(ctx, bxL, byT, bw, bh, 36);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bxL + 170, byT + 3);
  ctx.lineTo(bxL + 200, byT - 44);
  ctx.lineTo(bxL + 236, byT + 3);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bxL + 170, byT);
  ctx.lineTo(bxL + 200, byT - 44);
  ctx.lineTo(bxL + 236, byT);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, byT + 55 + i * lh + lh / 3));
  ctx.restore();

  const fy = H - (story ? 90 : 30);
  ctx.fillStyle = paper;
  rr(ctx, W / 2 - 170, fy - (story ? 100 : 92), 340, story ? 128 : 116, 30);
  ctx.fill();
  font(ctx, 600, 24, BRAND.body);
  spacing(ctx, 4);
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.6;
  ctx.textAlign = 'center';
  ctx.fillText(c.dateLabel, W / 2, H - (story ? 150 : 80));
  ctx.globalAlpha = 1;
  spacing(ctx, 0);
  wordmark(ctx, W / 2, H - (story ? 90 : 30), 46, ink, 'center');
}

// ---------- entry ----------
export async function ensureFonts() {
  const fams = [
    `800 100px ${BRAND.display}`,
    `600 100px ${BRAND.display}`,
    `700 40px ${BRAND.body}`,
    `500 40px ${BRAND.body}`,
    `400 30px ${BRAND.mono}`,
    `700 30px ${BRAND.mono}`,
  ];
  try {
    await Promise.all(fams.map((f) => document.fonts.load(f, '₹0123456789ABCabc')));
  } catch {
    /* draw with fallbacks */
  }
}

export function drawCard(canvas: HTMLCanvasElement, c: CardSpec) {
  const [W, H] = SIZES[c.format];
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
  spacing(ctx, 0);
  const r = rng(hash(`${c.style}|${c.title}|${c.line}`));
  if (c.style === 'ticket') drawTicket(ctx, W, H, c, r);
  else if (c.style === 'receipt') drawReceipt(ctx, W, H, c, r);
  else if (c.style === 'postcard') drawPostcard(ctx, W, H, c, r);
  else drawSticker(ctx, W, H, c, r);
}

export function cardBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
}

