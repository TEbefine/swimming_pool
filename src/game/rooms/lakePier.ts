import type { RoomDefinition } from '../types';
import {
  dalbitRiverBeach, dalbitRiverPier, dalbitRiverObstacles, DALBIT_RIVER_ACTOR_SCALE,
} from './dalbitRiverLayout';

// Fishing Pier — FREE FISHING with friends (not the story). Walk to the end of the pier and press ◯.
// 32 kinds of fish in 5 tiers (game/fishing/freeFish.ts), a Fish Book per player, and big catches
// are announced in the room chat. Uses the river-mouth painting for now (same pier + beach layout);
// swap in the Lumen Bay "Lake Pier" painting later — keep the pier end at the same place or move
// FISHING_SPOT in fishingSession.ts.
export const lakePierRoom: RoomDefinition = {
  roomId: 'lake_pier',
  name: 'Fishing Pier',
  backgroundImage: '/maps/dalbit/river.webp',
  thumbnail: '/maps/thumbs/dalbit_river.webp',
  icon: '🎣',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'town',
  actorScale: DALBIT_RIVER_ACTOR_SCALE,

  bounds: { minX: 4, maxX: 1016, minY: 212, maxY: 558 },
  spawnPoint: { x: 330, y: 420 },
  walkableZones: [...dalbitRiverBeach, ...dalbitRiverPier],
  strictWalkable: true,
  obstacles: dalbitRiverObstacles,
  elements: [],
  interactables: [
    { id: 'pier_end', label: 'Fish', rect: { x: 362, y: 212, width: 100, height: 20 } },
  ],
  exits: [],
  npcs: [],
  freeFishing: true,

  view: { cityOffsetX: 0, city: false, skyBottomY: 134, nightDarkness: 0.62 },
};
