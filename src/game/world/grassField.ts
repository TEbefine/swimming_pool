// Tall grass as an ELEMENT (Teera, 2026-11-02): little tufts planted on the map that sway in the wind
// and bend away when someone walks through them. Placement is seeded by the room id, so every player
// sees exactly the same grass. Art: scripts/process_woods.py → /sprites/elements/woods/grass_*.webp
//
// Depth trick (so only the LEGS hide in the grass, not the whole chibi body):
//   a player standing in grass is sorted COVER.skip px lower than their feet, so the tufts just in front
//   of them draw BEHIND them; then a small "feet cover" (two short tufts) is drawn over the legs.
// Design: docs/world/woods-grass-element.md (project doc) · AI_CONTEXT.md WOODS-01.

import type { Rect } from '../types';

export interface GrassZoneDef {
  /** Stable id: each zone can later have its own animal table. */
  id: string;
  /** Feet inside this rectangle = in the grass. Tufts are planted on its whole area. */
  rect: Rect;
}

export interface GrassWalker { id: string; x: number; y: number }

type Img = CanvasImageSource & { width: number; height: number };

const DIR = '/sprites/elements/woods/';
const KINDS = ['a', 'b', 'c'] as const;
const STATES = ['calm', 'left', 'right', 'parted'] as const;
type State = typeof STATES[number];

export const grassAsset = (kind: number, state: State) => `${DIR}grass_${KINDS[kind]}_${state}.webp`;
export const grassFxAsset = (frame: number) => `${DIR}grass_fx_${frame}.webp`;

/** Every image the grass needs (loaded with the room's elements). */
export const GRASS_ASSETS: string[] = [
  ...KINDS.flatMap((_, k) => STATES.map((s) => grassAsset(k, s))),
  ...[1, 2, 3, 4].map(grassFxAsset),
];

export const GRASS = {
  /** Planting grid: px between tufts in a row (random within), px between rows. */
  spacingX: [15, 20] as [number, number],
  rowGap: 8,
  /** Share of tufts that are the flower kind (c). It looks busy when common. */
  flowerShare: 1 / 12,
  /** Soft edges: rounded corners (px) and how ragged the row ends are (px). */
  cornerRadius: 26,
  raggedEnds: 10,
  /** Someone's feet within this box of a tuft (dx, dy from the tuft base) bends it. */
  touch: { dx: 14, dyUp: 6, dyDown: 10 },
  /** Bend timeline (ms): lean away → pressed apart → spring back the other way → calm. */
  bend: { lean: 110, parted: 320, back: 460 },
  /** Leaf bits: one puff every this many px walked inside grass; frame length (ms). */
  fxEveryPx: 22,
  fxFrameMs: 80,
};

/** How the grass covers a player standing in it. */
export const COVER = {
  /** The player sorts this much lower than their feet while in grass. */
  skip: 40,
};

interface Tuft { x: number; y: number; kind: number; flip: boolean; touched: number; away: -1 | 1 }
interface Row { y: number; minX: number; maxX: number; tufts: Tuft[] }
interface Fx { x: number; y: number; t0: number; flip: boolean }

