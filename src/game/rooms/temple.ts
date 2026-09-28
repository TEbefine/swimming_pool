import type { RoomDefinition } from '../types';
import { npcName } from '../content/npcNames';
import { templeElements, templeObstacles, TEMPLE_ACTOR_SCALE, TEMPLE_STEPS_EXIT } from './templeLayout';

// Quiet Temple — the Spirit's sanctuary on the hill above Lumen Bay. White marble, sea view, silence.
// Not in the postcard (SELECT) box on purpose: you only get here through the Spirit.
// Dev test: open the game with ?room=temple
// Layers: code sky + stars · sea glints · floor ring + doorway specks (behind people) ·
// two walk-behind columns · light motes (in front) · doorway glow at night (see world/ambient.ts).
export const templeRoom: RoomDefinition = {
  roomId: 'temple',
  name: 'Quiet Temple',
  backgroundImage: '/maps/temple.webp',
  thumbnail: '/maps/thumbs/temple.webp',
  icon: '🏛️',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'town',
  actorScale: TEMPLE_ACTOR_SCALE,

  bounds: { minX: 8, maxX: 1016, minY: 238, maxY: 572 },
  spawnPoint: { x: 512, y: 470 },
  walkableZones: [
    { x: 0, y: 268, width: 1024, height: 308 },   // marble floor + front steps
    { x: 392, y: 238, width: 240, height: 32 },   // temple stairs up to the doorway
  ],
  obstacles: templeObstacles,
  elements: templeElements,

  exits: [
    { triggerBox: TEMPLE_STEPS_EXIT, targetRoom: 'town' },   // walk down the front steps → Lakeside Square
  ],

  npcs: [
    {
      // Spirit — the ancient temple keeper. Stands near the altar, barely moves.
      id: 'spirit', name: npcName('spirit'), x: 512, y: 340, sprite: '/sprites/npc/spirit', facing: -1,
      standAt: { dx: 45, dy: 10, facing: -1 },
      wander: { area: { x: 420, y: 300, width: 180, height: 60 }, speed: 14, pauseMs: [6000, 14000], idlePoses: ['idle', 'tilt', 'reach', 'look_back'] },
    },
  ],

  view: { cityOffsetX: 0, city: false, skyBottomY: 166, nightDarkness: 0.58 },
};
