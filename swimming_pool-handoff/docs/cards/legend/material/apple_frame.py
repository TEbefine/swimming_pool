"""Legend frame + shutter in Apple-style metal finishes.
Shape (alpha) and engraved marks come from the Rare frame; the surface is
rebuilt in code: rounded edge + polished (diamond-cut) chamfer, studio light
gradient, fine bead-blast or brushed grain, laser-etched marks.
usage: python3 apple_frame.py <rare_frame.png> <rare_shutter.png> <outdir>
"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd

FINISHES = {
    # base = flat-surface colour under the key light; etch = colour of laser marks
    'spacegray': dict(base=(0.400, 0.405, 0.420), etch=(0.58, 0.59, 0.61), grain=0.010, brush=None,
                      chamfer=(0.86, 0.87, 0.89), shut=(0.47, 0.475, 0.49), shut_brush=0.020),
    'titanium':  dict(base=(0.600, 0.585, 0.560), etch=(0.42, 0.41, 0.395), grain=0.008, brush='h',
                      chamfer=(0.95, 0.94, 0.91), shut=(0.66, 0.645, 0.62), shut_brush=0.022),
    'gold':      dict(base=(0.780, 0.600, 0.300), etch=(0.06, 0.05, 0.04), grain=0.008, brush=None,
                      chamfer=(1.00, 0.93, 0.72), shut=(0.83, 0.66, 0.35), shut_brush=0.022),
    'silver':    dict(base=(0.780, 0.790, 0.800), etch=(0.55, 0.56, 0.58), grain=0.007, brush=None,
                      chamfer=(1.00, 1.00, 1.00), shut=(0.84, 0.85, 0.86), shut_brush=0.018),
}

L = np.array([-0.45, -0.75, 0.9]); L /= np.linalg.norm(L)   # key light: top-left, in front


def edge_light(mask, d, chamfer_px, round_px):
    """Return (shade, chamfer_band) for a binary mask.
    shade: multiplicative light from the rounded edge (1 on the flat face).
    chamfer_band: 0..1 strength of the polished facet, already weighted by
    which way the edge faces (top/left edges catch more light)."""
    # profile: 45deg chamfer facet [0,c], then quarter-round into the flat face
    c, R = chamfer_px, round_px
    h = np.where(d < c, d, c + R * np.sqrt(np.clip(1 - (1 - np.clip((d - c) / R, 0, 1)) ** 2, 0, 1)))
    h = nd.gaussian_filter(h, 0.7)
    gy, gx = np.gradient(h)
    n = np.stack([-gx, -gy, np.ones_like(h) * 0.9], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    diff = np.clip(n @ L, 0, 1)
    flat = (np.array([0, 0, 1.0]) @ L)
    shade = 0.35 + 0.65 * diff / flat
    # facet direction (unit outward normal in xy)
    gxs, gys = nd.gaussian_filter(gx, 1.2), nd.gaussian_filter(gy, 1.2)
    nrm = np.hypot(gxs, gys) + 1e-6
    ox, oy = -gxs / nrm, -gys / nrm                      # points outward
    facing = np.clip(-(ox * 0.45 + oy * 0.85), -1, 1)   # +1 = faces up/left toward light
    band = np.clip(1 - np.abs(d - c * 0.55) / (c * 0.75), 0, 1) ** 1.3
    band *= (0.55 + 0.45 * facing)
    band[~mask] = 0
    return np.clip(shade, 0.25, 1.25), band


def grain(shape, amt, brush, seed):
    rng = np.random.default_rng(seed)
    g = rng.standard_normal(shape)
    if brush == 'h':
        g = nd.uniform_filter1d(g, 41, axis=1) * 4.0 + nd.gaussian_filter(rng.standard_normal(shape), .6) * .35
    elif brush == 'v':
        g = nd.uniform_filter1d(g, 41, axis=0) * 4.0
    else:
        g = nd.gaussian_filter(g, 0.6) * 1.6
    return g * amt


def studio(H, W, strength=1.0):
    yy, xx = np.mgrid[0:H, 0:W]
    u, v = xx / W, yy / H
    g = 1 + 0.08 * (0.5 - v) - 0.03 * (u - 0.5)
    g += 0.05 * np.exp(-((u * 0.7 + v) - 0.42) ** 2 / 0.025)   # soft diagonal reflection
    return 1 + (g - 1) * strength


def marks_mask(fr):
    rgb, a = fr[..., :3], fr[..., 3]
    V = rgb.max(-1)
    m = a > 0.5
    med = np.median(V[m])
    H, W = V.shape
    box = np.zeros_like(m)
    out = np.zeros(V.shape)
    # barcode + square: darker than the rim
    dark = (V < med - 0.18) & m
    for (x0, x1, y0, y1) in [(30, 66, 100, 340), (30, 66, 1015, 1052)]:
        sub = np.zeros_like(m); sub[y0:y1, x0:x1] = True
        out = np.maximum(out, (dark & sub).astype(float))
    # arrow: redrawn as a clean vector shape at the original size/place
    from PIL import ImageDraw
    S = 4
    im = Image.new('L', (W * S, H * S), 0)
    pts = [(47, 41.5), (61.5, 64.5), (53.5, 64.5), (53.5, 89), (40.5, 89), (40.5, 64.5), (32.5, 64.5)]
    ImageDraw.Draw(im).polygon([(x * S, y * S) for x, y in pts], fill=255)
    arr = np.asarray(im.resize((W, H), Image.BOX)).astype(float) / 255
    out = np.maximum(out, arr)
    return np.clip(nd.gaussian_filter(out, 0.35), 0, 1)


def straighten(f, lines, win=5, taper=14):
    """Snap long straight edges to a fitted line.
    lines: (axis, pos, start, end); axis 'v' = vertical edge at x=pos for
    rows start..end, 'h' = horizontal edge at y=pos for cols start..end."""
    f = f.copy()
    for ax, pos, a0, a1 in lines:
        g = f if ax == 'v' else f.T          # work as if the edge is vertical
        idx = np.arange(a0, a1)
        lo, hi = int(pos) - win, int(pos) + win + 1
        xs = np.arange(lo, hi)
        prof = g[a0:a1, lo:hi]
        sign = 1 if prof[:, -1].mean() > prof[:, 0].mean() else -1
        q = prof if sign > 0 else prof[:, ::-1]
        xq = xs if sign > 0 else xs[::-1]
        cross = np.full(len(idx), np.nan)
        for i, row in enumerate(q):
            j = np.where((row[:-1] < .5) & (row[1:] >= .5))[0]
            if len(j):
                j = j[0]; t = (.5 - row[j]) / (row[j + 1] - row[j] + 1e-9)
                cross[i] = xq[j] + (xq[j + 1] - xq[j]) * t
        ok = ~np.isnan(cross)
        k, b = np.polyfit(idx[ok], cross[ok], 1)
        for _ in range(2):                    # robust refit
            r = np.abs(cross - (k * idx + b)); ok2 = ok & (r < 1.5)
            k, b = np.polyfit(idx[ok2], cross[ok2], 1)
        xe = k * idx + b
        ideal = np.clip(.5 + (xs[None, :] - xe[:, None]) * .32 * sign, 0, 1)
        w = np.minimum(1, np.minimum(idx - a0, a1 - 1 - idx) / taper)[:, None]
        g[a0:a1, lo:hi] = w * ideal + (1 - w) * prof
    return f


def clean_alpha(a, sigma, keep_box=(), S=4, lines=()):
    """Perfectly clean silhouette at sub-pixel precision.
    Blur the binary mask, upsample S times, re-threshold (removes bumps,
    dents, specks and 1px stair-steps), keep thin rails inside keep_box.
    Returns mask (1x), anti-aliased alpha (1x), distance-to-edge (1x, px)."""
    m0 = a > 0.5
    holes, nh = nd.label(nd.binary_fill_holes(m0) & ~m0)
    if nh:
        hs = nd.sum(holes > 0, holes, range(1, nh + 1))
        m0 = m0 | np.isin(holes, 1 + np.where(hs < 400)[0])   # fill specks, keep real windows
    lab, n = nd.label(m0)
    if n > 1:
        sizes = nd.sum(m0, lab, range(1, n + 1))
        m0 = np.isin(lab, 1 + np.where(sizes > 200)[0])
    f = nd.gaussian_filter(m0.astype(float), sigma)
    if lines:
        f = straighten(f, lines)
    for (x0, x1, y0, y1) in keep_box:
        f[y0:y1, x0:x1] = np.maximum(f[y0:y1, x0:x1], m0[y0:y1, x0:x1] * 1.0)
    H, W = f.shape
    hi = nd.zoom(f, S, order=1) > 0.5
    d_hi = nd.distance_transform_edt(hi) / S
    down = lambda x: x.reshape(H, S, W, S).mean(axis=(1, 3))
    aa = down(hi.astype(float))
    d = down(d_hi)
    return aa > 0.5, aa, d


def make_frame(fr, f, seed=1):
    rails = [(190, 222, 0, 185), (592, 625, 0, 185), (215, 600, 165, 185)]
    lines = [('v', 15.5, 45, 1040), ('v', 78.5, 128, 930), ('v', 762.5, 175, 930), ('v', 798.5, 170, 1040),
             ('h', 1066.5, 45, 770), ('h', 953.5, 100, 742), ('h', 108.5, 100, 178), ('h', 108.5, 636, 712),
             ('h', 26.5, 92, 196), ('h', 26.5, 618, 712)]
    m, a, d = clean_alpha(fr[..., 3], 2.2, keep_box=rails, lines=lines)
    H, W = m.shape
    shade, band = edge_light(m, d, chamfer_px=2.6, round_px=6.0)
    base = np.array(f['base'])
    lum = shade * studio(H, W) + grain(m.shape, f['grain'], f['brush'], seed)
    col = base[None, None, :] * lum[..., None]
    # polished chamfer: mirror-bright facet
    ch = np.array(f['chamfer'])
    col = col * (1 - band[..., None]) + ch * band[..., None]
    # thin rails at the shutter notch read as shadowed track
    inbox = np.zeros_like(m)
    for (x0, x1, y0, y1) in rails:
        inbox[y0:y1, x0:x1] = True
    thin = m & inbox & (nd.maximum_filter(d, 7) < 2.6)
    col[thin] *= 0.55
    # laser-etched marks: flat colour + tiny engraved light/shadow lip
    mk = marks_mask(fr)
    etch = np.array(f['etch'])
    lip_dark = np.clip(mk - nd.shift(mk, (1.2, 0.6), order=1), 0, 1)   # top-left inner wall in shadow
    lip_lit = np.clip(mk - nd.shift(mk, (-1.2, -0.6), order=1), 0, 1)  # bottom-right wall catches light
    e = etch[None, None, :] * (studio(H, W, .6)[..., None]) + grain(m.shape, f['grain'] * .6, None, seed + 7)[..., None]
    col = col * (1 - mk[..., None]) + e * mk[..., None]
    col = col * (1 - 0.25 * lip_dark[..., None]) + 0.18 * lip_lit[..., None]
    return np.concatenate([np.clip(col, 0, 1), a[..., None]], -1)


def make_shutter(sh, f, seed=3):
    m, a, d = clean_alpha(sh[..., 3], 1.6)
    H, W = m.shape
    shade, band = edge_light(m, d, chamfer_px=2.2, round_px=4.5)
    base = np.array(f['shut'])
    # brushed along the slide direction + a broad anisotropic reflection
    rng = np.random.default_rng(seed)
    g = nd.uniform_filter1d(rng.standard_normal(m.shape), 61, axis=1) * 5.5
    g += nd.uniform_filter1d(rng.standard_normal(m.shape), 9, axis=1) * 0.9
    yy, xx = np.mgrid[0:H, 0:W]
    u, v = xx / W, yy / H
    refl = 1 + 0.10 * np.exp(-((u * 0.55 + v * 0.45) - 0.38) ** 2 / 0.012) - 0.06 * (v - 0.5) + 0.04 * np.cos(u * 3.1) * 0.5
    lum = shade * refl + g * f['shut_brush']
    col = base[None, None, :] * lum[..., None]
    ch = np.array(f['chamfer'])
    col = col * (1 - band[..., None]) + ch * band[..., None]
    return np.concatenate([np.clip(col, 0, 1), a[..., None]], -1)


if __name__ == '__main__':
    frp, shp, out = sys.argv[1:4]
    fr = np.asarray(Image.open(frp).convert('RGBA')).astype(float) / 255
    sh = np.asarray(Image.open(shp).convert('RGBA')).astype(float) / 255
    for k, f in FINISHES.items():
        Image.fromarray((make_frame(fr, f) * 255).astype('uint8')).save(f'{out}/frame_{k}.png')
        Image.fromarray((make_shutter(sh, f) * 255).astype('uint8')).save(f'{out}/shutter_{k}.png')
        print('ok', k)
