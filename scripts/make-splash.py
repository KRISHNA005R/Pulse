"""Generates the PULSE launch splash (pure HTML/CSS/SVG, plays before the app's JS loads)
and writes it into index.html between the splash markers.

The film (about 3.3 s):
  1. A persimmon ₹ coin drops in spinning, lands with a bounce, sparks fly and light glints across its face.
  2. The coin flips, shrinks and flies into place as the full stop, while P-U-L-S-E roll in like slot-machine
     or balance-counter reels (digits and ₹ flicking past), stopping one after another. The dot clicks as E locks.
  3. A persimmon glint passes over the word; "Know what you can spend." appears.
  4. The dot flips like a tossed coin, floods the screen orange, and an iris opens from it onto the app.

Run:  python3 scripts/make-splash.py
Glyph outlines: Unbounded ExtraBold (wght 800), UPM 1000, y-up (pulse-glyphs.json, money-glyphs.json).
"""
import json, re, pathlib, random

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
GLYPHS = json.loads((HERE / 'pulse-glyphs.json').read_text())
MONEY = json.loads((HERE / 'money-glyphs.json').read_text())


def slim(d: str) -> str:
    return re.sub(r'-?\d+\.\d+', lambda m: f'{float(m.group()):.1f}'.rstrip('0').rstrip('.'), d)


# ---------- geometry (viewBox units; baseline at y = 0, caps up to -750) ----------
VB_W, VB_TOP, VB_H = 4300, -800, 840
letters = [g for g in GLYPHS if g['ch'] != '.']
dot = next(g for g in GLYPHS if g['ch'] == '.')
dcx = dot['x'] + (dot['b'][0] + dot['b'][2]) / 2
dcy = -((dot['b'][1] + dot['b'][3]) / 2)
dr = (dot['b'][2] - dot['b'][0]) / 2

fx = dcx / VB_W                  # dot centre as a fraction of the wordmark width
fy = (dcy - VB_TOP) / VB_H       # ... and of its height
fd = 2 * dr / VB_W               # dot diameter as a fraction of the width
ratio = VB_H / VB_W
dx, dy = 0.5 - fx, (0.5 - fy) * ratio   # slot → wordmark centre, in units of --W
K = 4.4                          # the coin is K times the size of the full stop

# ---------- reels ----------
ROW = 1100
rng = random.Random(7)
reel_rows = [6 + 2 * i for i in range(len(letters))]   # later reels spin more rows, so the speed feels equal

defs = ''.join(
    f'<path id="spG{"R" if c == "₹" else c}" transform="scale(1 -1)" d="{slim(MONEY[c]["d"])}"/>' for c in '0123456789₹'
)


def cx_of(b):
    return (b[0] + b[2]) / 2


reels = []
for i, g in enumerate(letters):
    lx = g['x'] + cx_of(g['b'])
    rows = [f'<path id="spP{i}" class="spLetter" transform="translate({g["x"]} 0) scale(1 -1)" d="{slim(g["d"])}"/>']
    for k in range(1, reel_rows[i] + 1):
        c = '₹' if k % 4 == 2 else rng.choice('0123456789')
        tx = round(lx - cx_of(MONEY[c]['b']))
        cls = 'spRup' if c == '₹' else 'spDig'
        rows.append(f'<use href="#spG{"R" if c == "₹" else c}" class="{cls}" transform="translate({tx} {k * ROW})"/>')
    reels.append(f'<g class="spReel" style="--i:{i};--n:{reel_rows[i]}">{"".join(rows)}</g>')
reels_svg = ''.join(reels)
uses = ''.join(f'<use href="#spP{i}"/>' for i in range(len(letters)))

rup = MONEY['₹']
rb = rup['b']
rup_svg = (f'<svg class="spRupee" viewBox="{rb[0] - 40:.0f} {-rb[3] - 40:.0f} {rb[2] - rb[0] + 80:.0f} {rb[3] - rb[1] + 80:.0f}">'
           f'<path transform="scale(1 -1)" d="{slim(rup["d"])}"/></svg>')

# ---------- timeline (seconds): one place to tune the whole film ----------
T = dict(
    fall=0.12, land=0.58, travel=0.98, arrive=1.42,
    reels=0.92, reel_len=0.42, reel_step=0.10,
    lock=1.76, sheen=1.84, tag=1.86,
    flip=2.28, flood=2.52, flooded=2.84, open_end=3.30,
)
TOTAL = 3.4
last_lock = T['reels'] + T['reel_len'] + T['reel_step'] * (len(letters) - 1)


