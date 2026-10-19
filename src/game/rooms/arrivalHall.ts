import type { RoomDefinition } from '../types';
import { npcName } from '../content/npcNames';
import {
  ARRIVAL_ACTOR_SCALE, ARRIVAL_EXIT_DOOR, FAH_SHIFT, FAH_TALK, NAGISA_START, NAGISA_STROLL, FAH_SPOT, PHU_POST, PHU_SPOT, PHU_TALK,
  TAWAN_SHIFT, TAWAN_SPOT, TAWAN_TALK,
  arrivalElements, arrivalObstacles,
} from './arrivalHallLayout';

// Arrival Hall — the first room in Lumen Bay. Newcomers (no Player ID) and people who lost their
// memory (cleared browser / new phone) arrive here: Fah at Arrivals (new passport), Tawan at
// Lost & Found (restore with the 12 words). Nagisa-sama, whose family opened the hall, strolls the floor.
// Phu guards the glass doors: first-timers check in at the counter before he lets them out (content/arrivalDoor.ts).
// The registration flow itself comes next (it touches the
// identity code); for now the staff greet you and explain. In the postcard (SELECT) box, last slot.
// Dev test: ?room=arrival_hall (add &hour=21 for night).
export const arrivalHallRoom: RoomDefinition = {
  roomId: 'arrival_hall',
  name: 'Arrival Hall',
  backgroundImage: '/maps/arrival_hall.webp',
  thumbnail: '/maps/thumbs/arrival_hall.webp',
  icon: '🛬',
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'cafe',
  actorScale: ARRIVAL_ACTOR_SCALE,

  bounds: { minX: 20, maxX: 1004, minY: 270, maxY: 566 },
  spawnPoint: { x: 104, y: 300 },                        // just stepped out of the arrival arch
  // coming back in through the glass doors (from the Quiet Temple doorway, or town)
  arrivals: { temple: { x: 956, y: 326, facing: -1 }, town: { x: 956, y: 326, facing: -1 } },
  walkableZones: [{ x: 0, y: 270, width: 1024, height: 300 }],
  obstacles: arrivalObstacles,
  elements: arrivalElements,
  interactables: [
    // the arrivals board behind the counter: stand in front of the middle of the counter (between
    // Fah's and Tawan's talk spots, so ◯ there reads the board)
    { id: 'arrival_board', label: 'Read', rect: { x: 430, y: 306, width: 190, height: 34 } },
  ],

  exits: [
    { triggerBox: ARRIVAL_EXIT_DOOR, targetRoom: 'town' },   // glass doors → out into the city (Lakeside Square)
  ],

  npcs: [
    { id: 'fah', name: npcName('fah'), x: FAH_SPOT.x, y: FAH_SPOT.y, sprite: '/sprites/npc/fah', facing: 1,
      standAt: FAH_TALK, wander: FAH_SHIFT },
    { id: 'tawan', name: npcName('tawan'), x: TAWAN_SPOT.x, y: TAWAN_SPOT.y, sprite: '/sprites/npc/tawan', facing: -1,
      standAt: TAWAN_TALK, wander: TAWAN_SHIFT },
    // Nagisa-sama: the family that opened this hall. Strolls slowly across the front, a lady of few words.
    { id: 'nagisa', name: npcName('nagisa'), x: NAGISA_START.x, y: NAGISA_START.y, sprite: '/sprites/npc/nagisa', facing: -1,
      standAt: { dx: 64, dy: 4, facing: -1 }, wander: NAGISA_STROLL },
    // Phu: the big, warm door guard by the glass doors (stops first-timers until they check in).
    { id: 'phu', name: npcName('phu'), x: PHU_SPOT.x, y: PHU_SPOT.y, sprite: '/sprites/npc/phu', facing: -1,
      standAt: PHU_TALK, wander: PHU_POST },
  ],

  // indoors: painted room, code sky only through the two windows; a gentle night (the lamps are on)
  view: { cityOffsetX: 0, city: false, skyBottomY: 120, nightDarkness: 0.5 },
};
