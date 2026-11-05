import type { RoomDefinition } from '../types';
import { npcName } from '../content/npcNames';
import {
  MOMO_SEAT, MOMO_TALK, RADIO_ACTOR_SCALE, RIN_SEAT, RIN_TALK, STUDIO_EXIT_DOOR, STUDIO_EXIT_LEFT, STUDIO_SEATS,
  TEERA_SEAT, TEERA_TALK, studioObstacles,
} from './radioLayout';

// LUMEN FM 78.6 — room 2, the recording studio. This painting is ALSO the set of the real podcast /
// YouTube show (16:9; each chair can be cropped to a 9:16 Short). Teera (the host, the creator of the
// game) in the centre, Rin (explains things simply; not every episode) on the left, Momo (the sweet,
// clever joke-maker) on the right. Hibiki stays in the control room (talk-back).
// Seated sprites: /sprites/npc/<name>_sit/ ('idle' = sitting). Dev test: ?room=radio_studio.
export const radioStudioRoom: RoomDefinition = {
  roomId: 'radio_studio',
  name: 'Lumen FM Studio',
  backgroundImage: '/maps/radio_studio.webp',
  thumbnail: '/maps/thumbs/radio_studio.webp',
  icon: '🎙️',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'cafe',
  actorScale: RADIO_ACTOR_SCALE,

  bounds: { minX: 14, maxX: 1010, minY: 312, maxY: 566 },
  spawnPoint: { x: 160, y: 380 },
  arrivals: { radio: { x: 160, y: 380, facing: 1 } },
  walkableZones: [{ x: 0, y: 312, width: 1024, height: 264 }],
  obstacles: studioObstacles,
  elements: [],

  exits: [
    { triggerBox: STUDIO_EXIT_DOOR, targetRoom: 'radio' },
    { triggerBox: STUDIO_EXIT_LEFT, targetRoom: 'radio' },
  ],

  npcs: [
    { id: 'rin', name: npcName('rin'), x: STUDIO_SEATS.rin.x, y: STUDIO_SEATS.rin.y, sprite: '/sprites/npc/rin_sit', facing: 1,
      standAt: RIN_TALK, wander: RIN_SEAT },
    { id: 'teera', name: npcName('teera'), x: STUDIO_SEATS.teera.x, y: STUDIO_SEATS.teera.y, sprite: '/sprites/npc/teera_sit', facing: 1,
      standAt: TEERA_TALK, wander: TEERA_SEAT },
    { id: 'momo', name: npcName('momo'), x: STUDIO_SEATS.momo.x, y: STUDIO_SEATS.momo.y, sprite: '/sprites/npc/momo_sit', facing: -1,
      standAt: MOMO_TALK, wander: MOMO_SEAT },
  ],

  view: { cityOffsetX: 0, city: false, nightDarkness: 0.4 },
};
