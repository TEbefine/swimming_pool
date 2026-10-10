// FREE FISHING — just for fun with friends, separate from the story (no energy, no story save).
// The kinds themselves live in freeFishCatalog.ts (pure data, shared with the save server).

import { useSyncExternalStore } from 'react';
import type { FishTable } from '../story/fishing';
import { FREE_FISH, TIERS, thaiSeasonAt } from './freeFishCatalog';
import type { FreeTier, Season } from './freeFishCatalog';

export * from './freeFishCatalog';

const FREE_TIERS = (['god', 'legend', 'epic', 'rare', 'common'] as FreeTier[]).map((t) => ({ id: t, weight: TIERS[t].weight, nice: TIERS[t].nice, weak: TIERS[t].weak }));

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

// ---- the Fish Book (collection), saved per browser ----------------------------------------
export interface FishBookEntry {
  count: number;
  best: number | null; // cm
  first: number; // timestamp of the first catch
}
export interface FishBook {
  version: 1;
  entries: Record<string, FishBookEntry>;
  total: number;
}

// test mode (?test=...) keeps its own book so testing never fills the real one
const KEY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test')
  ? 'free_fishing_book_test'
  : 'free_fishing_book_v1';
function load(): FishBook {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as FishBook;
      if (d.version === 1) return d;
    }
  } catch {
    // storage blocked — start fresh for this visit
  }
  return { version: 1, entries: {}, total: 0 };
}
let book: FishBook = load();
const listeners = new Set<() => void>();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}
export function getFishBook(): FishBook {
  return book;
}
export function useFishBook(): FishBook {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => book, () => book);
}
/** Add a catch. Returns { isNew: first ever of this kind, record: beat the best size }. */
export function addToFishBook(id: string, sizeCm: number | null): { isNew: boolean; record: boolean } {
  const old = book.entries[id];
  const record = !!old && sizeCm !== null && (old.best === null || sizeCm > old.best);
  const entry: FishBookEntry = old
    ? { ...old, count: old.count + 1, best: sizeCm !== null && (old.best === null || sizeCm > old.best) ? sizeCm : old.best }
    : { count: 1, best: sizeCm, first: Date.now() };
  book = { ...book, entries: { ...book.entries, [id]: entry }, total: book.total + 1 };
  save();
  return { isNew: !old, record };
}
export function resetFishBook() {
  book = { version: 1, entries: {}, total: 0 };
  save();
}
