import type { NpcWander, RoomDefinition } from '../types';
import { npcName } from '../content/npcNames';
import { QUIET_BAY_FISHING, quietBayObstacles, quietBayWalk } from './quietBayLayout';

// Quiet Bay — FREE FISHING with friends (not the story). A calm Japanese harbour breakwater with a red
// lighthouse (inspired by Ine Bay, Kyoto). Stand anywhere on the FRONT edge of the breakwater and press ◯:
// you fish facing the camera, the float lands in the water below. 64 kinds of fish in 5 tiers
// (game/fishing/freeFish.ts), a Fish Book per player, big catches are announced in the room chat.
// Living things (gulls, a jumping fish, the harbour cat, squid boats and a night heron) are in
// game/world/bayLife.ts. The room id stays 'lake_pier' so saved postcards and the server keep working.
// The Fishing Guide spot: between the first bollard and the vending machine, right where you arrive.
// Two part-time staff (both ~20, uni students) share it — Nami on the DAY shift, Kai on the NIGHT shift
// (decided by Teera: the young woman works in daylight, for safety). Docs: characters/bay-staff-*.md.
const GUIDE_PATROL: NpcWander = {
  area: { x: 136, y: 356, width: 68, height: 12 },
  speed: 24,
  pauseMs: [4000, 9000],
  // no 'point' here: the sheet points right, so facing left it would point at the shore
  idlePoses: ['idle', 'radio', 'clipboard', 'idle', 'wave'],
};

export const lakePierRoom: RoomDefinition = {
  roomId: 'lake_pier',
  name: 'Quiet Bay',
  backgroundImage: '/maps/quiet_bay.webp',
  thumbnail: '/maps/thumbs/quiet_bay.webp',
  icon: '🎣',
  schedule: 'always',
  width: 1024,
  height: 576,
  // everyone at the bay wears the angler outfit (cap + fishing vest): walk + front-facing fishing frames
  // in public/sprites/outfits/angler/ (docs: characters/bay-fishing-outfit.md)
  outfit: 'angler',
  actorScale: 1,

  bounds: { minX: 80, maxX: 956, minY: 348, maxY: 405 },
  spawnPoint: { x: 214, y: 374 }, // just behind the fishing edge, next to the Fishing Guide: first ◯ = talk
  walkableZones: quietBayWalk,
  strictWalkable: true,
  obstacles: quietBayObstacles,
  elements: [],
  interactables: [
    // the whole front edge: ◯ anywhere here = fish right where you stand
    { id: 'pier_end', label: 'Fish', rect: { x: 90, y: 384, width: 850, height: 22 } },
  ],
  exits: [],
  npcs: [
    { id: 'nami', name: npcName('nami'), x: 170, y: 362, sprite: '/sprites/npc/nami', facing: 1,
      standAt: { dx: 40, dy: 14, facing: -1 }, hours: [6, 18], wander: GUIDE_PATROL },
    { id: 'kai', name: npcName('kai'), x: 170, y: 362, sprite: '/sprites/npc/kai', facing: 1,
      standAt: { dx: 40, dy: 14, facing: -1 }, hours: [18, 6], wander: GUIDE_PATROL },
  ],
  freeFishing: true,
  fishing: QUIET_BAY_FISHING,

  view: { cityOffsetX: 0, city: false, skyBottomY: 132, nightDarkness: 0.62 },
};
