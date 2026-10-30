// Verified Fish Book configuration. This does not change the deck roll or global minigame tuning.
import { DECK_SPECIES_V1 } from './deckRollV1.js';
import { FREE_BY_ID } from './freeFishCatalog.js';
import { isSellableFish } from '../economy/market.js';

export const FISH_BOOK = Object.freeze({
  starSales: Object.freeze({ common: 25, rare: 12, epic: 6, legend: 3 }),
  strikeWindowMultiplier: 1.15,
});
export type FishBookTier = keyof typeof FISH_BOOK.starSales;
export interface FishBookKind {
  readonly id: string;
  readonly tier: FishBookTier;
  readonly size: readonly [number, number];
}
// Only ready, supported-deck, sellable kinds. Do not filter completion by current hour/season/caps.
export const FISH_BOOK_KINDS: readonly FishBookKind[] = Object.freeze(DECK_SPECIES_V1.flatMap((fish) => {
  if (!fish.size || fish.tier === 'god' || !isSellableFish(FREE_BY_ID[fish.id])) return [];
  return [Object.freeze({ id: fish.id, tier: fish.tier, size: Object.freeze([...fish.size]) as readonly [number, number] })];
}));
export const FISH_BOOK_BY_ID: Readonly<Record<string, FishBookKind>> = Object.freeze(
  Object.fromEntries(FISH_BOOK_KINDS.map((fish) => [fish.id, fish])),
);
