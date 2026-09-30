"""Grey-box background for the Dalbit dock & market (placeholder until the real painting exists).

Run:  python3 scripts/make_market_greybox.py   → public/maps/dalbit/market.webp (1024×576)
Plain boxes with labels, on purpose: play Day 1 first, then paint only what the scene proves it needs.
Positions MUST match src/game/rooms/dalbitMarketLayout.ts.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1024, 576
HORIZON = 140
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))   # sky stays transparent: the game draws it
d = ImageDraw.Draw(img)
font = ImageFont.truetype(str(ROOT / 'public/fonts/NuanPixel-Bold.ttf'), 16)
small = ImageFont.truetype(str(ROOT / 'public/fonts/NuanPixel-Bold.ttf'), 12)
INK = (43, 27, 18, 255)

# sea + far shore
d.rectangle([0, HORIZON, W, 222], fill=(78, 132, 160, 255))
for y in range(HORIZON + 8, 222, 14):
    d.line([(0, y), (W, y)], fill=(96, 150, 176, 255), width=1)
# ground (packed sand) + a darker path
d.rectangle([0, 222, W, H], fill=(214, 194, 150, 255))
d.polygon([(0, 380), (1024, 360), (1024, 440), (0, 462)], fill=(196, 172, 128, 255))
d.line([(0, 222), (W, 222)], fill=INK, width=2)

def box(x0, y0, x1, y1, fill, label=None, sub=None):
    d.rectangle([x0, y0, x1, y1], fill=fill, outline=INK, width=3)
    if label:
        tw = d.textlength(label, font=font)
        d.rectangle([(x0 + x1) / 2 - tw / 2 - 6, y0 + 8, (x0 + x1) / 2 + tw / 2 + 6, y0 + 30], fill=(255, 246, 229, 255), outline=INK, width=2)
        d.text(((x0 + x1) / 2 - tw / 2, y0 + 10), label, font=font, fill=INK)
    if sub:
        tw = d.textlength(sub, font=small)
        d.text(((x0 + x1) / 2 - tw / 2, y0 + 36), sub, font=small, fill=INK)

def person(x, y, color, name):
    """A pawn standing with its feet at (x, y)."""
    d.rectangle([x - 11, y - 34, x + 11, y], fill=color, outline=INK, width=2)
    d.ellipse([x - 10, y - 54, x + 10, y - 34], fill=(236, 200, 160, 255), outline=INK, width=2)
    tw = d.textlength(name, font=small)   # name tag under the feet, so it never covers a stall sign
    d.rectangle([x - tw / 2 - 4, y + 4, x + tw / 2 + 4, y + 19], fill=(255, 246, 229, 255), outline=INK, width=1)
    d.text((x - tw / 2, y + 5), name, font=small, fill=INK)

# the dock (planks out into the sea) + a boat
d.rectangle([740, 150, 820, 230], fill=(150, 108, 70, 255), outline=INK, width=3)
for y in range(160, 230, 12):
    d.line([(740, y), (820, y)], fill=INK, width=1)
d.polygon([(846, 176), (930, 176), (916, 196), (858, 196)], fill=(120, 84, 56, 255), outline=INK)

# inn back door (left)
box(20, 168, 232, 300, (176, 150, 118, 255), 'INN', 'back door')
d.rectangle([108, 236, 150, 300], fill=(92, 64, 44, 255), outline=INK, width=2)
person(130, 318, (122, 92, 150, 255), 'INNKEEPER')

# rice shop + its price board
box(262, 180, 468, 300, (190, 170, 120, 255), 'RICE SHOP', 'sacks inside')
d.rectangle([486, 236, 544, 292], fill=(255, 246, 229, 255), outline=INK, width=3)
d.text((492, 244), 'RICE', font=small, fill=INK)
d.text((492, 262), '1 sack', font=small, fill=INK)
d.text((492, 276), '30 c', font=small, fill=(156, 74, 62, 255))
d.rectangle([512, 292, 518, 314], fill=INK)
person(365, 318, (110, 130, 96, 255), 'RICE SELLER')

# Gu's fish stall by the dock, with the Governor's red seal banner
box(596, 226, 872, 318, (150, 150, 150, 255), "GU'S FISH STALL", 'the dock seal')
d.rectangle([840, 238, 862, 280], fill=(176, 52, 44, 255), outline=INK, width=2)
d.ellipse([845, 250, 857, 262], fill=(240, 200, 90, 255))
person(734, 338, (60, 60, 72, 255), 'MASTER GU')

# yeot cart (lower left)
box(170, 420, 290, 470, (214, 150, 80, 255), 'YEOT', None)
d.ellipse([178, 462, 198, 482], fill=INK)
d.ellipse([262, 462, 282, 482], fill=INK)
person(316, 482, (180, 120, 70, 255), 'YEOT SELLER')

# road sign, left edge
d.rectangle([8, 376, 14, 420], fill=INK)
d.rectangle([2, 360, 84, 380], fill=(255, 246, 229, 255), outline=INK, width=2)
d.text((8, 362), '< RIVER', font=small, fill=INK)

# grey-box stamp
d.text((W - 150, H - 22), 'GREY-BOX v1', font=small, fill=(120, 100, 80, 255))

out = ROOT / 'public/maps/dalbit/market.webp'
img.save(out, lossless=True)
print('wrote', out)
