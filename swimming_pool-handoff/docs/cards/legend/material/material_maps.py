"""Surface maps for the WebGL Legend frame.
N texture: R,G = surface normal x,y (image space, 0.5 = flat), B = height 0..1, A = alpha
M texture: R = engraved marks, G = outer contour band, B = micro grain (0.5 = none), A = 255
Outer silhouette -> soft contoured edge (like an iPhone Pro side band);
holes (card window, shutter window) -> crisp 45deg diamond-cut chamfer.
usage: python3 material_maps.py <rare_frame.png> <rare_shutter.png> <outdir>
"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from apple_frame import straighten, marks_mask

S = 4
HP = 4.0   # plateau height in px


def hi_mask(a, sigma, keep_box=(), lines=()):
    m0 = a > 0.5
    holes, nh = nd.label(nd.binary_fill_holes(m0) & ~m0)
    if nh:
        hs = nd.sum(holes > 0, holes, range(1, nh + 1))
        m0 = m0 | np.isin(holes, 1 + np.where(hs < 400)[0])
    lab, n = nd.label(m0)
    if n > 1:
        sizes = nd.sum(m0, lab, range(1, n + 1))
        m0 = np.isin(lab, 1 + np.where(sizes > 200)[0])
    f = nd.gaussian_filter(m0.astype(float), sigma)
    if lines:
        f = straighten(f, lines)
    for (x0, x1, y0, y1) in keep_box:
        f[y0:y1, x0:x1] = np.maximum(f[y0:y1, x0:x1], m0[y0:y1, x0:x1] * 1.0)
    return nd.zoom(f, S, order=1) > 0.5


def maps(hi, Ro, etch=None, grain='iso', seed=1):
    Hh, Wh = hi.shape
    H, W = Hh // S, Wh // S
    down = lambda x: x.reshape(H, S, W, S).mean(axis=(1, 3))
    lab, n = nd.label(~hi)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(border))
    holes = ~hi & ~outside
    d_out = down(nd.distance_transform_edt(~outside) / S)
    d_in = down(nd.distance_transform_edt(~holes) / S) if holes.any() else np.full((H, W), 99.0)
    alpha = down(hi.astype(float))
    p_out = HP * np.sqrt(np.clip(1 - (1 - np.clip(d_out / Ro, 0, 1)) ** 2, 0, 1))
    p_in = np.where(d_in < 2, d_in, 2 + 2 * np.sqrt(np.clip(1 - (1 - np.clip((d_in - 2) / 3, 0, 1)) ** 2, 0, 1)))
    h = np.minimum(p_out, p_in)
    if etch is not None:
        h = h - etch * 0.9            # engraved 0.9px deep: walls catch light
    h = nd.gaussian_filter(h, 0.6)
    gy, gx = np.gradient(h)
    nz = np.ones_like(h)
    nrm = np.sqrt(gx ** 2 + gy ** 2 + nz ** 2)
    nx, ny = -gx / nrm, -gy / nrm
    N = np.stack([0.5 + 0.5 * nx, 0.5 + 0.5 * ny, np.clip(h / HP, 0, 1), alpha], -1)
    band = 1 - np.clip((d_out - 1.9) / 1.0, 0, 1)       # thin gold hairline on the outer edge (~2.4px)
    inner = 1 - np.clip((d_in - 1.7) / 0.9, 0, 1)      # thin gold line on the window/hole edge
    rng = np.random.default_rng(seed)
    if grain == 'brushed':
        g = nd.uniform_filter1d(rng.standard_normal((H, W)), 71, axis=1) * 6.0
        g += nd.uniform_filter1d(rng.standard_normal((H, W)), 7, axis=1) * 0.8
        g = g * 0.12
    else:
        g = nd.gaussian_filter(rng.standard_normal((H, W)), 0.55) * 0.35
    M = np.stack([etch if etch is not None else np.zeros((H, W)), band, inner, np.ones((H, W))], -1)  # B = inner hairline
    return N, M


def save(arr, path):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype('uint8'), 'RGBA').save(path)


if __name__ == '__main__':
    frp, shp, out = sys.argv[1:4]
    fr = np.asarray(Image.open(frp).convert('RGBA')).astype(float) / 255
    sh = np.asarray(Image.open(shp).convert('RGBA')).astype(float) / 255
    rails = [(190, 222, 0, 185), (592, 625, 0, 185), (215, 600, 165, 185)]
    lines = [('v', 15.5, 45, 1040), ('v', 78.5, 128, 930), ('v', 762.5, 175, 930), ('v', 798.5, 170, 1040),
             ('h', 1066.5, 45, 770), ('h', 953.5, 100, 742), ('h', 108.5, 100, 178), ('h', 108.5, 636, 712),
             ('h', 26.5, 92, 196), ('h', 26.5, 618, 712)]
    hf = hi_mask(fr[..., 3], 2.2, rails, lines)
    etch = marks_mask(fr)
    # Legend: lift the little square 24px so it sits on the same centre line as the inscription
    sq = etch[1012:1056, 26:70].copy(); etch[1012:1056, 26:70] = 0
    etch[1012 - 24:1056 - 24, 26:70] = np.maximum(etch[1012 - 24:1056 - 24, 26:70], sq)
    N, M = maps(hf, Ro=9.0, etch=etch, grain='iso')
    save(N, f'{out}/frame_N.png'); save(M, f'{out}/frame_M.png')
    hs = hi_mask(sh[..., 3], 1.6)
    N, M = maps(hs, Ro=6.0, etch=None, grain='brushed', seed=5)
    save(N, f'{out}/shutter_N.png'); save(M, f'{out}/shutter_M.png')
    print('ok')
