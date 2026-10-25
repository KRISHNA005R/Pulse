// PULSE Rewind share card, drawn on a canvas so the preview is exactly the PNG that gets shared.
// "Aura glow": a dark background with soft orange glows, a little film grain, line-art sparkles,
// see-through chips and the PULSE name. Story size (1080 × 1920). No rupee amounts, ever.
import { BRAND } from './brand';
import { font, rng, rr, spacing, wordmark } from './cardArt';
import type { Rewind } from './rewind';

const W = 1080;
const H = 1920;

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(color, alpha));
  g.addColorStop(0.45, hexA(color, alpha * 0.6));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** A thin, four-point line-art sparkle. */
function starLine(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.quadraticCurveTo(cx + s * 0.12, cy - s * 0.12, cx + s, cy);
  ctx.quadraticCurveTo(cx + s * 0.12, cy + s * 0.12, cx, cy + s);
  ctx.quadraticCurveTo(cx - s * 0.12, cy + s * 0.12, cx - s, cy);
  ctx.quadraticCurveTo(cx - s * 0.12, cy - s * 0.12, cx, cy - s);
  ctx.stroke();
  ctx.restore();
}

function glass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(255,251,244,0.12)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,251,244,0.24)';
  ctx.stroke();
}

export function drawRewindCard(canvas: HTMLCanvasElement, r: Rewind) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Background and the three glows.
  ctx.fillStyle = '#1A120D';
  ctx.fillRect(0, 0, W, H);
  glow(ctx, 160, 260, 820, '#EC5B2B', 0.95);
  glow(ctx, 1010, 980, 640, '#F7A26B', 0.75);
  glow(ctx, 380, 1880, 760, '#C9421A', 0.9);
  // Film grain.
  const rand = rng(r.month.length * 7919 + r.chips.join('').length);
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#FFFBF4';
  for (let i = 0; i < 26000; i++) ctx.fillRect(rand() * W, rand() * H, 2, 2);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#000000';
  for (let i = 0; i < 18000; i++) ctx.fillRect(rand() * W, rand() * H, 2, 2);
  ctx.restore();
  // Line-art sparkles.
  starLine(ctx, 900, 330, 46, 'rgba(255,251,244,0.85)');
  starLine(ctx, 170, 1330, 30, 'rgba(255,251,244,0.75)');
  starLine(ctx, 930, 1420, 22, 'rgba(255,251,244,0.6)');

  ctx.textBaseline = 'alphabetic';
  // Kicker.
  ctx.fillStyle = 'rgba(255,251,244,0.88)';
  font(ctx, 800, 34, BRAND.body);
  spacing(ctx, 7);
  ctx.textAlign = 'left';
  ctx.fillText(`MY ${r.monthName.toUpperCase()} ON PULSE`, 96, 200);
  spacing(ctx, 0);

  // Title: "Food era," / "saver arc." — each line as big as fits.
  const lines = r.title.split(', ').map((l, i, a) => (i < a.length - 1 ? `${l},` : l));
  ctx.fillStyle = '#FFFBF4';
  ctx.textAlign = 'center';
  let y = 780 - (lines.length - 2) * 70;
  const sizes = lines.map((l) => {
    let s = 158;
    font(ctx, 800, s, BRAND.display);
    while (ctx.measureText(l).width > 900 && s > 70) {
      s -= 4;
      font(ctx, 800, s, BRAND.display);
    }
    return s;
  });
  const size = Math.min(...sizes);
  font(ctx, 800, size, BRAND.display);
  spacing(ctx, -size * 0.035);
  for (const l of lines) {
    ctx.fillText(l, W / 2, y);
    y += size * 0.98;
  }
  spacing(ctx, 0);

  // Chips, centred in rows.
  font(ctx, 800, 40, BRAND.body);
  const padX = 34;
  const ch = 88;
  const gap = 18;
  const widths = r.chips.map((c) => ctx.measureText(c).width + padX * 2);
  const rows: number[][] = [[]];
  let rowW = 0;
  widths.forEach((w, i) => {
    if (rowW + w > 900 && rows[rows.length - 1].length) {
      rows.push([]);
      rowW = 0;
    }
    rows[rows.length - 1].push(i);
    rowW += w + gap;
  });
  let cy = y + 40;
  for (const row of rows) {
    const total = row.reduce((a, i) => a + widths[i], 0) + gap * (row.length - 1);
    let cx = (W - total) / 2;
    for (const i of row) {
      glass(ctx, cx, cy, widths[i], ch, ch / 2);
      ctx.fillStyle = '#FFFBF4';
      ctx.textAlign = 'center';
      ctx.fillText(r.chips[i], cx + widths[i] / 2, cy + ch / 2 + 14);
      cx += widths[i] + gap;
    }
    cy += ch + gap;
  }

  // Bottom bar: PULSE and the address.
  glass(ctx, 96, 1652, W - 192, 150, 48);
  wordmark(ctx, 146, 1748, 64, '#FFFBF4', 'left', BRAND.accent);
  ctx.fillStyle = 'rgba(255,251,244,0.9)';
  font(ctx, 700, 36, BRAND.body);
  ctx.textAlign = 'right';
  ctx.fillText('pulsemoney.in', W - 146, 1740);
}
