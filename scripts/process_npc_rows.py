"""Cut a 4x4 sheet where EACH ROW is a different person (4 poses each) into NPC sprites.

Usage:
  python3 scripts/process_npc_rows.py src/assets/npc_market_sheet.webp \
      gu:idle,talk,weigh,kneel innkeeper:idle,talk,beckon,count \
      rice_seller:idle,talk,shrug,point yeot_seller:idle,clack_a,clack_b,give

Writes public/sprites/npc/<id>/<pose>.webp + manifest.json for each row (same format as
process_npc.py). One scale for the whole sheet (so the people keep their heights relative to
each other): the average idle height becomes the player's idle height (75 px). Frames are lined
up on the head, like process_npc.py, so switching poses doesn't jitter.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_npc import ALPHA_CUTOFF, ROOT, TARGET_IDLE_HEIGHT, detect_cells, head_center_x  # noqa: E402


def main(src, rows):
    sheet = Image.open(src).convert('RGBA')
    arr = np.array(sheet)
    arr[..., 3] = np.where(arr[..., 3] < ALPHA_CUTOFF, 0, arr[..., 3])
    sheet = Image.fromarray(arr)
    boxes = detect_cells(arr[..., 3])
    if len(boxes) != 16:
        sys.exit(f'Expected 16 figures, found {len(boxes)} — check the sheet.')
    crops = []
    for s in boxes:
        c = sheet.crop((s[1].start, s[0].start, s[1].stop, s[0].stop))
        crops.append(c.crop(c.getbbox()))
    idle_h = [crops[r * 4].height for r in range(4)]
    scale = TARGET_IDLE_HEIGHT / float(np.mean(idle_h))
    for r, spec in enumerate(rows):
        name, poses = spec.split(':')
        poses = poses.split(',')
        scaled = {}
        for i, pose in enumerate(poses):
            c = crops[r * 4 + i]
            scaled[pose] = c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))), Image.Resampling.LANCZOS)
        heads = {p: head_center_x(img) for p, img in scaled.items()}
        half = max(max(heads[p], img.width - heads[p]) for p, img in scaled.items())
        cw = max(48, 2 * int(np.ceil(half)) + 2)
        ch = max(82, max(img.height for img in scaled.values()) + 4)
        out = os.path.join(ROOT, 'public', 'sprites', 'npc', name)
        os.makedirs(out, exist_ok=True)
        manifest = {}
        for pose, img in scaled.items():
            canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
            canvas.paste(img, (round(cw / 2 - heads[pose]), ch - img.height), img)
            canvas.save(os.path.join(out, f'{pose}.webp'), 'WEBP', lossless=True)
            manifest[pose] = {'width': cw, 'height': ch, 'path': f'/sprites/npc/{name}/{pose}.webp'}
        # head.webp (used by some UI): top part of the idle frame
        idle = Image.open(os.path.join(out, 'idle.webp'))
        bb = idle.getbbox()
        idle.crop((bb[0], bb[1], bb[2], bb[1] + (bb[3] - bb[1]) // 2)).save(os.path.join(out, 'head.webp'), 'WEBP', lossless=True)
        with open(os.path.join(out, 'manifest.json'), 'w') as f:
            json.dump(manifest, f, indent=2)
        print(f'{name}: {len(manifest)} poses, frame {cw}×{ch}, idle {scaled[poses[0]].height}px tall')


if __name__ == '__main__':
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
