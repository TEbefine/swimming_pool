import type { RoomDefinition } from '../types';
import { cafeElements, CAFE_ACTOR_SCALE, BARISTA_SPOT } from './cafeLayout';
import { CITY_OFFSET_X } from '../world/cityView';
import { npcName } from '../content/npcNames';

// Weekday café — data-driven layout from cafeLayout.ts.
// Obstacles, seats and interaction points are derived from element definitions.
export const cafeRoom: RoomDefinition = {
  roomId: 'cafe',
  name: 'Weekday Chill Café',
  backgroundImage: '/maps/cafe_room.webp',
  thumbnail: '/maps/thumbs/cafe.webp',
  icon: '☕',
  // Open always for testing / user request (was 'weekdays')
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'cafe',
  view: { cityOffsetX: CITY_OFFSET_X.cafe },

  bounds: { minX: 30, maxX: 994, minY: 275, maxY: 566 },
  spawnPoint: { x: 960, y: 300 },

  walkableZones: [
    { x: 10, y: 275, width: 1004, height: 291 },
  ],

  // All obstacles come from element colliders; Engine merges them at startup.
  obstacles: [],

  // Data-driven furniture, décor and interactables.
  elements: cafeElements,
  actorScale: CAFE_ACTOR_SCALE,

  npcs: [
    { id: 'barista', name: npcName('barista'), x: BARISTA_SPOT.x, y: BARISTA_SPOT.y, sprite: '/sprites/npc/barista', facing: BARISTA_SPOT.facing, standAt: { dx: 90, dy: 54, facing: -1 } },
    {
      // หมาเด็ก — the café server. Walks the aisle in front of the tables (no colliders inside this box).
      id: 'server', name: npcName('server'), x: 520, y: 500, sprite: '/sprites/npc/server', facing: -1,
      standAt: { dx: 90, dy: 8, facing: -1 },
      wander: { area: { x: 150, y: 458, width: 720, height: 80 }, speed: 40, pauseMs: [2500, 6000], idlePoses: ['carry_tray', 'wipe', 'read', 'thinking', 'happy'] },
    },
  ],

  exits: [
    { triggerBox: [946, 262, 58, 30], targetRoom: 'town' },
  ],
};
