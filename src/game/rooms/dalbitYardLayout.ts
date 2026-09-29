// Dalbit · Kang family home — the yard (story world #1, Prologue "Yunseul"). Painted postcard, POOL size (1×).
// Background: /maps/dalbit/yard.webp (1024×576, sky TRANSPARENT above the sea horizon y≈155).
// Source painting: ChatGPT 2026-09-29 (src/assets/dalbit_yard_src.webp).
// Used for Prologue scenes 1, 4, 7, 8 (morning / dusk / evening / night) and the first battle background.
// Nothing here needs walk-behind pieces: the jars, rack and fence all sit against the back or side walls.

import type { Rect } from '../types';

export const DALBIT_YARD_ACTOR_SCALE = 1;

/** Painted things you bump into. */
export const dalbitYardObstacles: Rect[] = [
  { x: 0, y: 276, width: 238, height: 36 },     // jar terrace (onggi jars; the big front one is the rice jar)
  { x: 284, y: 262, width: 444, height: 30 },   // house porch (maru) + foundation stones
  { x: 780, y: 262, width: 244, height: 40 },   // fish-drying rack, water bucket, nets on the wall
  { x: 934, y: 300, width: 90, height: 168 },   // wooden side fence (right)
  { x: 0, y: 474, width: 120, height: 60 },     // bush on the front wall (left)
  { x: 932, y: 490, width: 92, height: 40 },    // bush on the front wall (right)
];

/** Spots the story will hook into later (examine / talk / sit). */
export const DALBIT_YARD_SPOTS = {
  riceJar: { x: 70, y: 316 },      // stand here to look into the rice jar
  porch: { x: 470, y: 296 },       // sit on the porch / Father mending nets
  door: { x: 430, y: 294 },        // paper doors → home room (later)
  dryingRack: { x: 850, y: 306 },  // hang / take dried fish
  gate: { x: 1000, y: 494 },       // gap below the fence → village path (later)
} as const;
