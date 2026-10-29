// Gen's sale intent -> verified fish, server prices, paid bits and Book in ONE player/log transaction.
import { COOLER, SALE, SELL } from '../../src/game/economy/economyConfig.js';
import { FREE_BY_ID } from '../../src/game/fishing/freeFishCatalog.js';
import { FISHING_DECK } from '../../src/game/fishing/deckConfig.js';
import { rollDeckCatch } from '../../src/game/fishing/deckRoll.js';
import type { CatchTicket } from '../../src/game/fishing/catchTicket.js';
import { iceMinutesFor, freshnessOf, isSellableFish, marketOf, quoteFish } from '../../src/game/economy/market.js';
import type { SellLine } from '../../src/game/economy/wallet.js';
import { fishingDeckSeed } from '../fishing/deck.js';
import { DeckRedemptionError, checkRedemptionWindow, markPaidTickets } from './deckRedemptions.js';
import { FishBookError, recordVerifiedPaidFish } from './fishBook.js';
import { checkedCoinBalance, LIMITS, SaveError } from './rules.js';
import type { PlayerDoc } from './rules.js';

export const SALE_LINES = {
  spoiled: 'That one went bad on the way.',
  daily_cap: 'My ice boxes are full for today. Come back tomorrow!',
  tier_cap: 'I can’t take another trophy today',
} as const;
export interface SaleCatch { fish: string; sizeCm: number | null; caughtAt: number; ticket?: CatchTicket }
export interface SaleContext { now: number; address: string; secret: string; redeemFromDeckId: number }
export interface KeptSaleLine { index: number; caughtAt: number; reason: keyof typeof SALE_LINES; message: string }
export interface SoldSaleLine extends SellLine { index: number; sizeCm: number; caughtAt: number; isWanted: boolean }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k));

/** Bounded wire shape only. Semantic checks happen AFTER receipt lookup so exact retries survive time/config changes. */
export function parseSaleCatches(raw: unknown): SaleCatch[] {
  // v1 wire bound stays fixed even if a later cooler policy shrinks; replay comes before capacity.
  const wireMax = 20;
  if (!Array.isArray(raw) || !raw.length || raw.length > wireMax) throw new SaveError(400, 'Invalid catch list.');
  return raw.map(c => {
    if (!object(c) || !keys(c, Object.hasOwn(c, 'ticket') ? ['fish', 'sizeCm', 'caughtAt', 'ticket'] : ['fish', 'sizeCm', 'caughtAt'])
      || typeof c.fish !== 'string' || c.fish.length > 40 || !(c.sizeCm === null || typeof c.sizeCm === 'number' && Number.isFinite(c.sizeCm))
      || !Number.isSafeInteger(c.caughtAt)) throw new SaveError(400, 'Invalid catch.');
    const t = c.ticket;
    if (t !== undefined && (!object(t) || !keys(t, ['version', 'deckId', 'castIndex', 'castInfo', 'castAt'])
      || !['version', 'deckId', 'castIndex', 'castAt'].every(k => Number.isSafeInteger(t[k]))
      || !object(t.castInfo) || !keys(t.castInfo, ['distance', 'nice'])
      || typeof t.castInfo.distance !== 'number' || !Number.isFinite(t.castInfo.distance) || typeof t.castInfo.nice !== 'boolean')) throw new SaveError(400, 'Invalid catch ticket.');
    return { fish: c.fish, sizeCm: c.sizeCm as number | null, caughtAt: c.caughtAt as number,
      ...(t === undefined ? {} : { ticket: structuredClone(t) as unknown as CatchTicket }) };
  });
}
function redemptionError(error: unknown): never {
  if (error instanceof DeckRedemptionError) {
    if (error.code === 'already_paid') throw new SaveError(409, "I've already paid for that catch.");
    if (error.code === 'invalid_state' || error.code === 'inactive') throw new SaveError(503, 'Fishing sales are unavailable right now. Try again later.');
    throw new SaveError(422, `I can't take that catch: ${error.code}.`);
  }
  if (error instanceof FishBookError) throw new SaveError(503, 'Your Fish Book needs checking. Please try again later.');
  throw error;
}

