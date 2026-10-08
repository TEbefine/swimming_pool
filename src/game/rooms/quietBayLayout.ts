// Quiet Bay (Free Fishing) — a calm Japanese harbour inspired by Ine Bay, Kyoto. Painted postcard, POOL size (1×).
// Background: /maps/quiet_bay.webp (1024×576, sky TRANSPARENT above the hills, y ≤ ~132).
// Source painting: ChatGPT 2026-10-08 (src/assets/quiet_bay_src.webp); keyed with scripts/process_quiet_bay.py.
// Docs: world/quiet-bay-scene.md, world/quiet-bay-ambient.md, characters/bay-fishing-outfit.md.
//
// One long straight concrete breakwater across the lower half (no perspective → one actorScale works).
// Players fish from its FRONT edge, facing the camera; the float lands in the water strip at the bottom.

import type { Rect } from '../types';

/** The breakwater top (feet y 348–404), the round end under the lighthouse, the little shore at the left. */
export const quietBayWalk: Rect[] = [
  { x: 90, y: 348, width: 760, height: 57 },   // main walkway
  { x: 80, y: 376, width: 12, height: 29 },    // corner by the stone shore
  { x: 850, y: 352, width: 86, height: 50 },   // round end (lighthouse platform)
  { x: 936, y: 360, width: 20, height: 34 },
];

/** Painted things you bump into (their bottoms are the depth line, so nobody stands behind them). */
export const quietBayObstacles: Rect[] = [
  { x: 214, y: 346, width: 44, height: 21 },   // vending machine
  { x: 262, y: 346, width: 64, height: 21 },   // bench
  { x: 814, y: 346, width: 92, height: 10 },   // lighthouse base
];

/** Bollard caps along the back edge (a gull may stand on one). */
export const QUIET_BAY_BOLLARDS: [number, number][] = [[148, 324], [352, 324], [491, 324], [624, 324], [760, 324]];

/** Fishing: stand on the front edge anywhere along it; the float lands in front, in the bottom water
 *  (y ≤ 526 so the desktop chat bar never covers it). */
export const QUIET_BAY_FISHING = {
  standY: 401,
  minX: 100,
  maxX: 900,
  water: { dx0: 40, dx1: 64, y0: 474, y1: 526, maxX: 1005 },
};
