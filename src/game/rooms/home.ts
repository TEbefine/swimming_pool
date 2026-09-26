import type { RoomDefinition } from '../types';
import { homeElements, HOME_ACTOR_SCALE, HOME_SPAWN } from './homeLayout';
import { CITY_OFFSET_X } from '../world/cityView';

// "My Room" — the player's own quiet room with view of the city.
// Obstacles, seats and interaction points are derived from homeLayout.ts element definitions.
export const homeRoom: RoomDefinition = {
  roomId: 'home',
  name: 'My Room',
  backgroundImage: '/maps/home_room.webp',
  thumbnail: '/maps/thumbs/home.webp',
  icon: '🏠',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'casual',
  view: { cityOffsetX: CITY_OFFSET_X.home },

  bounds: { minX: 30, maxX: 994, minY: 275, maxY: 566 },
  spawnPoint: HOME_SPAWN,

  walkableZones: [
    { x: 10, y: 275, width: 1004, height: 291 },
  ],

  // All obstacles come from element colliders; Engine merges them at startup.
  obstacles: [],

  // Furniture, décor and interactables from homeLayout.ts
  elements: homeElements,
  actorScale: HOME_ACTOR_SCALE,

  exits: [
    { triggerBox: [946, 262, 58, 30], targetRoom: 'cafe' },
  ],
};
