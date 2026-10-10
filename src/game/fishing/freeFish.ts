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

// ---- the Fish Book (collection) -------------------------------------------------------------
// Guest (no Player ID, or ?test=...): saved in this browser, every catch counts at once.
// With a Player ID (ID-01 c): the book comes from the server. New catches wait in a PENDING list on
// this device until the player shows them to a Fishing Guide (Nami / Kai), who records them through
// /api/items (game/saves/cloud.ts). The book shown = the server book + the pending catches.
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
export interface PendingCatch { fish: string; sizeCm: number | null; caughtAt: number }

const IS_TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');
// test mode (?test=...) keeps its own book so testing never fills the real one
const KEY = IS_TEST ? 'free_fishing_book_test' : 'free_fishing_book_v1';
const pendingKey = (address: string) => `free_fishing_pending_v1_${address}`;
const pendingOpKey = (address: string) => `free_fishing_pending_op_v1_${address}`;
const EMPTY: FishBook = { version: 1, entries: {}, total: 0 };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // storage blocked — start fresh for this visit
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
function loadLocal(): FishBook {
  const d = readJson<FishBook>(KEY);
  return d && d.version === 1 ? d : EMPTY;
}
function validPending(list: unknown): PendingCatch[] {
  if (!Array.isArray(list)) return [];
  return list.filter((c): c is PendingCatch => !!c && typeof c.fish === 'string' && typeof c.caughtAt === 'number' &&
    (c.sizeCm === null || typeof c.sizeCm === 'number'));
}

let localBook: FishBook = loadLocal();
/** The Player ID this book belongs to (null = guest). */
let scope: string | null = null;
let serverBook: FishBook = EMPTY;
let pending: PendingCatch[] = [];
let book: FishBook = localBook;
const listeners = new Set<() => void>();

function withCatch(b: FishBook, c: PendingCatch): FishBook {
  const old = b.entries[c.fish];
  const entry: FishBookEntry = old
    ? { ...old, count: old.count + 1, best: c.sizeCm !== null && (old.best === null || c.sizeCm > old.best) ? c.sizeCm : old.best }
    : { count: 1, best: c.sizeCm, first: c.caughtAt };
  return { ...b, entries: { ...b.entries, [c.fish]: entry }, total: b.total + 1 };
}
function rebuild() {
  book = scope ? pending.reduce(withCatch, serverBook) : localBook;
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
  // caughtAt is the catch's identity on this device: keep it strictly increasing.
  const lastAt = pending.length ? pending[pending.length - 1].caughtAt : 0;
  const c: PendingCatch = { fish: id, sizeCm, caughtAt: Math.max(Date.now(), lastAt + 1) };
  if (scope) {
    pending = [...pending, c];
    writeJson(pendingKey(scope), pending);
  } else {
    localBook = withCatch(localBook, c);
    writeJson(KEY, localBook);
  }
  rebuild();
  return { isNew: !old, record };
}
export function resetFishBook() {
  if (scope) {
    pending = [];
    writeJson(pendingKey(scope), pending);
  } else {
    localBook = EMPTY;
    writeJson(KEY, localBook);
  }
  rebuild();
}

// ---- Player ID hooks (called by game/saves/cloud.ts only) --------------------------------------
/** Switch the book to a Player ID (with the server's book) or back to the guest book (null). */
export function attachFishBook(address: string | null, server?: { entries: Record<string, FishBookEntry>; total: number }) {
  if (IS_TEST) return;
  scope = address;
  serverBook = server ? { version: 1, entries: server.entries, total: server.total } : EMPTY;
  pending = address ? validPending(readJson(pendingKey(address))) : [];
  rebuild();
}
/** Catches waiting for a Fishing Guide (oldest first). */
export function getPendingCatches(): PendingCatch[] {
  if (!scope) return [];
  const seen = new Set<number>();
  return [...pending].sort((a, b) => a.caughtAt - b.caughtAt).filter((c) => !seen.has(c.caughtAt) && !!seen.add(c.caughtAt));
}
export function usePendingCount(): number {
  useFishBook();
  return scope ? pending.length : 0;
}
/** The operation id a chunk was sent with, kept so a retry after a lost answer replays instead of failing. */
export function pendingOperation(address: string, chunkKey: string, fresh: () => string): string {
  const stored = readJson<{ key: string; id: string }>(pendingOpKey(address));
  if (stored && stored.key === chunkKey && typeof stored.id === 'string') return stored.id;
  const id = fresh();
  writeJson(pendingOpKey(address), { key: chunkKey, id });
  return id;
}
/** After the server accepted (or finally refused) some catches: drop them and show the new server book.
 *  `forAddress` guards against an answer arriving after the player switched to another Player ID. */
export function settlePendingCatches(done: PendingCatch[], server?: { entries: Record<string, FishBookEntry>; total: number }, forAddress?: string) {
  if (!scope || (forAddress !== undefined && forAddress !== scope)) return;
  if (done.length) writeJson(pendingOpKey(scope), null);
  const gone = new Set(done.map((c) => `${c.fish}@${c.caughtAt}`));
  pending = pending.filter((c) => !gone.has(`${c.fish}@${c.caughtAt}`));
  writeJson(pendingKey(scope), pending);
  if (server) serverBook = { version: 1, entries: server.entries, total: server.total };
  rebuild();
}
