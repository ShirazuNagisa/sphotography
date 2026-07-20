# -*- coding: utf-8 -*-
# Generate an animated cursive "Sphotography" wordmark SVG (Pinyon Script),
# self-contained (glyphs baked to paths). Big S written slowly, then
# "photography" quickly, revealed by a moving pen nib. Pure SMIL animation
# (runs even when the SVG is used as an <img>; no JS).
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, 'fonts', 'pinyon.ttf')
OUT  = os.path.join(HERE, '..', 'promo')
os.makedirs(OUT, exist_ok=True)

font = TTFont(FONT)
glyphset = font.getGlyphSet()
cmap = font.getBestCmap()
hmtx = font['hmtx']
UPM = font['head'].unitsPerEm

def gname(ch): return cmap[ord(ch)]
def adv(ch):   return hmtx[gname(ch)][0]

# --- Layout scales (arbitrary user units; viewBox scales everything) --------
PSCALE = 0.20                 # "photography" size
SSCALE = PSCALE * 1.9         # capital S ~1.9x taller
BASE_Y = 0.0                  # baseline (font y-up flipped to svg y-down)
OVERLAP = 0.06                # pull "photography" slightly under S's tail

def matrix(scale, penx, basey):
    # (x,y)_font -> (scale*x + penx, -scale*y + basey)_svg
    return (scale, 0.0, 0.0, -scale, penx, basey)

def draw_seg(chars, scale, penx):
    """Return (svg_path_d, bounds, penx_after) for a run of chars."""
    spen = SVGPathPen(glyphset)
    bpen = BoundsPen(glyphset)
    x = penx
    for ch in chars:
        m = matrix(scale, x, BASE_Y)
        glyphset[gname(ch)].draw(TransformPen(spen, m))
        glyphset[gname(ch)].draw(TransformPen(bpen, m))
        x += adv(ch) * scale
    return spen.getCommands(), bpen.bounds, x

def union(a, b):
    if a is None: return b
    if b is None: return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))

# S segment
d_S, b_S, penx = draw_seg('S', SSCALE, 0.0)
S_advance = penx
# pull the rest left a touch so it connects to the S tail
penx -= OVERLAP * S_advance
# photography segment
d_P, b_P, penx_end = draw_seg('photography', PSCALE, penx)

bounds = union(b_S, b_P)
xmin, ymin, xmax, ymax = bounds
S_xmax = b_S[2]  # right edge of the S -> reveal split point

# viewBox with small padding (compact)
w = xmax - xmin
h = ymax - ymin
pad = 0.05 * h
vb_x = xmin - pad
vb_y = ymin - pad
vb_w = w + 2 * pad
vb_h = h + 2 * pad

# --- Timing -----------------------------------------------------------------
T  = 2.4          # total write duration (s)
TS = 1.4          # slow S portion
kS = round(TS / T, 4)                       # keyTime where S is done
# reveal widths (rect grows from vb_x)
rev_S = S_xmax - vb_x
rev_full = vb_w
# nib x (leading edge of reveal)
nib_x0 = vb_x
nib_xS = S_xmax
nib_x1 = vb_x + vb_w
# nib vertical: ride within the lowercase body, a bit above baseline
nib_y = BASE_Y - 0.34 * (PSCALE * UPM)
nib_r = 0.9 + 0.010 * h   # small dot, scales gently with size

# --- SVG template -----------------------------------------------------------
def build(ink, bg):
    """ink=hex ink color, bg=hex or None (transparent)."""
    bg_rect = (f'<rect x="{vb_x:.2f}" y="{vb_y:.2f}" width="{vb_w:.2f}" '
               f'height="{vb_h:.2f}" fill="{bg}"/>') if bg else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb_x:.2f} {vb_y:.2f} {vb_w:.2f} {vb_h:.2f}" role="img" aria-label="Sphotography">
  <defs>
    <radialGradient id="nibGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{ink}" stop-opacity="1"/>
      <stop offset="45%" stop-color="{ink}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="{ink}" stop-opacity="0"/>
    </radialGradient>
    <mask id="reveal" maskUnits="userSpaceOnUse" x="{vb_x:.2f}" y="{vb_y:.2f}" width="{vb_w:.2f}" height="{vb_h:.2f}">
      <rect x="{vb_x:.2f}" y="{vb_y:.2f}" width="0" height="{vb_h:.2f}" fill="#fff">
        <animate attributeName="width" dur="{T}s" fill="freeze" calcMode="linear"
                 keyTimes="0;{kS};1" values="0;{rev_S:.2f};{rev_full:.2f}"/>
      </rect>
    </mask>
  </defs>
  {bg_rect}
  <g mask="url(#reveal)" fill="{ink}">
    <path d="{d_S}"/>
    <path d="{d_P}"/>
  </g>
  <circle r="{nib_r:.2f}" cx="0" cy="{nib_y:.2f}" fill="url(#nibGlow)">
    <animate attributeName="cx" dur="{T}s" fill="freeze" calcMode="linear"
             keyTimes="0;{kS};1" values="{nib_x0:.2f};{nib_xS:.2f};{nib_x1:.2f}"/>
    <animate attributeName="opacity" dur="{T}s" fill="freeze"
             keyTimes="0;0.04;0.95;1" values="0;1;1;0"/>
  </circle>
</svg>
'''

variants = {
    'sphotography-dark.svg':          ('#ffffff', '#0d0d0f'),
    'sphotography-light.svg':         ('#0d0d0f', '#ffffff'),
    'sphotography-white-on-clear.svg':('#ffffff', None),
    'sphotography-black-on-clear.svg':('#0d0d0f', None),
}
for fn, (ink, bg) in variants.items():
    with open(os.path.join(OUT, fn), 'w', encoding='utf-8') as f:
        f.write(build(ink, bg))
    print('wrote', fn)

print(f'viewBox = {vb_x:.1f} {vb_y:.1f} {vb_w:.1f} {vb_h:.1f}  (S_xmax={S_xmax:.1f}, kS={kS})')
