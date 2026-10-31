import type { RoomDefinition } from '../types';
import { npcName } from '../content/npcNames';
import { FISH_SHOP_EXIT, GEN_POST, GEN_SPOT, MINATO_SPOT, MINATO_STROLL, fishShopObstacles, fishShopWalk } from './fishShopLayout';

// Harbour Fish Shop (ECO-01) — reached from Quiet Bay's left shore. Gen (74, the founder) buys your
// fish and sells pantry/supplies; his grandson Minato (23, former idol) sells sashimi, meals, drinks.
// Open to everyone since ECO-04; the server decides whether Gen trades today. Docs: docs/tech/fish-economy.md,
// claude.ai Project characters/shop-chef-minato.md. Dev test: ?room=fish_shop.
export const fishShopRoom: RoomDefinition = {
  roomId: 'fish_shop',
  name: 'Harbour Fish Shop',
  backgroundImage: '/maps/fish_shop.webp',
  thumbnail: '/maps/thumbs/fish_shop.webp',
  icon: '🐟',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'angler', // you came from the bay in your fishing clothes
  actorScale: 1,

  bounds: { minX: 6, maxX: 1018, minY: 340, maxY: 404 },
  spawnPoint: { x: 960, y: 372 },
  arrivals: { lake_pier: { x: 970, y: 372, facing: -1 } },
  walkableZones: fishShopWalk,
  strictWalkable: true,
  obstacles: fishShopObstacles,
  elements: [],
  exits: [{ triggerBox: FISH_SHOP_EXIT, targetRoom: 'lake_pier' }],

  npcs: [
    { id: 'gen', name: npcName('gen'), x: GEN_SPOT.x, y: GEN_SPOT.y, sprite: '/sprites/npc/gen', facing: 1,
      standAt: { dx: 46, dy: 14, facing: -1 }, wander: GEN_POST },
    { id: 'minato', name: npcName('minato'), x: MINATO_SPOT.x, y: MINATO_SPOT.y, sprite: '/sprites/npc/minato', facing: -1,
      standAt: { dx: -46, dy: 14, facing: 1 }, wander: MINATO_STROLL },
  ],

  view: { cityOffsetX: 0, city: false, skyBottomY: 101, nightDarkness: 0.6 },
};
