// Music Club layout. Characters at 2x (same as the café). Background: /maps/club_room.webp (1024×576,
// see-through window). Pieces cut from src/assets/club_elements_sheet.webp, sized with the DOOR as ruler.
// Every element is placed by its BOTTOM-CENTRE (x, y). Move a piece = change x/y; collider/seat/interact follow.
// Stage pieces (y < 300) sit on the stage platform; the stage itself is out of bounds (minY = 300).

import type { ElementDef } from '../types';

export const CLUB_ACTOR_SCALE = 2;

const E = (name: string) => `/sprites/elements/club/${name}.webp`;

export const clubElements: ElementDef[] = [
  // ---- Stage (tonight's instruments; genre swaps will replace these later)
  { id: 'speaker_left', asset: E('speaker'), x: 38, y: 300, layer: 'object', collider: { w: 56, h: 14 } },
  { id: 'piano', asset: E('piano'), x: 150, y: 252, layer: 'object' },
  { id: 'mic', asset: E('mic'), x: 250, y: 258, layer: 'object' },
  { id: 'drums', asset: E('drums'), x: 330, y: 256, layer: 'object' },
  { id: 'double_bass', asset: E('double_bass'), x: 450, y: 256, layer: 'object' },
  { id: 'guitar_amp', asset: E('guitar_amp'), x: 540, y: 256, layer: 'object' },
  { id: 'speaker_right', asset: E('speaker_r'), x: 604, y: 300, layer: 'object', collider: { w: 56, h: 14 } },

  // ---- Bar under the window (city view behind the counter)
  { id: 'bar', asset: E('bar'), x: 786, y: 354, layer: 'object', collider: { w: 300, h: 44 } },
  { id: 'stool_1', asset: E('stool'), x: 700, y: 396, layer: 'object', seat: { dx: 0, dy: -38, facing: 1 } },
  { id: 'stool_2', asset: E('stool'), x: 760, y: 396, layer: 'object', seat: { dx: 0, dy: -38, facing: 1 } },
  { id: 'stool_3', asset: E('stool'), x: 820, y: 396, layer: 'object', seat: { dx: 0, dy: -38, facing: -1 } },
  { id: 'stool_4', asset: E('stool'), x: 880, y: 396, layer: 'object', seat: { dx: 0, dy: -38, facing: -1 } },

  // ---- Two small tables, a chair on each side (chairs face the table)
  { id: 'table_1', asset: E('table'), x: 330, y: 470, layer: 'object', collider: { w: 70, h: 16 } },
  { id: 'chair_1a', asset: E('chair'), x: 256, y: 480, layer: 'object', seat: { dx: 0, dy: -28, facing: 1 } },
  { id: 'chair_1b', asset: E('chair_r'), x: 404, y: 480, layer: 'object', seat: { dx: 0, dy: -28, facing: -1 } },
  { id: 'table_2', asset: E('table'), x: 620, y: 470, layer: 'object', collider: { w: 70, h: 16 } },
  { id: 'chair_2a', asset: E('chair'), x: 546, y: 480, layer: 'object', seat: { dx: 0, dy: -28, facing: 1 } },
  { id: 'chair_2b', asset: E('chair_r'), x: 694, y: 480, layer: 'object', seat: { dx: 0, dy: -28, facing: -1 } },

  // ---- Front booths, corners and extras
  { id: 'booth_left', asset: E('booth'), x: 160, y: 574, layer: 'object', seat: { dx: 0, dy: -36, facing: 1 } },
  { id: 'booth_right', asset: E('booth'), x: 800, y: 574, layer: 'object', seat: { dx: 0, dy: -36, facing: -1 } },
  { id: 'monstera', asset: E('monstera'), x: 44, y: 576, layer: 'object', collider: { w: 70, h: 20 } },
  { id: 'vinyl_shelf', asset: E('vinyl_shelf'), x: 52, y: 424, layer: 'object', collider: { w: 84, h: 14 }, interact: { id: 'vinyl_shelf', label: 'Browse', dx: 0, dy: 26, radius: 60 } },
  { id: 'jukebox', asset: E('jukebox'), x: 968, y: 486, layer: 'object', collider: { w: 84, h: 16 }, interact: { id: 'jukebox', label: 'Music', dx: -10, dy: 26, radius: 60 } },
];

/** The DJ walks the dance floor in front of the stage (all NPC coordinates = feet). */
export const DJ_HOME = { x: 420, y: 340, facing: 1 as const };
export const DJ_WANDER = { x: 160, y: 318, width: 440, height: 70 };

/** Spare pieces (not placed): back_bar (no free wall), neon_frame (planned: tonight's genre sign on the banner). */
