"""Hand-built 20x32 pixel mannequin: movement template (4-frame walks) for the base body."""
from PIL import Image

W, H = 20, 32
C = {
    'ol': (35, 26, 36), 'skin': (243, 194, 155), 'skin_s': (213, 142, 107),
    'hair': (43, 35, 48), 'hair_h': (84, 72, 96), 'tank': (205, 208, 215), 'tank_s': (160, 164, 176),
    'shorts': (80, 84, 98), 'shorts_s': (56, 58, 70), 'eye': (35, 26, 36), 'mouth': (190, 90, 90),
    'blush': (240, 150, 140),
}

class F:
    def __init__(s):
        s.px = {}      # (x,y) -> (layer_name, color)
        s.reg = {}     # region name -> set
    def put(s, name, x, y, col):
        if 0 <= x < W and 0 <= y < H:
            s.px[(x, y)] = col; s.reg.setdefault(name, set()).add((x, y))
    def rect(s, name, x0, y0, x1, y1, col):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                s.put(name, x, y, col)
    def shade(s, name, shadow):
        r = s.reg.get(name, set())
        for (x, y) in r:
            if (x + 1, y) not in r or (x, y + 1) not in r:
                s.px[(x, y)] = shadow
    def img(s):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); p = im.load()
        filled = set(s.px)
        for (x, y) in filled:
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                q = (x+dx, y+dy)
                if q not in filled and 0 <= q[0] < W and 0 <= q[1] < H:
                    p[q] = C['ol'] + (255,)
        for (x, y), col in s.px.items():
            p[x, y] = col + (255,)
        return im

def leg(f, name, xh, yh, xf, yf, col, w=3):
    for y in range(yh, yf + 1):
        t = (y - yh) / max(1, yf - yh)
        cx = round(xh + (xf - xh) * t)
        for x in range(cx - 1, cx - 1 + w):
            f.put(name, x, y, col)

HEAD_ROWS = {0: (6, 13), 1: (5, 14), 9: (5, 14), 10: (6, 13)}  # row offset from top (y=2) -> x range; others 4..15

def head(f, b, x_shift=0, hair_back=False):
    for i in range(11):
        x0, x1 = HEAD_ROWS.get(i, (4, 15))
        f.rect('head', x0 + x_shift, 2 + i + b, x1 + x_shift, 2 + i + b, C['skin'])
    f.shade('head', C['skin_s'])

