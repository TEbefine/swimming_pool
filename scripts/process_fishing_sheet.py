"""Cut Yunseul's FISHING 4x4 sheet into game frames with the rod-tip position of each frame.

Usage:
  .venv/bin/python scripts/process_fishing_sheet.py src/assets/outfit_dalbit_fishing_sheet.webp dalbit

Sheet order (prompt: docs/project characters/yunseul-profile.md → "fishing sheet"), row by row:
  ready, windup, cast, follow / wait_a, wait_b, sit, bite /
  strike, pull_a, pull_b, strain / catch, cheer, miss, shoulder

Output: public/sprites/outfits/<outfit>/fish_<pose>.webp + entries added to that outfit's manifest.json,
each with "tip": {x, y} = the rod tip in px from the frame's bottom-centre anchor (x right, y up is negative).
- Scale: the standing "wait_a" body is made exactly as tall as the outfit's side_idle (so no size jump).
- Anchor: the frames are padded so the BODY (not the rod) sits at the horizontal centre, lined up the same
  way as side_idle → switching side_idle ↔ fish_* doesn't make him slide sideways.
- The red tip pixel (#E0403A) is found, recorded, then painted over with the rod colour.
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

POSES = [
    'ready', 'windup', 'cast', 'follow',
    'wait_a', 'wait_b', 'sit', 'bite',
    'strike', 'pull_a', 'pull_b', 'strain',
    'catch', 'cheer', 'miss', 'shoulder',
]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALPHA_CUT = 40
ROD = (184, 154, 90)


def is_red(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (r > 170) & (g < 110) & (b < 100) & (a[..., 3] > 0)


def torso_center_x(a) -> float:
    """x-centre of the jeogori (blue-grey) + trousers (off-white) pixels = the body's middle."""
    r, g, b, al = (a[..., i].astype(int) for i in range(4))
    blue = (abs(r - 142) < 40) & (abs(g - 154) < 40) & (abs(b - 171) < 40) & (b > r + 10)
    cream = (r > 200) & (g > 190) & (b > 160) & (r - b < 45)
    mask = (blue | cream) & (al > 0)
    xs = np.nonzero(mask)[1]
    return float(np.median(xs)) if len(xs) else a.shape[1] / 2


