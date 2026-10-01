"""Cut Midjourney photo portraits on a WHITE background into dialogue portraits (no rembg needed).

Usage (from the project root):
  python3 scripts/process_photo_portraits.py <npc_id> <identity.png> <grid_2x2.png> <face_TL> <face_TR> <face_BL> <face_BR>
  e.g. python3 scripts/process_photo_portraits.py gu docs/characters/gu/references/identity.png \
         docs/characters/gu/references/expressions_v1.png smile tired stern humble

Writes public/sprites/npc/<id>/portrait/{neutral,<faces>}.webp — 700×696, transparent, the same
framing as Mother / Father: the face is found with OpenCV and scaled/placed to one size and spot,
so the head doesn't jump between expressions. Faces that OpenCV can't find (head tilted back,
bowed, turned away) use the grid's average scale and the head's outline instead.
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 700, 696            # portrait canvas (same as mother/father)
FACE_W = 236               # target face-box width (OpenCV frontal face box)
FACE_CX, FACE_TOP = 322, 228

CASCADES = [cv2.CascadeClassifier(cv2.data.haarcascades + n) for n in
            ('haarcascade_frontalface_default.xml', 'haarcascade_frontalface_alt2.xml')]


def cut_white(img: Image.Image) -> Image.Image:
    """Remove the white backdrop: near-white connected to the border (+ big enclosed white gaps)."""
    src = np.array(img.convert('RGB')).astype(float)
    w = src.min(axis=2)
    lab, n = ndimage.label(w >= 238)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # enclosed white gaps (e.g. between an arm and the body) — big and pure white only (not teeth)
    lab2, n2 = ndimage.label((w >= 250) & ~bg)
    if n2:
        sizes = ndimage.sum(np.ones_like(w), lab2, range(1, n2 + 1))
        big = [i + 1 for i, s in enumerate(sizes) if s > 1500]
        bg |= np.isin(lab2, big)
    a = np.where(bg, 0.0, 1.0)
    # soft edge: a 2-px band around the figure gets alpha from how far it is from white
    edge = ndimage.binary_dilation(bg, iterations=2) & ~bg
    a = np.where(edge, np.clip((255 - w) / 60, 0, 1), a)
    al = np.clip(a, 1e-3, 1)[..., None]
    col = np.clip((src - (1 - al) * 255) / al, 0, 255)
    # keep only the main figure
    lab3, n3 = ndimage.label(a > 0.1)
    if n3 > 1:
        sizes = ndimage.sum(np.ones_like(w), lab3, range(1, n3 + 1))
        a = np.where(lab3 == 1 + int(np.argmax(sizes)), a, 0)
    return Image.fromarray(np.dstack([col, a * 255]).astype(np.uint8))


def find_face(img: Image.Image):
    g = cv2.cvtColor(np.array(img.convert('RGB')), cv2.COLOR_RGB2GRAY)
    best = None
    for c in CASCADES:
        for (x, y, fw, fh) in c.detectMultiScale(g, 1.08, 5, minSize=(g.shape[1] // 8, g.shape[1] // 8)):
            if best is None or fw * fh > best[2] * best[3]:
                best = (x, y, fw, fh)
    return best


def head_outline(cut: Image.Image):
    """(centre x, top y) of the head from the outline: top of the figure and the middle of its top band."""
    a = np.array(cut)[..., 3] > 128
    ys = np.where(a.any(axis=1))[0]
    top = ys.min()
    band = a[top + 40: top + 160] if a.shape[0] > top + 160 else a[top:]
    xs = np.where(band)[1]
    return float(xs.mean()), float(top)


def place(cut: Image.Image, s: float, cx: float, top: float) -> Image.Image:
    r = cut.resize((round(cut.width * s), round(cut.height * s)), Image.Resampling.LANCZOS)
    x, y = round(FACE_CX - cx * s), round(FACE_TOP - top * s)
    head_top = r.getchannel('A').getbbox()[1] + y
    if head_top < 24:          # never clip the head / hat / scarf at the top edge
        y += 24 - head_top
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.alpha_composite(r, (x, y))
    return out


def main(npc, ident_path, grid_path, faces):
    out_dir = os.path.join(ROOT, 'public', 'sprites', 'npc', npc, 'portrait')
    os.makedirs(out_dir, exist_ok=True)
    grid = Image.open(grid_path).convert('RGB')
    gw, gh = grid.size
    cells = [grid.crop((0, 0, gw // 2, gh // 2)), grid.crop((gw // 2, 0, gw, gh // 2)),
             grid.crop((0, gh // 2, gw // 2, gh)), grid.crop((gw // 2, gh // 2, gw, gh))]
    items = [('neutral', Image.open(ident_path).convert('RGB'))] + list(zip(faces, cells))

    found = {name: find_face(img) for name, img in items}
    grid_scales = [FACE_W / f[2] for name, f in found.items() if f is not None and name != 'neutral']
    grid_scale = float(np.median(grid_scales)) if grid_scales else None
    # offset between the outline's head top and the face-box top, learnt from detected grid faces
    offsets = []
    for (name, img) in items[1:]:
        f = found[name]
        if f is not None:
            hx, htop = head_outline(cut_white(img))
            offsets.append(((f[0] + f[2] / 2) - hx, f[1] - htop))

    for name, img in items:
        cut = cut_white(img)
        f = found[name]
        if f is not None:
            # the 4 grid cells are one photo size, so they share one scale (a tilted face
            # gives a smaller/bigger box, but the person isn't smaller); the identity has its own
            s = FACE_W / f[2] if name == 'neutral' or grid_scale is None else grid_scale
            fw = f[2] * s
            res = place(cut, s, f[0] + f[2] / 2, f[1] + f[3] / 2 - (FACE_W / 2) / s)
            how = f'face {f[2]}px'
        else:
            s = grid_scale or 1.0
            hx, htop = head_outline(cut)
            dx, dy = (np.median([o[0] for o in offsets]), np.median([o[1] for o in offsets])) if offsets else (0, 60)
            res = place(cut, s, hx + dx, htop + dy)
            how = 'outline (no face found)'
        res.save(os.path.join(out_dir, f'{name}.webp'), 'WEBP', quality=92)
        print(f'{npc}/{name}: scale {s:.3f} — {how}')


if __name__ == '__main__':
    if len(sys.argv) != 8:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:8])