def pct(t, total=TOTAL):
    return f'{min(100, max(0, t / total * 100)):.2f}%'


C = f'translate(calc(var(--W) * {dx:.5f}), calc(var(--W) * {dy:.5f}))'
Z = 'translate(0px, 0px)'
k = 1 / K
coin_frames = [
    (0, C, 1, 'linear'),
    (T['travel'], C, 1, 'cubic-bezier(.65,0,.25,1)'),
    (T['arrive'], Z, k, 'linear'),
    (last_lock, Z, k, 'cubic-bezier(.3,0,.3,1)'),
    (last_lock + 0.06, Z, k * 1.45, 'cubic-bezier(.3,0,.3,1)'),
    (last_lock + 0.18, Z, k, 'linear'),
    (TOTAL, Z, k, 'linear'),
]
coin_kf = '\n'.join(f'  {pct(t)} {{ transform: {tr} scale({s:.4f}); animation-timing-function: {e}; }}' for t, tr, s, e in coin_frames)

spin_frames = [
    (0, 0, 'linear'),
    (T['fall'], 0, 'cubic-bezier(.15,.55,.3,1)'),
    (T['land'] + 0.08, 1080, 'linear'),
    (T['travel'], 1080, 'cubic-bezier(.55,0,.35,1)'),
    (T['arrive'], 1440, 'linear'),
    (T['flip'], 1440, 'cubic-bezier(.5,0,.3,1)'),
    (T['flip'] + 0.26, 1800, 'linear'),
    (TOTAL, 1800, 'linear'),
]
spin_kf = '\n'.join(f'  {pct(t)} {{ transform: rotateY({a}deg); animation-timing-function: {e}; }}' for t, a, e in spin_frames)

fall_frames = [
    (0, '-78vh', 'linear'),
    (T['fall'], '-78vh', 'cubic-bezier(.55,0,.9,.45)'),
    (T['land'], '0px', 'cubic-bezier(.2,.7,.4,1)'),
    (T['land'] + 0.10, 'calc(var(--W) * -0.07)', 'cubic-bezier(.6,0,.8,.4)'),
    (T['land'] + 0.20, '0px', 'cubic-bezier(.2,.7,.4,1)'),
    (T['land'] + 0.25, 'calc(var(--W) * -0.018)', 'cubic-bezier(.6,0,.8,.4)'),
    (T['land'] + 0.30, '0px', 'linear'),
    (TOTAL, '0px', 'linear'),
]
fall_kf = '\n'.join(f'  {pct(t)} {{ transform: translateY({y}); animation-timing-function: {e}; }}' for t, y, e in fall_frames)

sparks = ''.join(f'<span class="spSpark" style="--a:{a}deg;--d:{d}"></span>'
                 for a, d in [(-8, 1), (28, .8), (62, 1.1), (118, .9), (152, 1.05), (188, .85), (222, 1), (258, .75), (298, 1.1), (332, .9)])
edges = ''.join(f'<i style="--z:{z}px"></i>' for z in (-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5))

