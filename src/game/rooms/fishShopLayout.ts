// Harbour Fish Shop — the walkway in front of Gen's shop, next to Quiet Bay. POOL size (1×), like the bay.
// Background: /maps/fish_shop.webp (1024×576, sky TRANSPARENT above the hills, y ≤ ~101).
// Source painting: ChatGPT 2026-10-26 (src/assets/fish_shop_src.webp, Teera picked the bigger shop);
// keyed with scripts/process_fish_shop.py. The walkway (feet y 340–404) matches the bay's breakwater.

import type { NpcWander, Rect } from '../types';

/** The paved walkway between the shop and the harbour wall. */
export const fishShopWalk: Rect[] = [
  { x: 6, y: 340, width: 1012, height: 65 },
];

/** Painted things you bump into (their bottoms are the depth line). */
export const fishShopObstacles: Rect[] = [
  { x: 86, y: 322, width: 168, height: 18 },   // blue crates, table and stools
  { x: 704, y: 330, width: 48, height: 16 },   // menu board
  { x: 896, y: 330, width: 128, height: 18 },  // stone planter + pine
];

/** Gen stands at the fish display (left), Minato at the sashimi tray (right). Both in FRONT of the
 *  counter, facing the walkway; you talk to them from the walkway side. */
export const GEN_SPOT = { x: 420, y: 352 };
export const MINATO_SPOT = { x: 616, y: 352 };

/** Gen barely moves: he is watching his fish. (A tiny post, so talking to him walks you to his side.) */
export const GEN_POST: NpcWander = {
  area: { x: 414, y: 351, width: 12, height: 2 },
  speed: 12,
  pauseMs: [7000, 14000],
  idlePoses: ['idle', 'proud', 'thinking', 'idle', 'hold_fish'],
};

/** Minato steps around a little in front of his tray (Gen stays put: he's watching the fish). */
export const MINATO_STROLL: NpcWander = {
  area: { x: 590, y: 350, width: 70, height: 6 },
  speed: 22,
  pauseMs: [5000, 11000],
  idlePoses: ['idle', 'arms_crossed', 'idle', 'headband', 'thinking'],
};

/** Walk off the right edge → back to Quiet Bay. */
export const FISH_SHOP_EXIT: [number, number, number, number] = [1004, 340, 20, 65];
