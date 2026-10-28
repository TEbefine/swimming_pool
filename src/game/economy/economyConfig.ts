// FISH SHOP ECONOMY — every number in ONE place. Tune here; the logic has no magic numbers.
// Design doc: docs/tech/fish-economy.md (ECO-01 in AI_CONTEXT.md).
//
// Pure data, no imports except types, so the game, the unit tests and (later) the save server share it.

import type { FreeTier } from '../fishing/freeFishCatalog.js';

/** The town money. One word to change when Teera picks the final name (e.g. "Bia" / เบี้ย). */
export const CURRENCY = { one: 'coin', many: 'coins' } as const;

/**
 * VAT printed on the receipt slip. It is INCLUDED in every shop price (never added on top), and selling fish
 * is not taxed. Today it is shown only; TOWN-01 will move it into the town fund (docs/ai/PROMPT_town.md).
 * Thailand: 7% reduced rate, extended to 30 Sep 2027 (statutory rate 10%).
 */
export const VAT = { rate: 0.07 } as const;

/** What Gen pays for a catch: tierBase × size × freshness × market. */
export const SELL = {
  /** Base price per tier. God-tier catches are trophies: nobody buys them (0 = not for sale). */
  tierBase: { common: 6, rare: 20, epic: 70, legend: 250, god: 0 } as Record<FreeTier, number>,
  /** Smallest of its kind → ×sizeMin, biggest → ×sizeMax (linear in between). */
  sizeMin: 0.8,
  sizeMax: 1.3,
  /** "Gen wants today": this many species per Bangkok day get ×wantedBonus (same for every player). */
  wantedPerDay: 2,
  wantedBonus: 1.5,
  /** Supply and demand: each fish of the SAME species sold earlier today multiplies by glutStep (never below glutFloor). */
  glutStep: 0.9,
  glutFloor: 0.5,
  /** Hard ceiling per player per Bangkok day. Not a pacing tool (glut does that): an anti-cheat ceiling. */
  dailyCap: 5000,
  /** Every sale pays at least this. */
  minPrice: 1,
};

/** Fresh fish die like real fish. Age is measured from the catch, minus any ice. */
export const FRESH = {
  lifetimeMin: 30,
  /** Bands are checked in order: age < untilMin → that band. Older than the last band = spoiled (gone). */
  bands: [
    { id: 'fresh', label: 'Fresh', untilMin: 10, mult: 1 },
    { id: 'good', label: 'Good', untilMin: 20, mult: 0.8 },
    { id: 'tired', label: 'Tired', untilMin: 30, mult: 0.5 },
  ],
  /** One Block of ice keeps every fish in the cooler fresh this much longer… */
  iceExtendMin: 15,
  /** …up to this much ice per fish in total. */
  iceMaxPerFishMin: 30,
} as const;

/** The cooler box: the fish you carry right now. Inventory pressure = the walk back to the shop. */
export const COOLER = {
  baseSlots: 10,
  /** Each upgrade (buy the Cooler box from Gen) adds slots. Price per level, in order. */
  upgradeSlots: 5,
  upgradePrices: [400, 900],
} as const;

/** Goods bought at the shop. Perishable goods take one slot each; others stack in one slot. */
export const BAG = {
  slots: 20,
  /** Most of one stackable item in one slot. */
  maxStack: 20,
} as const;

/** The shop side. */
export const SHOP = {
  /** "Today's special": one sashimi plate per Bangkok day at this price factor (same for everyone). */
  specialFactor: 0.8,
  /** Most items in one order. */
  maxCart: 10,
} as const;

/** Trade history kept on the device (newest last). */
export const LOG_KEEP = 30;

/** ECO-02 persisted economy bounds. No client wallet is imported into the server save. */
export const ECONOMY_SAVE = {
  opsPerDay: 40,
  goodsUidMaxLength: 64,
  /** Balance ceiling = SELL.dailyCap times this many days. */
  balanceCapDays: 400,
} as const;