CSS = f"""
#sp {{ --W: min(76vw, 380px); --D: calc(var(--W) * {fd * K:.5f}); --ink: #17140F; --or: #EC5B2B; position: fixed; top: 0; left: 0; right: 0; bottom: 0; height: 100vh; height: 100dvh; z-index: 2147483000; overflow: hidden;
  display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px); background: var(--ink); cursor: pointer; -webkit-tap-highlight-color: transparent; animation: spBg {TOTAL}s linear both; }}
#sp::before {{ content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(90% 60% at 50% 50%, rgba(236,91,43,.11) 0%, rgba(23,20,15,0) 50%), radial-gradient(130% 100% at 50% 50%, transparent 55%, rgba(0,0,0,.55) 100%);
  animation: spHide {TOTAL}s step-end both; }}
#sp::after {{ content: ''; position: absolute; inset: -60px; pointer-events: none; opacity: .09; mix-blend-mode: screen;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  animation: spGrain .5s steps(4) infinite, spHide {TOTAL}s step-end both; }}
#sp .spStage {{ position: relative; width: var(--W); aspect-ratio: {VB_W} / {VB_H}; animation: spCam 2.8s cubic-bezier(.2,.7,.2,1) both; }}
#sp .spWordWrap {{ position: absolute; inset: 0; animation: spHide {TOTAL}s step-end both; }}
#sp svg.spWord {{ position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; animation: spReelsIn .12s linear {T['reels']:.2f}s both; }}
#sp .spLetter {{ fill: #F6F5F2; }}
#sp .spDig {{ fill: rgba(246,245,242,.42); }}
#sp .spRup {{ fill: var(--or); }}
#sp .spReel {{ animation: spReel var(--len) cubic-bezier(.25,.1,.3,1.12) {T['reels']:.2f}s both;
  --len: calc({T['reel_len']}s + var(--i) * {T['reel_step']}s); }}
#sp .spSheen {{ transform: translateX(-1200px) skewX(-18deg); animation: spSheen .75s cubic-bezier(.45,0,.3,1) {T['sheen']:.2f}s both; }}
/* Logo and tagline are one centred column, so the pair sits in the exact middle of the visible screen. */
#sp .spGroup {{ display: flex; flex-direction: column; align-items: center; gap: 22px; }}
#sp .spTag {{ position: relative; white-space: nowrap; margin: 0; text-align: center;
  font: 500 clamp(12.5px, 3.6vw, 15px)/1 'Onest Variable', 'Onest', system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: .01em; color: rgba(246,245,242,.62);
  animation: spTag {TOTAL}s linear both; }}
#sp .spTag b {{ color: var(--or); font-weight: 600; }}

#sp .spCoin, #sp .spFlood, #sp .spIris, #sp .spFloor, #sp .spSpark {{ position: absolute; }}
#sp .spCoin {{ width: var(--D); height: var(--D); left: calc(var(--W) * {fx:.5f} - var(--D) / 2); top: calc(var(--W) * {ratio * fy:.5f} - var(--D) / 2);
  transform: {Z} scale({k:.4f}); animation: spCoin {TOTAL}s linear both, spHide {TOTAL}s step-end both; will-change: transform; }}
#sp .spFall {{ position: absolute; inset: 0; perspective: 700px; animation: spFall {TOTAL}s linear both; }}
#sp .spSpin {{ position: absolute; inset: 0; transform-style: preserve-3d; animation: spSpin {TOTAL}s linear both; }}
#sp .spSpin i, #sp .spFace {{ position: absolute; inset: 0; border-radius: 50%; }}
#sp .spSpin i {{ background: #B9441B; transform: translateZ(var(--z)); }}
#sp .spFace {{ background: var(--or); transform: translateZ(4px); overflow: hidden; backface-visibility: hidden; box-shadow: 0 0 22px rgba(236,91,43,.45); outline: 1px solid transparent; }}
#sp .spFace.spBack {{ transform: rotateY(180deg) translateZ(4px); }}
#sp .spMint {{ position: absolute; inset: 0; border-radius: 50%; opacity: 0; animation: spMint {TOTAL}s linear both;
  background: radial-gradient(circle at 30% 26%, rgba(255,214,190,.55), rgba(255,214,190,0) 46%), radial-gradient(circle at 70% 80%, rgba(120,32,6,.35), rgba(120,32,6,0) 55%); }}
#sp .spMint::before {{ content: ''; position: absolute; inset: 9%; border-radius: 50%; border: calc(var(--D) * .025) solid rgba(23,20,15,.2); box-shadow: inset 0 0 0 calc(var(--D) * .02) rgba(255,220,200,.18); }}
#sp .spMint::after {{ content: ''; position: absolute; inset: -10%; background: linear-gradient(115deg, transparent 38%, rgba(255,251,244,.85) 50%, transparent 62%);
  transform: translateX(-120%); animation: spGlint .5s cubic-bezier(.4,0,.2,1) {T['land'] + 0.1:.2f}s both; }}
#sp .spRupee {{ position: absolute; left: 27%; top: 25%; width: 46%; height: 50%; fill: #17140F; opacity: .88; }}
#sp .spFloor {{ width: calc(var(--D) * 1.6); height: calc(var(--D) * .34); left: calc(50% - var(--D) * .8); top: calc(50% + var(--D) * .52);
  border-radius: 50%; background: radial-gradient(closest-side, rgba(236,91,43,.55), rgba(236,91,43,0)); opacity: 0; animation: spFloor {TOTAL}s linear both; }}
#sp .spSpark {{ left: 50%; top: 50%; width: calc(var(--D) * .16); height: calc(var(--D) * .16); margin: calc(var(--D) * -.08); opacity: 0;
  background: #FFD9C4; clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%);
  animation: spSpark .6s cubic-bezier(.1,.7,.3,1) {T['land']:.2f}s both; }}
#sp .spSpark:nth-child(odd) {{ background: var(--or); }}
#sp .spFlood {{ width: calc(var(--W) * {fd:.5f}); aspect-ratio: 1; left: calc(var(--W) * {fx:.5f}); top: calc(var(--W) * {ratio * fy:.5f}); transform: translate(-50%, -50%);
  border-radius: 50%; background: var(--or); opacity: 0;
  animation: spFlood {T['flooded'] - T['flood']:.2f}s cubic-bezier(.7,0,.85,.25) {T['flood']:.2f}s forwards, spHide {TOTAL}s step-end both; }}
#sp .spIris {{ width: 0; height: 0; left: calc(var(--W) * {fx:.5f}); top: calc(var(--W) * {ratio * fy:.5f}); transform: translate(-50%, -50%); border-radius: 50%;
  box-shadow: 0 0 0 300vmax var(--or); opacity: 0; animation: spIris {T['open_end'] - T['flooded'] + 0.05:.2f}s cubic-bezier(.55,.05,.25,1) {T['flooded'] - 0.03:.2f}s forwards; }}
#sp.spOut {{ opacity: 0; transition: opacity .28s ease; pointer-events: none; }}

@keyframes spCoin {{
{coin_kf}
}}
@keyframes spSpin {{
{spin_kf}
}}
@keyframes spFall {{
{fall_kf}
}}
@keyframes spMint {{ 0% {{ opacity: 1; }} {pct(T['travel'] + 0.08)} {{ opacity: 1; }} {pct(T['arrive'] - 0.06)}, 100% {{ opacity: 0; }} }}
@keyframes spFloor {{ 0%, {pct(T['fall'] + 0.15)} {{ opacity: 0; transform: scale(.4); }} {pct(T['land'])} {{ opacity: 1; transform: scale(1); }}
  {pct(T['land'] + 0.1)} {{ opacity: .7; transform: scale(.85); }} {pct(T['land'] + 0.2)} {{ opacity: 1; transform: scale(1); }}
  {pct(T['travel'])} {{ opacity: .8; transform: scale(1); }} {pct(T['travel'] + 0.18)}, 100% {{ opacity: 0; transform: scale(.5); }} }}
@keyframes spSpark {{ 0% {{ opacity: 0; transform: rotate(var(--a)) translateX(calc(var(--D) * .5)) scale(.4); }}
  12% {{ opacity: 1; }}
  100% {{ opacity: 0; transform: rotate(var(--a)) translateX(calc(var(--D) * (1.05 + var(--d) * .5))) scale(1.1) rotate(90deg); }} }}
@keyframes spGlint {{ to {{ transform: translateX(120%); }} }}
@keyframes spReel {{ from {{ transform: translateY(calc(var(--n) * {-ROW}px)); }} to {{ transform: translateY(0); }} }}
@keyframes spReelsIn {{ from {{ opacity: 0; }} to {{ opacity: 1; }} }}
@keyframes spBg {{ 0%, {pct(T['flooded'] + 0.01)} {{ background-color: #17140F; }} {pct(T['flooded'] + 0.02)}, 100% {{ background-color: transparent; }} }}
@keyframes spHide {{ 0%, {pct(T['flooded'] + 0.01)} {{ visibility: visible; }} {pct(T['flooded'] + 0.02)}, 100% {{ visibility: hidden; }} }}
@keyframes spGrain {{ 0% {{ transform: translate(0, 0); }} 25% {{ transform: translate(-22px, 14px); }} 50% {{ transform: translate(16px, -26px); }} 75% {{ transform: translate(-10px, -8px); }} 100% {{ transform: translate(0, 0); }} }}
@keyframes spCam {{ from {{ transform: scale(1.07); }} to {{ transform: scale(1); }} }}
@keyframes spSheen {{ to {{ transform: translateX(5200px) skewX(-18deg); }} }}
@keyframes spTag {{ 0%, {pct(T['tag'])} {{ opacity: 0; transform: translateY(8px); letter-spacing: .12em; }}
  {pct(T['tag'] + 0.4)}, {pct(T['flooded'] + 0.01)} {{ opacity: 1; transform: translateY(0); letter-spacing: .01em; }}
  {pct(T['flooded'] + 0.02)}, 100% {{ opacity: 0; }} }}
@keyframes spFlood {{ 0% {{ opacity: 1; }} 100% {{ opacity: 1; width: 240vmax; }} }}
@keyframes spIris {{ 0% {{ opacity: 1; width: 0; height: 0; }} 100% {{ opacity: 1; width: 170vmax; height: 170vmax; }} }}
@media (prefers-reduced-motion: reduce) {{
  #sp, #sp *, #sp::before, #sp::after {{ animation: none !important; }}
  #sp {{ animation: spQuiet 1.2s ease both !important; }}
  #sp .spFloor, #sp .spSpark, #sp .spIris, #sp .spFlood, #sp .spSheen {{ display: none; }}
  #sp .spTag {{ opacity: 1; }}
  @keyframes spQuiet {{ 0%, 70% {{ opacity: 1; }} 100% {{ opacity: 0; }} }}
}}
""".strip()

