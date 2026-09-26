// "My Room" — the player's own quiet room. Characters at 1.5× (same as the café).
// Furniture is sized to the ROOM (door ≈ bookshelf height), not to the chibi body.
// Background: /maps/home_empty.webp (1024×576). Elements placed by BOTTOM-CENTRE (x, y).
// Seats: 'sit' (floor-sit pose) or 'lie' (lie pose on the bed).
// Interaction ids: bed → Rest, guitar → Play, my_collection → Collection (saved tips),
// diary → Write, record_player → Music.
import type { ElementDef } from '../types';

export const HOME_ACTOR_SCALE = 1.5;

const H = (name: string) => `/sprites/elements/home/${name}.webp`;

export const homeElements: ElementDef[] = [
  { id: 'fairy_lights', asset: H('fairy_lights'), x: 245, y: 74, layer: 'wall' },
  { id: 'picture', asset: H('picture'), x: 660, y: 165, layer: 'wall' },
  { id: 'wall_shelf', asset: H('wall_shelf'), x: 806, y: 140, layer: 'wall' },
  { id: 'clock', asset: H('clock'), x: 905, y: 118, layer: 'wall' },
  { id: 'cushion', asset: H('cushion'), x: 668, y: 462, layer: 'floor', seat: { dx: 0, dy: -11, facing: -1, pose: 'sit' } },
  { id: 'floor_lamp', asset: H('floor_lamp'), x: 46, y: 305, layer: 'object', collider: { w: 46, h: 12 } },
  { id: 'bed', asset: H('bed'), x: 208, y: 320, layer: 'object', collider: { w: 224, h: 58 }, seat: { dx: 11, dy: -43, facing: 1, pose: 'lie' }, interact: { id: 'bed', label: 'Rest', dx: 0, dy: 26, radius: 85 } },
  { id: 'guitar', asset: H('guitar'), x: 350, y: 292, layer: 'object', collider: { w: 40, h: 10 }, interact: { id: 'guitar', label: 'Play', dx: 0, dy: 24, radius: 50 } },
  { id: 'bookshelf', asset: H('bookshelf'), x: 462, y: 276, layer: 'object', collider: { w: 134, h: 14 }, interact: { id: 'my_collection', label: 'Collection', dx: 0, dy: 30, radius: 70 } },
  { id: 'desk', asset: H('desk'), x: 662, y: 284, layer: 'object', collider: { w: 156, h: 18 }, interact: { id: 'diary', label: 'Write', dx: 0, dy: 32, radius: 70 } },
  { id: 'chair', asset: H('chair'), x: 590, y: 300, layer: 'object', collider: { w: 58, h: 12 } },
  { id: 'record_player', asset: H('record_player'), x: 836, y: 282, layer: 'object', collider: { w: 118, h: 16 }, interact: { id: 'record_player', label: 'Music', dx: 0, dy: 30, radius: 65 } },
  { id: 'beanbag', asset: H('beanbag'), x: 410, y: 476, layer: 'object', collider: { w: 108, h: 24 }, seat: { dx: 8, dy: -19, facing: 1, pose: 'sit' } },
  { id: 'tea_table', asset: H('tea_table'), x: 540, y: 466, layer: 'object', collider: { w: 118, h: 18 } },
  { id: 'cactus', asset: H('cactus'), x: 868, y: 566, layer: 'object', collider: { w: 34, h: 10 } },
  { id: 'monstera', asset: H('monstera'), x: 966, y: 576, layer: 'object', collider: { w: 96, h: 26 } },
];

/** Spawn just inside the door. */
export const HOME_SPAWN = { x: 960, y: 300 };
