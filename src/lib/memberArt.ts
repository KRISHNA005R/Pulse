// The member card: what someone posts to their story after signing in. Five looks, all drawn on a
// canvas so the preview is exactly the image that gets shared.
import { BRAND } from './brand';
import { barcode, circleText, fit, font, grain, hash, mix, rng, rr, SIZES, spacing, sparkle, starPath, wordmark } from './cardArt';

export type MemberStyle = 'black' | 'pass' | 'jersey' | 'receipt' | 'seal';
export const MEMBER_STYLES: { value: MemberStyle; label: string }[] = [
  { value: 'black', label: 'Black card' },
  { value: 'pass', label: 'Boarding pass' },
  { value: 'jersey', label: 'Jersey' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'seal', label: 'Sticker' },
];

export interface MemberSpec {
  n: number;
  name: string;
  /** "Day-one member" */
  title: string;
  /** "Oct 2026" */
  since: string;
}

type Ctx = CanvasRenderingContext2D;
const INK = BRAND.ink;
const PAPER = BRAND.paper;
const ORANGE = BRAND.accent;
const CREAM = '#F6F5F2';

const firstName = (m: MemberSpec) => (m.name.trim().split(/\s+/)[0] || 'Member').slice(0, 18);
const tag = (m: MemberSpec) => (m.title.toLowerCase().startsWith('day-one') ? 'DAY ONE' : 'MEMBER');
const padded = (n: number) => String(n).padStart(6, '0');

function text(ctx: Ctx, t: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') {
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
}
/** A pill with words in it. Returns its width. */
function pill(ctx: Ctx, t: string, x: number, y: number, bg: string, fg: string, size = 40, align: 'left' | 'center' = 'left') {
  font(ctx, 700, size, BRAND.body);
  spacing(ctx, 0);
  const w = ctx.measureText(t).width + size * 1.5;
  const h = size * 2.1;
  const left = align === 'center' ? x - w / 2 : x;
  rr(ctx, left, y - h / 2, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.textBaseline = 'middle';
  text(ctx, t, left + w / 2, y + 2, fg, 'center');
  ctx.textBaseline = 'alphabetic';
  return w;
}
function dashed(ctx: Ctx, x1: number, y: number, x2: number, color: string, width = 3) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

// ---------- 1. Black card: the flex ----------
function drawBlack(ctx: Ctx, W: number, H: number, m: MemberSpec, r: () => number) {
  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, 0, W, H);
  // The number, huge and faint, bleeding off the edge.
  ctx.save();
  ctx.globalAlpha = 0.09;
  font(ctx, 800, 720, BRAND.display);
  text(ctx, `${m.n}`, W + 40, 1500, INK, 'right');
  ctx.restore();
  grain(ctx, W, H, r, INK, 0.07, 3200);

  wordmark(ctx, 88, 180, 60, INK, 'left', PAPER);
  font(ctx, 800, 148, BRAND.display);
  text(ctx, 'I’m in.', 84, 440, INK);
  font(ctx, 600, 46, BRAND.body);
  text(ctx, `${firstName(m)} just got a PULSE number.`, 90, 520, mix(INK, ORANGE, 0.12));

  const cw = 900;
  const ch = 566;
  ctx.save();
  ctx.translate(W / 2 + 6, 1040);
  // A second card peeking out behind.
  ctx.save();
  ctx.rotate((7 * Math.PI) / 180);
  rr(ctx, -cw / 2 + 30, -ch / 2 + 46, cw, ch, 52);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.restore();

  ctx.rotate((-7 * Math.PI) / 180);
  ctx.save();
  ctx.shadowColor = 'rgba(23,20,15,0.45)';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 36;
  rr(ctx, -cw / 2, -ch / 2, cw, ch, 52);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.restore();
  ctx.save();
  rr(ctx, -cw / 2, -ch / 2, cw, ch, 52);
  ctx.clip();
  const glow = ctx.createRadialGradient(cw / 2, -ch / 2, 0, cw / 2, -ch / 2, cw * 0.75);
  glow.addColorStop(0, 'rgba(236,91,43,0.55)');
  glow.addColorStop(1, 'rgba(236,91,43,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
  // A band of light across the card.
  ctx.rotate(-0.5);
  const sheen = ctx.createLinearGradient(0, -80, 0, 80);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.07)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-cw, -80, cw * 2, 160);
  ctx.restore();

  wordmark(ctx, -cw / 2 + 56, -ch / 2 + 96, 44, CREAM);
  font(ctx, 700, 26, BRAND.mono);
  spacing(ctx, 6);
  text(ctx, 'MEMBER', cw / 2 - 56, -ch / 2 + 90, 'rgba(246,245,242,0.65)', 'right');
  spacing(ctx, 0);
  const label = `#${m.n}`;
  font(ctx, 800, fit(ctx, label, 800, 250, BRAND.display, cw - 130, 110), BRAND.display);
  text(ctx, label, -cw / 2 + 48, 96, ORANGE);
  font(ctx, 700, 36, BRAND.mono);
  spacing(ctx, 5);
  text(ctx, firstName(m).toUpperCase(), -cw / 2 + 56, ch / 2 - 60, CREAM);
  font(ctx, 400, 28, BRAND.mono);
  spacing(ctx, 3);
  text(ctx, `${tag(m)} · ${m.since.toUpperCase()}`, cw / 2 - 56, ch / 2 - 62, 'rgba(246,245,242,0.65)', 'right');
  spacing(ctx, 0);
  ctx.restore();

  sparkle(ctx, 930, 640, 46, PAPER);
  sparkle(ctx, 150, 1430, 30, INK);
  sparkle(ctx, 985, 1395, 20, INK);

  font(ctx, 700, 50, BRAND.body);
  text(ctx, 'Know what’s safe to spend.', W / 2, 1610, INK, 'center');
  text(ctx, 'Till payday.', W / 2, 1674, INK, 'center');
  pill(ctx, 'Get your number → pulsemoney.in', W / 2, 1790, INK, CREAM, 38, 'center');
}

