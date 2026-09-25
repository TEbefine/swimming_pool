def soften(px):
    """Round 3x3 loop heads: remove ONE corner per ring - the outer corner farthest from where the loop joins the stroke."""
    px = set(px); out = set(px)
    if not px: return out
    xs = [x for x, _ in px]; ys = [y for _, y in px]
    for cx in range(min(xs) + 1, max(xs)):
        for cy in range(min(ys) + 1, max(ys)):
            if (cx, cy) in px: continue
            ring = {(cx + dx, cy + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx, dy) != (0, 0)}
            if not ring <= px: continue
            conn = set()
            for r in ring:
                for a in (-1, 0, 1):
                    for b in (-1, 0, 1):
                        q = (r[0] + a, r[1] + b)
                        if q in px and q not in ring and q != (cx, cy):
                            conn.add(q)
            best, bd = None, -1
            for dx in (-1, 1):
                for dy in (-1, 1):
                    c = (cx + dx, cy + dy)
                    nb = {(c[0] + a, c[1] + b) for a in (-1, 0, 1) for b in (-1, 0, 1)}
                    if (nb - ring - {(cx, cy)}) & px:
                        continue
                    d = min((abs(c[0] - q[0]) + abs(c[1] - q[1]) for q in conn), default=9)
                    edge = (c[0] in (min(xs), max(xs))) + (c[1] in (min(ys), max(ys)))
                    d += 10 * edge
                    if d > bd:
                        best, bd = c, d
            if best: out.discard(best)
    return out
