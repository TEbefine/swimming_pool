"""Cut a player OUTFIT 4x4 sprite sheet (transparent PNG from ChatGPT) into game frames.

Usage:
  python scripts/process_outfit.py src/assets/outfit_cafe_sheet.png cafe
  python scripts/process_outfit.py src/assets/outfit_pajamas_sheet.png pajamas
  (optional 3rd argument: scale, default 2.0 = café / My Room size)

Sheet order (row by row, left to right — same as the prompt in docs/characters/player/README.md):
  idle, side_idle, back_idle, walk1 / walk2, wave, talk, happy /
  thinking, sit, lie, jump / walk_down1, walk_down2, walk_up1, walk_up2

Writes public/sprites/outfits/<name>/<pose>.webp + manifest.json at the close-up room
size, replacing the placeholder from scripts/make_placeholder_outfits.py.
Standing poses share the same canvas as public/sprites/land_<scale>x, so switching
outfits never changes the player's size.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_npc import ALPHA_CUTOFF, detect_cells  # noqa: E402  (same auto cell finder)

POSES = [
    'idle', 'side_idle', 'back_idle', 'walk1',
    'walk2', 'wave', 'talk', 'happy',
    'thinking', 'sit', 'lie', 'jump',
    'walk_down1', 'walk_down2', 'walk_up1', 'walk_up2',
]
STAND = {'idle', 'side_idle', 'back_idle', 'walk1', 'walk2', 'thinking',
         'walk_down1', 'walk_down2', 'walk_up1', 'walk_up2'}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(src: str, name: str, k: float = 2.0) -> None:
    target_idle = 75.0 * k   # matches scripts/process_land_scaled.py
    canvas_size = (round(32 * target_idle / 50), round(52 * target_idle / 50) + 4)
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

    scale = target_idle / crops['idle'].height
    out_dir = os.path.join(ROOT, 'public', 'sprites', 'outfits', name)
    os.makedirs(out_dir, exist_ok=True)
    manifest = {}
    for pose, c in crops.items():
        img = c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))),
                       Image.Resampling.LANCZOS)
        if pose in STAND:
            cw, ch = max(canvas_size[0], img.width), max(canvas_size[1], img.height)
            canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
            canvas.paste(img, ((cw - img.width) // 2, ch - img.height), img)
            img = canvas
        img.save(os.path.join(out_dir, f'{pose}.webp'), 'WEBP', lossless=True)
        manifest[pose] = {'width': img.width, 'height': img.height,
                          'path': f'/sprites/outfits/{name}/{pose}.webp'}

    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'Saved {len(manifest)} frames to {out_dir}')


if __name__ == '__main__':
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) == 4 else 2.0)
