"""Cut a FRONT-FACING fishing 4x4 sheet (player faces the camera, rod out to his right) into game frames.

Usage:
  python3 scripts/process_front_fishing_sheet.py src/assets/outfit_town_fishing_sheet.webp town
  python3 scripts/process_front_fishing_sheet.py src/assets/outfit_jinbei_fishing_sheet.webp jinbei
  python3 scripts/process_front_fishing_sheet.py src/assets/outfit_angler_fishing_sheet.webp angler

Writes public/sprites/outfits/<outfit>/fish_<pose>.webp + manifest entries with
  "tip":  the rod tip (red marker #E0403A) in px from the frame's bottom-centre anchor (x right, y up = negative)
  "hand": the palm (green marker #3AE070) in the catch frames, where the game draws the fish
Scale: the standing wait_a body = the outfit's front idle body height. Anchor: the BODY centre (not the rod).
Prompts: docs → characters/bay-fishing-outfit.md. Needs numpy, pillow, scipy.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_fishing_sheet import find_figures  # noqa: E402  (finds the 16 figures by shape)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORDERS = {
    # v3 town outfit sheet (2026-10-08)
    'town': ['ready', 'windup', 'cast', 'follow',
             'wait_a', 'wait_b', 'sit_a', 'sit_b',
             'bite', 'strike', 'pull_a', 'pull_b',
             'catch', 'cheer', 'miss', 'shoulder'],
    # jinbei sheet (2026-10-09); the angler sheet uses the same order
    'jinbei': ['ready', 'windup', 'cast', 'follow',
               'wait_a', 'wait_b', 'sip', 'yawn',
               'sit_a', 'sit_b', 'bite', 'strike',
               'pull_a', 'pull_b', 'catch', 'miss'],
}
ORDERS['angler'] = ORDERS['jinbei']  # angler outfit (cap + vest), 2026-10-09 — Quiet Bay
REF_OUTFIT = {'town': 'town', 'jinbei': 'town', 'angler': 'angler'}  # whose front idle sets the size
ALPHA_CUT = 40


def red_mask(a):
    r, g, b = (a[..., i].astype(int) for i in range(3))
    return (r > 170) & (g < 110) & (b < 100) & (a[..., 3] > 0)


def green_mask(a):
    r, g, b = (a[..., i].astype(int) for i in range(3))
    return (g > 170) & (r < 140) & (b < 150) & (g - r > 60) & (a[..., 3] > 0)


def body_mask(a, k):
    """Opaque pixels with the thin rod opened away (k = structuring size in px)."""
    solid = a[..., 3] > 0
    return ndimage.binary_opening(solid, structure=np.ones((k, k)))


def body_box(a, k):
    m = body_mask(a, k)
    lab, n = ndimage.label(m)
    if n == 0:
        return None
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    big = lab == (int(np.argmax(sizes)) + 1)
    ys, xs = np.nonzero(big)
    return xs, ys


def fill_marker(a, mask):
    """Paint marker pixels with the median colour of the opaque pixels around them."""
    if not mask.any():
        return a
    ring = ndimage.binary_dilation(mask, iterations=3) & ~mask & (a[..., 3] > 0)
    ring &= ~red_mask(a) & ~green_mask(a)
    if ring.any():
        col = np.median(a[ring][:, :3], axis=0).astype(np.uint8)
        a[mask, :3] = col
    return a


SQUEEZE_X = float(os.environ.get('SQUEEZE_X', '1'))


def main(src: str, outfit: str) -> None:
    order = ORDERS[outfit]
    sheet = np.array(Image.open(src).convert('RGBA'))
    sheet[sheet[..., 3] < ALPHA_CUT] = 0
    out_dir = os.path.join(ROOT, 'public', 'sprites', 'outfits', outfit)
    os.makedirs(out_dir, exist_ok=True)
    mpath = os.path.join(out_dir, 'manifest.json')
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}

    ref = np.array(Image.open(os.path.join(ROOT, 'public/sprites/outfits', REF_OUTFIT[outfit], 'idle.webp')).convert('RGBA'))
    rys, rxs = np.nonzero(ref[..., 3] > 0)
    ref_h = rys.max() - rys.min() + 1
    ref_off = ref.shape[1] / 2 - float(np.median(rxs))

    cells = {}
    for pose, (x0, y0, x1, y1, mask) in zip(order, find_figures(sheet)):
        a = sheet[y0:y1, x0:x1].copy()
        a[~mask] = 0
        cells[pose] = a

    k = 9  # wider than the rod (~5 px on the sheet), thinner than legs/arms
    xs, ys = body_box(cells['wait_a'], k)
    scale = ref_h / (ys.max() - ys.min() + 1)
    print(f'scale {scale:.4f} (idle body {ref_h}px)')

    for pose, a in cells.items():
        a = a.copy()
        bxs, bys = body_box(a, k)
        cx = float(np.median(bxs))
        feet = bys.max()
        tip = hand = None
        red = red_mask(a)
        if red.any():
            ys_, xs_ = np.nonzero(red)
            d = (xs_ - cx) ** 2 + (ys_ - (feet - 120)) ** 2
            fx, fy = xs_[d.argmax()], ys_[d.argmax()]
            near = (xs_ - fx) ** 2 + (ys_ - fy) ** 2 <= 14 ** 2
            tip = (float(xs_[near].mean()), float(ys_[near].mean()))
            m = np.zeros_like(red)
            m[ys_[near], xs_[near]] = True
            a = fill_marker(a, ndimage.binary_dilation(m, iterations=1) & (a[..., 3] > 0))
        green = green_mask(a)
        if green.any():
            gy, gx = np.nonzero(green)
            hand = (float(gx.mean()), float(gy.mean()))
            a = fill_marker(a, ndimage.binary_dilation(green, iterations=1) & (a[..., 3] > 0))
        # crop to content, keep feet line = bottom of the body
        img = Image.fromarray(a)
        bb = img.getbbox()
        img = img.crop(bb)
        ox0, oy0 = bb[0], bb[1]
        sx = scale * SQUEEZE_X                         # SQUEEZE_X: same narrowing as the walk frames
        nw, nh = max(1, round(img.width * sx)), max(1, round(img.height * scale))
        img = img.resize((nw, nh), Image.Resampling.LANCZOS)
        arr = np.array(img)
        arr[..., 3] = np.where(arr[..., 3] >= 110, 255, 0)
        feet_y = (feet - oy0 + 1) * scale            # body bottom inside the scaled crop
        anchor = (cx - ox0) * sx + ref_off         # where the feet-centre should be
        half = int(np.ceil(max(anchor, nw - anchor))) + 1
        hgt = int(np.ceil(max(nh, feet_y)))
        canvas = Image.new('RGBA', (half * 2, hgt), (0, 0, 0, 0))
        px_ = int(round(half - anchor))
        py_ = int(round(hgt - feet_y))  # body bottom on the frame bottom (rod may poke below → cropped)
        canvas.paste(Image.fromarray(arr), (px_, py_), Image.fromarray(arr))
        name = f'fish_{pose}'
        canvas.save(os.path.join(out_dir, f'{name}.webp'), 'WEBP', lossless=True)
        entry = {'width': canvas.width, 'height': canvas.height, 'path': f'/sprites/outfits/{outfit}/{name}.webp'}

        def to_anchor(p):
            return {'x': round((p[0] - ox0) * sx + px_ - half, 1), 'y': round((p[1] - oy0) * scale + py_ - hgt, 1)}
        if tip:
            entry['tip'] = to_anchor(tip)
        if hand:
            entry['hand'] = to_anchor(hand)
        manifest[name] = entry
        print(f'{name:14s} {canvas.width}x{canvas.height}  tip {entry.get("tip")}  hand {entry.get("hand")}')

    json.dump(manifest, open(mpath, 'w'), indent=2)
    print('manifest updated:', mpath)


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[2] not in ORDERS:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
