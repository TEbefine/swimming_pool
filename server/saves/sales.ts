// ECO-02(b): server-owned sale intent -> fields + immutable receipt, inside the caller's transaction.
// No cooler, no Fish Book mutation, no client prices/ice. ECO-03 extends validateSaleCatch below.
import { COOLER, SALE, SELL } from '../../src/game/economy/economyConfig.js';
import { FREE_BY_ID } from '../../src/game/fishing/freeFishCatalog.js';
import { freshnessOf, isSellableFish, marketOf, quoteFish } from '../../src/game/economy/market.js';
import type { SellLine } from '../../src/game/economy/wallet.js';
import { catchProblem, checkedCoinBalance, LIMITS, SaveError } from './rules.js';
import type { Catch, PlayerDoc } from './rules.js';

export const SALE_LINES = {
  spoiled: 'That one went bad on the way.',
  daily_cap: 'My ice boxes are full for today. Come back tomorrow!',
  sold_set_full: "My notebook is full for now. Keep those fish; try again shortly.",
} as const;
export interface KeptSaleLine {
  index: number;
  caughtAt: number;
  reason: 'spoiled' | 'daily_cap';
  message: string;
}
export interface SoldSaleLine extends SellLine {
  index: number;
  sizeCm: number | null;
  caughtAt: number;
  isWanted: boolean;
}

/** Single authenticity entry point: ECO-03 can add deckId/castIndex verification here.
 * Older catches are judged by freshness instead of the Fish Book's seven-day recording window.
 * All impossible claims throw; valid-but-spoiled catches are kept, not fatal to the batch. */
export function validateSaleCatch(c: Catch, context: { now: number; recentSoldAt: readonly number[]; previous: number | null }): 'spoiled' | null {
  const problem = catchProblem(c, context.now, { clockSkewMs: SALE.clockSkewMs, maxCatchAgeMs: Infinity });
  if (problem) throw new SaveError(422, `I can't take that catch: ${problem}.`);
  if (!isSellableFish(FREE_BY_ID[c.fish])) throw new SaveError(422, "That one isn't for the shop. It belongs in your Fish Book.");
  if (context.recentSoldAt.includes(c.caughtAt)) throw new SaveError(409, "I've already paid for that catch.");
  if ((context.previous !== null && c.caughtAt - context.previous < LIMITS.minCatchGapMs)
    || context.recentSoldAt.some(at => Math.abs(c.caughtAt - at) < LIMITS.minCatchGapMs)) {
    throw new SaveError(422, "Those catches came too close together. I can't take them.");
  }
  // Stage (c) will derive this extension from server-owned ice events, never from the request.
  return freshnessOf(c.caughtAt, 0, context.now) ? null : 'spoiled';
}

export function applySale(doc: PlayerDoc, catches: Catch[], now: number) {
  const capacity = COOLER.baseSlots + COOLER.upgradeSlots * doc.coolerLevel;
  if (catches.length > capacity) throw new SaveError(422, "That's more fish than your cooler holds.");
  if (doc.recentSoldAt.length >= SALE.maxRecentSold) throw new SaveError(409, SALE_LINES.sold_set_full);
  // Validate the ENTIRE batch before pricing. An impossible last catch cannot sell the first ones.
  const spoiled = catches.map((c, index) => validateSaleCatch(c, {
    now, recentSoldAt: doc.recentSoldAt, previous: index ? catches[index - 1].caughtAt : null,
  }));
  const market = marketOf(now);
  const soldToday = { ...doc.econ.soldToday };
  let soldCount = Object.values(soldToday).reduce((sum, n) => sum + n, 0);
  let earned = 0;
  const sold: SoldSaleLine[] = [];
  const keptLines: KeptSaleLine[] = [];
  for (const [index, c] of catches.entries()) {
    if (spoiled[index]) {
      keptLines.push({ index, caughtAt: c.caughtAt, reason: 'spoiled', message: SALE_LINES.spoiled });
      continue;
    }
    const quote = quoteFish({ fishId: c.fish, sizeCm: c.sizeCm, caughtAt: c.caughtAt, icedMin: 0 }, now, market, soldToday[c.fish] ?? 0)!;
    if (doc.econ.earnedToday + earned + quote.price > SELL.dailyCap || soldCount >= LIMITS.catchesPerDay) {
      keptLines.push({ index, caughtAt: c.caughtAt, reason: 'daily_cap', message: SALE_LINES.daily_cap });
      continue;
    }
    sold.push({ ...quote, uid: String(c.caughtAt), capped: false, index, sizeCm: c.sizeCm, caughtAt: c.caughtAt, isWanted: quote.wanted > 1 });
    earned += quote.price;
    soldToday[c.fish] = (soldToday[c.fish] ?? 0) + 1;
    soldCount++;
  }
  if (!sold.length) throw new SaveError(422, keptLines[0].message, {
    result: { sold, earned: 0, kept: keptLines.length, keptLines, balanceAfter: doc.coins, pricedAt: now, marketDay: market.day },
  });
  if (doc.recentSoldAt.length + sold.length > SALE.maxRecentSold) throw new SaveError(409, SALE_LINES.sold_set_full);
  const balanceAfter = checkedCoinBalance(doc.coins + earned);
  const fields: Partial<PlayerDoc> = {
    coins: balanceAfter,
    econ: { ...doc.econ, soldToday, earnedToday: doc.econ.earnedToday + earned },
    recentSoldAt: [...doc.recentSoldAt, ...sold.map(c => c.caughtAt)].sort((a, b) => a - b),
  };
  // commit stores this result verbatim in log.changes. It is never repriced on retry.
  const changes = { sold, earned, kept: keptLines.length, keptLines, balanceAfter, pricedAt: now, marketDay: market.day };
  return { fields, changes };
}
