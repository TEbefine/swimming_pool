"""Quiet Bay life: cut the day/night animation sheets + the props sheet into small strips for the game.

Usage: python3 scripts/process_bay_life.py
Sheets (prompts: docs → world/quiet-bay-ambient.md), each 4x4, EACH ROW = one 4-frame loop:
  src/assets/bay_life_day_sheet.webp   gull_fly · gull_stand · fish_jump · cat_walk
  src/assets/bay_life_night_sheet.webp squid_boat · heron · jelly · lanterns (paper ×2, camp ×2)
  src/assets/bay_props_sheet.webp      single props (bucket, cooler, sleeping cat …)
Rows are cut on the fixed grid and cropped to ONE box per row, so the frames stay lined up
(the jumping fish keeps its arc). Output: public/sprites/bay/<name>.webp (frames side by side)
+ public/sprites/bay/manifest.json {name: {w, h, frames}}.
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public/sprites/bay')
ALPHA_CUT = 60

# (sheet, row, name, scale-by, target px, frame columns or None = all 4)
ROWS = [
    ('bay_life_day_sheet', 0, 'gull_fly', 'w', 22, None),
    ('bay_life_day_sheet', 1, 'gull_stand', 'h', 16, None),
    ('bay_life_day_sheet', 2, 'fish_jump', 'w', 20, None),
    ('bay_life_day_sheet', 3, 'cat_walk', 'h', 17, None),
    ('bay_life_night_sheet', 0, 'squid_boat', 'w', 46, None),
    ('bay_life_night_sheet', 1, 'heron', 'h', 24, None),
    ('bay_life_night_sheet', 2, 'jelly', 'w', 13, None),
    ('bay_life_night_sheet', 3, 'paper_lantern', 'h', 12, [0, 1]),
    ('bay_life_night_sheet', 3, 'camp_lantern', 'h', 12, [2, 3]),
]
# single props: (row, col, name, scale-by, target)
PROPS = [
    (0, 0, 'bucket', 'h', 10),
    (0, 1, 'cooler', 'w', 17),
    (3, 2, 'cat_sleep', 'w', 18),
]


def clean(cell, name):
    a = cell.copy()
    a[a[..., 3] < ALPHA_CUT] = 0
    if name == 'jelly':  # ChatGPT drew a bright blue glow halo round the bell: drop it
        r, g, b = (a[..., i].astype(int) for i in range(3))
        halo = (b > 150) & (r < 90) & (g < 140) & (b - g > 70)
        a[halo] = 0
    # drop specks: keep components >= 4% of the biggest
    solid = a[..., 3] > 0
    lab, n = ndimage.label(solid)
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= sizes.max() * 0.04
        a[~keep[lab]] = 0
    return a


def scale_frames(frames, by, target):
    boxes = [Image.fromarray(f).getbbox() for f in frames]
    boxes = [b for b in boxes if b]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    if by == 'w':
        # size by the widest single frame, not the union (the fish moves across its row)
        ref = max(b[2] - b[0] for b in boxes)
    else:
        ref = max(b[3] - b[1] for b in boxes)
    s = target / ref
    w, h = max(1, round((x1 - x0) * s)), max(1, round((y1 - y0) * s))
    out = []
    for f in frames:
        im = Image.fromarray(f).crop((x0, y0, x1, y1)).resize((w, h), Image.Resampling.LANCZOS)
        a = np.array(im)
        a[..., 3] = np.where(a[..., 3] >= 110, 255, 0)
        out.append(a)
    return out, w, h


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    cache = {}

    def sheet(name):
        if name not in cache:
            cache[name] = np.array(Image.open(os.path.join(ROOT, 'src/assets', name + '.webp')).convert('RGBA'))
        return cache[name]

    def cell(name, r, c):
        a = sheet(name)
        H, W = a.shape[:2]
        return a[round(r * H / 4):round((r + 1) * H / 4), round(c * W / 4):round((c + 1) * W / 4)]

    for sh, row, name, by, target, cols in ROWS:
        cols = cols or [0, 1, 2, 3]
        frames = [clean(cell(sh, row, c), name) for c in cols]
        frames, w, h = scale_frames(frames, by, target)
        strip = np.concatenate(frames, axis=1)
        Image.fromarray(strip).save(os.path.join(OUT, f'{name}.webp'), 'WEBP', lossless=True)
        manifest[name] = {'w': w, 'h': h, 'frames': len(frames)}
        print(f'{name:14s} {w}x{h} ×{len(frames)}')
    for r, c, name, by, target in PROPS:
        frames, w, h = scale_frames([clean(cell('bay_props_sheet', r, c), name)], by, target)
        Image.fromarray(frames[0]).save(os.path.join(OUT, f'{name}.webp'), 'WEBP', lossless=True)
        manifest[name] = {'w': w, 'h': h, 'frames': 1}
        print(f'{name:14s} {w}x{h}')
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=2)


if __name__ == '__main__':
    main()
