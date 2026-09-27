// Lumen Bay — Lakeside Square (painted postcard scene). POOL size: characters at 1× (land sprites).
// Background: /maps/town_lakeside.webp (1024×576, sky is TRANSPARENT so the code sky, clouds,
// birds, stars and day/night show through). Everything else is painted into that one picture.
//
// Depth pieces below are cut from the SAME painting and sit exactly on top of their painted copy,
// so you can walk behind them. Each is placed by its BOTTOM-CENTRE — don't move them unless the
// background changes, or they will look doubled.

import type { ElementDef, Rect } from '../types';

export const TOWN_ACTOR_SCALE = 1;

const E = (name: string) => `/sprites/elements/lakeside/${name}.webp`;

export const townElements: ElementDef[] = [
  { id: 'fountain', asset: E('fountain'), x: 432, y: 360, layer: 'object', collider: { w: 158, h: 40 } },
  { id: 'bench', asset: E('bench'), x: 626, y: 342, layer: 'object', collider: { w: 104, h: 8 }, seat: { dx: 0, dy: -20, facing: 1 } },
  { id: 'lamp_l', asset: E('lamp_l'), x: 261, y: 342, layer: 'object', collider: { w: 56, h: 20 } },
  { id: 'lamp_r', asset: E('lamp_r'), x: 773, y: 342, layer: 'object', collider: { w: 56, h: 20 } },
];

/** Painted things you bump into but never walk behind (flower beds with trees, café terrace, pots). */
export const townObstacles: Rect[] = [
  { x: 0, y: 262, width: 152, height: 82 },     // left flower bed + green tree
  { x: 904, y: 262, width: 120, height: 80 },   // right flower bed + blossom tree
  { x: 306, y: 262, width: 94, height: 18 },    // café terrace table + chairs
  { x: 460, y: 262, width: 34, height: 16 },    // café door plant pot
  { x: 496, y: 262, width: 36, height: 12 },    // tall plant between the shops
  { x: 638, y: 262, width: 60, height: 16 },    // bookshop flower box
  { x: 706, y: 262, width: 30, height: 16 },    // bookshop little tree pot
];

/** Café door (the green door) — walk into it to go inside. */
export const TOWN_CAFE_DOOR: [number, number, number, number] = [414, 262, 42, 10];
