"""Cut an NPC 4x4 sprite sheet (transparent PNG) into game-ready frames.

Usage:
  python scripts/process_npc.py src/assets/npc_barista_sheet.png barista [scale]
  (scale 1.5 for close-up rooms like the café; default 1)

Writes public/sprites/npc/<name>/<pose>.webp and public/sprites/npc/<name>/manifest.json.
Poses are auto-detected (no hand-measured crop boxes), read row by row, left to right.
Frames are scaled so the idle pose matches the player's idle height (75px × scale).
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

POSES = [
    'idle', 'side_idle', 'back_idle', 'walk1',
    'walk2', 'wave', 'talk', 'happy',
    'thinking', 'wai', 'pour', 'serve',
    'read', 'idea', 'point', 'blink',
]
# Standing poses share one canvas so switching between them never jitters
STAND_POSES = {'idle', 'side_idle', 'back_idle', 'walk1', 'walk2', 'thinking', 'wai', 'serve', 'read', 'blink'}
TARGET_IDLE_HEIGHT = 75.0   # player idle height at 1x (scripts/process_assets.py)
ALPHA_CUTOFF = 40           # drop faint anti-alias noise around the edges

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def detect_cells(alpha: np.ndarray):
    fg = alpha > ALPHA_CUTOFF
    lab, _ = ndimage.label(ndimage.binary_dilation(fg, iterations=8))
    boxes = [s for s in ndimage.find_objects(lab)
             if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > 2000]
    row_h = alpha.shape[0] / 4
    boxes.sort(key=lambda s: (int(((s[0].start + s[0].stop) / 2) // row_h), s[1].start))
    return boxes


def main(src: str, name: str, k: float = 1.0):
    sheet = Image.open(src).convert('RGBA')
    arr = np.array(sheet)
    arr[..., 3] = np.where(arr[..., 3] < ALPHA_CUTOFF, 0, arr[..., 3])
    sheet = Image.fromarray(arr)

    boxes = detect_cells(arr[..., 3])
    if len(boxes) != len(POSES):
        sys.exit(f'Expected {len(POSES)} poses, found {len(boxes)} — check the sheet.')

    crops = {}
    for pose, s in zip(POSES, boxes):
        cell = sheet.crop((s[1].start, s[0].start, s[1].stop, s[0].stop))
        crops[pose] = cell.crop(cell.getbbox())

    scale = TARGET_IDLE_HEIGHT * k / crops['idle'].height
    scaled = {p: c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))),
                          Image.Resampling.LANCZOS) for p, c in crops.items()}

    stand_w = max(round(48 * k), max(scaled[p].width for p in STAND_POSES))
    stand_h = max(round(78 * k) + 4, max(scaled[p].height for p in STAND_POSES) + 4)

    out_dir = os.path.join(ROOT, 'public', 'sprites', 'npc', name)
    os.makedirs(out_dir, exist_ok=True)
    manifest = {}
    for pose, img in scaled.items():
        if pose in STAND_POSES:
            canvas = Image.new('RGBA', (stand_w, stand_h), (0, 0, 0, 0))
            canvas.paste(img, ((stand_w - img.width) // 2, stand_h - img.height), img)
            img = canvas
        img.save(os.path.join(out_dir, f'{pose}.webp'), 'WEBP', lossless=True)
        manifest[pose] = {'width': img.width, 'height': img.height,
                          'path': f'/sprites/npc/{name}/{pose}.webp'}

    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'Saved {len(manifest)} frames to {out_dir}')


if __name__ == '__main__':
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) == 4 else 1.0)