/** One authenticity entry point. Only the owner's reconstructed roll is priced/recorded. */
export function validateSaleCatch(c: SaleCatch, context: SaleContext & { iceUsedAt: readonly number[] }) {
  const ticket = c.ticket;
  if (!ticket) throw new SaveError(422, "That catch has no fishing ticket. It can't be sold or added to the Fish Book.");
  try { checkRedemptionWindow(ticket, context); } catch (error) { redemptionError(error); }
  if (!Number.isSafeInteger(c.caughtAt) || !Number.isSafeInteger(ticket.castAt) || ticket.castAt < 0
    || Math.floor(ticket.castAt / FISHING_DECK.windowMs) !== ticket.deckId
    || c.caughtAt < ticket.castAt || c.caughtAt - ticket.castAt > FISHING_DECK.maxCastDurationMs
    || c.caughtAt > context.now + SALE.clockSkewMs) throw new SaveError(422, "I can't take that catch: invalid fishing time.");
  let roll;
  try { roll = rollDeckCatch({ ...ticket, seed: fishingDeckSeed(context.address, ticket.version, ticket.deckId, context.secret) }); }
  catch { throw new SaveError(422, "I can't take that catch: invalid fishing ticket."); }
  if (roll.fish !== c.fish || roll.sizeCm !== c.sizeCm) throw new SaveError(422, "That fish doesn't match its fishing ticket.");
  const fish = FREE_BY_ID[roll.fish];
  if (!isSellableFish(fish) || roll.sizeCm === null) throw new SaveError(422, "That one isn't for the shop.");
  return { fish: roll.fish, sizeCm: roll.sizeCm, caughtAt: c.caughtAt, ticket,
    spoiled: !freshnessOf(c.caughtAt, iceMinutesFor(c.caughtAt, context.iceUsedAt), context.now) };
}

export function applySale(doc: PlayerDoc, catches: SaleCatch[], context: SaleContext) {
  const { now } = context;
  const capacity = COOLER.baseSlots + COOLER.upgradeSlots * doc.coolerLevel;
  if (catches.length > capacity) throw new SaveError(422, "That's more fish than your cooler holds.");
  const ordered = catches.map((c, index) => ({ c: validateSaleCatch(c, { ...context, iceUsedAt: doc.iceUsedAt }), index }))
    .sort((a, b) => a.c.caughtAt - b.c.caughtAt);
  // Pure dry run validates ALL identities, even kept lines. Never persist this provisional bitmap.
  try { markPaidTickets(doc.paidDecks, ordered.map(({ c }) => c.ticket), context); } catch (error) { redemptionError(error); }
  const market = marketOf(now), soldToday = { ...doc.econ.soldToday };
  const tierSold = { common: 0, rare: 0, epic: 0, legend: 0, god: 0 };
  for (const [id, count] of Object.entries(soldToday)) tierSold[FREE_BY_ID[id].tier] += count;
  let soldCount = Object.values(soldToday).reduce((sum, n) => sum + n, 0), earned = 0;
  const sold: SoldSaleLine[] = [], keptLines: KeptSaleLine[] = [];
  const paidTickets: CatchTicket[] = [];
  for (const { index, c } of ordered) {
    const tier = FREE_BY_ID[c.fish].tier, cap = FISHING_DECK.dailySaleLimits[tier];
    const quote = quoteFish({ fishId: c.fish, sizeCm: c.sizeCm, caughtAt: c.caughtAt, icedMin: iceMinutesFor(c.caughtAt, doc.iceUsedAt) }, now, market, soldToday[c.fish] ?? 0)!;
    const reason = c.spoiled ? 'spoiled' : cap !== null && tierSold[tier] >= cap ? 'tier_cap'
      : doc.econ.earnedToday + earned + quote.price > SELL.dailyCap || soldCount >= LIMITS.catchesPerDay ? 'daily_cap' : null;
    if (reason) { keptLines.push({ index, caughtAt: c.caughtAt, reason, message: SALE_LINES[reason] }); continue; }
    sold.push({ ...quote, uid: `${c.ticket.version}:${c.ticket.deckId}:${c.ticket.castIndex}`, capped: false, index, sizeCm: c.sizeCm, caughtAt: c.caughtAt, isWanted: quote.wanted > 1 });
    paidTickets.push(c.ticket); earned += quote.price; soldCount++; tierSold[tier]++;
    soldToday[c.fish] = (soldToday[c.fish] ?? 0) + 1;
  }
  if (!sold.length) throw new SaveError(422, keptLines[0].message, {
    result: { sold, earned: 0, kept: keptLines.length, keptLines, balanceAfter: doc.coins, pricedAt: now, marketDay: market.day },
  });
  const balanceAfter = checkedCoinBalance(doc.coins + earned);
  let paidDecks, fishBook;
  try {
    paidDecks = markPaidTickets(doc.paidDecks, paidTickets, context);
    fishBook = recordVerifiedPaidFish(doc.fishBook, sold.map(line => ({ fishId: line.fishId, sizeCm: line.sizeCm })));
  } catch (error) { redemptionError(error); }
  const fields: Partial<PlayerDoc> = { coins: balanceAfter, econ: { ...doc.econ, soldToday, earnedToday: doc.econ.earnedToday + earned }, paidDecks, fishBook };
  const changes = { sold, earned, kept: keptLines.length, keptLines, balanceAfter, pricedAt: now, marketDay: market.day };
  return { fields, changes };
}