HTML = f"""<div id="sp" aria-hidden="true">
  <div class="spGroup">
  <div class="spStage">
    <span class="spFloor"></span>
    <div class="spWordWrap">
      <svg class="spWord" viewBox="0 {VB_TOP} {VB_W} {VB_H}" focusable="false">
        <defs>{defs}
          <linearGradient id="spFade" gradientUnits="userSpaceOnUse" x1="0" y1="-930" x2="0" y2="170"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".12" stop-color="#fff"/><stop offset=".85" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
          <mask id="spWin" maskUnits="userSpaceOnUse" x="-300" y="-930" width="4900" height="1100"><rect x="-300" y="-930" width="4900" height="1100" fill="url(#spFade)"/></mask>
          <clipPath id="spShape">{uses}</clipPath>
          <linearGradient id="spShine" x1="0" x2="1"><stop offset="0" stop-color="#EC5B2B" stop-opacity="0"/><stop offset=".5" stop-color="#EC5B2B" stop-opacity=".95"/><stop offset="1" stop-color="#EC5B2B" stop-opacity="0"/></linearGradient></defs>
        <g mask="url(#spWin)">{reels_svg}</g>
        <g clip-path="url(#spShape)"><rect class="spSheen" x="0" y="-900" width="620" height="1000" fill="url(#spShine)"/></g>
      </svg>
    </div>
    <span class="spSparks">{sparks}</span>
    <span class="spCoin"><span class="spFall"><span class="spSpin">{edges}<b class="spFace"><span class="spMint">{rup_svg}</span></b><b class="spFace spBack"><span class="spMint">{rup_svg}</span></b></span></span></span>
    <span class="spFlood"></span>
    <span class="spIris"></span>
  </div>
  <p class="spTag">Know what you can <b>spend.</b></p>
  </div>
</div>
<script>
(function () {{
  var sp = document.getElementById('sp');
  if (!sp) return;
  var seen = false;
  try {{ seen = sessionStorage.getItem('pulse-splash') === '1'; sessionStorage.setItem('pulse-splash', '1'); }} catch (e) {{}}
  // Once per session, and never in the way of a home-screen shortcut.
  if (seen || /[?&]action=/.test(location.search)) {{ sp.remove(); return; }}
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tc = document.createElement('meta');
  tc.name = 'theme-color'; tc.id = 'sp-tc'; tc.content = '#17140F';
  document.head.insertBefore(tc, document.head.firstChild);
  var done = false, timers = [];
  function end() {{
    if (done) return; done = true;
    timers.forEach(clearTimeout);
    tc.remove(); sp.remove();
    removeEventListener('keydown', skip, true);
  }}
  function skip() {{
    if (done) return;
    tc.remove(); sp.classList.add('spOut');
    timers.push(setTimeout(end, 300));
  }}
  sp.addEventListener('pointerdown', skip);
  addEventListener('keydown', skip, true);
  timers.push(setTimeout(function () {{ tc.remove(); }}, calm ? 800 : {int(T['flooded'] * 1000)}));
  timers.push(setTimeout(end, calm ? 1250 : {int(T['open_end'] * 1000) + 120}));
}})();
</script>"""

START, END = '<!-- splash:start -->', '<!-- splash:end -->'
CSTART, CEND = '/* splash-css:start */', '/* splash-css:end */'

index = ROOT / 'index.html'
html = index.read_text()
block = f'{START}\n{HTML}\n{END}'
if START in html:
    html = re.sub(re.escape(START) + r'.*?' + re.escape(END), lambda m: block, html, flags=re.S)
else:
    html = html.replace('<body>\n', '<body>\n' + block + '\n', 1)
css_block = f'{CSTART}\n{CSS}\n{CEND}'
if CSTART in html:
    html = re.sub(re.escape(CSTART) + r'.*?' + re.escape(CEND), lambda m: css_block, html, flags=re.S)
else:
    html = html.replace('    </style>\n  </head>', css_block + '\n    </style>\n  </head>', 1)
index.write_text(html)
print('splash written:', len(block) + len(css_block), 'bytes')
