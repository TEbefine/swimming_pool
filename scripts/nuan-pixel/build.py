import sys, importlib
sys.path.insert(0, '.')
import glyphs; importlib.reload(glyphs)
import latin
from soften import soften
from glyphs import G
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

P = 50            # units per pixel
UPM = 20 * P      # 20px em
ASC, DESC = 18, 5
BOLD = '--bold' in sys.argv
FAMILY = "Nuan Pixel"
STYLE = "Bold" if BOLD else "Regular"
THAI_GAP = 1 if '--gap1' in sys.argv else 2

def pixels(gd):
    px = set()
    for i, row in enumerate(gd['rows']):
        y = gd['top'] - i
        for x, c in enumerate(row):
            if c == '#':
                px.add((x, y))
    return soften(px)

def embolden(px):
    return px | {(x + 1, y) for x, y in px}

def trace(px):
    """Union of unit squares -> clockwise contours (TrueType outer)."""
    edges = {}
    for x, y in px:
        for a, b in (((x, y), (x, y + 1)), ((x, y + 1), (x + 1, y + 1)),
                     ((x + 1, y + 1), (x + 1, y)), ((x + 1, y), (x, y))):
            if (b, a) in edges:
                del edges[(b, a)]
            else:
                edges[(a, b)] = True
    out = {}
    for a, b in edges:
        out.setdefault(a, []).append(b)
    contours = []
    while out:
        start = next(iter(out))
        pts = [start]
        cur = start
        prev_dir = None
        while True:
            nxts = out[cur]
            if len(nxts) > 1 and prev_dir is not None:
                # at pinch: turn right relative to incoming direction
                dx, dy = prev_dir
                right = (dy, -dx)
                pick = None
                for n in nxts:
                    if (n[0] - cur[0], n[1] - cur[1]) == right:
                        pick = n
                nxt = pick or nxts[0]
            else:
                nxt = nxts[0]
            nxts.remove(nxt)
            if not nxts:
                del out[cur]
            prev_dir = (nxt[0] - cur[0], nxt[1] - cur[1])
            cur = nxt
            if cur == start:
                break
            pts.append(cur)
        # drop collinear points
        simp = []
        n = len(pts)
        for i in range(n):
            a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
            if (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) != 0:
                simp.append(b)
        contours.append(simp)
    return contours

def draw(px, dx=0):
    pen = TTGlyphPen(None)
    for c in trace(px):
        pen.moveTo(((c[0][0] + dx) * P, c[0][1] * P))
        for p in c[1:]:
            pen.lineTo(((p[0] + dx) * P, p[1] * P))
        pen.closePath()
    return pen.glyph()

order = ['.notdef', 'space', 'uni00A0']
glyf, adv, cmap = {}, {}, {}
info = {}   # name -> dict(W=body width, kind, cls, stack, top)

# .notdef
nd = {(x, y) for x in range(6) for y in range(10) if x in (0, 5) or y in (0, 9)}
glyf['.notdef'] = draw(nd); adv['.notdef'] = 7 * P
for sp, cp in (('space', 0x20), ('uni00A0', 0xA0)):
    glyf[sp] = TTGlyphPen(None).glyph(); adv[sp] = 5 * P; cmap[cp] = sp

def add(name, px, advance, cp=None):
    glyf[name] = draw(px); adv[name] = advance * P
    if name not in order: order.append(name)
    if cp is not None: cmap[cp] = name

for name, gd in G.items():
    px = pixels(gd)
    if BOLD: px = embolden(px)
    if not px:
        continue
    maxx = max(x for x, _ in px)
    if gd['kind'] == 'mark':
        shift = -(maxx + 1) + gd.get('dx', 0)
        px = {(x + shift, y) for x, y in px}
        add(name, px, 0, gd['cp'])
        info[name] = dict(kind='mark', cls=gd['cls'], stack=gd.get('stack'), top=gd['top'])
    else:
        W = maxx + 1
        thai = 0x0E01 <= (gd['cp'] or 0) <= 0x0E5B
        add(name, px, W + (THAI_GAP if thai else 1), gd['cp'])
        info[name] = dict(kind='base', W=W, asc=gd.get('asc', False),
                          top=max(y for _, y in px), bot=min(y for _, y in px),
                          thai=0x0E01 <= (gd['cp'] or 0) <= 0x0E2E)

# derived: tailless ญ ฐ for use with lower vowels
for base, cut in (('uni0E0D', -1), ('uni0E10', -1)):
    px = {(x, y) for x, y in pixels(G[base]) if y >= 0}
    if BOLD: px = embolden(px)
    W = max(x for x, _ in px) + 1
    add(base + '.notail', px, W + THAI_GAP)
    info[base + '.notail'] = dict(kind='base', W=W, asc=False, top=6, bot=0, thai=True)

