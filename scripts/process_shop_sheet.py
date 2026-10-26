"""Cut a 4x4 FISH SHOP icon sheet (flat magenta background) into one icon per item.

Usage (from the repo root):
    .venv/bin/python scripts/process_shop_sheet.py src/assets/shop_sashimi_sheet.webp sashimi
    .venv/bin/python scripts/process_shop_sheet.py src/assets/shop_meals_sheet.webp meals
    .venv/bin/python scripts/process_shop_sheet.py src/assets/shop_pantry_sheet.webp pantry
Writes public/sprites/shop/<id>.webp (64x64, transparent), like the fish icons.
The id order MUST match SHOP_ITEMS (sheet + cell) in src/game/economy/shopCatalog.ts.
Needs numpy, pillow and scipy.

Items are found as shapes (not a fixed grid); small bits join the nearest item.
Magenta key: pure #FF00FF-ish pixels become transparent, and the pink-purple fringe ChatGPT leaves
next to the outline is removed too (only within 2 px of the background, so purple INSIDE an item,
like the flower on the chef's special, is kept).
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SHEETS = {
    'sashimi': [
        'sashimi_tai', 'sashimi_hirame', 'sashimi_grouper', 'sashimi_ika',
        'sashimi_akami', 'sashimi_otoro', 'sashimi_hamachi', 'sashimi_saba',
        'sashimi_amaebi', 'sashimi_hotate', 'sashimi_uni', 'sashimi_ikura',
        'sashimi_tako', 'sashimi_mixed', 'sashimi_boat', 'chef_special',
    ],
    'meals': [
        'nigiri_tuna', 'nigiri_shrimp', 'maki_roll', 'kaisen_don',
        'tuna_don', 'miso_soup', 'onigiri', 'shioyaki',
        'himono', 'kamaboko', 'tempura_shrimp', 'ika_yaki',
        'tamagoyaki', 'green_tea', 'ramune', 'barley_tea',
    ],
    'pantry': [
        'nori', 'wasabi_root', 'soy_sauce', 'sushi_rice',
        'daikon', 'shiso', 'yuzu', 'katsuobushi',
        'kombu', 'sea_salt', 'ice_block', 'cooler_box',
        'fish_crate', 'chef_knife', 'whetstone', 'gift_box',
    ],
}
SIZE = 64      # output icon size (shown at 32 px in the bag, 64 for crisp 2x screens)
MARGIN = 0.04  # empty border around each icon, as a share of the icon


def key_magenta(rgb: np.ndarray) -> np.ndarray:
    """Alpha mask (bool, True = keep)."""
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    score = np.minimum(r, b) - g                    # how magenta a pixel is
    bg = score > 150
    bg = ndimage.binary_opening(bg, iterations=1) | (score > 200)
    near_bg = ndimage.binary_dilation(bg, iterations=2) & ~bg
    fringe = near_bg & (score > 60)
    return ~(bg | fringe)


def main(sheet_path: str, sheet: str, out_dir: str = 'public/sprites/shop') -> None:
    ids = SHEETS[sheet]
    im = Image.open(sheet_path).convert('RGB')
    rgb = np.asarray(im)
    keep = key_magenta(rgb)
    rgba = np.dstack([rgb, (keep * 255).astype(np.uint8)])
    h, w = keep.shape
    cw, ch = w / 4, h / 4
    # Items are found as SHAPES, not cut on a fixed grid (ChatGPT items poke over the cell lines).
    lab, n = ndimage.label(keep, structure=np.ones((3, 3)))
    if n == 0:
        sys.exit('no items found')
    idx = range(1, n + 1)
    areas = np.asarray(ndimage.sum(keep, lab, idx))
    cents = np.asarray(ndimage.center_of_mass(keep, lab, idx))  # (y, x)
    big = areas > cw * ch * 0.015
    # each big shape belongs to the cell its centre is in
    owner = {}
    for i in np.nonzero(big)[0]:
        cy, cx = cents[i]
        owner[i + 1] = int(min(3, cy // ch)) * 4 + int(min(3, cx // cw))
    # small bits (a leaf tip, a steam puff) join the nearest big shape if close, else they are dropped
    bigs = np.nonzero(big)[0]
    for i in np.nonzero(~big)[0]:
        if areas[i] < 6:
            continue
        d = np.hypot(*(cents[bigs] - cents[i]).T)
        j = int(np.argmin(d))
        if d[j] < 0.45 * cw:
            owner[i + 1] = owner[bigs[j] + 1]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for cell, item_id in enumerate(ids):
        labels = [lb for lb, c in owner.items() if c == cell]
        if not labels:
            print(f'  !! {item_id}: nothing found in cell {cell}')
            continue
        m = np.isin(lab, labels)
        ys, xs = np.nonzero(m)
        by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = rgba[by0:by1, bx0:bx1].copy()
        crop[..., 3] = np.where(m[by0:by1, bx0:bx1], 255, 0).astype(np.uint8)
        side = int(max(crop.shape[0], crop.shape[1]) * (1 + 2 * MARGIN))
        square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        square.paste(Image.fromarray(crop, 'RGBA'), ((side - crop.shape[1]) // 2, (side - crop.shape[0]) // 2))
        square.resize((SIZE, SIZE), Image.LANCZOS).save(out / f'{item_id}.webp', lossless=True)
    print(f'{sheet}: {len(ids)} icons → {out}/')


if __name__ == '__main__':
    if len(sys.argv) < 3 or sys.argv[2] not in SHEETS:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], *(sys.argv[3:4]))
