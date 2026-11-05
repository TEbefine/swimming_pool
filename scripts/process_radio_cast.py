"""LUMEN FM cast (Teera, Rin, Momo, Hibiki): cut the 4x4 sheets into sprite sets.

Usage (from the project root):  python3 scripts/process_radio_cast.py

Two kinds of sets come out:
  public/sprites/npc/<name>/      standing set (walk, wave, talk ...), 'idle' = standing idle
  public/sprites/npc/<name>_sit/  SEATED set for the studio chairs, 'idle' / 'blink' / 'talk' = the
                                  seated versions, so the engine's idle / blink / talk logic just works
                                  for a seated NPC (it only knows the pose names).

Size: the standing idle is 75 px x 2 (café size), like every other 2x NPC. Seated poses on the
same sheet get the SAME factor (so a seated Rin is exactly as big as a standing Rin). Teera's seated
sheet is a separate drawing, so its factor is matched on the head width of his standing idle.
Pose names: docs/characters/<name>/character.json -> "sheets" (one list per sheet).
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_npc import TARGET_IDLE_HEIGHT, head_center_x  # noqa: E402
from process_npc_sheets import cut_sheet  # noqa: E402

ROOT = os.environ.get('SP_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = 2.0  # café size

CAST = {
    # name: [(sheet file, index of the pose list in character.json "sheets")]
    'teera': ['src/assets/npc_teera_walk_sheet.webp', 'src/assets/npc_teera_sit_sheet.webp'],
    'rin': ['src/assets/npc_rin_sheet.webp'],
    'momo': ['src/assets/npc_momo_sheet.webp'],
    'hibiki': ['src/assets/npc_hibiki_sheet.webp'],
}


def head_width(img: Image.Image) -> float:
    """Width of the hair/head: the widest opaque row in the top 30% of the figure."""
    a = np.array(img)[..., 3] > 128
    ys = np.where(a.any(axis=1))[0]
    top = ys.min()
    band = a[top: top + int(img.height * 0.30)]
    widths = [np.ptp(np.where(r)[0]) + 1 for r in band if r.any()]
    return float(np.percentile(widths, 90))


def save_set(folder: str, crops: dict[str, Image.Image], scale: float):
    scaled = {p: c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))),
                          Image.Resampling.LANCZOS) for p, c in crops.items()}
    heads = {p: head_center_x(img) for p, img in scaled.items()}
    half = max(max(heads[p], img.width - heads[p]) for p, img in scaled.items())
    canvas_w = max(round(48 * K), 2 * int(np.ceil(half)) + 2)
    canvas_h = max(img.height for img in scaled.values()) + 4
    out_dir = os.path.join(ROOT, 'public', 'sprites', 'npc', folder)
    os.makedirs(out_dir, exist_ok=True)
    manifest = {}
    for pose, img in scaled.items():
        canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        canvas.paste(img, (round(canvas_w / 2 - heads[pose]), canvas_h - img.height), img)
        canvas.save(os.path.join(out_dir, f'{pose}.webp'), 'WEBP', lossless=True)
        manifest[pose] = {'width': canvas_w, 'height': canvas_h, 'path': f'/sprites/npc/{folder}/{pose}.webp'}
    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'{folder}: {len(manifest)} frames, canvas {canvas_w}x{canvas_h}, idle h {scaled["idle"].height}')


def main():
    for name, sheets in CAST.items():
        with open(os.path.join(ROOT, 'docs', 'characters', name, 'character.json')) as f:
            pose_lists = json.load(f)['sheets']
        stand, sit = {}, {}
        for path, poses in zip(sheets, pose_lists):
            crops = cut_sheet(os.path.join(ROOT, path), poses)
            for p, c in crops.items():
                if p.startswith('_'):
                    continue
                if p.startswith('sit:'):
                    sit[p[4:]] = (c, path)
                else:
                    stand[p] = (c, path)
        scale = TARGET_IDLE_HEIGHT * K / stand['idle'][0].height
        save_set(name, {p: c for p, (c, _) in stand.items()}, scale)
        if sit:
            # seated poses drawn on a different sheet: match the head width to the standing idle
            sit_scale = scale
            sit_paths = {path for _, path in sit.values()}
            if sit_paths - {stand['idle'][1]}:
                sit_scale = scale * head_width(stand['idle'][0]) / head_width(sit['idle'][0])
            save_set(f'{name}_sit', {p: c for p, (c, _) in sit.items()}, sit_scale)


if __name__ == '__main__':
    main()
