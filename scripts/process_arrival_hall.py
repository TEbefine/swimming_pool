"""Arrival Hall background: scale to 1024x576, key the sky out of the two windows (the code sky shows
through, so day -> sunset -> night works), erase the painted clock hands (the code draws real-time
hands), cut the counter as a walk-behind piece, write the thumb.

Usage: python3 scripts/process_arrival_hall.py   (reads src/assets/arrival_hall_src.webp)

Outputs
  public/maps/arrival_hall.webp                      background (RGBA, window skies transparent)
  public/maps/thumbs/arrival_hall.webp               320x180 thumb
  public/sprites/elements/arrival/counter.webp       counter + help desk + the small things on top,
                                                     placed by its bottom-centre (see arrivalHallLayout.ts)
Prints the numbers the layout needs (counter box, clock centre).
"""
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.environ.get('SP_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src/assets/arrival_hall_src.webp')
OUT = os.path.join(ROOT, 'public/maps/arrival_hall.webp')
THUMB = os.path.join(ROOT, 'public/maps/thumbs/arrival_hall.webp')
PIECES = os.path.join(ROOT, 'public/sprites/elements/arrival')
W, H = 1024, 576

# --- measured on the 1024x576 version of the 2nd ChatGPT painting (2026-10-16) ---
WINDOWS = [(217, 28, 366, 192), (655, 28, 790, 192)]   # glass of the two windows (x0, y0, x1, y1)
CLOCK = (848, 91, 20)                                  # centre x, centre y, radius of the hand area
COUNTER_BOX = (306, 176, 830, 303)                     # everything the counter piece may contain
COUNTER_TOP_Y = 222                                    # front edge of the counter top (main desk)
DESK_TOP_Y = 211                                       # top of the separate help desk (right)
DESK_X0 = 722                                          # help desk starts here
DESK_L, DESK_R = 311, 826                              # painted left end of the counter, right end of the desk


def key_window_sky(rgb: np.ndarray) -> np.ndarray:
    """Alpha (0/255): everything above the hill line inside each window (sky AND painted clouds,
    so the code clouds / sunset / stars take over). Per column, the hill top is the first pixel
    from the top that is green-ish (g >= b - 8) and not bright; a 9-column median keeps it clean."""
    a = rgb.astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = (r + g + b) / 3
    hill = (g >= b - 8) & (lum < 205) & (g > r)
    alpha = np.full(r.shape, 255, np.uint8)
    for x0, y0, x1, y1 in WINDOWS:
        sub = hill[y0:y1, x0:x1]
        # ignore lone specks: a hill pixel needs 2 more hill pixels right below it
        solid = sub & np.roll(sub, -1, axis=0) & np.roll(sub, -2, axis=0)
        h = sub.shape[0]
        tops = np.array([np.argmax(col) if col.any() else h for col in solid.T])
        tops = ndimage.median_filter(tops, size=9, mode='nearest')
        # no deep spikes: a column may not go much lower than its neighbourhood (e.g. the red
        # lighthouse is not green, so on its own it would be keyed all the way down)
        tops = np.minimum(tops, ndimage.median_filter(tops, size=21, mode='nearest') + 4)
        tops = np.minimum(tops, int(h * 0.55))
        for i, t in enumerate(tops):
            alpha[y0:y0 + t, x0 + i] = 0
    return alpha


def erase_clock_hands(img: Image.Image):
    """Paint the clock face colour over the hands; keep the rim ticks."""
    cx, cy, rr = CLOCK
    a = np.array(img)
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    inside = (xx - cx) ** 2 + (yy - cy) ** 2 <= rr ** 2
    face = a[inside]
    lum = face[..., :3].mean(axis=1)
    face_col = np.median(face[lum > np.percentile(lum, 60)][:, :3], axis=0).astype(np.uint8)
    dark = inside & (a[..., :3].mean(axis=2) < lum.mean() - 18)
    dark = ndimage.binary_dilation(dark, iterations=1) & inside
    a[..., :3][dark] = face_col
    return Image.fromarray(a), face_col


