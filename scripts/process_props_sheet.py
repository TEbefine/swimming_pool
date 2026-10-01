"""Cut a 4x4 PROPS sheet (one object per cell, transparent) into scene elements.

Usage:
  python3 scripts/process_props_sheet.py src/assets/dalbit_market_props_sheet.webp public/maps/dalbit/market 0.33 \
      yeot_cart,rice_board,basket_full,basket_empty,crates,onggi_jar,water_barrel,rope,drying_rack,bench,clam_mat,oars,lantern,lantern_lit,signpost,firewood

- Objects are found as SHAPES (ChatGPT's cells drift), in reading order.
- ONE scale for the whole sheet, so the props keep their sizes relative to each other
  (0.33 = a 330-px cart becomes 110 px, next to ~75-px people). A single prop can take its own
  scale with name@scale (e.g. water_barrel@0.24 when ChatGPT drew it too big).
- The coloured fringe ChatGPT leaves around the cut-out (a red/orange halo) is removed:
  the soft edge is cut off, then the outermost pixel ring is darkened to the outline colour.
Writes <out_dir>/<name>.webp (lossless, transparent), anchored bottom-centre in the game.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_fish_sheet import find_creatures  # noqa: E402

OUTLINE = np.array([43, 27, 18])


def clean(rgba: np.ndarray) -> np.ndarray:
    a = rgba[..., 3] > 150
    a = ndimage.binary_erosion(a, iterations=2)          # drop the fringe band
    a = ndimage.binary_fill_holes(a) | (a)
    ring = a & ~ndimage.binary_erosion(a, iterations=2)  # new outer edge
    out = rgba.copy()
    out[..., 3] = np.where(a, 255, 0)
    rgb = out[..., :3].astype(float)
    rgb[ring] = rgb[ring] * 0.35 + OUTLINE * 0.65          # a dark outline instead of a red halo
    out[..., :3] = rgb.astype(np.uint8)
    return out


def main(src, out_dir, scale, names):
    sheet = np.array(Image.open(src).convert('RGBA'))
    sheet[sheet[..., 3] < 40] = 0
    os.makedirs(out_dir, exist_ok=True)
    for spec, mask in zip(names, find_creatures(sheet[..., 3])):
        name, _, own = spec.partition('@')          # "water_barrel@0.24" = its own scale
        k = float(own) if own else scale
        obj = sheet.copy()
        obj[~mask] = 0
        img = Image.fromarray(clean(obj))
        img = img.crop(img.getchannel('A').getbbox())
        w, h = img.size
        small = img.resize((max(1, round(w * k)), max(1, round(h * k))), Image.Resampling.LANCZOS)
        a = np.array(small)
        a[..., 3] = np.where(a[..., 3] > 110, 255, 0)      # crisp pixel edge after scaling
        Image.fromarray(a).save(os.path.join(out_dir, f'{name}.webp'), lossless=True)
        print(f'{name}: {small.size[0]}×{small.size[1]}')


if __name__ == '__main__':
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4].split(','))