# ---------------- FRONT / BACK ----------------
def front(dy=0, lift_l=0, lift_r=0, arm_l=0, arm_r=0, back=False, blink=False):
    f = F(); b = dy  # b: body offset (negative = up)
    # legs first (drawn from hips to feet); feet at y=30 unless lifted
    for name, xs, lift in (('legL', (6, 8), lift_l), ('legR', (11, 13), lift_r)):
        bottom = 28 - lift
        f.rect(name, xs[0], 23 + b, xs[1], bottom, C['skin'])
        foot_x = (xs[0] - 1, xs[1]) if name == 'legL' else (xs[0], xs[1] + 1)
        f.rect(name + 'f', foot_x[0], bottom + 1, foot_x[1], bottom + 2, C['skin'])
        f.shade(name, C['skin_s']); f.shade(name + 'f', C['skin_s'])
    f.rect('shorts', 6, 20 + b, 13, 22 + b, C['shorts']); f.shade('shorts', C['shorts_s'])
    f.rect('torso', 6, 14 + b, 13, 19 + b, C['tank']); f.shade('torso', C['tank_s'])
    if not back:
        for x in (6, 13):
            f.put('torso', x, 14 + b, C['skin'])
    # arms: arm_* > 0 swings forward (hand lower), < 0 back (hand higher)
    for name, xs, sw in (('armL', (3, 4), arm_l), ('armR', (15, 16), arm_r)):
        end = 19 + b + sw
        f.rect(name, xs[0], 14 + b, xs[1], end, C['skin'])
        f.rect(name + 'h', xs[0], end + 1, xs[1], end + 2, C['skin_s'])
        f.shade(name, C['skin_s'])
    f.rect('neck', 8, 13 + b, 11, 13 + b, C['skin_s'])
    head(f, b)
    if back:
        for i in range(11):
            x0, x1 = HEAD_ROWS.get(i, (4, 15))
            f.rect('hair', x0, 2 + i + b, x1, 2 + i + b, C['hair'])
        f.shade('hair', (30, 24, 34))
        f.rect('neckb', 8, 12 + b, 11, 12 + b, C['skin_s'])
    else:
        # hair: full top, spiky fringe, sideburns
        for i in range(4):
            x0, x1 = HEAD_ROWS.get(i, (4, 15))
            f.rect('hair', x0, 2 + i + b, x1, 2 + i + b, C['hair'])
        for x in (4, 5, 7, 8, 10, 12, 13, 14, 15):
            f.put('hair', x, 6 + b, C['hair'])
        for x in (4, 5, 14, 15):
            f.put('hair', x, 7 + b, C['hair'])
        for x in (4, 15):
            f.put('hair', x, 8 + b, C['hair'])
        if blink:
            f.put('eye', 7, 9 + b, C['eye']); f.put('eye', 12, 9 + b, C['eye'])
        else:
            for x in (7, 12):
                f.put('eye', x, 8 + b, C['eye']); f.put('eye', x, 9 + b, C['eye'])
        f.put('blush', 6, 10 + b, C['blush']); f.put('blush', 13, 10 + b, C['blush'])
        f.put('m', 9, 11 + b, C['mouth']); f.put('m', 10, 11 + b, C['mouth'])
    for (x, y) in ((6, 3), (7, 3), (8, 3), (6, 4)):
        f.put('hl', x, y + b, C['hair_h'])
    return f.img()

# ---------------- SIDE (facing right) ----------------
def side(dy=0, near=(9, 9), far=None, arm=0):
    """near/far = (hip_x, foot_x) of each leg; arm: +forward / -back swing (hand x offset)."""
    f = F(); b = dy
    def side_leg(name, hip, foot, near_leg):
        for y in range(23 + b, 30):
            t = (y - (23 + b)) / max(1, 29 - (23 + b))
            cx = round(hip + (foot - hip) * t)
            if near_leg:
                f.put(name + 'ol', cx - 1, y, C['ol'])
                f.put(name, cx, y, C['skin']); f.put(name, cx + 1, y, C['skin_s'])
            else:
                f.put(name, cx, y, C['skin_s']); f.put(name, cx + 1, y, C['skin_s'])
        f.rect(name + 'f', foot, 30, foot + 2, 30, C['skin'] if near_leg else C['skin_s'])
    if far:
        side_leg('legF', far[0], far[1], False)
    side_leg('legN', near[0], near[1], True)
    f.rect('shorts', 7, 20 + b, 12, 22 + b, C['shorts']); f.shade('shorts', C['shorts_s'])
    f.rect('torso', 7, 14 + b, 13, 19 + b, C['tank']); f.shade('torso', C['tank_s'])
    f.rect('neck', 9, 13 + b, 11, 13 + b, C['skin_s'])
    head(f, b, x_shift=0)
    for i in range(5):
        x0, x1 = HEAD_ROWS.get(i, (4, 15))
        f.rect('hair', x0, 2 + i + b, x1, 2 + i + b, C['hair'])
    f.rect('hair', 4, 7 + b, 9, 10 + b, C['hair'])
    for x in (4, 5, 6, 7, 8, 9, 11, 13):
        f.put('hair', x, 6 + b, C['hair'])
    for (x, y) in ((6, 3), (7, 3), (8, 3), (6, 4)):
        f.put('hl', x, y + b, C['hair_h'])
    f.put('ear', 10, 9 + b, C['skin_s'])
    f.put('eye', 13, 8 + b, C['eye']); f.put('eye', 13, 9 + b, C['eye'])
    f.put('blush', 13, 10 + b, C['blush']); f.put('m', 14, 11 + b, C['mouth'])
    # near arm: shoulder at (10,14); swings forward (+) / back (-) from the shoulder
    for i, y in enumerate(range(14 + b, 21 + b)):
        x = 10 + round(arm * i / 6)
        f.put('armol', x - 1, y, C['ol'])
        f.put('arm', x, y, C['skin']); f.put('arm', x + 1, y, C['skin_s'])
    hx = 10 + arm
    f.rect('hand', hx, 21 + b, hx + 1, 21 + b, C['skin_s'])
    return f.img()

