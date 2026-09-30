import type { RoomDefinition } from '../types';
import {
  dalbitRiverBeach, dalbitRiverPier, dalbitRiverObstacles, DALBIT_RIVER_EXIT, DALBIT_RIVER_ACTOR_SCALE,
} from './dalbitRiverLayout';

// Dalbit · River mouth — where the river meets the sea, a short walk from the Kang yard.
// Prologue Day 1: Yunseul fishes from the end of the pier (fishing system: coming next).
// Reached from the yard gate (story) — dev test: ?room=dalbit_river
// Layers: code sky + stars · sea glints (ambient.ts) · no night lights (nobody lives here).
export const dalbitRiverRoom: RoomDefinition = {
  roomId: 'dalbit_river',
  name: 'River Mouth',
  backgroundImage: '/maps/dalbit/river.webp',
  thumbnail: '/maps/thumbs/dalbit_river.webp',
  icon: '🎣',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'dalbit',
  actorScale: DALBIT_RIVER_ACTOR_SCALE,

  bounds: { minX: 4, maxX: 1016, minY: 212, maxY: 558 },
  spawnPoint: { x: 40, y: 410 },   // coming down the path from the yard (left edge)
  arrivals: {
    dalbit_market: { x: 815, y: 420, facing: -1 },   // back along the shore path (right side of the beach)
  },
  walkableZones: [...dalbitRiverBeach, ...dalbitRiverPier],
  strictWalkable: true, // the sea is not walkable — only the beach and the pier
  obstacles: dalbitRiverObstacles,
  elements: [],
  // Story "Look" spots. Text lives in game/story/dalbitPrologue.ts.
  interactables: [
    { id: 'pier_end', label: 'Fish', rect: { x: 362, y: 212, width: 100, height: 20 } },
    { id: 'basket', label: 'Look', rect: { x: 205, y: 376, width: 70, height: 18 } },
  ],
  exits: [
    { triggerBox: DALBIT_RIVER_EXIT, targetRoom: 'dalbit_yard' },   // path home
    { triggerBox: [884, 372, 16, 120], targetRoom: 'dalbit_market' },   // shore path (right end of the beach) → dock market
  ],
  npcs: [],

  view: { cityOffsetX: 0, city: false, skyBottomY: 134, nightDarkness: 0.62, past: true },
};