// ---------- 2. Boarding pass: broke → sorted ----------
function drawPass(ctx: Ctx, W: number, H: number, m: MemberSpec, r: () => number) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, 1100);
  glow.addColorStop(0, 'rgba(236,91,43,0.35)');
  glow.addColorStop(1, 'rgba(236,91,43,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, r, '#FFFFFF', 0.05, 2600);

  wordmark(ctx, 96, 200, 60, CREAM);
  font(ctx, 700, 28, BRAND.mono);
  spacing(ctx, 6);
  text(ctx, 'BOARDING PASS', W - 96, 194, ORANGE, 'right');
  spacing(ctx, 0);

  const x = 96;
  const y = 300;
  const w = W - 192;
  const h = 1300;
  const cut = y + 930; // where the stub tears off
  const notch = 34;
  ctx.save();
  ctx.beginPath();
  const rad = 48;
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.lineTo(x + w, cut - notch);
  ctx.arc(x + w, cut, notch, -Math.PI / 2, Math.PI / 2, true);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.lineTo(x, cut + notch);
  ctx.arc(x, cut, notch, Math.PI / 2, -Math.PI / 2, true);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.clip();
  // A strip of orange along the top of the ticket.
  ctx.fillStyle = ORANGE;
  ctx.fillRect(x, y, w, 130);
  font(ctx, 700, 30, BRAND.mono);
  spacing(ctx, 5);
  text(ctx, 'PULSE AIR', x + 56, y + 82, INK);
  text(ctx, `FLIGHT PL${String(m.n).padStart(3, '0')}`, x + w - 56, y + 82, INK, 'right');
  spacing(ctx, 0);
  ctx.restore();

  const soft = mix(INK, PAPER, 0.45);
  const lab = (t: string, lx: number, ly: number, align: CanvasTextAlign = 'left') => {
    font(ctx, 700, 24, BRAND.mono);
    spacing(ctx, 4);
    text(ctx, t, lx, ly, soft, align);
    spacing(ctx, 0);
  };
  lab('PASSENGER', x + 56, y + 220);
  const who = firstName(m).toUpperCase();
  font(ctx, 800, fit(ctx, who, 800, 92, BRAND.display, w - 112, 48), BRAND.display);
  text(ctx, who, x + 52, y + 316, INK);

  lab('FROM', x + 56, y + 430);
  lab('TO', x + w - 56, y + 590, 'right');
  font(ctx, 800, 112, BRAND.display);
  text(ctx, 'BROKE', x + 50, y + 550, INK);
  font(ctx, 800, 112, BRAND.display);
  text(ctx, 'SORTED', x + w - 50, y + 700, ORANGE, 'right');
  // The route between them.
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.setLineDash([4, 16]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 600, y + 512);
  ctx.quadraticCurveTo(x + 800, y + 520, x + 790, y + 600);
  ctx.stroke();
  ctx.restore();
  font(ctx, 400, 84, BRAND.body);
  text(ctx, '✈', x + 150, y + 686, INK);
  font(ctx, 500, 32, BRAND.body);
  text(ctx, '“paisa kahan gaya?”', x + 56, y + 600, soft);
  text(ctx, 'knows what’s safe to spend', x + w - 56, y + 750, soft, 'right');

  const cols: [string, string, boolean][] = [
    ['SEAT', `#${m.n}`, true],
    ['CLASS', tag(m), false],
    ['GATE', 'PAYDAY', false],
  ];
  cols.forEach(([l, v, hot], i) => {
    const cx = x + 56 + (i * (w - 112)) / 3;
    lab(l, cx, y + 830);
    font(ctx, 800, fit(ctx, v, 800, hot ? 54 : 40, BRAND.display, (w - 112) / 3 - 44, 24), BRAND.display);
    text(ctx, v, cx, y + 894, hot ? ORANGE : INK);
  });

  dashed(ctx, x + notch + 14, cut, x + w - notch - 14, mix(INK, PAPER, 0.7), 4);
  barcode(ctx, x + 56, cut + 70, w - 112, 150, r, INK);
  font(ctx, 700, 28, BRAND.mono);
  spacing(ctx, 5);
  text(ctx, `MEMBER NO. ${padded(m.n)}`, x + 56, cut + 280, INK);
  text(ctx, m.since.toUpperCase(), x + w - 56, cut + 280, INK, 'right');
  spacing(ctx, 0);

  font(ctx, 700, 48, BRAND.body);
  text(ctx, 'Seats are free. Board at', W / 2, 1722, CREAM, 'center');
  font(ctx, 800, 54, BRAND.display);
  text(ctx, 'pulsemoney.in', W / 2, 1802, ORANGE, 'center');
}

