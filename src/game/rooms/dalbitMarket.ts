import type { RoomDefinition } from '../types';
import { npcName } from '../content/npcNames';
import { dalbitMarketElements, dalbitMarketGround, dalbitMarketObstacles, DALBIT_MARKET_ACTOR_SCALE, DALBIT_MARKET_EXIT } from './dalbitMarketLayout';

// Dalbit · Dock & market — Master Gu's fish stall (the only legal buyer: the Governor's dock seal),
// the inn's back door, the rice shop with its price board, and the yeot cart.
// Painted scene + props (see dalbitMarketLayout.ts). Dev test: ?room=dalbit_market
// The four market people are standing NPCs (sprites: src/assets/npc_market_sheet.webp → scripts/process_npc_rows.py).
export const dalbitMarketRoom: RoomDefinition = {
  roomId: 'dalbit_market',
  name: 'Dock Market',
  backgroundImage: '/maps/dalbit/market.webp',
  thumbnail: '/maps/thumbs/dalbit_market.webp',
  icon: '🐟',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'dalbit',
  actorScale: DALBIT_MARKET_ACTOR_SCALE,

  bounds: { minX: 4, maxX: 1016, minY: 292, maxY: 554 },
  spawnPoint: { x: 60, y: 420 },
  arrivals: {
    dalbit_river: { x: 70, y: 420, facing: 1 },
  },
  walkableZones: dalbitMarketGround,
  strictWalkable: true,
  obstacles: dalbitMarketObstacles,
  elements: dalbitMarketElements,
  // Talk / look spots. Text lives in game/story/dalbitPrologue.ts.
  interactables: [
    { id: 'rice_board', label: 'Read', rect: { x: 495, y: 322, width: 70, height: 40 } },
  ],
  // Walk off the left edge → the shore path back to the river mouth (and home past it).
  exits: [
    { triggerBox: DALBIT_MARKET_EXIT, targetRoom: 'dalbit_river' },
  ],
  npcs: [
    // Master Gu at his stall: now and then weighs a fish on his hand scale
    { id: 'gu', name: npcName('gu'), x: 680, y: 306, sprite: '/sprites/npc/gu', facing: 1,
      standAt: { dx: 42, dy: 8, facing: -1 }, idleLoop: { poses: ['weigh'], frameMs: 2600, pauseMs: 7000 } },
    // The innkeeper at the inn's back door: counts her coins
    { id: 'innkeeper', name: npcName('innkeeper'), x: 100, y: 302, sprite: '/sprites/npc/innkeeper', facing: 1,
      standAt: { dx: 42, dy: 8, facing: -1 }, idleLoop: { poses: ['count'], frameMs: 2200, pauseMs: 9000 } },
    // The rice seller in front of his shop: arms crossed, grumpy
    { id: 'rice_seller', name: npcName('rice_seller'), x: 340, y: 304, sprite: '/sprites/npc/rice_seller', facing: 1,
      standAt: { dx: 42, dy: 8, facing: -1 } },
    // The yeot seller by his cart: *clack clack* with the big scissors
    { id: 'yeot_seller', name: npcName('yeot_seller'), x: 300, y: 418, sprite: '/sprites/npc/yeot_seller', facing: 1,
      standAt: { dx: 42, dy: 6, facing: -1 }, idleLoop: { poses: ['clack_a', 'clack_b', 'clack_a', 'clack_b'], frameMs: 260, pauseMs: 4200 } },
  ],

  view: { cityOffsetX: 0, city: false, skyBottomY: 131, nightDarkness: 0.62, past: true },
};