# ำ precomposed: nikhahit hanging over previous glyph + า
aa = pixels(G['uni0E32']); nk = pixels(G['uni0E4D'])
nk = {(x - 3, y) for x, y in nk}   # ring at x -3..-1, y 8..10
am = aa | nk
if BOLD: am = embolden(am)
add('uni0E33', am, max(x for x, _ in aa) + THAI_GAP + (2 if BOLD else 1), 0x0E33)

# dotted circle
dc = {(2,9),(4,9),(0,7),(6,7),(0,5),(6,5),(0,3),(6,3),(2,1),(4,1)}
if BOLD: dc = embolden(dc)
add('uni25CC', dc, 8, 0x25CC)
info['uni25CC'] = dict(kind='base', W=7 + (1 if BOLD else 0), asc=False, top=9, bot=0, thai=True)

# ---------- OpenType features ----------
def gl(names): return '[' + ' '.join(names) + ']'
marks = {c: [n for n, i in info.items() if i['kind'] == 'mark' and i['cls'] == c] for c in ('UV', 'TONE', 'LV')}
bases = [n for n, i in info.items() if i['kind'] == 'base' and i.get('thai')]
Y8 = 11 * P
fea = ["languagesystem DFLT dflt;", "languagesystem thai dflt;", "languagesystem latn dflt;"]
fea.append(f"markClass {gl(marks['UV'])} <anchor 0 {Y8}> @UV;")
fea.append(f"markClass {gl(marks['TONE'])} <anchor 0 {Y8}> @TONE;")
fea.append(f"markClass {gl(marks['LV'])} <anchor 0 0> @LV;")
fea.append("lookup notail { sub uni0E0D by uni0E0D.notail; sub uni0E10 by uni0E10.notail; } notail;")
fea.append("feature ccmp {")
fea.append("  lookupflag 0;")
fea.append(f"  sub [uni0E0D uni0E10]' lookup notail {gl(marks['LV'])};")
fea.append("} ccmp;")
fea.append("feature mark {")
for b in bases:
    i = info[b]
    tx = i['W'] - (2 if i['asc'] else 0)
    ty = Y8 + 0
    by = 0
    if b in ('uni0E0E', 'uni0E0F'): by = -4 * P
    fea.append(f"  pos base {b} <anchor {tx*P} {ty}> mark @UV <anchor {tx*P} {ty}> mark @TONE <anchor {i['W']*P} {by}> mark @LV;")
fea.append("} mark;")
fea.append("feature mkmk {")
for m in marks['UV']:
    fea.append(f"  pos mark {m} <anchor 0 {info[m]['stack']*P}> mark @TONE;")
fea.append("} mkmk;")
FEA = "\n".join(fea)

# ---------- build ----------
fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap(cmap)
fb.setupGlyf(glyf)
metrics = {}
gt = fb.font['glyf']
for n in order:
    g = gt[n]
    if g.numberOfContours:
        g.recalcBounds(gt)
    metrics[n] = (adv[n], g.xMin if g.numberOfContours else 0)
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=ASC * P, descent=-DESC * P)
fb.setupNameTable({
    "familyName": FAMILY, "styleName": STYLE,
    "uniqueFontIdentifier": f"NuanPixel-{STYLE};SAP by Teera;2026",
    "fullName": f"{FAMILY} {STYLE}", "psName": f"NuanPixel-{STYLE}",
    "version": "Version 2.000", "copyright": "(c) 2026 Teera Thongbai / SAP by Teera",
    "designer": "Teera Thongbai with Claude", "manufacturer": "SAP by Teera",
    "description": "Soft Thai + Latin pixel font for Pixel Poolside",
})
fb.setupOS2(version=4, sTypoAscender=ASC * P, sTypoDescender=-DESC * P, sTypoLineGap=0,
            usWinAscent=ASC * P, usWinDescent=7 * P, fsSelection=(0x20 if BOLD else 0x40) | 0x80,
            usWeightClass=700 if BOLD else 400, achVendID="SAPT",
            ulUnicodeRange1=(1 << 0) | (1 << 24), ulCodePageRange1=(1 << 0) | (1 << 16),
            sxHeight=7 * P, sCapHeight=10 * P)
fb.setupPost(isFixedPitch=0, underlinePosition=-2 * P, underlineThickness=P)
fb.setupHead(unitsPerEm=UPM, macStyle=1 if BOLD else 0, created=3000000000+786000000, modified=3000000000+786000000)
# GDEF
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
gdef = "table GDEF { GlyphClassDef %s, , %s, ; } GDEF;" % (
    gl([n for n in order if info.get(n, {}).get('kind') != 'mark' and n != '.notdef']),
    gl(marks['UV'] + marks['TONE'] + marks['LV']))
addOpenTypeFeaturesFromString(fb.font, FEA + "\n" + gdef)
fb.font['head'].flags |= (1 << 3)  # integer ppem
out = f"out/NuanPixel-{STYLE}"
import os; os.makedirs('out', exist_ok=True)
fb.save(out + ".ttf")
fb.font.flavor = 'woff2'; fb.save(out + ".woff2")
print("glyphs:", len(order), "->", out)