// ---------- 3. Jersey: team PULSE ----------
function drawJersey(ctx: Ctx, W: number, H: number, m: MemberSpec, r: () => number) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // Pitch stripes, very faint.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = INK;
  for (let i = 0; i < 6; i++) ctx.fillRect(0, 300 + i * 300, W, 150);
  ctx.restore();
  grain(ctx, W, H, r, INK, 0.05, 2600);

  wordmark(ctx, 96, 190, 60, INK);
  font(ctx, 700, 28, BRAND.mono);
  spacing(ctx, 6);
  text(ctx, 'SEASON 2026', W - 96, 184, mix(INK, PAPER, 0.4), 'right');
  spacing(ctx, 0);
  font(ctx, 800, 112, BRAND.display);
  text(ctx, 'TEAM', 90, 400, INK);
  text(ctx, 'PULSE.', 90, 520, ORANGE);

  // The shirt, seen from the back.
  const cx = W / 2;
  const top = 640;
  const shirt = () => {
    ctx.beginPath();
    ctx.moveTo(cx - 150, top);
    ctx.quadraticCurveTo(cx, top + 70, cx + 150, top);
    ctx.lineTo(cx + 260, top + 10);
    ctx.lineTo(cx + 470, top + 190);
    ctx.lineTo(cx + 380, top + 370);
    ctx.lineTo(cx + 280, top + 300);
    ctx.lineTo(cx + 280, top + 940);
    ctx.lineTo(cx - 280, top + 940);
    ctx.lineTo(cx - 280, top + 300);
    ctx.lineTo(cx - 380, top + 370);
    ctx.lineTo(cx - 470, top + 190);
    ctx.lineTo(cx - 260, top + 10);
    ctx.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(23,20,15,0.3)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 34;
  shirt();
  ctx.strokeStyle = INK; // a bold ink outline, like a sticker of a shirt
  ctx.lineWidth = 40;
  ctx.stroke();
  ctx.restore();
  shirt();
  ctx.fillStyle = ORANGE;
  ctx.fill();
  ctx.save();
  ctx.lineJoin = 'round';
  shirt();
  ctx.clip();
  // Ink cuffs and a side stripe.
  ctx.fillStyle = INK;
  ctx.save();
  ctx.translate(cx + 425, top + 280);
  ctx.rotate(-1.1);
  ctx.fillRect(-140, -34, 280, 44);
  ctx.restore();
  ctx.save();
  ctx.translate(cx - 425, top + 280);
  ctx.rotate(1.1);
  ctx.fillRect(-140, -34, 280, 44);
  ctx.restore();
  ctx.fillRect(cx - 300, top + 880, 600, 90);
  grain(ctx, W, H, r, '#FFFFFF', 0.06, 1800);
  ctx.restore();
  // Collar.
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 30;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 150, top - 4);
  ctx.quadraticCurveTo(cx, top + 66, cx + 150, top - 4);
  ctx.stroke();
  ctx.restore();

  const who = firstName(m).toUpperCase();
  font(ctx, 800, fit(ctx, who, 800, 84, BRAND.display, 500, 44), BRAND.display);
  spacing(ctx, 6);
  text(ctx, who, cx + 3, top + 250, INK, 'center');
  spacing(ctx, 0);
  const num = `${m.n}`;
  const size = fit(ctx, num, 800, 440, BRAND.display, 500, 150);
  font(ctx, 800, size, BRAND.display);
  const base = top + 300 + size * 0.86;
  text(ctx, num, cx + 12, base + 12, INK, 'center'); // a hard shadow, like a printed kit
  text(ctx, num, cx, base, PAPER, 'center');
  font(ctx, 700, 30, BRAND.mono);
  spacing(ctx, 8);
  text(ctx, tag(m), cx + 4, top + 842, INK, 'center');
  spacing(ctx, 0);

  sparkle(ctx, 950, 600, 40, ORANGE);
  sparkle(ctx, 120, 1500, 28, INK);
  font(ctx, 700, 48, BRAND.body);
  text(ctx, `Signed for the team in ${m.since}.`, W / 2, 1722, INK, 'center');
  pill(ctx, 'Pick your number → pulsemoney.in', W / 2, 1812, INK, CREAM, 38, 'center');
}

