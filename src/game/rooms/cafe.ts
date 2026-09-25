import type { RoomDefinition } from '../types';

// Weekday café — coordinates measured from public/maps/cafe.webp (1024×576).
// Player (x, y) = sprite bottom-centre (feet), matching Engine's anchor.
export const cafeRoom: RoomDefinition = {
  roomId: 'cafe',
  name: 'Weekday Chill Café',
  backgroundImage: '/maps/cafe.webp',
  width: 1024,
  height: 576,
  outfit: 'casual',

  // Wall baseboard ends at y≈260, so feet stay on the wooden floor below it
  bounds: { minX: 25, maxX: 1024 - 25, minY: 280, maxY: 576 - 20 },

  // Enter the café by the door on the right
  spawnPoint: { x: 920, y: 300 },

  walkableZones: [
    { x: 10, y: 280, width: 1004, height: 276 },
  ],

  obstacles: [
    { x: 0, y: 185, width: 200, height: 172 },   // Coffee counter + pastry display
    { x: 284, y: 318, width: 74, height: 60 },   // Table 1
    { x: 536, y: 318, width: 72, height: 60 },   // Table 2
    { x: 781, y: 318, width: 76, height: 60 },   // Table 3
    { x: 0, y: 490, width: 110, height: 86 },    // Bottom-left monstera pot
    { x: 915, y: 490, width: 109, height: 86 },  // Bottom-right monstera pot
  ],

  // Floor cushions: blue sits facing right (1), red sits facing left (-1),
  // so the two people at each table face each other.
  seats: [
    { x: 253, y: 368, facing: 1 },  { x: 388, y: 368, facing: -1 }, // Table 1
    { x: 506, y: 368, facing: 1 },  { x: 638, y: 368, facing: -1 }, // Table 2
    { x: 752, y: 368, facing: 1 },  { x: 887, y: 368, facing: -1 }, // Table 3
  ],

  // Data only — not rendered yet. Barista is a half-body sprite whose bottom
  // edge sits on the counter top (y≈196) so the counter hides the legs.
  npcs: [
    { id: 'barista', name: 'Barista', x: 100, y: 196, sprite: '/sprites/npc/barista.webp', facing: 1 },
  ],

  interactables: [
    { id: 'notice_board', label: 'Read', rect: { x: 500, y: 262, width: 120, height: 40 } },
  ],

  // Not wired in Engine yet. Door on the right; notice board interaction comes in Step 3.
  exits: [
    { triggerBox: [950, 262, 74, 40], targetRoom: 'poolside' },
  ],
};
