// THE MARKET — pure price maths for selling fish to Gen. No React, no storage, no clock of its own:
// every function takes `now` (ms), so the game, the tests and later the save server get the same answer.
//
// price = tierBase × size × freshness × wanted × glut   (rounded, at least SELL.minPrice)

import { FREE_BY_ID, FREE_FISH, thaiSeasonAt } from '../fishing/freeFishCatalog.js';
import type { FreeFish } from '../fishing/freeFishCatalog.js';
import { FRESH, SELL, SHOP } from './economyConfig.js';
import { SHOP_ITEMS } from './shopCatalog.js';

const DAY_MS = 86_400_000;
const BKK_OFFSET_MS = 7 * 3_600_000; // Bangkok = UTC+7, no daylight saving

/** Bangkok calendar day number (changes at midnight Bangkok time). Same formula as the gift spec. */
export function bkkDay(ms: number): number {
  return Math.floor((ms + BKK_OFFSET_MS) / DAY_MS);
}

/** Can Gen buy this catch? Real catches with a size only: no protected animals (released),
 *  no God-tier trophies, no treasure (bottle, chest, fossil stone have no size). */
export function isSellableFish(f: FreeFish | undefined): f is FreeFish {
  return !!f && !f.release && !!f.size && SELL.tierBase[f.tier] > 0;
}

// ---- seeded randomness: every player sees the same market on the same day --------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(list: T[], n: number, rand: () => number): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

export interface MarketDay {
  day: number;
  /** Species Gen pays extra for today. */
  wanted: string[];
  /** Today's special plate (cheaper), or null. */
  special: string | null;
}

/** The market of a Bangkok day. `now` only decides the season (wanted fish must be catchable now). */
export function marketOf(now: number): MarketDay {
  const day = bkkDay(now);
  const season = thaiSeasonAt(now);
  // wanted: everyday kinds (common/rare) that can bite in this season, so anyone can chase them
  const candidates = FREE_FISH
    .filter((f) => isSellableFish(f) && (f.tier === 'common' || f.tier === 'rare') && (!f.season || f.season === season))
    .map((f) => f.id);
  const rand = mulberry32(day * 2654435761);
  const wanted = pick(candidates, SELL.wantedPerDay, rand);
  const plates = SHOP_ITEMS.filter((i) => i.category === 'sashimi' && !i.dailyLimit && !i.soon).map((i) => i.id);
  const special = pick(plates, 1, rand)[0] ?? null;
  return { day, wanted, special };
}

// ---- freshness ------------------------------------------------------------------------------
export interface Freshness {
  id: string;
  label: string;
  mult: number;
  /** Minutes until it spoils. */
  leftMin: number;
  /** 1 = just caught … 0 = about to spoil (for the icon fade). */
  ratio: number;
}

/** Freshness of a catch (null = spoiled, it is gone). `icedMin` = minutes of ice it got. */
export function freshnessOf(caughtAt: number, icedMin: number, now: number): Freshness | null {
  const ageMin = Math.max(0, (now - caughtAt) / 60_000 - icedMin);
  for (const b of FRESH.bands) {
    if (ageMin < b.untilMin) {
      return { id: b.id, label: b.label, mult: b.mult, leftMin: FRESH.lifetimeMin - ageMin, ratio: 1 - ageMin / FRESH.lifetimeMin };
    }
  }
  return null;
}

/** ×sizeMin for the smallest of its kind … ×sizeMax for the biggest. */
export function sizeFactor(f: FreeFish, sizeCm: number | null): number {
  if (!f.size || sizeCm === null) return 1;
  const [lo, hi] = f.size;
  const t = hi > lo ? Math.min(1, Math.max(0, (sizeCm - lo) / (hi - lo))) : 0.5;
  return SELL.sizeMin + (SELL.sizeMax - SELL.sizeMin) * t;
}

/** Supply and demand: `soldBefore` = fish of this species already sold today. */
export function glutFactor(soldBefore: number): number {
  return Math.max(SELL.glutFloor, SELL.glutStep ** soldBefore);
}

/** Every part of one fish's price, so the shop can SHOW why (players learn by seeing it). */
export interface FishQuote {
  fishId: string;
  base: number;
  size: number;
  fresh: Freshness;
  wanted: number;
  glut: number;
  price: number;
}

/** Price of one catch, or null if Gen won't take it (not sellable, or spoiled). */
export function quoteFish(
  c: { fishId: string; sizeCm: number | null; caughtAt: number; icedMin: number },
  now: number,
  market: MarketDay,
  soldBefore: number,
): FishQuote | null {
  const f = FREE_BY_ID[c.fishId];
  if (!isSellableFish(f)) return null;
  const fresh = freshnessOf(c.caughtAt, c.icedMin, now);
  if (!fresh) return null;
  const base = SELL.tierBase[f.tier];
  const size = sizeFactor(f, c.sizeCm);
  const wanted = market.wanted.includes(f.id) ? SELL.wantedBonus : 1;
  const glut = glutFactor(soldBefore);
  const price = Math.max(SELL.minPrice, Math.round(base * size * fresh.mult * wanted * glut));
  return { fishId: f.id, base, size, fresh, wanted, glut, price };
}

/** Today's price of a shop item for this player (special discount; the cooler price grows per level). */
export function itemPrice(id: string, market: MarketDay, coolerLevel: number, coolerPrices: readonly number[]): number | null {
  const it = SHOP_ITEMS.find((i) => i.id === id);
  if (!it || it.soon) return null;
  if (it.use === 'cooler_upgrade') return coolerPrices[coolerLevel] ?? null; // null = already the biggest
  return market.special === id ? Math.round(it.price * SHOP.specialFactor) : it.price;
}
