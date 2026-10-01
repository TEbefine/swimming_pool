// Dalbit · Dock & market (story world #1, Prologue Day 1 "Market day" + Day 2). Painted postcard, POOL size (1×).
// Background: /maps/dalbit/market.webp (1024×576, sky TRANSPARENT above the sea horizon y≈131).
// Source painting: ChatGPT 2026-09-30 (src/assets/dalbit_market_src.webp; spare: dalbit_market_src_b.webp).
// Back row (painted): inn back door (x≈68–128), rice shop (x≈262–510), Master Gu's stall (x≈545–812) with the
// red seal banner, dock + boat top-right. The sand below y≈292 is open; props stand on it as depth-sorted
// (keep people and props above y≈450: on desktop the emote bar covers the bottom of the screen),
// elements (cut from src/assets/dalbit_market_props_sheet.webp by scripts/process_props_sheet.py).

import type { ElementDef, Rect } from '../types';

export const DALBIT_MARKET_ACTOR_SCALE = 1;

const E = (name: string) => `/maps/dalbit/market/${name}.webp`;

/** Where you can walk: the open sand in front of the shops. */
export const dalbitMarketGround: Rect[] = [
  { x: 0, y: 292, width: 1024, height: 262 },
];

/** Feet of the people standing at their stalls (the props have their own colliders). */
export const dalbitMarketObstacles: Rect[] = [
  { x: 88, y: 292, width: 24, height: 12 },     // innkeeper
  { x: 328, y: 294, width: 24, height: 12 },    // rice seller
  { x: 668, y: 296, width: 24, height: 12 },    // Master Gu
  { x: 288, y: 408, width: 24, height: 12 },    // yeot seller
];

/** Props on the sand (walk behind them). x/y = bottom-centre. */
export const dalbitMarketElements: ElementDef[] = [
  { id: 'signpost', asset: E('signpost'), x: 40, y: 372, layer: 'object', collider: { w: 14, h: 8 } },       // points left: to the river
  { id: 'water_barrel', asset: E('water_barrel'), x: 212, y: 318, layer: 'object', collider: { w: 40, h: 12 } },
  { id: 'onggi_jar', asset: E('onggi_jar'), x: 252, y: 314, layer: 'object', collider: { w: 40, h: 12 } },
  { id: 'rice_board', asset: E('rice_board'), x: 530, y: 320, layer: 'object', collider: { w: 50, h: 10 } },   // the price board (Read)
  { id: 'basket_full', asset: E('basket_full'), x: 606, y: 320, layer: 'object', collider: { w: 50, h: 12 } },
  { id: 'basket_empty', asset: E('basket_empty'), x: 762, y: 320, layer: 'object', collider: { w: 46, h: 12 } },
  { id: 'rope', asset: E('rope'), x: 880, y: 308, layer: 'object', collider: { w: 44, h: 10 } },
  { id: 'crates', asset: E('crates'), x: 942, y: 326, layer: 'object', collider: { w: 66, h: 16 } },
  { id: 'oars', asset: E('oars'), x: 1000, y: 308, layer: 'object', collider: { w: 30, h: 10 } },
  { id: 'lantern_w', asset: E('lantern'), x: 150, y: 392, layer: 'object', collider: { w: 14, h: 8 } },
  { id: 'lantern_e', asset: E('lantern'), x: 884, y: 420, layer: 'object', collider: { w: 14, h: 8 } },
  { id: 'yeot_cart', asset: E('yeot_cart'), x: 232, y: 416, layer: 'object', collider: { w: 96, h: 14 } },
  { id: 'bench', asset: E('bench'), x: 566, y: 430, layer: 'object', collider: { w: 74, h: 10 }, seat: { dx: 0, dy: -12, facing: 1 } },
  { id: 'drying_rack', asset: E('drying_rack'), x: 800, y: 446, layer: 'object', collider: { w: 86, h: 10 } },
  { id: 'clam_mat', asset: E('clam_mat'), x: 420, y: 452, layer: 'floor' },
];

/** Walk off the left edge → the shore path back to the river mouth (and home past it). */
export const DALBIT_MARKET_EXIT: [number, number, number, number] = [0, 380, 8, 80];
