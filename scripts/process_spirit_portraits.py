"""Process Spirit NPC portraits: background removal + alignment without beret anchor.

Usage (from the project root):
  pip install rembg onnxruntime   # if not already installed
  python scripts/process_spirit_portraits.py

Reads:
  docs/characters/spirit/references/expressions_v1.webp  (2×2 grid)
  docs/characters/spirit/references/identity_front.webp  (neutral)
Writes:
  public/sprites/npc/spirit/portrait/<face>.webp

The Spirit has no face/beret/hat to anchor on, so we align on the hood apex
(highest opaque pixel) instead of a coloured landmark.
"""
import os

import numpy as np
from PIL import Image

# Try rembg; if not available, fall back to simple white bg removal
try:
    import rembg
    HAS_REMBG = True
except ImportError:
    rembg = None
    HAS_REMBG = False
    print('Warning: rembg not installed, using simple background removal')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CID = 'spirit'
REF = os.path.join(ROOT, 'docs', 'characters', CID, 'references')
OUT = os.path.join(ROOT, 'public', 'sprites', 'npc', CID, 'portrait')
os.makedirs(OUT, exist_ok=True)


def simple_bg_remove(img: Image.Image) -> Image.Image:
    """Remove white background via flood-fill from edges, preserving the cream cloak."""
    from collections import deque
    
    rgba = np.array(img.convert('RGBA'))
    h, w = rgba.shape[:2]
    rgb = rgba[..., :3].astype(float)
    white_dist = np.sqrt(np.sum((rgb - 255.0) ** 2, axis=2))
    
    tol = 35  # tighter for portraits
    is_white_ish = white_dist < tol
    
    visited = np.zeros((h, w), dtype=bool)
    bg_mask = np.zeros((h, w), dtype=bool)
    
    queue = deque()
    for y in range(h):
        for x in [0, w - 1]:
            if not visited[y, x] and is_white_ish[y, x]:
                visited[y, x] = True
                bg_mask[y, x] = True
                queue.append((y, x))
    for x in range(w):
        for y in [0, h - 1]:
            if not visited[y, x] and is_white_ish[y, x]:
                visited[y, x] = True
                bg_mask[y, x] = True
                queue.append((y, x))
    
    while queue:
        cy, cx = queue.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                visited[ny, nx] = True
                if is_white_ish[ny, nx]:
                    bg_mask[ny, nx] = True
                    queue.append((ny, nx))
    
    alpha = np.full((h, w), 255, dtype=np.uint8)
    alpha[bg_mask] = 0
    
    # Feather edges
    from scipy import ndimage
    bg_dilated = ndimage.binary_dilation(bg_mask, iterations=2)
    fringe = bg_dilated & ~bg_mask
    fringe_dist = white_dist[fringe]
    fringe_alpha = np.clip((fringe_dist / tol) * 255, 0, 255).astype(np.uint8)
    alpha[fringe] = fringe_alpha
    
    rgba[..., 3] = alpha
    return Image.fromarray(rgba)


def rembg_cut(img: Image.Image, sess) -> Image.Image:
    """Use rembg for background removal, then clean up."""
    if rembg is None:
        raise RuntimeError("rembg is not installed")
    result = rembg.remove(
        img,
        session=sess,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=15,
        alpha_matting_erode_size=8,
    )
    if isinstance(result, Image.Image):
        return result
    return Image.fromarray(np.array(result))


def hood_apex(im: Image.Image) -> tuple:
    """Find the topmost opaque pixel column (hood apex) for alignment."""
    a = np.array(im)
    if a.shape[2] < 4:
        return im.width // 2, 0
    
    mask = a[..., 3] > 128
    ys = np.where(mask.any(axis=1))[0]
    if len(ys) == 0:
        return im.width // 2, 0
    
    top_y = ys.min()
    # Use a band of 5% from the top to find the center of the hood
    band_h = max(5, int(im.height * 0.05))
    band = mask[top_y:top_y + band_h]
    xs = np.where(band)[1]
    if len(xs) == 0:
        return im.width // 2, top_y
    
    cx = float(xs.mean())
    return cx, top_y


def main():
    # Load reference images
    identity_path = os.path.join(REF, 'identity_front.webp')
    expressions_path = os.path.join(REF, 'expressions_v1.webp')
    
    ident = Image.open(identity_path).convert('RGB')
    grid = Image.open(expressions_path).convert('RGB')
    
    W, H = grid.size
    # 2×2 grid of expressions
    cells = {
        'reach': grid.crop((0, 0, W // 2, H // 2)),
        'hood_peek': grid.crop((W // 2, 0, W, H // 2)),
        'solemn': grid.crop((0, H // 2, W // 2, H)),
        'turn': grid.crop((W // 2, H // 2, W, H)),
        'neutral': ident,
    }
    
    # Setup rembg if available
    sess = None
    if HAS_REMBG and rembg is not None:
        sess = rembg.new_session('u2net_human_seg')
    
    CANVAS_W, CANVAS_H = 760, 696  # match other NPCs' portrait dimensions
    
    for name, img in cells.items():
        print(f'Processing {name}...')
        
        # Remove background
        if HAS_REMBG:
            im = rembg_cut(img, sess)
        else:
            im = simple_bg_remove(img)
        
        # Find hood apex for alignment
        cx, top = hood_apex(im)
        
        # Scale: fit the figure to roughly 80% of canvas height
        bbox = im.getbbox()
        if bbox:
            fig_h = bbox[3] - bbox[1]
            target_h = int(CANVAS_H * 0.88)
            s = target_h / fig_h
        else:
            s = 0.5
        
        r = im.resize((round(im.width * s), round(im.height * s)), Image.Resampling.LANCZOS)
        
        # Align on hood apex
        cx_scaled = cx * s
        top_scaled = top * s
        
        canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
        paste_x = round(CANVAS_W / 2 - cx_scaled)
        paste_y = round(40 - top_scaled)  # 40px top margin
        canvas.paste(r, (paste_x, paste_y), r)
        
        canvas.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=92)
        print(f'  {name}: scale={s:.3f}, bbox={canvas.getbbox()}')
    
    print(f'\nSaved {len(cells)} portraits to {OUT}')


if __name__ == '__main__':
    main()
