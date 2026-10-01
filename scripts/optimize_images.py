#!/usr/bin/env python3
"""Shrink the game's .webp art without visibly changing it.

For every image it tries three encodings and keeps the smallest one that still matches the
original closely (PSNR on premultiplied colour + alpha):

  * 256-colour palette (libimagequant, no dithering) saved as lossless WebP — keeps pixel edges
    perfectly hard; ideal for sprites, props and most backgrounds
  * high-quality lossy WebP (q94, lossless alpha) — only for big pictures (backgrounds, city)
  * plain lossless WebP at max effort — identical pixels, just packed better

A file is only rewritten when the result is at least 5% smaller. Run it again after adding
new art:   .venv/bin/python scripts/optimize_images.py public/sprites public/maps
           (--dry-run to only print what it would save)

Needs: pip install pillow imagequant numpy
"""
from __future__ import annotations

import io
import math
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from PIL import Image

try:
    import imagequant
except ImportError:  # still useful without it: lossless repack + lossy for big images
    imagequant = None

BIG = 300 * 300           # images larger than this may use lossy (backgrounds, city, portraits)
MIN_PSNR_SPRITE = 38.0
MIN_PSNR_BIG = 36.0
MIN_GAIN = 0.05


def psnr(a: Image.Image, b: Image.Image) -> float:
    x = np.asarray(a, dtype=np.float32)
    y = np.asarray(b, dtype=np.float32)
    px = x[..., :3] * x[..., 3:4] / 255
    py = y[..., :3] * y[..., 3:4] / 255
    mse = ((px - py) ** 2).mean() + ((x[..., 3] - y[..., 3]) ** 2).mean()
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)


def encode(im: Image.Image, **kw) -> bytes:
    buf = io.BytesIO()
    im.save(buf, 'WEBP', **kw)
    return buf.getvalue()


def best_encoding(path: str) -> tuple[str, int, int, str, float]:
    original = os.path.getsize(path)
    src = Image.open(path)
    if getattr(src, 'n_frames', 1) > 1:
        return path, original, original, 'animated-skip', 99.0
    im = src.convert('RGBA')
    big = im.width * im.height > BIG
    floor = MIN_PSNR_BIG if big else MIN_PSNR_SPRITE
    candidates: list[tuple[str, bytes]] = []
    if imagequant is not None:
        pal = imagequant.quantize_pil_image(im, dithering_level=0.0, max_colors=256, min_quality=0, max_quality=100)
        candidates.append(('palette256', encode(pal.convert('RGBA'), lossless=True, quality=95, method=5)))
    if big:
        candidates.append(('lossy94', encode(im, quality=94, method=6, alpha_quality=100)))
    candidates.append(('lossless', encode(im, lossless=True, quality=95, method=5)))

    best = None
    for name, data in sorted(candidates, key=lambda c: len(c[1])):
        score = 99.0 if name == 'lossless' else psnr(im, Image.open(io.BytesIO(data)).convert('RGBA'))
        if score >= floor:
            best = (name, data, score)
            break
    if best is None or len(best[1]) > original * (1 - MIN_GAIN):
        return path, original, original, 'keep', 99.0
    name, data, score = best
    if '--dry-run' not in sys.argv:
        tmp = path + '.tmp'
        with open(tmp, 'wb') as fh:
            fh.write(data)
        os.replace(tmp, path)
    return path, original, len(data), name, score


def main() -> None:
    roots = [a for a in sys.argv[1:] if not a.startswith('--')] or ['public/sprites', 'public/maps', 'public/ui']
    files = [os.path.join(d, f) for r in roots for d, _, fs in os.walk(r) for f in fs if f.lower().endswith('.webp')]
    before = after = 0
    kinds: dict[str, int] = {}
    with ProcessPoolExecutor() as pool:
        for path, a, b, kind, score in pool.map(best_encoding, files, chunksize=8):
            before += a
            after += b
            kinds[kind] = kinds.get(kind, 0) + 1
            if a - b > 50_000:
                print(f'{a / 1024:8.0f}KB -> {b / 1024:6.0f}KB  {kind:10s} psnr {score:4.1f}  {path}')
    print(f'\n{len(files)} images: {before / 1e6:.2f} MB -> {after / 1e6:.2f} MB '
          f'({100 * (1 - after / max(1, before)):.0f}% smaller)  {kinds}')


if __name__ == '__main__':
    main()
