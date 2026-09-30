"""Cut the 4x4 Dalbit item icon sheet into one icon per item.

Usage:
    .venv/bin/python scripts/process_items.py src/assets/dalbit_items_sheet.webp

Writes public/sprites/items/<item_id>.webp (64x64, transparent).
The order MUST match ITEM_IDS in src/game/story/items.ts (row by row, left to right).
"""

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ITEM_IDS = [
    'mackerel', 'yellow_croaker', 'anchovy', 'flounder',
    'sea_bream', 'eel', 'blue_crab', 'clams',
    'dried_mackerel', 'dried_croaker', 'dried_anchovy', 'kelp',
    'yeot', 'small_net', 'straw_sandal', 'rice_sack',
]
SIZE = 64          # output icon size (shown at 32 px in the bag, 64 for crisp 2x screens)
ALPHA_CUT = 40     # softer pixels than this become fully transparent (removes the dark halo)
PAD = 0.06         # empty border around each icon, as a share of its size

OUT = Path(__file__).resolve().parent.parent / 'public' / 'sprites' / 'items'


def keep_main_blobs(alpha: np.ndarray) -> np.ndarray:
    """Remove tiny stray specks (bits of a neighbour cell). Keeps blobs >= 2% of the biggest."""
    h, w = alpha.shape
    solid = alpha > 0
    label = np.zeros((h, w), dtype=np.int32)
    sizes = [0]
    for y in range(h):
        for x in range(w):
            if solid[y, x] and not label[y, x]:
                n = len(sizes)
                count = 0
                q = deque([(y, x)])
                label[y, x] = n
                while q:
                    cy, cx = q.popleft()
                    count += 1
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not label[ny, nx]:
                            label[ny, nx] = n
                            q.append((ny, nx))
                sizes.append(count)
    if len(sizes) == 1:
        return solid
    biggest = max(sizes)
    keep = np.array([s >= biggest * 0.02 for s in sizes])
    keep[0] = False
    return keep[label]


def main(src: str) -> None:
    sheet = np.array(Image.open(src).convert('RGBA'))
    sheet[sheet[..., 3] < ALPHA_CUT] = 0
    H, W = sheet.shape[:2]
    cw, ch = W / 4, H / 4
    OUT.mkdir(parents=True, exist_ok=True)

    for i, item_id in enumerate(ITEM_IDS):
        r, c = divmod(i, 4)
        cell = sheet[round(r * ch):round((r + 1) * ch), round(c * cw):round((c + 1) * cw)].copy()
        cell[~keep_main_blobs(cell[..., 3])] = 0
        img = Image.fromarray(cell)
        bbox = img.getchannel('A').getbbox()
        if not bbox:
            print(f'!! cell {i} ({item_id}) is empty')
            continue
        img = img.crop(bbox)
        w, h = img.size
        side = max(w, h)
        full = side + 2 * round(side * PAD)
        square = Image.new('RGBA', (full, full), (0, 0, 0, 0))
        square.paste(img, ((full - w) // 2, (full - h) // 2))
        square.resize((SIZE, SIZE), Image.LANCZOS).save(OUT / f'{item_id}.webp', lossless=True)
        print(f'ok  {item_id}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
