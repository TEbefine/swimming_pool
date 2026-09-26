"""Make front/back walk frames from the idle sprites (until real art exists).

Lifts one leg a few pixels (left leg for frame 1, right leg for frame 2) while the
other foot stays planted, so walking up/down steps instead of floating.

    python scripts/make_walk_frames.py

Writes walk_down1/2 + walk_up1/2 into public/sprites/land and land_1_5x and
adds them to both manifests. Re-run after replacing idle/back_idle art.
Delete the generated files once hand-drawn walk frames replace them.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "sprites"
LEG_TOP = 0.785   # legs start ~78% down the sprite (just under the trunks)
LIFT = 0.042      # lift ≈ 4% of height (5px at 1.5×, 3px at 1×)


def split_x(im: Image.Image) -> int:
    """Column between the two feet: the widest gap in the lowest opaque row."""
    a = im.getchannel("A")
    for y in range(im.height - 1, 0, -1):
        xs = [x for x in range(im.width) if a.getpixel((x, y)) > 100]
        if len(xs) > 4:
            gap, mid = max((xs[i + 1] - xs[i], (xs[i] + xs[i + 1]) // 2) for i in range(len(xs) - 1))
            if gap > 2:
                return mid
    return im.width // 2


def lift_leg(im: Image.Image, side: str) -> Image.Image:
    w, h = im.size
    sx, top = split_x(im), int(h * LEG_TOP)
    px = max(3, round(h * LIFT))
    box = (0, top, sx, h) if side == "L" else (sx, top, w, h)
    leg = im.crop((box[0], box[1] + px, box[2], box[3]))
    out = im.copy()
    out.paste(Image.new("RGBA", (box[2] - box[0], box[3] - box[1])), box[:2])
    out.alpha_composite(leg, (box[0], box[1]))
    return out


def main() -> None:
    for folder, url in (("land", "/sprites/land"), ("land_1_5x", "/sprites/land_1_5x")):
        d = ROOT / folder
        entries = {}
        for base, name in (("idle", "walk_down"), ("back_idle", "walk_up")):
            im = Image.open(d / f"{base}.webp").convert("RGBA")
            for side, n in (("L", 1), ("R", 2)):
                key = f"{name}{n}"
                lift_leg(im, side).save(d / f"{key}.webp", "WEBP", lossless=True)
                entries[key] = {"width": im.width, "height": im.height, "path": f"{url}/{key}.webp"}

        if folder == "land":
            mf = ROOT / "character_manifest.json"
            data = json.loads(mf.read_text())
            data["land"].update(entries)
        else:
            mf = d / "manifest.json"
            data = json.loads(mf.read_text())
            data.update(entries)
        mf.write_text(json.dumps(data, indent=2) + "\n")
        print(folder, "→", ", ".join(entries))


if __name__ == "__main__":
    main()
