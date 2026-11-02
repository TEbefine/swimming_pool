// Whisker Woods — the forest clearing just outside town where wild animals hide in the tall grass
// (painted postcard scene, POOL size, 1× characters). Teera, 2026-11-02.
// Background: /maps/woods_1.webp (1024×576, sky TRANSPARENT above the tree line so the code sky and
// day/night show through). Source: src/assets/woods_1_src.png → scripts/process_woods.py.
// The tall grass is NOT painted: it is planted in code on WOODS_GRASS (world/grassField.ts).

import type { Rect } from '../types';
import type { GrassZoneDef } from '../world/grassField';

export const WOODS_ACTOR_SCALE = 1;

/** Tall-grass zones (feet inside = in the grass; random animal encounters). Each zone can later get
 *  its own animals. The sandy path (y 378–425) stays clear: walking on the path is always safe. */
export const WOODS_GRASS: GrassZoneDef[] = [
  { id: 'north_west', rect: { x: 245, y: 300, width: 200, height: 64 } },
  { id: 'north_east', rect: { x: 570, y: 300, width: 226, height: 64 } },
  { id: 'south', rect: { x: 367, y: 456, width: 280, height: 80 } },
];

/** Painted things you bump into. The lamp column is blocked so nobody stands "behind" the lamp. */
export const woodsObstacles: Rect[] = [
  { x: 0, y: 290, width: 66, height: 82 },      // white fence (and the corner behind it)
  { x: 66, y: 290, width: 32, height: 82 },     // street lamp + the strip behind it
  { x: 174, y: 294, width: 36, height: 16 },    // grey rock (top left)
  { x: 828, y: 300, width: 46, height: 20 },    // tree stump
  { x: 902, y: 492, width: 46, height: 20 },    // grey rock (bottom right)
];

/** Walk off the LEFT end of the path → back to Lakeside Square. */
export const WOODS_TOWN_EXIT: [number, number, number, number] = [0, 374, 8, 56];
