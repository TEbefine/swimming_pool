"""Dialogue portraits when the face finder fails (tilted heads, laughing, hands near the face).

Same output as process_photo_portraits.py (700x696, transparent, rembg cut, same framing), but each
picture's face is given by hand: centre x, eye line y and face width (temple to temple), in source px.
The 4 grid cells share one scale (the person is the same size in every cell); the identity has its own.

Usage: PORTRAIT_CUT=rembg python3 scripts/process_portraits_manual.py <npc>   (boxes in FACES below)
Needs rembg + OpenCV 4.x (the shared module imports the face cascades).
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_photo_portraits import FACE_W, ROOT, cut_rembg, place  # noqa: E402

EYE_FROM_TOP = 0.42  # eyes sit this far down the face box

# name: (cx, eye_y, face_w); identity = the full photo, grid cells = their own 561x701 crops
FACES = {
    'gen': {
        'ref': 'docs/characters/gen/references',
        'faces': ['laugh', 'pleased', 'stern', 'whistle'],
        'neutral': (530, 310, 225),
        'laugh': (270, 187, 200), 'pleased': (300, 225, 200), 'stern': (262, 170, 200), 'whistle': (275, 130, 200),
    },
    'minato': {
        'ref': 'docs/characters/minato/references',
        'faces': ['smile', 'explain', 'thinking', 'wink'],
        'neutral': (585, 255, 215),
        'smile': (270, 185, 180), 'explain': (272, 195, 185), 'thinking': (275, 200, 175), 'wink': (285, 195, 175),
    },
}


def main(npc: str):
    spec = FACES[npc]
    ident = Image.open(os.path.join(ROOT, spec['ref'], 'identity.jpg')).convert('RGB')
    grid = Image.open(os.path.join(ROOT, spec['ref'], 'expressions_v1.jpg')).convert('RGB')
    gw, gh = grid.size
    cells = [grid.crop((0, 0, gw // 2, gh // 2)), grid.crop((gw // 2, 0, gw, gh // 2)),
             grid.crop((0, gh // 2, gw // 2, gh)), grid.crop((gw // 2, gh // 2, gw, gh))]
    grid_scale = FACE_W / float(np.median([spec[f][2] for f in spec['faces']]))
    out_dir = os.path.join(ROOT, 'public', 'sprites', 'npc', npc, 'portrait')
    os.makedirs(out_dir, exist_ok=True)
    for name, img in [('neutral', ident)] + list(zip(spec['faces'], cells)):
        cx, eye, fw = spec[name]
        s = FACE_W / fw if name == 'neutral' else grid_scale
        top = eye - EYE_FROM_TOP * FACE_W / s
        place(cut_rembg(img), s, cx, top).save(os.path.join(out_dir, f'{name}.webp'), 'WEBP', quality=92)
        print(f'{npc}/{name}: scale {s:.3f}')


if __name__ == '__main__':
    if len(sys.argv) != 2 or sys.argv[1] not in FACES:
        sys.exit(__doc__)
    main(sys.argv[1])
