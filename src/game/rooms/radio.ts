import type { RoomDefinition } from '../types';
import { npcName } from '../content/npcNames';
import {
  HIBIKI_SHIFT, HIBIKI_SPOT, HIBIKI_TALK, RADIO_ACTOR_SCALE, RADIO_BOARD, RADIO_EXIT_LEFT, RADIO_STUDIO_DOOR,
  radioObstacles,
} from './radioLayout';

// LUMEN FM 78.6 — room 1, the control room. Like a real community-FM / video-podcast station:
// you come in from the street on the LEFT, guests wait on the red sofa, the sound engineer works at
// the console facing the monitor (the studio camera feed), and the padded door under the ON AIR
// light on the right leads into the recording studio. Docs: claude.ai Project world/lumen-fm.md.
// Dev test: ?room=radio (add &hour=21 for night).
export const radioRoom: RoomDefinition = {
  roomId: 'radio',
  name: 'Lumen FM 78.6',
  backgroundImage: '/maps/radio.webp',
  thumbnail: '/maps/thumbs/radio.webp',
  icon: '📻',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'cafe',
  actorScale: RADIO_ACTOR_SCALE,

  bounds: { minX: 14, maxX: 1010, minY: 296, maxY: 566 },
  spawnPoint: { x: 130, y: 430 },
  // from the street (left) · back out of the studio (just in front of its door, not in the trigger)
  arrivals: { town: { x: 60, y: 440, facing: 1 }, radio_studio: { x: 878, y: 348, facing: -1 } },
  walkableZones: [{ x: 0, y: 296, width: 1024, height: 280 }],
  obstacles: radioObstacles,
  elements: [],
  interactables: [
    { id: 'radio_board', label: 'Read', rect: RADIO_BOARD },
  ],

  exits: [
    { triggerBox: RADIO_EXIT_LEFT, targetRoom: 'town' },
    { triggerBox: RADIO_STUDIO_DOOR, targetRoom: 'radio_studio' },
  ],

  npcs: [
    // Hibiki — the sound engineer. Cool, quiet, the best at sound. Back to you, working the console.
    { id: 'hibiki', name: npcName('hibiki'), x: HIBIKI_SPOT.x, y: HIBIKI_SPOT.y, sprite: '/sprites/npc/hibiki', facing: 1,
      standAt: HIBIKI_TALK, wander: HIBIKI_SHIFT },
  ],

  // indoors, no windows to the sky: painted room only; the lamps keep it warm at night
  view: { cityOffsetX: 0, city: false, nightDarkness: 0.45 },
};
