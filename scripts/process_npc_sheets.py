"""Cut an NPC made of TWO (or more) 4x4 sheets into one sprite set (e.g. a movement sheet + a desk
actions sheet). Same rules as process_npc.py: poses auto-detected row by row, one shared canvas,
every pose lined up on the head so the NPC doesn't jitter when it switches poses.

Usage (from the project root):
  python3 scripts/process_npc_sheets.py <name> <scale> <sheet1> [<sheet2> ...]
  e.g. python3 scripts/process_npc_sheets.py tawan 2 src/assets/npc_tawan_sheet.webp src/assets/npc_tawan_desk_sheet.webp

Pose names: docs/characters/<name>/character.json -> "sheets": [[16 names], [16 names], ...].
A name starting with "_" is cut but not saved (a pose the character doesn't need).
The FIRST sheet's "idle" sets the size (75 px x scale tall, like the player); every sheet gets that
same factor, so both sheets must be drawn at the same size (ChatGPT keeps it when you attach sheet 1).
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_npc import ALPHA_CUTOFF, ROOT, TARGET_IDLE_HEIGHT, detect_cells, head_center_x  # noqa: E402

ROOT = os.environ.get('SP_ROOT') or ROOT


def cut_sheet(path: str, poses: list[str]):
    sheet = Image.open(path).convert('RGBA')
    arr = np.array(sheet)
    arr[..., 3] = np.where(arr[..., 3] < ALPHA_CUTOFF, 0, arr[..., 3])
    sheet = Image.fromarray(arr)
    boxes = detect_cells(arr[..., 3])
    if len(boxes) != len(poses):
        sys.exit(f'{path}: expected {len(poses)} poses, found {len(boxes)} — check the sheet.')
    crops = {}
    for pose, s in zip(poses, boxes):
        cell = sheet.crop((s[1].start, s[0].start, s[1].stop, s[0].stop))
        crops[pose] = cell.crop(cell.getbbox())
    return crops


def main(name: str, k: float, sheets: list[str]):
    with open(os.path.join(ROOT, 'docs', 'characters', name, 'character.json')) as f:
        pose_lists = json.load(f)['sheets']
    if len(pose_lists) != len(sheets):
        sys.exit(f'character.json has {len(pose_lists)} pose lists but {len(sheets)} sheets were given.')

    all_crops: dict[str, Image.Image] = {}
    scale = None
    for path, poses in zip(sheets, pose_lists):
        crops = cut_sheet(path, poses)
        if scale is None:
            scale = TARGET_IDLE_HEIGHT * k / crops['idle'].height
        for pose, c in crops.items():
            if not pose.startswith('_'):
                all_crops[pose] = c
        print(f'{os.path.basename(path)}: {len(crops)} poses, idle-ish height '
              f'{max(c.height for c in crops.values())}px')

    scaled = {p: c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))),
                          Image.Resampling.LANCZOS) for p, c in all_crops.items()}
    heads = {p: head_center_x(img) for p, img in scaled.items()}
    half = max(max(heads[p], img.width - heads[p]) for p, img in scaled.items())
    canvas_w = max(round(48 * k), 2 * int(np.ceil(half)) + 2)
    canvas_h = max(round(78 * k) + 4, max(img.height for img in scaled.values()) + 4)

    out_dir = os.path.join(ROOT, 'public', 'sprites', 'npc', name)
    os.makedirs(out_dir, exist_ok=True)
    manifest = {}
    for pose, img in scaled.items():
        canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        canvas.paste(img, (round(canvas_w / 2 - heads[pose]), canvas_h - img.height), img)
        canvas.save(os.path.join(out_dir, f'{pose}.webp'), 'WEBP', lossless=True)
        manifest[pose] = {'width': canvas_w, 'height': canvas_h, 'path': f'/sprites/npc/{name}/{pose}.webp'}
    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'Saved {len(manifest)} frames ({canvas_w}x{canvas_h}) to {out_dir}')


if __name__ == '__main__':
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    main(sys.argv[1], float(sys.argv[2]), sys.argv[3:])