// ---------- 4. Receipt: everything costs ₹0 ----------
function drawReceipt(ctx: Ctx, W: number, H: number, m: MemberSpec, r: () => number) {
  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, r, INK, 0.07, 3000);
  wordmark(ctx, 96, 180, 56, INK, 'left', PAPER);

  const x = 150;
  const y = 270;
  const w = W - 300;
  const h = 1400;
  ctx.save();
  ctx.translate(W / 2, y + h / 2);
  ctx.rotate((-2.5 * Math.PI) / 180);
  ctx.translate(-W / 2, -(y + h / 2));
  ctx.save();
  ctx.shadowColor = 'rgba(23,20,15,0.35)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  const teeth = 26;
  for (let i = teeth; i >= 0; i--) ctx.lineTo(x + (w * i) / teeth, y + h + (i % 2 ? 22 : 0)); // the torn edge
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();

  const L = x + 56;
  const R = x + w - 56;
  const soft = mix(INK, '#FFFFFF', 0.45);
  const line = mix(INK, '#FFFFFF', 0.72);
  wordmark(ctx, W / 2, y + 120, 64, INK, 'center');
  font(ctx, 700, 28, BRAND.mono);
  spacing(ctx, 6);
  text(ctx, 'MEMBERSHIP RECEIPT', W / 2, y + 180, soft, 'center');
  spacing(ctx, 0);
  dashed(ctx, L, y + 226, R, line);

  const row = (l: string, v: string, yy: number, bold = false, hot = false) => {
    font(ctx, bold ? 700 : 400, 34, BRAND.mono);
    text(ctx, l, L, yy, bold ? INK : soft);
    font(ctx, 700, 34, BRAND.mono);
    text(ctx, v, R, yy, hot ? ORANGE : INK, 'right');
  };
  row('MEMBER NO.', `#${m.n}`, y + 300, false, true);
  row('NAME', firstName(m).toUpperCase(), y + 360);
  row('JOINED', m.since.toUpperCase(), y + 420);
  row('STATUS', tag(m), y + 480);
  dashed(ctx, L, y + 530, R, line);

  const items: [string, string][] = [
    ['Knowing what’s', 'safe to spend'],
    ['No more “paisa', 'kahan gaya?”'],
    ['Splits without', 'the drama'],
  ];
  items.forEach(([a, b], i) => {
    const yy = y + 606 + i * 126;
    font(ctx, 700, 36, BRAND.mono);
    text(ctx, `1 × ${a}`, L, yy, INK);
    text(ctx, '₹0', R, yy, INK, 'right');
    font(ctx, 400, 36, BRAND.mono);
    text(ctx, `    ${b}`, L, yy + 46, INK);
  });
  dashed(ctx, L, y + 990, R, line);
  font(ctx, 800, 76, BRAND.display);
  text(ctx, 'TOTAL', L - 4, y + 1094, INK);
  text(ctx, '₹0', R, y + 1094, ORANGE, 'right');
  font(ctx, 400, 30, BRAND.mono);
  text(ctx, 'PAID WITH: good decisions', L, y + 1150, soft);
  barcode(ctx, L, y + 1196, w - 112, 110, r, INK);
  spacing(ctx, 3);
  const bye = `${padded(m.n)} · THANK YOU, COME AGAIN (YOU WILL)`;
  font(ctx, 400, fit(ctx, bye, 400, 26, BRAND.mono, w - 112, 16), BRAND.mono);
  text(ctx, bye, W / 2, y + 1356, soft, 'center');
  spacing(ctx, 0);
  ctx.restore();

  pill(ctx, 'Get yours free → pulsemoney.in', W / 2, 1806, INK, CREAM, 38, 'center');
}

