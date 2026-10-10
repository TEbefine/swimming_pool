"""Cut a PLAYER 4x4 sheet drawn with the body-standard prompt (lifeguard style) into game frames.

Usage:
  python scripts/process_player_sheet.py src/assets/player_swim_sheet.webp swim
  python scripts/process_player_sheet.py src/assets/outfit_cafe_sheet.webp cafe
  python scripts/process_player_sheet.py src/assets/outfit_pajamas_sheet.webp pajamas
  python scripts/process_player_sheet.py src/assets/outfit_cafe_sheet.webp town 1
  (optional 3rd argument: scale for outfits, default 2 = café / My Room size; 1 = pool / town size)

Sheet order (docs: characters/body-standard.md), row by row:
  idle, side_idle, back_idle, walk1 / walk2, wave, talk, happy /
  walk_down1, walk_down2, walk_up1, walk_up2 / thinking, sit, lie, jump
(Older outfit sheets with the walk row LAST use scripts/process_outfit.py instead.)

swim    -> public/sprites/land/ (1x, pool) + character_manifest.json "land"
           and public/sprites/land_2_0x/ (2x, close-up rooms) + its manifest.json
cafe / pajamas -> public/sprites/outfits/<name>/ (2x)
Standing/walking poses share one canvas (48x82 at 1x, 96x160 at 2x), idle height 75 px x scale,
so switching outfits never changes the player's size. Water sprites are not touched.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_npc import ALPHA_CUTOFF, detect_cells  # noqa: E402

POSES = [
    'idle', 'side_idle', 'back_idle', 'walk1',
    'walk2', 'wave', 'talk', 'happy',
    'walk_down1', 'walk_down2', 'walk_up1', 'walk_up2',
    'thinking', 'sit', 'lie', 'jump',
]
STAND = {'idle', 'side_idle', 'back_idle', 'walk1', 'walk2', 'thinking',
         'walk_down1', 'walk_down2', 'walk_up1', 'walk_up2'}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cut(src: str):
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
    return crops


SQUEEZE_X = float(os.environ.get('SQUEEZE_X', '1'))


def write(crops, out_dir: str, url_dir: str, k: float) -> dict:
    target_idle = 75.0 * k
    canvas = (round(32 * target_idle / 50), round(52 * target_idle / 50) + 4)
    scale = target_idle / crops['idle'].height
    os.makedirs(out_dir, exist_ok=True)
    manifest = {}
    for pose, c in crops.items():
        # SQUEEZE_X=0.87 → narrower (an AI sheet that came out wider than the v3 body; height unchanged)
        img = c.resize((max(1, round(c.width * scale * SQUEEZE_X)), max(1, round(c.height * scale))),
                       Image.Resampling.LANCZOS)
        if pose in STAND:
            cw, ch = max(canvas[0], img.width), max(canvas[1], img.height)
            can = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
            can.paste(img, ((cw - img.width) // 2, ch - img.height), img)
            img = can
        img.save(os.path.join(out_dir, f'{pose}.webp'), 'WEBP', lossless=True)
        manifest[pose] = {'width': img.width, 'height': img.height, 'path': f'{url_dir}/{pose}.webp'}
    return manifest


def main(src: str, name: str, k: float = 2.0) -> None:
    crops = cut(src)
    sprites = os.path.join(ROOT, 'public', 'sprites')
    if name == 'swim':
        land = write(crops, os.path.join(sprites, 'land'), '/sprites/land', 1.0)
        mpath = os.path.join(sprites, 'character_manifest.json')
        with open(mpath) as f:
            data = json.load(f)
        data['land'] = land                      # keep "water" and "floatColors" as they are
        with open(mpath, 'w') as f:
            json.dump(data, f, indent=2)
        big = write(crops, os.path.join(sprites, 'land_2_0x'), '/sprites/land_2_0x', 2.0)
        with open(os.path.join(sprites, 'land_2_0x', 'manifest.json'), 'w') as f:
            json.dump(big, f, indent=2)
        print('Saved swimsuit: land (1x) + land_2_0x (2x)')
    else:
        out = os.path.join(sprites, 'outfits', name)
        m = write(crops, out, f'/sprites/outfits/{name}', k)
        with open(os.path.join(out, 'manifest.json'), 'w') as f:
            json.dump(m, f, indent=2)
        print(f'Saved outfit {name} ({k:g}x)')


if __name__ == '__main__':
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) == 4 else 2.0)
