import type { RoomDefinition } from '../types';
import { cafeElements, CAFE_ACTOR_SCALE, BARISTA_SPOT } from './cafeLayout';

// Weekday café — data-driven layout from cafeLayout.ts.
// Obstacles, seats and interaction points are derived from element definitions.
export const cafeRoom: RoomDefinition = {
  roomId: 'cafe',
  name: 'Weekday Chill Café',
  backgroundImage: '/maps/cafe_empty.webp',
  width: 1024,
  height: 576,
  outfit: 'casual',

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
    { id: 'barista', name: 'Barista', x: BARISTA_SPOT.x, y: BARISTA_SPOT.y, sprite: '/sprites/npc/barista', facing: BARISTA_SPOT.facing },
  ],

  exits: [
    { triggerBox: [946, 262, 58, 30], targetRoom: 'poolside' },
  ],
};
