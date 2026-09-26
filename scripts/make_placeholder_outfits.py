"""Placeholder outfits made by recoloring the swimsuit sprites (until real art exists).

    python scripts/make_placeholder_outfits.py [scale]      (default 2.0 = café / My Room size)

Reads public/sprites/land_<scale>x/*.webp (the close-up room size) and writes
public/sprites/outfits/<outfit>/<pose>.webp + manifest.json for every outfit below.
Skin on the torso becomes a shirt, the trunks + legs become pants, the feet become shoes,
and (cap: False) the swim cap becomes plain black hair.
When real art arrives, cut it with scripts/process_outfit.py — it overwrites these files.
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "sprites"
HAIR = (46, 40, 38)  # soft black, a touch warm

OUTFITS = {
    # cozy café: sage-green oversized shirt, charcoal long pants, white sneakers
    "cafe": {"shirt": (168, 191, 160), "pants": (74, 70, 82), "shoes": (236, 230, 220), "stripe": None, "barefoot": False, "cap": False},
    # My Room: light-blue striped pajamas, barefoot
    "pajamas": {"shirt": (170, 200, 232), "pants": (170, 200, 232), "shoes": None, "stripe": (140, 170, 210), "barefoot": True, "cap": False},
}


def is_skin(p):
    r, g, b, a = p
    return a > 100 and r > 150 and r > g > b and (r - b) > 60


def is_navy(p):
    r, g, b, a = p
    return a > 100 and b > r + 12 and b > g and r + g + b < 360


def is_cap(p):
    """White dome or blue band of the swim cap."""
    r, g, b, a = p
    white = min(r, g, b) > 150 and max(r, g, b) - min(r, g, b) < 40
    blue = b > r + 25 and b > g
    return a > 100 and (white or blue)


def remove_cap(im, top, bottom, pose):
    """Paint the swim cap as hair. The cap sits in the top part of the sprite
    (the head is on the left when lying down)."""
    w, _ = im.size
    H = bottom - top
    limit = top + (0.62 if pose == "lie" else 0.42 if pose == "sit" else 0.36) * H
    px = im.load()
    for y in range(top, int(limit)):
        for x in range(int(w * 0.6) if pose == "lie" else w):
            p = px[x, y]
            if is_cap(p):
                px[x, y] = shade(p, HAIR, ref_lum=150)
    return im


def shade(p, base, ref_lum=200):
    """Keep the original light/dark shading, swap the color."""
    r, g, b, a = p
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    k = max(0.45, min(1.25, lum / ref_lum))
    return tuple(max(0, min(255, round(c * k))) for c in base) + (a,)


def striped(o, i):
    return o["stripe"] if o["stripe"] and i % 6 >= 4 else None


def navy_rows(im, top, bottom):
    w, h = im.size
    start = top + int(0.5 * (bottom - top))  # below the cap's blue band
    rows = [y for y in range(start, h) if sum(is_navy(im.getpixel((x, y))) for x in range(w)) >= 4]
    return (min(rows), max(rows)) if rows else (None, None)


def navy_cols(im, y0, y1, xmin=0):
    w, _ = im.size
    cols = [x for x in range(xmin, w) if any(is_navy(im.getpixel((x, y))) for y in range(y0, y1))]
    return (min(cols), max(cols)) if cols else (None, None)


def recolor_upright(im, o, top, bottom):
    w, h = im.size
    t0, t1 = navy_rows(im, top, bottom)
    if t0 is None:
        return im
    out = im.copy(); px = out.load(); src = im.load()
    shirt_start = t0 - round(0.30 * (t0 - top))
    feet_start = bottom - round(0.085 * (bottom - top))
    pants_ref = 45 if o["barefoot"] else 60
    for y in range(h):
        for x in range(w):
            p = src[x, y]
            if p[3] <= 100:
                continue
            if is_navy(p) and t0 - 2 <= y <= t1 + 2:
                px[x, y] = shade(p, o["pants"], pants_ref)
            elif not is_skin(p):
                continue
            elif shirt_start <= y < t0:
                px[x, y] = shade(p, striped(o, y - shirt_start) or o["shirt"])
            elif y > t1 + 1:
                if y >= feet_start:
                    if not o["barefoot"]:
                        px[x, y] = shade(p, o["shoes"])
                else:
                    px[x, y] = shade(p, striped(o, y - t1) or o["pants"])
    return out


def recolor_folded(im, o, pose, top, bottom):
    """Sit / lie: the body is folded sideways, so split by columns around the trunks."""
    w, h = im.size
    H = bottom - top
    if pose == "lie":
        x0, x1 = navy_cols(im, top + int(0.6 * H), h, xmin=int(0.5 * w))
    else:
        x0, x1 = navy_cols(im, top + int(0.6 * H), h)
    if x0 is None:
        return im
    out = im.copy(); px = out.load(); src = im.load()
    left, right = im.getchannel("A").point(lambda v: 255 if v > 100 else 0).getbbox()[0::2]
    pants_ref = 45 if o["barefoot"] else 60
    for y in range(h):
        for x in range(w):
            p = src[x, y]
            if p[3] <= 100:
                continue
            if is_navy(p) and x0 - 1 <= x <= x1 + 1 and (pose == "lie" or y > top + 0.6 * H):
                px[x, y] = shade(p, o["pants"], pants_ref)
                continue
            if not is_skin(p):
                continue
            if pose == "sit":
                if y < top + 0.5 * H:
                    continue  # head
                arm = y < top + 0.7 * H and x < right - 0.3 * (right - left)
                if arm or (x <= x1 - 4 and y < bottom - 0.25 * H):
                    px[x, y] = shade(p, striped(o, y) or o["shirt"])
                elif x > x1 - 4:
                    if x > right - 0.16 * (right - left) and y > bottom - 0.3 * H:
                        if not o["barefoot"]:
                            px[x, y] = shade(p, o["shoes"])
                    else:
                        px[x, y] = shade(p, striped(o, y) or o["pants"])
            else:  # lie: head left, legs right
                if x0 - 0.15 * w <= x < x0:
                    px[x, y] = shade(p, striped(o, x) or o["shirt"])
                elif x > x1:
                    if x > right - 0.08 * (right - left):
                        if not o["barefoot"]:
                            px[x, y] = shade(p, o["shoes"])
                    else:
                        px[x, y] = shade(p, o["pants"])
    return out


def recolor(im, o, pose):
    im = im.convert("RGBA")
    top, bottom = im.getchannel("A").point(lambda v: 255 if v > 100 else 0).getbbox()[1::2]
    if pose in ("sit", "lie"):
        out = recolor_folded(im, o, pose, top, bottom)
    else:
        out = recolor_upright(im, o, top, bottom)
    if not o.get("cap", True):
        out = remove_cap(out if out is not im else out.copy(), top, bottom, pose)
    return out


def main(scale: float) -> None:
    src = ROOT / f"land_{str(scale).replace('.', '_')}x"
    src_manifest = json.loads((src / "manifest.json").read_text())
    for name, o in OUTFITS.items():
        out_dir = ROOT / "outfits" / name
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest = {}
        for pose in src_manifest:
            img = recolor(Image.open(src / f"{pose}.webp"), o, pose)
            img.save(out_dir / f"{pose}.webp", "WEBP", lossless=True)
            manifest[pose] = {"width": img.width, "height": img.height,
                              "path": f"/sprites/outfits/{name}/{pose}.webp"}
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"{name}: {len(manifest)} poses → {out_dir}")


if __name__ == "__main__":
    main(float(sys.argv[1]) if len(sys.argv) > 1 else 2.0)