frames = {
    # row 1: walk down (front), 4 frames: contact L, passing, contact R, passing
    'walk_down1': front(0, lift_r=2, arm_l=-1, arm_r=1),
    'walk_down_pass1': front(-1),
    'walk_down2': front(0, lift_l=2, arm_l=1, arm_r=-1),
    'walk_down_pass2': front(-1),
    # row 2: walk up (back)
    'walk_up1': front(0, lift_r=2, arm_l=1, arm_r=-1, back=True),
    'walk_up_pass1': front(-1, back=True),
    'walk_up2': front(0, lift_l=2, arm_l=-1, arm_r=1, back=True),
    'walk_up_pass2': front(-1, back=True),
    # row 3: walk side (facing right)
    'walk1': side(0, near=(11, 14), far=(8, 5), arm=-2),
    'side_pass1': side(-1, near=(10, 10), far=(9, 9), arm=0),
    'walk2': side(0, near=(9, 6), far=(10, 13), arm=2),
    'side_pass2': side(-1, near=(10, 10), far=(9, 9), arm=0),
    # row 4: idles
    'idle': front(0),
    'idle_breathe': front(1),
    'back_idle': front(0, back=True),
    'side_idle': side(0, near=(10, 10), far=(9, 9)),
}
if __name__ == '__main__':
    import sys
    S = 8
    names = list(frames)
    sheet = Image.new('RGBA', (4 * W * S, 4 * H * S), (0, 0, 0, 0))
    guide = Image.new('RGBA', sheet.size, (236, 232, 222, 255))
    for i, n in enumerate(names):
        im = frames[n].resize((W * S, H * S), Image.NEAREST)
        pos = ((i % 4) * W * S, (i // 4) * H * S)
        sheet.alpha_composite(im, pos); guide.alpha_composite(im, pos)
    sheet.save('movement_template.png'); guide.save('movement_template_preview.png')
    # animated previews
    def gif(seq, name, ms=140):
        fr = []
        for n in seq:
            bg = Image.new('RGBA', (W * S, H * S), (236, 232, 222, 255))
            bg.alpha_composite(frames[n].resize((W * S, H * S), Image.NEAREST)); fr.append(bg.convert('RGB'))
        fr[0].save(name, save_all=True, append_images=fr[1:], duration=ms, loop=0)
    strip = []
    for row in (names[0:4], names[4:8], names[8:12], ['idle', 'idle', 'idle_breathe', 'idle_breathe']):
        strip.append(row)
    # combined gif: 3 walks + idle side by side
    fr = []
    for k in range(8):
        canvas = Image.new('RGB', (4 * W * S, H * S), (236, 232, 222))
        for j, row in enumerate(strip):
            n = row[k % 4] if j < 3 else row[(k // 1) % 4]
            canvas.paste(Image.alpha_composite(Image.new('RGBA', (W * S, H * S), (236, 232, 222, 255)),
                         frames[n].resize((W * S, H * S), Image.NEAREST)).convert('RGB'), (j * W * S, 0))
        fr.append(canvas)
    fr[0].save('movement_preview.gif', save_all=True, append_images=fr[1:], duration=150, loop=0)
    print('ok', len(names))
