import type { RoomDefinition } from '../types';
import { WOODS_ACTOR_SCALE, WOODS_GRASS, WOODS_TOWN_EXIT, woodsObstacles } from './woodsLayout';

// Whisker Woods — walk in the tall grass to meet wild animals (battles later: docs/ui/battle-screen.md).
// In the postcard (SELECT) box. The left end of the path goes back to town.
// Dev test: ?room=woods_1 (add &hour=21 for night).
export const woodsRoom: RoomDefinition = {
  roomId: 'woods_1',
  name: 'Whisker Woods',
  backgroundImage: '/maps/woods_1.webp',
  thumbnail: '/maps/thumbs/woods_1.webp',
  icon: '🌿',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'town',
  actorScale: WOODS_ACTOR_SCALE,

  bounds: { minX: 4, maxX: 1016, minY: 292, maxY: 570 },
  spawnPoint: { x: 120, y: 402 },
  arrivals: { town: { x: 40, y: 402, facing: 1 } },
  walkableZones: [{ x: 0, y: 292, width: 1024, height: 284 }],
  obstacles: woodsObstacles,
  grass: WOODS_GRASS,

  exits: [
    { triggerBox: WOODS_TOWN_EXIT, targetRoom: 'town' },
  ],

  view: { cityOffsetX: 0, city: false, skyBottomY: 142, nightDarkness: 0.6 },
};
