// Arrival Hall — the first room in Lumen Bay (no Player ID yet / lost memory → you arrive here).
// One painted scene at CAFÉ size (2× characters). Background: /maps/arrival_hall.webp (1024×576),
// made by scripts/process_arrival_hall.py from src/assets/arrival_hall_src.webp: the window skies are
// TRANSPARENT (code sky, day → sunset → night, stars), the clock hands are erased (code draws real
// Bangkok time, world/ambient.ts) and the counter is cut out as a walk-behind piece.
//
// Walk left → right: the arch where you arrive (left) → the counter (centre) → the glass doors to
// Lakeside Square (right). The two staff stand BEHIND the counter; the counter piece is drawn over
// their legs (its y is larger, so it's drawn later). Docs: claude.ai Project world + characters/arrival-staff-*.md

import type { ElementDef, NpcWander, Rect } from '../types';

/** Characters here use the 2× (café-size) frame sets. */
export const ARRIVAL_ACTOR_SCALE = 2;

const E = (name: string) => `/sprites/elements/arrival/${name}.webp`;

/** Counter + help desk + the small things on top (bell, stamps, plants, desk lamp), cut from the
 *  painting and placed exactly on top of their painted copy (bottom-centre). Don't move it. */
export const arrivalElements: ElementDef[] = [
  { id: 'counter', asset: E('counter'), x: 570, y: 303, layer: 'object' },
];

/** Painted things you bump into (never walk behind). */
export const arrivalObstacles: Rect[] = [
  { x: 306, y: 200, width: 526, height: 106 },  // counter, help desk and the staff strip behind them
  { x: 0, y: 262, width: 58, height: 58 },      // big monstera by the arch
  { x: 110, y: 262, width: 54, height: 14 },    // postcard rack
  { x: 164, y: 262, width: 44, height: 14 },    // water dispenser
  { x: 200, y: 262, width: 124, height: 14 },   // two benches
  { x: 832, y: 262, width: 66, height: 14 },    // lemon tree pot
];

/** Glass doors to Lakeside Square (walk into the doormat). */
export const ARRIVAL_EXIT_DOOR: [number, number, number, number] = [915, 266, 100, 12];

/** Where each staff member works behind the counter (feet y≈262, so head + shoulders show above it;
 *  on the floor line ≈290 only their heads would show). Fah = Arrivals (left stamp), Tawan = Lost & Found (right stamp). */
export const FAH_SPOT = { x: 405, y: 262 };
export const TAWAN_SPOT = { x: 644, y: 262 };

/** A short stroll behind their own desk; between walks they work (write, read, sip...). */
export const FAH_SHIFT: NpcWander = {
  area: { x: 380, y: 262, width: 52, height: 0 },
  speed: 14,
  pauseMs: [7000, 15000],
  idlePoses: ['idle_clasped', 'idle_clasped', 'write', 'read', 'tuck_hair', 'idle', 'sip'],
};
export const TAWAN_SHIFT: NpcWander = {
  area: { x: 618, y: 262, width: 52, height: 0 },
  speed: 14,
  pauseMs: [7000, 15000],
  idlePoses: ['idle_pockets', 'idle_pockets', 'write', 'read', 'sip', 'idle', 'stretch'],
};

/** Nagisa-sama, matriarch of the family that opened the hall: a slow stroll across the front of the hall
 *  (never behind the counter). Long pauses, small dignified idles. She is petite (cut at 1.8×, not 2×). */
export const NAGISA_STROLL: NpcWander = {
  area: { x: 170, y: 372, width: 680, height: 50 },
  speed: 9,
  pauseMs: [9000, 18000],
  idlePoses: ['idle', 'sleeves', 'hand_crest', 'look_up', 'fan_closed', 'remember', 'smooth_sleeve', 'hold_tea', 'sip', 'content'],
};
export const NAGISA_START = { x: 520, y: 392 };

/** Where you stand to talk: in front of the counter, a little to the side, so your head doesn't
 *  hide theirs (you're drawn in front of the counter, they're behind it). */
export const FAH_TALK = { dx: -62, dy: 70, facing: 1 as const };
export const TAWAN_TALK = { dx: 62, dy: 70, facing: -1 as const };
