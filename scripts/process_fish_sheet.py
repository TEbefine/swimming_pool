"""Cut a 4x4 FREE FISHING icon sheet into one icon per fish.

Usage:
    .venv/bin/python scripts/process_fish_sheet.py src/assets/fish_sheet_a.webp a   (real fish)
    .venv/bin/python scripts/process_fish_sheet.py src/assets/fish_sheet_b.webp b   (myth, history & treasure)
    .venv/bin/python scripts/process_fish_sheet.py src/assets/fish_sheet_c.webp c   (season fish)
    .venv/bin/python scripts/process_fish_sheet.py src/assets/fish_sheet_d.webp d   (water friends)
Then add the sheet letter to READY_SHEETS in src/game/fishing/freeFish.ts.
Needs numpy, pillow and scipy. Creatures are found as shapes, not by a fixed grid.

Writes public/sprites/fish/<id>.webp (64x64, transparent).
The order MUST match FREE_FISH in src/game/fishing/freeFish.ts (sheet + cell, row by row).
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

SHEETS = {
    'a': [
        'sardine', 'tilapia', 'carp', 'catfish',
        'snakehead', 'pomfret', 'barramundi', 'red_snapper',
        'grouper', 'pufferfish', 'giant_gourami', 'bluefin_tuna',
        'arowana', 'mekong_catfish', 'oarfish', 'coelacanth',
    ],
    'b': [
        'armorfish', 'megalodon_pup', 'ammonite', 'fossil_fish',
        'dragon_gate_carp', 'jade_moon_koi', 'lantern_fish', 'abyss_angler',
        'ghost_pirate_fish', 'pearl_oyster', 'baby_kraken', 'star_swallower',
        'sun_carp', 'moon_whale', 'bottle_message', 'treasure_chest',
    ],
    'c': [
        'mango_threadfin', 'flying_fish', 'mahi_mahi', 'sailfish',
        'mirage_fish', 'climbing_perch', 'swamp_eel', 'betta',
        'giant_stingray', 'rain_naga', 'rainbow_koi', 'pla_thu',
        'saury', 'rainbow_trout', 'yellowtail', 'snowflake_fish',
    ],
    'd': [
        'hermit_crab', 'blue_crab', 'river_prawn', 'mantis_shrimp',
        'moon_jelly', 'seahorse', 'starfish', 'horseshoe_crab',
        'sea_turtle', 'paddy_frog', 'night_squid', 'manta_ray',
        'axolotl', 'blue_lobster', 'dugong', 'island_turtle',
    ],
}
SIZE = 64          # output icon size (shown at 32 px in the bag, 64 for crisp 2x screens)
ALPHA_CUT = 40     # softer pixels than this become fully transparent (removes the dark halo)
PAD = 0.06         # empty border around each icon, as a share of its size

OUT = Path(__file__).resolve().parent.parent / 'public' / 'sprites' / 'fish'


def find_creatures(alpha: np.ndarray) -> list[np.ndarray]:
    """Find the 16 creatures as shapes (not by a fixed grid: ChatGPT's fish often poke out of their cell).
    Returns one mask per creature in reading order (row by row, left to right).
    Small bits (a whisker, a hat brim) are joined to the nearest big shape; tiny specks are dropped."""
    from scipy import ndimage
    solid = alpha > 0
    label, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, label, range(1, n + 1))
    order = sorted(range(1, n + 1), key=lambda i: -sizes[i - 1])
    big = order[:16]
    if len(big) < 16 or sizes[big[-1] - 1] < sizes[big[0] - 1] * 0.2:
        sys.exit(f'!! expected 16 creatures, found {len([i for i in order if sizes[i-1] > sizes[order[0]-1]*0.2])}')
    centre = {i: ndimage.center_of_mass(solid, label, i) for i in big}
    groups = {i: [i] for i in big}
    for i in order[16:]:
        if sizes[i - 1] < 30:
            continue
        cy, cx = ndimage.center_of_mass(solid, label, i)
        near = min(big, key=lambda b: (centre[b][0] - cy) ** 2 + (centre[b][1] - cx) ** 2)
        groups[near].append(i)
    rows = sorted(big, key=lambda b: centre[b][0])
    reading = []
    for r in range(4):
        reading += sorted(rows[r * 4:(r + 1) * 4], key=lambda b: centre[b][1])
    return [np.isin(label, groups[b]) for b in reading]


def main(src: str, sheet_id: str) -> None:
    ITEM_IDS = SHEETS[sheet_id]
    sheet = np.array(Image.open(src).convert('RGBA'))
    sheet[sheet[..., 3] < ALPHA_CUT] = 0
    OUT.mkdir(parents=True, exist_ok=True)

    for item_id, mask in zip(ITEM_IDS, find_creatures(sheet[..., 3])):
        cell = sheet.copy()
        cell[~mask] = 0
        img = Image.fromarray(cell)
        img = img.crop(img.getchannel('A').getbbox())
        w, h = img.size
        side = max(w, h)
        full = side + 2 * round(side * PAD)
        square = Image.new('RGBA', (full, full), (0, 0, 0, 0))
        square.paste(img, ((full - w) // 2, (full - h) // 2))
        square.resize((SIZE, SIZE), Image.LANCZOS).save(OUT / f'{item_id}.webp', lossless=True)
        print(f'ok  {item_id}')


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[2] not in SHEETS:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
