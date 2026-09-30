import type { RoomDefinition } from '../types';
import { dalbitMarketGround, dalbitMarketObstacles, DALBIT_MARKET_ACTOR_SCALE } from './dalbitMarketLayout';

// Dalbit · Dock & market — Master Gu's fish stall (the only legal buyer: the Governor's dock seal),
// the inn's back door, the rice shop with its price board, and the yeot cart.
// GREY-BOX for now (see dalbitMarketLayout.ts). Dev test: ?room=dalbit_market
// People here are "talk spots" (interactables), not walking NPCs, until they get sprites.
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

  bounds: { minX: 4, maxX: 1016, minY: 296, maxY: 556 },
  spawnPoint: { x: 60, y: 420 },
  arrivals: {
    dalbit_river: { x: 70, y: 420, facing: 1 },
    dalbit_yard: { x: 70, y: 420, facing: 1 },
  },
  walkableZones: dalbitMarketGround,
  strictWalkable: true,
  obstacles: dalbitMarketObstacles,
  elements: [],
  // Talk / look spots. Text lives in game/story/dalbitPrologue.ts.
  interactables: [
    { id: 'innkeeper', label: 'Talk', rect: { x: 90, y: 318, width: 90, height: 42 } },
    { id: 'rice_seller', label: 'Talk', rect: { x: 318, y: 318, width: 100, height: 42 } },
    { id: 'rice_board', label: 'Read', rect: { x: 460, y: 316, width: 110, height: 44 } },
    { id: 'gu', label: 'Talk', rect: { x: 660, y: 338, width: 150, height: 44 } },
    { id: 'yeot_cart', label: 'Talk', rect: { x: 160, y: 476, width: 190, height: 50 } },
    { id: 'market_road', label: 'Go', rect: { x: 0, y: 380, width: 60, height: 80 } },
  ],
  exits: [],
  npcs: [],

  view: { cityOffsetX: 0, city: false, skyBottomY: 140, nightDarkness: 0.62, past: true },
};