def body_height(a) -> int:
    """Height from the top of the hair to the feet, ignoring the thin rod."""
    al = a[..., 3] > 0
    cx = int(torso_center_x(a))
    half = max(10, a.shape[1] // 5)
    window = al[:, max(0, cx - half):cx + half]
    counts = window.sum(axis=1)
    rows = np.nonzero(counts >= max(6, counts.max() * 0.25))[0]
    return int(rows[-1] - rows[0] + 1)


def keep_main(cell: np.ndarray) -> np.ndarray:
    """Drop small specks from neighbouring cells (keep blobs >= 3% of the biggest)."""
    solid = cell[..., 3] > 0
    h, w = solid.shape
    label = np.zeros((h, w), np.int32)
    sizes = [0]
    for y in range(h):
        for x in range(w):
            if solid[y, x] and not label[y, x]:
                n = len(sizes)
                q = deque([(y, x)])
                label[y, x] = n
                c = 0
                while q:
                    cy, cx = q.popleft()
                    c += 1
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not label[ny, nx]:
                            label[ny, nx] = n
                            q.append((ny, nx))
                sizes.append(c)
    big = max(sizes)
    keep = np.array([s >= big * 0.03 for s in sizes])
    keep[0] = False
    out = cell.copy()
    out[~keep[label]] = 0
    return out


def label_components(solid: np.ndarray):
    """Connected components (4-neighbour). Uses scipy if present, else a plain BFS."""
    try:
        from scipy import ndimage  # type: ignore
        lab, n = ndimage.label(solid)
        return lab, n
    except ImportError:
        h, w = solid.shape
        lab = np.zeros((h, w), np.int32)
        n = 0
        for y in range(h):
            for x in range(w):
                if solid[y, x] and not lab[y, x]:
                    n += 1
                    q = deque([(y, x)])
                    lab[y, x] = n
                    while q:
                        cy, cx = q.popleft()
                        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                            if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = n
                                q.append((ny, nx))
        return lab, n


def find_figures(sheet: np.ndarray):
    """The 16 figures (character + rod), found by shape, not by a fixed grid (ChatGPT's rows drift).
    Returns [(x0, y0, x1, y1, mask)] in reading order (row by row, left to right)."""
    solid = sheet[..., 3] > 0
    lab, n = label_components(solid)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    order = np.argsort(sizes)[::-1]
    big = [i for i in order if sizes[i] >= sizes[order[0]] * 0.15][:16]
    if len(big) != 16:
        sys.exit(f'Expected 16 figures, found {len(big)} — check the sheet.')
    ys, xs = np.nonzero(lab)
    labs = lab[ys, xs]
    info = {}
    for i in big:
        m = labs == i
        info[i] = dict(cx=xs[m].mean(), cy=ys[m].mean(), x0=xs[m].min(), x1=xs[m].max(), y0=ys[m].min(), y1=ys[m].max())
    # small bits (a loose braid tip, a rod piece): join the nearest figure
    owner = {i: i for i in big}
    for i in range(1, n + 1):
        if i in owner or sizes[i] == 0:
            continue
        m = labs == i
        px, py = xs[m].mean(), ys[m].mean()
        best = min(big, key=lambda b: max(0, info[b]['x0'] - px, px - info[b]['x1']) ** 2
                   + max(0, info[b]['y0'] - py, py - info[b]['y1']) ** 2)
        owner[i] = best
    lut = np.zeros(n + 1, np.int32)
    for k, v in owner.items():
        lut[k] = v
    own = lut[lab]
    # reading order: 4 rows by centre y, then left → right
    by_y = sorted(big, key=lambda b: info[b]['cy'])
    rows = [sorted(by_y[r * 4:(r + 1) * 4], key=lambda b: info[b]['cx']) for r in range(4)]
    out = []
    for row in rows:
        for b in row:
            yy, xx = np.nonzero(own == b)
            x0, x1, y0, y1 = xx.min(), xx.max() + 1, yy.min(), yy.max() + 1
            out.append((x0, y0, x1, y1, own[y0:y1, x0:x1] == b))
    return out


def main(src: str, outfit: str) -> None:
    sheet = np.array(Image.open(src).convert('RGBA'))
    sheet[sheet[..., 3] < ALPHA_CUT] = 0
    H, W = sheet.shape[:2]
    out_dir = os.path.join(ROOT, 'public', 'sprites', 'outfits', outfit)
    mpath = os.path.join(out_dir, 'manifest.json')
    with open(mpath) as f:
        manifest = json.load(f)

    # reference: the outfit's side_idle frame (height + where its body sits vs. the frame centre)
    side = np.array(Image.open(os.path.join(out_dir, 'side_idle.webp')).convert('RGBA'))
    side_h = body_height(side)
    side_offset = side.shape[1] / 2 - torso_center_x(side)  # frame centre minus torso centre

    cells = {}
    for pose, box in zip(POSES, find_figures(sheet)):
        x0, y0, x1, y1, mask = box
        a = sheet[y0:y1, x0:x1].copy()
        a[~mask] = 0
        img = Image.fromarray(a)
        cells[pose] = np.array(img.crop(img.getbbox()))

    scale = side_h / body_height(cells['wait_a'])
    print(f'scale {scale:.4f} (side_idle body {side_h}px)')

    for pose, a in cells.items():
        # the tip marker = the red pixels FARTHEST from the body (his open mouth is red too!)
        red = is_red(a)
        ys, xs = np.nonzero(red)
        tip_src = None
        a = a.copy()
        if len(xs):
            bx, by = torso_center_x(a), a.shape[0] * 0.55
            d = (xs - bx) ** 2 + (ys - by) ** 2
            fx, fy = xs[d.argmax()], ys[d.argmax()]
            near = (xs - fx) ** 2 + (ys - fy) ** 2 <= 12 ** 2
            tip_src = (float(xs[near].mean()), float(ys[near].mean()))
            # paint only the marker with the rod colour (keep the mouth red)
            a[ys[near], xs[near], 0], a[ys[near], xs[near], 1], a[ys[near], xs[near], 2] = ROD
        img = Image.fromarray(a)
        nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
        img = img.resize((nw, nh), Image.Resampling.LANCZOS)
        arr = np.array(img)
        anchor = torso_center_x(arr) + side_offset  # where the feet-centre should be
        left = anchor
        right = nw - anchor
        half = int(np.ceil(max(left, right)))
        canvas = Image.new('RGBA', (half * 2, nh), (0, 0, 0, 0))
        ox = int(round(half - anchor))
        canvas.paste(img, (ox, 0), img)
        name = f'fish_{pose}'
        canvas.save(os.path.join(out_dir, f'{name}.webp'), 'WEBP', lossless=True)
        entry = {'width': canvas.width, 'height': canvas.height, 'path': f'/sprites/outfits/{outfit}/{name}.webp'}
        if tip_src:
            tx = tip_src[0] * scale + ox - half        # from the anchor, + = right
            ty = tip_src[1] * scale - nh               # from the feet, - = up
            entry['tip'] = {'x': round(tx, 1), 'y': round(ty, 1)}
        manifest[name] = entry
        print(f'{name:14s} {canvas.width}x{canvas.height}  tip {entry.get("tip")}')

    with open(mpath, 'w') as f:
        json.dump(manifest, f, indent=2)
    print('manifest updated:', mpath)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
