// Quiet Temple — the Spirit's sanctuary above Lumen Bay (painted postcard scene, POOL size, 1× characters).
// Background: /maps/temple.webp (1024×576, sky TRANSPARENT above the horizon y≈166 so the code sky,
// stars and day/night show through). Source painting: ChatGPT, 2026-09-28.
//
// The two big foreground columns are cut from the SAME painting and sit exactly on their painted copy
// (bottom-centre anchor), so you can walk BEHIND them. Don't move them unless the background changes.

import type { ElementDef, Rect } from '../types';

export const TEMPLE_ACTOR_SCALE = 1;

const E = (name: string) => `/sprites/elements/temple/${name}.webp`;

export const templeElements: ElementDef[] = [
  { id: 'column_l', asset: E('column_l'), x: 339, y: 412, layer: 'object', collider: { w: 116, h: 40 } },
  { id: 'column_r', asset: E('column_r'), x: 688, y: 412, layer: 'object', collider: { w: 116, h: 40 } },
];

/** Painted things you bump into but never walk behind. */
export const templeObstacles: Rect[] = [
  { x: 0, y: 262, width: 106, height: 58 },     // left olive tree + planter
  { x: 918, y: 262, width: 106, height: 58 },   // right olive tree + planter
];

/** The dark doorway (temple centre). The Spirit stands just in front of it. */
export const TEMPLE_DOOR = { x: 490, y: 127, w: 44, h: 105 } as const;

/** Front steps: walking down them leads back to Lakeside Square. */
export const TEMPLE_STEPS_EXIT: [number, number, number, number] = [200, 562, 624, 14];
