// LUMEN FM 78.6 — the town's little radio station, also the set of the real podcast / YouTube show.
// Two painted rooms at CAFÉ size (2× characters), made by scripts/process_radio.py:
//   radio         room 1 = control room + guest welcome. Enter / leave on the LEFT. The big monitor
//                 shows the studio "camera feed" (baked in). Hibiki, the sound engineer, works at the
//                 desk with her back to you, facing the monitor (like a real video-podcast control room).
//   radio_studio  room 2 = the recording studio, through the padded door on the right. Three chairs:
//                 Rin (left), Teera (centre), Momo (right). When Rin is away a Lumen Bay guest can sit there.
// Docs: claude.ai Project world/lumen-fm.md · docs/characters/{teera,rin,momo,hibiki}/character.json

import type { NpcWander, Rect } from '../types';

export const RADIO_ACTOR_SCALE = 2;

// ---- room 1: control room ----------------------------------------------------------------------

/** Painted things you bump into (never walk behind). Their bottoms are the depth line. */
export const radioObstacles: Rect[] = [
  { x: 285, y: 236, width: 462, height: 84 },   // broadcast desk (bottom y≈318)
  { x: 132, y: 236, width: 150, height: 62 },   // CD + vinyl shelf
  { x: 0, y: 222, width: 128, height: 108 },    // red sofa (guest waiting area)
  { x: 0, y: 250, width: 52, height: 112 },     // red request post box
  { x: 92, y: 288, width: 80, height: 54 },     // round table
  { x: 944, y: 250, width: 80, height: 66 },    // plant by the studio door
];

/** Walk off the left edge → back out to the town. */
export const RADIO_EXIT_LEFT: [number, number, number, number] = [0, 340, 12, 236];
/** The padded studio door (under the ON AIR light) → the recording studio. */
export const RADIO_STUDIO_DOOR: [number, number, number, number] = [862, 292, 82, 12];

/** The cork board with the program schedule (Read). Stand just below it. */
export const RADIO_BOARD: Rect = { x: 748, y: 298, width: 106, height: 26 };

/** Hibiki at the desk, in FRONT of it, facing the monitor. A small shuffle along the console,
 *  between work idles seen from the back. Talking to her: you stand to her right. */
export const HIBIKI_SPOT = { x: 512, y: 334 };
export const HIBIKI_SHIFT: NpcWander = {
  area: { x: 440, y: 332, width: 150, height: 4 },
  speed: 12,
  pauseMs: [8000, 16000],
  idlePoses: ['work', 'work', 'headphones_back', 'talkback', 'work', 'over_shoulder', 'back_idle'],
};
export const HIBIKI_TALK = { dx: 80, dy: 26, facing: -1 as const };

// ---- room 2: recording studio ------------------------------------------------------------------

/** Where each host sits: feet x, feet y (keep in sync with scripts/process_radio.py SEATS). */
export const STUDIO_SEATS = {
  rin: { x: 368, y: 338 },     // left chair (angled to the centre)
  teera: { x: 580, y: 314 },   // centre chair
  momo: { x: 795, y: 338 },    // right chair (angled to the centre → drawn facing left)
};

/** A seated NPC: a zero-size "wander" keeps them in the chair, but lets the engine freeze them,
 *  turn them toward you and play the dialog poses while you talk (static NPCs hide during a talk).
 *  The idle poses come from the seated set (/sprites/npc/<name>_sit/), where 'idle' = sitting. */
const seated = (x: number, y: number, idlePoses: string[]): NpcWander => ({
  area: { x, y, width: 0, height: 0 },
  speed: 1,
  pauseMs: [3500, 7000],
  idlePoses,
});
export const TEERA_SEAT = seated(STUDIO_SEATS.teera.x, STUDIO_SEATS.teera.y,
  ['idle', 'talk', 'idle', 'talk2', 'smile', 'nod', 'idle', 'thinking', 'laugh', 'look']);
export const RIN_SEAT = seated(STUDIO_SEATS.rin.x, STUDIO_SEATS.rin.y,
  ['idle', 'nod', 'idle', 'thinking', 'talk', 'idle', 'smirk', 'hair']);
export const MOMO_SEAT = seated(STUDIO_SEATS.momo.x, STUDIO_SEATS.momo.y,
  ['idle', 'nod', 'giggle', 'idle', 'talk', 'laugh', 'idle', 'wink']);

/** Where you stand to talk to each host: beside the chair (or in front of the centre one), so your
 *  head doesn't hide theirs. */
export const RIN_TALK = { dx: 105, dy: 20, facing: -1 as const };
export const TEERA_TALK = { dx: 0, dy: 118, facing: 1 as const };
export const MOMO_TALK = { dx: -105, dy: 20, facing: 1 as const };

export const studioObstacles: Rect[] = [
  { x: 298, y: 270, width: 146, height: 68 },   // left chair
  { x: 522, y: 262, width: 120, height: 52 },   // centre chair
  { x: 720, y: 270, width: 150, height: 68 },   // right chair
  { x: 444, y: 270, width: 70, height: 44 },    // side table (with the mug)
  { x: 646, y: 270, width: 72, height: 44 },    // side table
  { x: 246, y: 280, width: 40, height: 22 },    // floor lamp left
  { x: 884, y: 280, width: 40, height: 26 },    // floor lamp right
  { x: 196, y: 270, width: 56, height: 38 },    // plant left
  { x: 928, y: 270, width: 58, height: 42 },    // plant right
];

/** Back through the padded door / off the left edge → the control room. */
export const STUDIO_EXIT_DOOR: [number, number, number, number] = [24, 312, 106, 12];
export const STUDIO_EXIT_LEFT: [number, number, number, number] = [0, 340, 12, 236];
