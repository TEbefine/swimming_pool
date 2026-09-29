import type { RoomDefinition } from '../types';
import { npcName } from '../content/npcNames';
import { dalbitYardObstacles, DALBIT_YARD_ACTOR_SCALE } from './dalbitYardLayout';

// Dalbit · Kang family home (the yard). First room of story world #1 — see project doc story/dalbit-heir.md.
// Not in the postcard (SELECT) box: story rooms are reached through the Spirit. Dev test: ?room=dalbit_yard
// Layers: code sky + stars · sea glints · night glow from the window and paper doors (cityView ROOM_LIGHTS).
export const dalbitYardRoom: RoomDefinition = {
  roomId: 'dalbit_yard',
  name: 'Kang Family Home',
  backgroundImage: '/maps/dalbit/yard.webp',
  thumbnail: '/maps/thumbs/dalbit_yard.webp',
  icon: '🏡',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'dalbit', // the player becomes Kang Yunseul here (public/sprites/outfits/dalbit/, 1×)
  actorScale: DALBIT_YARD_ACTOR_SCALE,

  bounds: { minX: 8, maxX: 1016, minY: 290, maxY: 520 },
  spawnPoint: { x: 512, y: 410 },
  arrivals: {
    dalbit_river: { x: 985, y: 478, facing: -1 },   // back through the gate (gap between fence and bush)
  },
  walkableZones: [
    { x: 0, y: 296, width: 1024, height: 226 },   // packed-earth yard
    { x: 290, y: 288, width: 430, height: 10 },   // just in front of the porch
  ],
  obstacles: dalbitYardObstacles,
  elements: [],
  // Story "Look" spots (press E / ◯ inside the box). Text lives in game/story/dalbitPrologue.ts.
  interactables: [
    { id: 'rice_jar', label: 'Look', rect: { x: 0, y: 306, width: 150, height: 34 } },
    { id: 'drying_rack', label: 'Look', rect: { x: 885, y: 300, width: 50, height: 24 } },
    { id: 'gate', label: 'Look', rect: { x: 960, y: 468, width: 64, height: 54 } },
  ],
  exits: [],
  npcs: [
    {
      // Mother (the hidden Queen). Busy in front of the jar terrace and the porch: stops often,
      // stirs a pot, holds a bowl. Prologue Day 1 preview dialogue in content/dialogues.ts.
      id: 'mother', name: npcName('mother'), x: 250, y: 330, sprite: '/sprites/npc/mother', facing: 1,
      standAt: { dx: 45, dy: 10, facing: -1 },
      wander: { area: { x: 170, y: 318, width: 300, height: 50 }, speed: 22, pauseMs: [5000, 10000], idlePoses: ['hold_bowl', 'happy', 'talk', 'stir'] },
    },
    {
      // Father Kang — mends nets in front of the drying rack. Barely moves (tiny wander area, long
      // pauses), so he is almost always sitting with the net; now and then he stands and looks at the road.
      id: 'father', name: npcName('father'), x: 830, y: 318, sprite: '/sprites/npc/father', facing: -1,
      standAt: { dx: -45, dy: 10, facing: 1 },
      wander: { area: { x: 822, y: 314, width: 16, height: 8 }, speed: 18, pauseMs: [15000, 30000], idlePoses: ['mend_net', 'mend_net', 'mend_net', 'side_idle'] },
    },
  ],

  view: { cityOffsetX: 0, city: false, skyBottomY: 155, nightDarkness: 0.62, past: true },
};
