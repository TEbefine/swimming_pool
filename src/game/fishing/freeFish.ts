// FREE FISHING — just for fun with friends, separate from the story (no energy, no story save).
// The kinds themselves live in freeFishCatalog.ts (pure data, shared with the save server).

import { useSyncExternalStore } from 'react';
import { FishBookStore } from './fishBookState';
export type { FishBook, FishBookEntry } from './fishBookState';
import type { FishTable } from '../story/fishing';
import { DECK_TIERS_V2 } from './deckRollV2';
import { FREE_FISH, thaiSeasonAt } from './freeFishCatalog';
import type { Season } from './freeFishCatalog';

export * from './freeFishCatalog';

const FREE_TIERS = DECK_TIERS_V2.map(t => ({ ...t }));

/** The table for every season at once (test forcing, simulations). */
export const FREE_TABLE: FishTable = {
  species: FREE_FISH,
  // order = rarest first … lowest tier last (the lowest tier is never dampened by zone fit)
  tiers: FREE_TIERS,
};

/** Thai season for a date, by the Bangkok calendar. Test with ?season=hot|rainy|cool. */
export function thaiSeason(now: Date = new Date()): Season {
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('season');
    if (q === 'hot' || q === 'rainy' || q === 'cool') return q;
  }
  return thaiSeasonAt(now.getTime());
}

/** What can bite right now: fish without a season, plus this season's fish. (Day/night is checked in the roll.) */
export function freeTableNow(season: Season = thaiSeason()): FishTable {
  return { species: FREE_FISH.filter((f) => !f.season || f.season === season), tiers: FREE_TIERS };
}

/** Messages found in bottles (fun, random). */
export const BOTTLE_NOTES = [
  'If you find this, the tide remembers you.',
  'Dear finder: the café makes the best cocoa. Tell no one.',
  'I caught a fish THIS big. You had to be there.',
  'Be kind today. That is the whole message.',
  'Treasure is under the third lamp. (It is not. Sorry.)',
  'Whoever reads this: you are doing better than you think.',
];

export function freeIcon(id: string): string {
  return `/sprites/fish/${id}.webp`;
}

// ---- the verified, read-only Fish Book -------------------------------------------------------
const IS_TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');
const store = new FishBookStore({
  get: key => localStorage.getItem(key), set: (key, value) => localStorage.setItem(key, value), remove: key => localStorage.removeItem(key),
});
export function getFishBook() { return store.get(); }
export function useFishBook() { return useSyncExternalStore(fn => store.subscribe(fn), () => store.get(), () => store.get()); }
export function attachFishBook(address: string | null) { store.attach(IS_TEST ? null : address); }
export function receiveFishBook(address: string | null, view: Record<string, unknown>) { if (!IS_TEST) store.receive(address, view); }

export function resetVerifiedBook(address: string) { store.reset(address); }