// ---------- 5. Sticker: the seal ----------
function drawSeal(ctx: Ctx, W: number, H: number, m: MemberSpec, r: () => number) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  // A grid of dots, like a sticker sheet.
  ctx.save();
  ctx.fillStyle = 'rgba(246,245,242,0.08)';
  for (let yy = 60; yy < H; yy += 60) for (let xx = 60; xx < W; xx += 60) ctx.fillRect(xx, yy, 4, 4);
  ctx.restore();

  wordmark(ctx, 96, 190, 60, CREAM);
  font(ctx, 800, 100, BRAND.display);
  text(ctx, 'officially', 88, 400, CREAM);
  text(ctx, 'one of us.', 88, 510, ORANGE);

  const cx = W / 2;
  const cy = 1020;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 30;
  starPath(ctx, 0, 0, 22, 440, 396, 0);
  ctx.fillStyle = ORANGE;
  ctx.fill();
  ctx.restore();
  // White edge, the way a die-cut sticker has one.
  ctx.lineJoin = 'round';
  starPath(ctx, 0, 0, 22, 440, 396, 0);
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 268, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  const ring = `PULSE MEMBER ✦ ${tag(m)} ✦ PULSE MEMBER ✦ ${tag(m)} ✦ `;
  circleText(ctx, ring, 0, 0, 326, `800 46px ${BRAND.display}`, INK);
  const label = `#${m.n}`;
  font(ctx, 800, fit(ctx, label, 800, 230, BRAND.display, 440, 90), BRAND.display);
  ctx.textBaseline = 'middle';
  text(ctx, label, 0, 4, INK, 'center');
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  // Name, on a strip of label tape across the seal.
  const who = firstName(m).toUpperCase();
  ctx.save();
  ctx.translate(cx + 150, cy + 330);
  ctx.rotate(-0.1);
  font(ctx, 800, 62, BRAND.display);
  const tw = Math.min(620, ctx.measureText(who).width + 110);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = CREAM;
  ctx.fillRect(-tw / 2, -62, tw, 124);
  ctx.shadowColor = 'transparent';
  font(ctx, 800, fit(ctx, who, 800, 62, BRAND.display, tw - 70, 34), BRAND.display);
  ctx.textBaseline = 'middle';
  text(ctx, who, 0, 4, INK, 'center');
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  // Two small stickers.
  ctx.save();
  ctx.translate(250, 1560);
  ctx.rotate(0.07);
  pill(ctx, 'safe to spend ✓', 0, 0, CREAM, INK, 38, 'center');
  ctx.restore();
  ctx.save();
  ctx.translate(800, 620);
  ctx.rotate(0.12);
  pill(ctx, 'no cap', 0, 0, ORANGE, INK, 40, 'center');
  ctx.restore();
  sparkle(ctx, 150, 700, 34, ORANGE);
  sparkle(ctx, 950, 1500, 44, CREAM);
  grain(ctx, W, H, r, '#FFFFFF', 0.04, 2400);

  font(ctx, 500, 40, BRAND.body);
  text(ctx, `Joined ${m.since}`, W / 2, 1712, 'rgba(246,245,242,0.7)', 'center');
  font(ctx, 800, 54, BRAND.display);
  text(ctx, 'pulsemoney.in', W / 2, 1800, CREAM, 'center');
}

export function drawMemberCard(canvas: HTMLCanvasElement, m: MemberSpec, style: MemberStyle = 'black') {
  const [W, H] = SIZES.story;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  spacing(ctx, 0);
  const r = rng(hash(`member|${style}|${m.n}`));
  if (style === 'pass') drawPass(ctx, W, H, m, r);
  else if (style === 'jersey') drawJersey(ctx, W, H, m, r);
  else if (style === 'receipt') drawReceipt(ctx, W, H, m, r);
  else if (style === 'seal') drawSeal(ctx, W, H, m, r);
  else drawBlack(ctx, W, H, m, r);
}
