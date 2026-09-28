"""Process Spirit NPC sprite sheet: flood-fill background removal from edges only.

Usage (from the project root):
  python scripts/process_spirit_sprites.py

The Spirit's cloak is near-white on a WHITE background.  A global white→transparent
would destroy the cloak.  Instead we:
  1. Flood-fill from the four corners with a generous tolerance, stopping at the
     dark outline that borders every sprite.
  2. Soft-erode 1-2px into the remaining fringe so it blends cleanly on any bg.

Writes to public/sprites/npc/spirit/ using the same pipeline (head-aligned canvases,
manifest.json) as process_npc.py.
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src', 'assets', 'npc_spirit_sheet.webp')
NAME = 'spirit'
TARGET_IDLE_HEIGHT = 75.0
ALPHA_CUTOFF = 40

# ── Pose list from character.json ──
POSES = [
    'idle', 'side_idle', 'back_idle', 'walk1',
    'walk2', 'reach', 'talk', 'tilt',
    'front_walk1', 'front_walk2', 'back_walk1', 'back_walk2',
    'look_back', 'sit', 'bow', 'lean',
]
STAND_POSES = {
    'idle', 'side_idle', 'back_idle', 'walk1', 'walk2',
    'front_walk1', 'front_walk2', 'back_walk1', 'back_walk2', 'look_back',
}


def flood_fill_bg(rgba: np.ndarray, tol: int = 60) -> np.ndarray:
    """Flood-fill from corners to remove the white background.
    
    Stops at dark outlines (pixels that differ from white by more than `tol`).
    Returns an alpha mask where 0 = background, 255 = foreground.
    """
    h, w = rgba.shape[:2]
    rgb = rgba[..., :3].astype(float)
    
    # Distance from pure white for each pixel
    white_dist = np.sqrt(np.sum((rgb - 255.0) ** 2, axis=2))
    
    # Pixels that are "close to white" can be flooded through
    is_white_ish = white_dist < tol
    
    visited = np.zeros((h, w), dtype=bool)
    bg_mask = np.zeros((h, w), dtype=bool)
    
    # Seed from corners and edges
    seeds = []
    for y in range(h):
        seeds.append((y, 0))
        seeds.append((y, w - 1))
    for x in range(w):
        seeds.append((0, x))
        seeds.append((h - 1, x))
    
    queue = deque()
    for y, x in seeds:
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
    
    # Feather: soft transition at edges (dilate bg by 1px and blend)
    bg_dilated = ndimage.binary_dilation(bg_mask, iterations=1)
    fringe = bg_dilated & ~bg_mask
    
    alpha = np.full((h, w), 255, dtype=np.uint8)
    alpha[bg_mask] = 0
    # Fringe pixels: partial alpha based on how white-ish they are
    fringe_dist = white_dist[fringe]
    fringe_alpha = np.clip((fringe_dist / tol) * 255, 0, 255).astype(np.uint8)
    alpha[fringe] = fringe_alpha
    
    return alpha


def detect_cells(alpha: np.ndarray):
    """Detect 16 cells from a 4×4 grid, same logic as process_npc.py."""
    for it in (8, 4, 2):
        cells = _detect_cells(alpha, it)
        if len(cells) == 16:
            return cells
    return cells


def _detect_cells(alpha: np.ndarray, iterations: int):
    fg = alpha > ALPHA_CUTOFF
    labeled: object = ndimage.label(ndimage.binary_dilation(fg, iterations=iterations))
    lab = labeled[0] if isinstance(labeled, tuple) else labeled
    boxes = [s for s in ndimage.find_objects(lab)
             if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > 2000]
    row_h, col_w = alpha.shape[0] / 4, alpha.shape[1] / 4
    cells = {}
    for s in boxes:
        key = (int(((s[0].start + s[0].stop) / 2) // row_h), int(((s[1].start + s[1].stop) / 2) // col_w))
        if key in cells:
            o = cells[key]
            s = (slice(min(o[0].start, s[0].start), max(o[0].stop, s[0].stop)),
                 slice(min(o[1].start, s[1].start), max(o[1].stop, s[1].stop)))
        cells[key] = s
    return [cells[k] for k in sorted(cells)]


def head_center_x(img: Image.Image) -> float:
    """X centre of the head: mean x of opaque pixels in the top 28% of the figure."""
    a = np.array(img)[..., 3] > 128
    ys = np.where(a.any(axis=1))[0]
    if len(ys) == 0:
        return img.width / 2
    top = ys.min()
    band = a[top: top + max(4, int(img.height * 0.28))]
    xs = np.where(band)[1]
    return float(xs.mean()) if len(xs) else img.width / 2


def main():
    print(f'Loading {SRC}...')
    sheet = Image.open(SRC).convert('RGBA')
    arr = np.array(sheet)
    
    # Step 1: Flood-fill background removal from edges
    print('Removing white background via edge flood-fill...')
    new_alpha = flood_fill_bg(arr)
    
    # Combine: keep original alpha where it exists (for any existing transparency),
    # but override with our flood-fill mask
    arr[..., 3] = np.minimum(arr[..., 3], new_alpha)
    
    # Clean up: remove faint anti-alias noise
    arr[..., 3] = np.where(arr[..., 3] < ALPHA_CUTOFF, 0, arr[..., 3])
    sheet = Image.fromarray(arr)
    
    # Step 2: Detect the 16 cells
    boxes = detect_cells(arr[..., 3])
    print(f'Found {len(boxes)} cells (expected {len(POSES)})')
    if len(boxes) != len(POSES):
        sys.exit(f'Expected {len(POSES)} poses, found {len(boxes)} — check the sheet.')
    
    # Step 3: Crop each pose
    crops = {}
    for pose, s in zip(POSES, boxes):
        cell = sheet.crop((s[1].start, s[0].start, s[1].stop, s[0].stop))
        bbox = cell.getbbox()
        if bbox:
            crops[pose] = cell.crop(bbox)
        else:
            print(f'  Warning: {pose} has no visible pixels, using full cell')
            crops[pose] = cell
    
    # Step 4: Scale to match lifeguard idle height (82px canvas, ~75px figure)
    scale = TARGET_IDLE_HEIGHT / crops['idle'].height
    print(f'Scale factor: {scale:.3f} (idle {crops["idle"].height}px → {TARGET_IDLE_HEIGHT:.0f}px)')
    scaled = {p: c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))),
                          Image.Resampling.LANCZOS) for p, c in crops.items()}
    
    # Step 5: Build head-aligned canvases (same algorithm as process_npc.py)
    heads = {p: head_center_x(img) for p, img in scaled.items()}
    half = max(max(heads[p], img.width - heads[p]) for p, img in scaled.items())
    canvas_w = max(48, 2 * int(np.ceil(half)) + 2)
    canvas_h = max(82, max(img.height for img in scaled.values()) + 4)
    
    out_dir = os.path.join(ROOT, 'public', 'sprites', 'npc', NAME)
    os.makedirs(out_dir, exist_ok=True)
    manifest = {}
    for pose, img in scaled.items():
        canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        canvas.paste(img, (round(canvas_w / 2 - heads[pose]), canvas_h - img.height), img)
        canvas.save(os.path.join(out_dir, f'{pose}.webp'), 'WEBP', lossless=True)
        manifest[pose] = {'width': canvas_w, 'height': canvas_h,
                          'path': f'/sprites/npc/{NAME}/{pose}.webp'}
    
    # Step 6: Create head.webp (crop the top portion of the idle sprite for the dialog name tag)
    idle_img = scaled['idle']
    idle_arr = np.array(idle_img)
    a = idle_arr[..., 3] > 128
    ys = np.where(a.any(axis=1))[0]
    if len(ys) > 0:
        top_y = ys.min()
        head_h = max(20, int(idle_img.height * 0.45))
        head_crop = idle_img.crop((0, top_y, idle_img.width, min(top_y + head_h, idle_img.height)))
        head_crop.save(os.path.join(out_dir, 'head.webp'), 'WEBP', lossless=True)
        print(f'Saved head.webp ({head_crop.size})')
    
    # Step 7: Save manifest
    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'Saved {len(manifest)} frames + manifest to {out_dir}')


if __name__ == '__main__':
    main()