def cut_counter(rgba: np.ndarray):
    """Counter body + help desk as a solid block, plus the small things standing on it (bell,
    stamps, plants, papers, desk lamp), found as pixels that differ from the cream wall."""
    x0, y0, x1, y1 = COUNTER_BOX
    box = rgba[y0:y1, x0:x1, :3].astype(int)
    hh, ww = box.shape[:2]
    mask = np.zeros((hh, ww), bool)
    # solid desk parts (between the painted left end of the counter and the right end of the desk)
    mask[COUNTER_TOP_Y - y0 - 2:, DESK_L - x0:DESK_X0 - x0 + 6] = True
    mask[DESK_TOP_Y - y0 - 2:, DESK_X0 - x0:DESK_R - x0] = True
    # objects on top: anything clearly not wall-coloured above the desk top
    wall = np.median(rgba[200:215, 450:500, :3].reshape(-1, 3), axis=0)
    diff = np.abs(box - wall).sum(axis=2)
    above = np.zeros_like(mask)
    above[: COUNTER_TOP_Y - y0, :] = True
    obj = (diff > 70) & above
    # window frames / board frame sit above y~205: only the desk lamp may reach that high, and
    # there only its own colours (green shade, gold stand, dark outline) count
    obj[: 205 - y0, : 752 - x0] = False
    obj[: 205 - y0, 790 - x0:] = False
    obj[:, : DESK_L - x0 + 2] = False
    r, g, b = box[..., 0], box[..., 1], box[..., 2]
    lampish = ((g > r + 15) & (g > b)) | ((r > 170) & (g > 120) & (b < 90))
    lampish |= ndimage.binary_dilation(lampish, iterations=1) & ((r + g + b) / 3 < 80)
    obj[: 205 - y0] &= lampish[: 205 - y0]
    # keep only blobs that touch the desk top (things standing ON the desk)
    lab, n = ndimage.label(ndimage.binary_dilation(obj, iterations=1))
    keep = np.zeros_like(obj)
    touch_rows = slice(COUNTER_TOP_Y - y0 - 6, COUNTER_TOP_Y - y0 + 1)
    for i in range(1, n + 1):
        blob = lab == i
        if blob[touch_rows].any() or blob[DESK_TOP_Y - y0 - 6: DESK_TOP_Y - y0 + 1, DESK_X0 - x0:].any():
            keep |= blob
    mask |= keep
    piece = np.zeros((hh, ww, 4), np.uint8)
    piece[..., :3] = rgba[y0:y1, x0:x1, :3]
    piece[..., 3] = np.where(mask, 255, 0)
    img = Image.fromarray(piece)
    bbox = img.getbbox()
    img = img.crop(bbox)
    left, top, right, bottom = bbox[0] + x0, bbox[1] + y0, bbox[2] + x0, bbox[3] + y0
    return img, (left, top, right, bottom)


def main():
    src = Image.open(SRC).convert('RGB')
    rgb = np.array(src.resize((W, H), Image.Resampling.LANCZOS))
    alpha = key_window_sky(rgb)
    img = Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')
    img, face_col = erase_clock_hands(img)
    os.makedirs(os.path.dirname(THUMB), exist_ok=True)
    img.save(OUT, 'WEBP', lossless=True)
    img.convert('RGB').resize((320, 180), Image.Resampling.LANCZOS).save(THUMB, 'WEBP', quality=88)

    piece, (l, t, r, b) = cut_counter(np.array(img))
    os.makedirs(PIECES, exist_ok=True)
    piece.save(os.path.join(PIECES, 'counter.webp'), 'WEBP', lossless=True)
    print('saved', OUT, THUMB)
    print(f'counter piece {piece.size} box x {l}-{r} y {t}-{b} -> place at x={round((l + r) / 2)}, y={b}')
    print('clock face colour', face_col.tolist(), 'centre', CLOCK[:2])


if __name__ == '__main__':
    main()