/** Small seeded random (mulberry32): same seed → same grass on every device. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function insideRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

export class GrassField {
  readonly zones: GrassZoneDef[];
  readonly rows: Row[] = [];
  readonly tufts: Tuft[] = [];
  private fx: Fx[] = [];
  private last = new Map<string, { x: number; y: number; acc: number }>();

  constructor(zones: GrassZoneDef[], seed: number) {
    this.zones = zones;
    const rand = seededRandom(seed);
    for (const zone of zones) {
      const { x, y, width, height } = zone.rect;
      let row = 0;
      // tuft bases fill the zone from its top edge (+4) down to its bottom edge
      for (let ty = y + 4; ty <= y + height; ty += GRASS.rowGap, row++) {
        const r: Row = { y: ty, minX: Infinity, maxX: -Infinity, tufts: [] };
        // ragged row ends + rounded corners, so a patch looks grown, not like a hedge
        const rowStart = x + rand() * GRASS.raggedEnds;
        const rowEnd = x + width - rand() * GRASS.raggedEnds;
        let tx = rowStart + (row % 2 ? GRASS.spacingX[0] / 2 : 0);
        while (tx <= rowEnd) {
          if (!insideRounded(zone.rect, tx, ty, GRASS.cornerRadius)) {
            tx += GRASS.spacingX[0];
            continue;
          }
          const kind = rand() < GRASS.flowerShare ? 2 : rand() < 0.62 ? 0 : 1;
          const tuft: Tuft = { x: Math.round(tx + (rand() * 4 - 2)), y: ty, kind, flip: rand() < 0.5, touched: -1e9, away: 1 };
          r.tufts.push(tuft);
          this.tufts.push(tuft);
          r.minX = Math.min(r.minX, tuft.x);
          r.maxX = Math.max(r.maxX, tuft.x);
          tx += GRASS.spacingX[0] + rand() * (GRASS.spacingX[1] - GRASS.spacingX[0]);
        }
        if (r.tufts.length) this.rows.push(r);
      }
    }
    this.rows.sort((a, b) => a.y - b.y);
  }

  /** The zone the feet are in, or null. */
  zoneAt(x: number, y: number): GrassZoneDef | null {
    for (const z of this.zones) if (insideRect(z.rect, x, y)) return z;
    return null;
  }

  /** Bend the tufts around everyone who is walking through the grass; spawn leaf bits. */
  update(now: number, walkers: GrassWalker[]): void {
    const seen = new Set<string>();
    for (const w of walkers) {
      seen.add(w.id);
      const prev = this.last.get(w.id);
      const moved = prev ? Math.hypot(w.x - prev.x, w.y - prev.y) : 0;
      const state = prev ?? { x: w.x, y: w.y, acc: 0 };
      state.x = w.x; state.y = w.y;
      this.last.set(w.id, state);
      // a big jump = a teleport / room change, not walking
      if (moved < 0.5 || moved > 60 || !this.zoneAt(w.x, w.y)) continue;
      const { dx, dyUp, dyDown } = GRASS.touch;
      for (const row of this.rows) {
        if (row.y < w.y - dyUp || row.y > w.y + dyDown) continue;
        for (const t of row.tufts) {
          if (Math.abs(t.x - w.x) > dx) continue;
          if (now - t.touched > GRASS.bend.lean) t.away = t.x < w.x ? -1 : 1;
          t.touched = now;
        }
      }
      state.acc += moved;
      if (state.acc >= GRASS.fxEveryPx) {
        state.acc = 0;
        this.fx.push({ x: w.x, y: w.y, t0: now, flip: (Math.floor(now / 7) & 1) === 1 });
      }
    }
    for (const id of this.last.keys()) if (!seen.has(id)) this.last.delete(id);
    const life = GRASS.fxFrameMs * 4;
    if (this.fx.length) this.fx = this.fx.filter((f) => now - f.t0 < life);
  }

  /** Which drawing a tuft shows right now (world direction; flipping is handled when drawing). */
  stateOf(t: Tuft, now: number): State {
    const age = now - t.touched;
    const { lean, parted, back } = GRASS.bend;
    if (age < lean) return t.away < 0 ? 'left' : 'right';
    if (age < parted) return 'parted';
    if (age < back) return t.away < 0 ? 'right' : 'left';
    // wind: a slow gust travelling across the field, tipping a band of tufts to the right
    const w = Math.sin(now * 0.0016 - t.x * 0.045 + t.y * 0.03);
    return w > 0.94 ? 'right' : 'calm';
  }

  /** Push one depth-sorted draw item per visible row (plus leaf bits) into the engine's list. */
  collect(
    view: { x: number; w: number },
    now: number,
    push: (y: number, draw: () => void) => void,
    ctx: CanvasRenderingContext2D,
    image: (key: string) => Img | undefined,
  ): void {
    const left = view.x - 24;
    const right = view.x + view.w + 24;
    for (const row of this.rows) {
      if (row.maxX < left || row.minX > right) continue;
      push(row.y, () => {
        for (const t of row.tufts) {
          if (t.x < left || t.x > right) continue;
          let s = this.stateOf(t, now);
          // a flipped drawing leans the other way, so swap to keep the world direction right
          if (t.flip && (s === 'left' || s === 'right')) s = s === 'left' ? 'right' : 'left';
          const img = image(grassAsset(t.kind, s));
          if (img) drawAt(ctx, img, t.x, t.y, t.flip);
        }
      });
    }
    for (const f of this.fx) {
      if (f.x < left || f.x > right) continue;
      const frame = Math.min(4, 1 + Math.floor((now - f.t0) / GRASS.fxFrameMs));
      const img = image(grassFxAsset(frame));
      if (img) push(f.y + COVER.skip + 0.02, () => drawAt(ctx, img, f.x, f.y - 6, f.flip));
    }
  }

  /** Two short tufts over a standing player's legs (drawn right after the player). */
  drawFeetCover(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, moving: boolean, image: (key: string) => Img | undefined): void {
    const s: State = moving ? 'parted' : 'calm';
    const a = image(grassAsset(1, s));
    const b = image(grassAsset(0, moving ? 'parted' : (Math.floor(now / 900) % 5 === 0 ? 'right' : 'calm')));
    if (b) drawAt(ctx, b, x + 9, y + 5, true);
    if (a) drawAt(ctx, a, x - 8, y + 4, false);
  }
}

/** Inside the rectangle with rounded corners of radius `r`. */
function insideRounded(rect: Rect, x: number, y: number, r: number): boolean {
  const cx = Math.max(rect.x + r, Math.min(rect.x + rect.width - r, x));
  const cy = Math.max(rect.y + r, Math.min(rect.y + rect.height - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function drawAt(ctx: CanvasRenderingContext2D, img: Img, x: number, baseY: number, flip: boolean): void {
  const dx = Math.round(x - img.width / 2);
  const dy = Math.round(baseY - img.height);
  if (!flip) {
    ctx.drawImage(img, dx, dy);
    return;
  }
  // mirror without save/restore (cheaper for hundreds of tufts): flip, draw at the mirrored x, flip back
  ctx.scale(-1, 1);
  ctx.drawImage(img, -(dx + img.width), dy);
  ctx.scale(-1, 1);
}
