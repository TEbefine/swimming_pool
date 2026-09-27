import type { RoomDefinition } from '../types';
import { npcName } from '../content/npcNames';
import { townElements, townObstacles, TOWN_ACTOR_SCALE, TOWN_CAFE_DOOR } from './townLayout';

// Lumen Bay — Lakeside Square. One painted postcard scene at POOL size (small characters).
// The green door is the café; walk off the left edge to the Summer Pool, the right edge to the Music Club.
// Layers: code sky + clouds/birds/stars behind the painting · lake glints · fountain sparkles ·
// blossom petals · lamp/window glows and the lighthouse beacon at night (see world/ambient.ts).
export const townRoom: RoomDefinition = {
  roomId: 'town',
  name: 'Lumen Bay',
  backgroundImage: '/maps/town_lakeside.webp',
  thumbnail: '/maps/thumbs/town.webp',
  icon: '🏡',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'town',
  actorScale: TOWN_ACTOR_SCALE,

  bounds: { minX: 8, maxX: 1016, minY: 262, maxY: 566 },
  spawnPoint: { x: 512, y: 420 },
  walkableZones: [
    { x: 0, y: 272, width: 1024, height: 298 },   // the stone plaza
    { x: 414, y: 262, width: 42, height: 12 },    // café doorstep
  ],
  obstacles: townObstacles,
  elements: townElements,

  exits: [
    { triggerBox: TOWN_CAFE_DOOR, targetRoom: 'cafe' },
    { triggerBox: [0, 350, 12, 210], targetRoom: 'poolside' },   // west edge → Summer Pool
    { triggerBox: [1012, 350, 12, 210], targetRoom: 'club' },    // east edge → Music Club
  ],

  npcs: [
    {
      // Sir Ledger — the old tycoon (AI tips). Strolls the LEFT half of the plaza in front of the fountain.
      id: 'tycoon', name: npcName('tycoon'), x: 320, y: 440, sprite: '/sprites/npc/tycoon', facing: -1,
      standAt: { dx: 45, dy: 10, facing: -1 },
      wander: { area: { x: 120, y: 392, width: 380, height: 120 }, speed: 30, pauseMs: [3000, 7000], idlePoses: ['thinking', 'happy', 'wave', 'talk'] },
    },
    {
      // Nova — the cool girl (prompt tricks). Owns the right half of the plaza, walks a bit faster.
      id: 'nova', name: npcName('nova'), x: 700, y: 450, sprite: '/sprites/npc/nova', facing: -1,
      standAt: { dx: 45, dy: 10, facing: -1 },
      wander: { area: { x: 540, y: 392, width: 360, height: 120 }, speed: 42, pauseMs: [2500, 6000], idlePoses: ['thinking', 'happy', 'wave', 'talk'] },
    },
    {
      // Clara — the bookish scholar (thinking habits). Strolls the BACK row in front of the shops,
      // passing behind the fountain and the bench (depth-sorted), stopping often to read.
      id: 'clara', name: npcName('clara'), x: 540, y: 294, sprite: '/sprites/npc/clara', facing: 1,
      standAt: { dx: 45, dy: 10, facing: -1 },
      wander: { area: { x: 160, y: 284, width: 700, height: 22 }, speed: 26, pauseMs: [4000, 9000], idlePoses: ['talk', 'thinking', 'happy', 'wave'] },
    },
    {
      // Envoy — the news anchor (AI news / word of the day). Walks the FRONT edge of the scene,
      // closest to the camera, like a reporter doing a piece to camera.
      id: 'envoy', name: npcName('envoy'), x: 500, y: 540, sprite: '/sprites/npc/envoy', facing: 1,
      standAt: { dx: 45, dy: -6, facing: -1 },
      wander: { area: { x: 120, y: 528, width: 780, height: 26 }, speed: 38, pauseMs: [2500, 6000], idlePoses: ['talk', 'happy', 'wave', 'thinking'] },
    },
  ],

  view: { cityOffsetX: 0, city: false, skyBottomY: 166, nightDarkness: 0.62 },
};
