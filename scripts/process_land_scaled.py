"""Export the player's LAND frames at a bigger size for close-up rooms (e.g. the café).

Usage:  python scripts/process_land_scaled.py 1.5
Writes public/sprites/land_<scale>x/<pose>.webp + manifest.json (scale 1.5 -> land_1_5x).
Uses the same crop boxes as scripts/process_assets.py, but resizes from the ORIGINAL
sheet, so frames stay sharp instead of enlarging the small 1x files.
"""
import json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src', 'assets', 'spritesheet.png')
SPECS = {  # keep in sync with scripts/process_assets.py
    'idle': (110, 60, 180, 205), 'side_idle': (355, 60, 425, 205), 'back_idle': (590, 60, 665, 205),
    'walk1': (840, 60, 915, 205), 'walk2': (110, 245, 185, 390), 'wave': (350, 245, 445, 390),
    'talk': (585, 245, 685, 390), 'happy': (820, 245, 935, 390), 'thinking': (110, 430, 180, 585),
    'sit': (340, 460, 435, 585), 'lie': (555, 500, 715, 585), 'jump': (830, 420, 925, 585),
}
STAND = {'idle', 'side_idle', 'back_idle', 'walk1', 'walk2', 'thinking'}

def main(k: float):
    im = Image.open(SRC)
    target = 75.0 * k
    idle = im.crop(SPECS['idle']); idle = idle.crop(idle.getbbox())
    scale = target / idle.height
    mult = target / 50.0
    cw, ch = round(32 * mult), round(52 * mult) + 4
    tag = str(k).replace('.', '_')
    out = os.path.join(ROOT, 'public', 'sprites', f'land_{tag}x'); os.makedirs(out, exist_ok=True)
    manifest = {}
    for name, box in SPECS.items():
        c = im.crop(box); c = c.crop(c.getbbox())
        s = c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))), Image.Resampling.LANCZOS)
        if name in STAND:
            canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
            canvas.paste(s, ((cw - s.width) // 2, ch - s.height), s); s = canvas
        s.save(os.path.join(out, f'{name}.webp'), 'WEBP', lossless=True)
        manifest[name] = {'width': s.width, 'height': s.height, 'path': f'/sprites/land_{tag}x/{name}.webp'}
    with open(os.path.join(out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'Saved {len(manifest)} frames to {out}')

if __name__ == '__main__':
    main(float(sys.argv[1]) if len(sys.argv) > 1 else 1.5)
