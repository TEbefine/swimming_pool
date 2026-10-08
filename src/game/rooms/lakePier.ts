import type { RoomDefinition } from '../types';
import { QUIET_BAY_FISHING, quietBayObstacles, quietBayWalk } from './quietBayLayout';

// Quiet Bay — FREE FISHING with friends (not the story). A calm Japanese harbour breakwater with a red
// lighthouse (inspired by Ine Bay, Kyoto). Stand anywhere on the FRONT edge of the breakwater and press ◯:
// you fish facing the camera, the float lands in the water below. 64 kinds of fish in 5 tiers
// (game/fishing/freeFish.ts), a Fish Book per player, big catches are announced in the room chat.
// Living things (gulls, a jumping fish, the harbour cat, squid boats and a night heron) are in
// game/world/bayLife.ts. The room id stays 'lake_pier' so saved postcards and the server keep working.
export const lakePierRoom: RoomDefinition = {
  roomId: 'lake_pier',
  name: 'Quiet Bay',
  backgroundImage: '/maps/quiet_bay.webp',
  thumbnail: '/maps/thumbs/quiet_bay.webp',
  icon: '🎣',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'town',
  actorScale: 1,

  bounds: { minX: 80, maxX: 956, minY: 348, maxY: 405 },
  spawnPoint: { x: 150, y: 384 },
  walkableZones: quietBayWalk,
  strictWalkable: true,
  obstacles: quietBayObstacles,
  elements: [],
  interactables: [
    // the whole front edge: ◯ anywhere here = fish right where you stand
    { id: 'pier_end', label: 'Fish', rect: { x: 90, y: 384, width: 850, height: 22 } },
  ],
  exits: [],
  npcs: [],
  freeFishing: true,
  fishing: QUIET_BAY_FISHING,

  view: { cityOffsetX: 0, city: false, skyBottomY: 132, nightDarkness: 0.62 },
};
