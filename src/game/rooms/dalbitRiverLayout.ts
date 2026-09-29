// Dalbit · River mouth (story world #1, Prologue Day 1 — Yunseul goes fishing). Painted postcard, POOL size (1×).
// Background: /maps/dalbit/river.webp (1024×576, sky TRANSPARENT above the sea horizon y≈134).
// Source painting: ChatGPT 2026-09-30, flat-water version (src/assets/dalbit_river_src.webp) so the code
// can add glints/ripples on top. The painted-ripples version is kept as src/assets/dalbit_river_src_b.webp.
// The wooden pier runs diagonally into the water: its walkable deck is a "staircase" of thin rects that
// follow the two deck edges (left edge (210,340)→(360,212), deck ≈120 px wide).

import type { Rect } from '../types';

export const DALBIT_RIVER_ACTOR_SCALE = 1;

/** Sand beach in front of the water. */
export const dalbitRiverBeach: Rect[] = [
  { x: 0, y: 348, width: 560, height: 210 },     // left + middle of the beach (water line ≈ y 345)
  { x: 560, y: 362, width: 340, height: 196 },   // right of the beach (water line dips to ≈ y 360; rocks past x 900)
];

/** The pier deck, 16-px bands from the far end (top) down to the sand. */
export const dalbitRiverPier: Rect[] = [
  { x: 360, y: 212, width: 103, height: 16 },    // far end — the fishing spot
  { x: 341, y: 228, width: 103, height: 16 },
  { x: 322, y: 244, width: 104, height: 16 },
  { x: 304, y: 260, width: 103, height: 16 },
  { x: 285, y: 276, width: 103, height: 16 },
  { x: 266, y: 292, width: 104, height: 16 },
  { x: 248, y: 308, width: 103, height: 16 },
  { x: 229, y: 324, width: 103, height: 28 },    // first planks, overlaps the sand
];

/** Painted things you bump into. */
export const dalbitRiverObstacles: Rect[] = [
  { x: 214, y: 362, width: 58, height: 14 },     // fish basket
  { x: 274, y: 370, width: 52, height: 12 },     // coiled rope
  { x: 0, y: 448, width: 70, height: 128 },      // rocks, bottom-left
  { x: 70, y: 488, width: 140, height: 88 },     // bushes, bottom-left
  { x: 755, y: 538, width: 50, height: 30 },     // rock, bottom-right
  { x: 820, y: 500, width: 204, height: 76 },    // bushes + rocks, bottom-right
];

/** Spots the story (and the fishing system later) will hook into. */
export const DALBIT_RIVER_SPOTS = {
  pierEnd: { x: 412, y: 220 },    // stand here to fish (float lands in the water above/right of it)
  basket: { x: 243, y: 386 },     // the catch goes in here
  path: { x: 20, y: 408 },        // path back to the yard (left edge)
} as const;

/** Walk off the left edge of the beach → back home. */
export const DALBIT_RIVER_EXIT: [number, number, number, number] = [0, 375, 10, 65];
