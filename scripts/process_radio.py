"""LUMEN FM 78.6 — the two radio rooms (control room + recording studio).

Usage (from the project root, AFTER scripts/process_radio_cast.py):  python3 scripts/process_radio.py

Inputs   src/assets/radio_control_src.webp   room 1, ChatGPT 2026-11-05 (big monitor painted flat magenta)
         src/assets/radio_studio_src.webp    room 2, ChatGPT 2026-11-05
Outputs  public/maps/radio.webp  + thumbs/radio.webp
         public/maps/radio_studio.webp + thumbs/radio_studio.webp

Room 1's magenta monitor gets the studio "camera feed": the studio painting with the three hosts in
their chairs, a REC dot and level meters — like a real video-podcast control room, where the
engineer watches the cameras on a monitor wall. (Static for now; a live feed can come later.)
Seat positions must match src/game/rooms/radioLayout.ts (STUDIO_SEATS).
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.environ.get('SP_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1024, 576
# feet x, feet y, facing — keep in sync with radioLayout.ts STUDIO_SEATS
SEATS = {'rin': (368, 338, 1), 'teera': (580, 314, 1), 'momo': (795, 338, -1)}


def p(*a):
    return os.path.join(ROOT, *a)


def load_room(name):
    return Image.open(p('src/assets', name)).convert('RGB').resize((W, H), Image.Resampling.LANCZOS)


def sprite(folder, pose='idle'):
    m = json.load(open(p('public/sprites/npc', folder, 'manifest.json')))
    return Image.open(p('public' + m[pose]['path'])).convert('RGBA')


def studio_with_cast(studio: Image.Image) -> Image.Image:
    img = studio.convert('RGBA')
    for name, (x, y, facing) in sorted(SEATS.items(), key=lambda kv: kv[1][1]):
        s = sprite(f'{name}_sit')
        if facing < 0:
            s = s.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        img.alpha_composite(s, (round(x - s.width / 2), y - s.height))
    return img


def camera_feed(studio_cast: Image.Image, size) -> Image.Image:
    fw, fh = size
    # frame the chairs like a wide camera shot (crop the empty floor)
    shot = studio_cast.crop((150, 40, 1010, 430)).convert('RGB')
    shot = shot.resize((fw, fh), Image.Resampling.LANCZOS)
    a = np.array(shot).astype(float)
    a = a * 0.86 + np.array([8, 10, 18])                       # a little cooler + darker: a screen
    a[::3] *= 0.93                                              # faint scanlines
    feed = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(feed)
    # REC dot + label (top-left), camera label (top-right)
    d.ellipse((10, 9, 22, 21), fill=(230, 50, 50))
    d.rectangle((28, 9, 66, 21), fill=(20, 20, 24))
    d.text((31, 9), 'REC', fill=(245, 245, 245))
    d.rectangle((fw - 70, 9, fw - 10, 21), fill=(20, 20, 24))
    d.text((fw - 66, 9), 'CAM 1', fill=(245, 245, 245))
    # three level meters (one per mic) along the bottom-right
    rng = np.random.default_rng(786)
    for i in range(3):
        x0 = fw - 60 + i * 16
        lvl = int(rng.integers(5, 11))
        for j in range(12):
            y = fh - 14 - j * 6
            col = (90, 200, 110) if j < 8 else (240, 200, 70) if j < 10 else (230, 70, 60)
            d.rectangle((x0, y, x0 + 10, y + 3), fill=col if j < lvl else (40, 44, 48))
    return feed


def fill_monitor(room: Image.Image, feed_src: Image.Image) -> Image.Image:
    a = np.array(room).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = (r > 170) & (b > 170) & (g < 110)
    lab, n = ndimage.label(mag)
    big = 1 + int(np.argmax(ndimage.sum(mag, lab, range(1, n + 1))))
    m = ndimage.binary_dilation(lab == big, iterations=2)
    ys, xs = np.where(m)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    feed = np.array(camera_feed(feed_src, (x1 - x0, y1 - y0)))
    out = a.copy()
    sub = out[y0:y1, x0:x1]
    mm = m[y0:y1, x0:x1]
    sub[mm] = feed[mm]
    print(f'monitor box x {x0}-{x1} y {y0}-{y1}')
    return Image.fromarray(out.astype(np.uint8))


def save(img: Image.Image, name: str):
    os.makedirs(p('public/maps/thumbs'), exist_ok=True)
    img.save(p('public/maps', f'{name}.webp'), 'WEBP', quality=92, method=6)
    img.convert('RGB').resize((320, 180), Image.Resampling.LANCZOS).save(p('public/maps/thumbs', f'{name}.webp'), 'WEBP', quality=88)
    print('saved', name)


def main():
    studio = load_room('radio_studio_src.webp')
    control = load_room('radio_control_src.webp')
    save(studio, 'radio_studio')
    save(fill_monitor(control, studio_with_cast(studio)), 'radio')
    # preview of the seated hosts in the studio (not shipped)
    studio_with_cast(studio).save(p('docs/characters/teera/references/_studio_seats_preview.png'))


if __name__ == '__main__':
    main()
