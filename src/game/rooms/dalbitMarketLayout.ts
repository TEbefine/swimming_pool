// Dalbit · Dock & market (story world #1, Prologue Day 1 "Market day" + Day 2).
// GREY-BOX: background made by scripts/make_market_greybox.py (plain labelled boxes, 1024×576,
// sky transparent above the sea horizon y≈140). Play Day 1 first, then paint only what it needs.
// When the real painting comes, keep these rects (or move them to match the art).

import type { Rect } from '../types';

export const DALBIT_MARKET_ACTOR_SCALE = 1;

/** Where you can walk: the sandy market ground. */
export const dalbitMarketGround: Rect[] = [
  { x: 0, y: 300, width: 1024, height: 262 },
  { x: 232, y: 300, width: 364, height: 22 },
];

/** Stalls, carts and people you bump into (feet boxes). */
export const dalbitMarketObstacles: Rect[] = [
  { x: 20, y: 168, width: 212, height: 136 },    // inn wall
  { x: 262, y: 180, width: 206, height: 124 },   // rice shop
  { x: 486, y: 236, width: 58, height: 80 },     // rice price board
  { x: 596, y: 226, width: 276, height: 96 },    // Gu's stall
  { x: 872, y: 222, width: 152, height: 80 },    // dock edge / water
  { x: 170, y: 420, width: 120, height: 56 },    // yeot cart
  { x: 118, y: 300, width: 24, height: 20 },     // innkeeper
  { x: 353, y: 302, width: 24, height: 18 },     // rice seller
  { x: 722, y: 322, width: 24, height: 18 },     // Master Gu
  { x: 304, y: 466, width: 24, height: 18 },     // yeot seller
];

/** Walk off the left edge → the shore path (home / river mouth). */
export const DALBIT_MARKET_EXIT: [number, number, number, number] = [0, 380, 8, 80];
