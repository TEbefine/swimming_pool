"""Whisker Woods (room `woods_1`): background + tall-grass element frames.

Usage: python3 scripts/process_woods.py
Reads  src/assets/woods_1_src.png            (ChatGPT painting, grass removed, 1672×941)
       src/assets/woods_grass_sheet_src.png  (4×4 sheet on magenta: rows A/B/C × calm, left, right, parted; row 4 = leaf bits)
Writes public/maps/woods_1.webp (1024×576, sky keyed so the code sky shows through)
       public/maps/thumbs/woods_1.webp (320×180)
       public/sprites/elements/woods/grass_{a,b,c}_{calm,left,right,parted}.webp, grass_fx_{1..4}.webp

Grass: magenta + its purple fringe → transparent; each cell cut to its art pixels (one shared box per
row so the base and centre never jump between frames); shrunk to native pixel size, the sheet's bright
greens remapped to the map's own grass greens (darkest → lightest), then drawn 2× with crisp pixels.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP_SRC = os.path.join(ROOT, 'src/assets/woods_1_src.png')
SHEET_SRC = os.path.join(ROOT, 'src/assets/woods_grass_sheet_src.png')
MAP_OUT = os.path.join(ROOT, 'public/maps/woods_1.webp')
THUMB = os.path.join(ROOT, 'public/maps/thumbs/woods_1.webp')
EL_DIR = os.path.join(ROOT, 'public/sprites/elements/woods')
W, H = 1024, 576

# Grass greens tuned to the map (darker + richer than the lawn #A0D860, tips a touch lighter than it),
# darkest → lightest. The sheet's 5 neon greens are mapped onto these by brightness.
MAP_GREENS = np.array([(10, 84, 70), (20, 118, 80), (42, 150, 78), (92, 186, 70), (186, 232, 98)], float)
SHEET_ART_PX = 13.5   # sheet pixels per native art pixel (tuft A ≈ 15 art px tall → 30 px in game)
DRAW_SCALE = 2
STATES = ['calm', 'left', 'right', 'parted']
TUFTS = ['a', 'b', 'c']


def process_map():
    im = Image.open(MAP_SRC).convert('RGB')
    a = np.array(im).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    blue = (b >= 200) & (b > g + 25) & (g > r + 30)
    cloud = (b > 180) & (r > 150) & (g > 170)
    sky_like = blue | cloud
    sky_like[int(a.shape[0] * 0.40):] = False  # never below the tree line
    lab, _ = ndimage.label(sky_like)
    top = set(np.unique(lab[0])) - {0}
    sky = np.isin(lab, list(top))
    sky = ndimage.binary_fill_holes(sky)          # cloud shading enclosed by sky
    alpha = Image.fromarray(((~sky) * 255).astype(np.uint8))
    rgb = im.resize((W, H), Image.Resampling.LANCZOS)
    al = np.array(alpha.resize((W, H), Image.Resampling.BOX))
    al = np.where(al >= 140, 255, 0).astype(np.uint8)
    out = np.dstack([np.array(rgb), al])
    Image.fromarray(out, 'RGBA').save(MAP_OUT, 'WEBP', lossless=True)
    rows = np.nonzero((al == 0).any(axis=1))[0]
    print('saved', MAP_OUT, 'lowest sky row', rows.max() if len(rows) else None)
    Image.fromarray(out, 'RGBA').convert('RGB').resize((320, 180), Image.Resampling.LANCZOS).save(THUMB, 'WEBP', quality=88)
    print('thumb', THUMB)


def kmeans(px, k, it=20):
    rng = np.random.RandomState(0)
    c = px[rng.choice(len(px), k, replace=False)].astype(float)
    for _ in range(it):
        lab = ((px[:, None, :] - c[None]) ** 2).sum(-1).argmin(1)
        for i in range(k):
            if (lab == i).any():
                c[i] = px[lab == i].mean(0)
    return c


def lum(c):
    return 0.3 * c[..., 0] + 0.59 * c[..., 1] + 0.11 * c[..., 2]


def process_grass():
    os.makedirs(EL_DIR, exist_ok=True)
    s = np.array(Image.open(SHEET_SRC).convert('RGB')).astype(int)
    r, g, b = s[..., 0], s[..., 1], s[..., 2]
    bg = ((r - g) > 30) & ((b - g) > 30)          # magenta and its purple fringe
    alpha = np.where(bg, 0, 255)
    white = (r > 200) & (g > 200) & (b > 200)
    greens = s[(alpha > 0) & ~white].astype(float)
    sheet_c = kmeans(greens[::5], len(MAP_GREENS))
    sheet_c = sheet_c[np.argsort(lum(sheet_c))]
    target = MAP_GREENS[np.argsort(lum(MAP_GREENS))]

    cell = s.shape[0] / 4
    for row in range(4):
        y0, y1 = int(row * cell), int((row + 1) * cell)
        boxes = []
        for col in range(4):
            x0, x1 = int(col * cell), int((col + 1) * cell)
            ys, xs = np.nonzero(alpha[y0:y1, x0:x1])
            boxes.append((xs.min(), xs.max(), ys.min(), ys.max()))
        # one shared box per row (relative to the cell), so frames keep the same base and centre
        bx0 = min(bb[0] for bb in boxes); bx1 = max(bb[1] for bb in boxes)
        by0 = min(bb[2] for bb in boxes); by1 = max(bb[3] for bb in boxes)
        for col in range(4):
            x0 = int(col * cell)
            crop_rgb = s[y0 + by0:y0 + by1 + 1, x0 + bx0:x0 + bx1 + 1].astype(float)
            crop_a = alpha[y0 + by0:y0 + by1 + 1, x0 + bx0:x0 + bx1 + 1]
            nw = max(1, round(crop_a.shape[1] / SHEET_ART_PX))
            nh = max(1, round(crop_a.shape[0] / SHEET_ART_PX))
            small = np.zeros((nh, nw, 4), np.uint8)
            # one art pixel = the most common palette colour in its block (ignoring the background);
            # empty when less than ~45% of the block is grass
            for j in range(nh):
                for i in range(nw):
                    ya, yb = int(j * crop_a.shape[0] / nh), int((j + 1) * crop_a.shape[0] / nh)
                    xa, xb = int(i * crop_a.shape[1] / nw), int((i + 1) * crop_a.shape[1] / nw)
                    blk_a = crop_a[ya:yb, xa:xb] > 0
                    if blk_a.mean() < 0.45:
                        continue
                    px = crop_rgb[ya:yb, xa:xb][blk_a]
                    if ((px > 200).all(1)).mean() > 0.3:
                        small[j, i] = (250, 250, 240, 255)
                        continue
                    lab = ((px[:, None, :] - sheet_c[None]) ** 2).sum(-1).argmin(1)
                    k = np.bincount(lab, minlength=len(sheet_c)).argmax()
                    small[j, i] = (*target[k].astype(np.uint8), 255)
            big = Image.fromarray(small, 'RGBA').resize((nw * DRAW_SCALE, nh * DRAW_SCALE), Image.Resampling.NEAREST)
            name = f'grass_fx_{col + 1}' if row == 3 else f'grass_{TUFTS[row]}_{STATES[col]}'
            big.save(os.path.join(EL_DIR, name + '.webp'), 'WEBP', lossless=True)
            print(name, big.size)


if __name__ == '__main__':
    process_map()
    process_grass()
