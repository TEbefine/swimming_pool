"""Quiet Bay background: key the sky out (code sky shows through), scale to 1024x576, write the thumb.

Usage: python3 scripts/process_quiet_bay.py   (reads src/assets/quiet_bay_src.webp)
Sky = bright blue (b >= 228) or near-white cloud pixels, connected to the top edge, above the hills.
Distant blue-grey mountains are darker (b < 215), so they stay.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src/assets/quiet_bay_src.webp')
OUT = os.path.join(ROOT, 'public/maps/quiet_bay.webp')
THUMB = os.path.join(ROOT, 'public/maps/thumbs/quiet_bay.webp')
W, H = 1024, 576


def main():
    im = Image.open(SRC).convert('RGB')
    a = np.array(im).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    blue = (b >= 228) & (g >= 150) & (r < g)
    cloud = (r > 165) & (g > 195) & (b > 228)
    sky_like = blue | cloud
    sky_like[int(a.shape[0] * 0.36):] = False  # never below the far shore
    lab, _ = ndimage.label(sky_like)
    top = set(np.unique(lab[0])) - {0}
    sky = np.isin(lab, list(top))
    sky = ndimage.binary_closing(sky, iterations=2) & ~ndimage.binary_erosion(~sky_like, iterations=0)
    alpha = Image.fromarray(((~sky) * 255).astype(np.uint8))
    rgb = im.resize((W, H), Image.Resampling.LANCZOS)
    al = np.array(alpha.resize((W, H), Image.Resampling.BOX))
    al = np.where(al >= 140, 255, 0).astype(np.uint8)
    out = np.dstack([np.array(rgb), al])
    Image.fromarray(out, 'RGBA').save(OUT, 'WEBP', lossless=True)
    # horizon: lowest keyed row
    rows = np.nonzero((al == 0).any(axis=1))[0]
    print('saved', OUT, 'sky rows 0..', rows.max() if len(rows) else None)
    Image.fromarray(out, 'RGBA').convert('RGB').resize((320, 180), Image.Resampling.LANCZOS).save(THUMB, 'WEBP', quality=88)
    print('thumb', THUMB)


if __name__ == '__main__':
    main()
