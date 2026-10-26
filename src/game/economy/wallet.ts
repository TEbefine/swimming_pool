// THE WALLET — money, the cooler (fish you carry) and the goods bag, as PURE functions.
// Every action takes the wallet + `now` and returns a NEW wallet (or the same one + a reason it failed).
// All-or-nothing: a failed action never half-changes anything. Expiry is checked on read (no timers).
// The same functions will run on the save server later (ECO-01 step 8), so the phone can't cheat.

import { BAG, COOLER, FRESH, LOG_KEEP, SELL, SHOP } from './economyConfig.js';
import { SHOP_BY_ID } from './shopCatalog.js';
import type { Vendor } from './shopCatalog.js';
import { FREE_BY_ID } from '../fishing/freeFishCatalog.js';
import { bkkDay, freshnessOf, isSellableFish, itemPrice, marketOf, quoteFish } from './market.js';
import type { FishQuote, MarketDay } from './market.js';

/** One fish in the cooler. */
export interface CoolerFish {
  uid: string;
  fishId: string;
  sizeCm: number | null;
  caughtAt: number;
  /** Minutes of ice it got (keeps it fresh longer). */
  icedMin: number;
}

/** One bag slot of shop goods. Perishable goods are always qty 1 (each has its own clock). */
export interface Goods {
  uid: string;
  id: string;
  qty: number;
  /** When it was bought (perishable clock). */
  at: number;
}

export interface TradeLog {
  at: number;
  kind: 'sell' | 'buy' | 'use' | 'spoil';
  text: string;
  /** + earned / − spent. */
  coins: number;
}

export interface Wallet {
  version: 1;
  coins: number;
  /** 0 = the starter cooler; each upgrade adds COOLER.upgradeSlots. */
  coolerLevel: number;
  cooler: CoolerFish[];
  goods: Goods[];
  /** The Bangkok day the daily counters below belong to. */
  day: number;
  /** Fish sold today per species (supply and demand). */
  soldToday: Record<string, number>;
  earnedToday: number;
  /** Items bought today (daily limits). */
  boughtToday: Record<string, number>;
  log: TradeLog[];
}

export type Reason =
  | 'not_sellable' | 'cooler_full' | 'nothing_selected' | 'spoiled' | 'daily_cap'
  | 'unknown_item' | 'not_for_sale' | 'wrong_vendor' | 'too_many' | 'daily_limit'
  | 'not_enough_coins' | 'bag_full' | 'cooler_max' | 'nothing_to_cool' | 'cant_use' | 'not_owned';

/** Limits speak in a character's voice, never as error pop-ups. The UI may swap in per-NPC lines. */
export const REASON_LINES: Record<Reason, string> = {
  not_sellable: "That one isn't for the shop. It belongs in your Fish Book.",
  cooler_full: 'Your cooler is full! Sell some fish at the shop first.',
  nothing_selected: 'Pick something first.',
  spoiled: "Hmm… these went bad. Fish don't wait, you know.",
  daily_cap: 'My ice boxes are full for today. Come back tomorrow!',
  unknown_item: "Sorry, that's not on the menu.",
  not_for_sale: "Not for sale yet. Soon, I promise.",
  wrong_vendor: "That's from the other counter.",
  too_many: `That's a lot! ${SHOP.maxCart} things at a time, please.`,
  daily_limit: 'Only so many of those a day. The sea decides, not me.',
  not_enough_coins: 'Not enough coins for that yet.',
  bag_full: 'Your bag is full. Make some room first.',
  cooler_max: "That's already the biggest cooler I have.",
  nothing_to_cool: 'Your cooler is empty. Ice is for fish!',
  cant_use: "You can't use that here.",
  not_owned: "You don't have that.",
};

export type Fail = { ok: false; wallet: Wallet; reason: Reason; item?: string };
export type Ok<T> = { ok: true; wallet: Wallet } & T;
export interface Ctx {
  now: number;
  /** Id maker (tests pass a counter). */
  uid?: () => string;
}

function defaultUid(): string {
  const b = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

const fishName = (id: string) => FREE_BY_ID[id]?.name ?? id;
const itemName = (id: string) => SHOP_BY_ID[id]?.name ?? id;

function withLog(w: Wallet, entry: TradeLog): Wallet {
  return { ...w, log: [...w.log, entry].slice(-LOG_KEEP) };
}

// ---- create, load, settle --------------------------------------------------------------------

export function freshWallet(now: number): Wallet {
  return { version: 1, coins: 0, coolerLevel: 0, cooler: [], goods: [], day: bkkDay(now), soldToday: {}, earnedToday: 0, boughtToday: {}, log: [] };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
function counts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, n] of Object.entries(v)) if (isNum(n) && n > 0) out[k] = Math.floor(n);
  return out;
}

/** Read a stored wallet safely: anything broken or unknown is dropped, never crashes the game. */
export function parseWallet(raw: unknown, now: number): Wallet {
  const base = freshWallet(now);
  if (!raw || typeof raw !== 'object' || (raw as Wallet).version !== 1) return base;
  const r = raw as Partial<Wallet>;
  const cooler = Array.isArray(r.cooler)
    ? r.cooler.filter((c): c is CoolerFish => !!c && isStr(c.uid) && isStr(c.fishId) && isNum(c.caughtAt) && isNum(c.icedMin) && (c.sizeCm === null || isNum(c.sizeCm)))
    : [];
  const goods = Array.isArray(r.goods)
    ? r.goods.filter((g): g is Goods => !!g && isStr(g.uid) && isStr(g.id) && isNum(g.qty) && g.qty > 0 && isNum(g.at) && !!SHOP_BY_ID[g.id])
    : [];
  const log = Array.isArray(r.log) ? r.log.filter((l): l is TradeLog => !!l && isNum(l.at) && isStr(l.text) && isNum(l.coins)).slice(-LOG_KEEP) : [];
  return {
    version: 1,
    coins: isNum(r.coins) && r.coins > 0 ? Math.floor(r.coins) : 0,
    coolerLevel: isNum(r.coolerLevel) ? Math.max(0, Math.min(COOLER.upgradePrices.length, Math.floor(r.coolerLevel))) : 0,
    cooler,
    goods,
    day: isNum(r.day) ? r.day : base.day,
    soldToday: counts(r.soldToday),
    earnedToday: isNum(r.earnedToday) && r.earnedToday > 0 ? Math.floor(r.earnedToday) : 0,
    boughtToday: counts(r.boughtToday),
    log,
  };
}

/** Bring a wallet up to `now`: a new Bangkok day resets the daily counters, spoiled fish and
 *  expired goods are removed. Every action calls this first. */
export function settle(w: Wallet, now: number): { wallet: Wallet; spoiled: CoolerFish[]; expired: Goods[] } {
  let next = w;
  const day = bkkDay(now);
  if (next.day !== day) next = { ...next, day, soldToday: {}, earnedToday: 0, boughtToday: {} };
  const spoiled = next.cooler.filter((c) => !freshnessOf(c.caughtAt, c.icedMin, now));
  const expired = next.goods.filter((g) => {
    const it = SHOP_BY_ID[g.id];
    return !it || (it.perishMin !== undefined && now - g.at >= it.perishMin * 60_000);
  });
  if (spoiled.length || expired.length) {
    next = {
      ...next,
      cooler: next.cooler.filter((c) => !spoiled.includes(c)),
      goods: next.goods.filter((g) => !expired.includes(g)),
    };
    if (spoiled.length) next = withLog(next, { at: now, kind: 'spoil', text: `${spoiled.length} fish went bad in the cooler`, coins: 0 });
  }
  return { wallet: next, spoiled, expired };
}

export function coolerSlots(w: Wallet): number {
  return COOLER.baseSlots + COOLER.upgradeSlots * w.coolerLevel;
}

export function bagSlotsUsed(w: Wallet): number {
  return w.goods.length;
}

/** How fresh a bought item still is: 1 = just bought … 0 = about to go off (null = keeps forever). */
export function goodsFreshRatio(g: Goods, now: number): number | null {
  const it = SHOP_BY_ID[g.id];
  if (!it?.perishMin) return null;
  return Math.max(0, 1 - (now - g.at) / (it.perishMin * 60_000));
}

// ---- fishing → cooler ------------------------------------------------------------------------

/** A free-fishing catch goes into the cooler (if Gen could ever buy it, and there is room). */
export function addCatch(w0: Wallet, fishId: string, sizeCm: number | null, ctx: Ctx): Ok<{ fish: CoolerFish }> | Fail {
  const { wallet: w } = settle(w0, ctx.now);
  if (!isSellableFish(FREE_BY_ID[fishId])) return { ok: false, wallet: w, reason: 'not_sellable', item: fishId };
  if (w.cooler.length >= coolerSlots(w)) return { ok: false, wallet: w, reason: 'cooler_full', item: fishId };
  const fish: CoolerFish = { uid: (ctx.uid ?? defaultUid)(), fishId, sizeCm, caughtAt: ctx.now, icedMin: 0 };
  return { ok: true, wallet: { ...w, cooler: [...w.cooler, fish] }, fish };
}

// ---- selling fish to Gen ---------------------------------------------------------------------

export interface SellLine extends FishQuote {
  uid: string;
  /** Over today's ceiling: stays in the cooler. */
  capped: boolean;
}
export interface SellQuote {
  lines: SellLine[];
  /** Coins for the lines that will be paid. */
  total: number;
  market: MarketDay;
}

/** What Gen would pay for these fish right now (in cooler order). Shows every part of each price. */
export function quoteSell(w0: Wallet, uids: string[], now: number): { wallet: Wallet; quote: SellQuote } {
  const { wallet: w } = settle(w0, now);
  const market = marketOf(now);
  const want = new Set(uids);
  const seen: Record<string, number> = { ...w.soldToday };
  let room = Math.max(0, SELL.dailyCap - w.earnedToday);
  let total = 0;
  const lines: SellLine[] = [];
  for (const c of w.cooler) {
    if (!want.has(c.uid)) continue;
    const q = quoteFish(c, now, market, seen[c.fishId] ?? 0);
    if (!q) continue;
    seen[c.fishId] = (seen[c.fishId] ?? 0) + 1;
    const capped = q.price > room;
    if (!capped) { room -= q.price; total += q.price; }
    lines.push({ ...q, uid: c.uid, capped });
  }
  return { wallet: w, quote: { lines, total, market } };
}

/** Sell these fish to Gen. Fish over today's ceiling stay in the cooler. */
export function sellFish(w0: Wallet, uids: string[], ctx: Ctx): Ok<{ sold: SellLine[]; earned: number; kept: number }> | Fail {
  const { wallet: settled, spoiled } = settle(w0, ctx.now);
  const want = new Set(uids);
  const inCooler = settled.cooler.filter((c) => want.has(c.uid)).length;
  if (!inCooler) {
    // asked for fish that just went bad → say so; anything else (nothing, or not a fish at all) → pick again
    return { ok: false, wallet: settled, reason: spoiled.some((c) => want.has(c.uid)) ? 'spoiled' : 'nothing_selected' };
  }
  const { wallet: w, quote } = quoteSell(settled, uids, ctx.now);
  const sold = quote.lines.filter((l) => !l.capped);
  if (!sold.length) return { ok: false, wallet: w, reason: 'daily_cap' };
  const gone = new Set(sold.map((l) => l.uid));
  const soldToday = { ...w.soldToday };
  for (const l of sold) soldToday[l.fishId] = (soldToday[l.fishId] ?? 0) + 1;
  const what = sold.length === 1 ? fishName(sold[0].fishId) : `${sold.length} fish`;
  let next: Wallet = {
    ...w,
    coins: w.coins + quote.total,
    earnedToday: w.earnedToday + quote.total,
    soldToday,
    cooler: w.cooler.filter((c) => !gone.has(c.uid)),
  };
  next = withLog(next, { at: ctx.now, kind: 'sell', text: `Sold ${what} to Gen`, coins: quote.total });
  return { ok: true, wallet: next, sold, earned: quote.total, kept: quote.lines.length - sold.length };
}

// ---- buying from the shop --------------------------------------------------------------------

export interface CartLine { id: string; qty: number }
export interface BuyLine { id: string; qty: number; unit: number; total: number; special: boolean }
export interface BuyQuote { lines: BuyLine[]; total: number; problem?: Reason; problemItem?: string }

/** Merge repeated ids, drop zero/negative quantities. */
function cleanCart(cart: CartLine[]): CartLine[] {
  const m = new Map<string, number>();
  for (const l of cart) if (Number.isInteger(l.qty) && l.qty > 0) m.set(l.id, (m.get(l.id) ?? 0) + l.qty);
  return [...m].map(([id, qty]) => ({ id, qty }));
}

/** Goods after adding a cart (null = the bag can't hold it). Upgrades don't go in the bag. */
function goodsAfter(goods: Goods[], cart: CartLine[], now: number, uid: () => string): Goods[] | null {
  const out = goods.map((g) => ({ ...g }));
  for (const l of cart) {
    const it = SHOP_BY_ID[l.id];
    if (it.use === 'cooler_upgrade') continue;
    if (it.perishMin !== undefined) {
      for (let i = 0; i < l.qty; i++) out.push({ uid: uid(), id: l.id, qty: 1, at: now });
    } else {
      let left = l.qty;
      for (const g of out) {
        if (g.id !== l.id || left <= 0) continue;
        const add = Math.min(left, BAG.maxStack - g.qty);
        g.qty += add; left -= add;
      }
      while (left > 0) {
        const add = Math.min(left, BAG.maxStack);
        out.push({ uid: uid(), id: l.id, qty: add, at: now });
        left -= add;
      }
    }
  }
  return out.length > BAG.slots ? null : out;
}

/** Price an order at one counter and find the FIRST problem (if any), without changing anything. */
export function quoteBuy(w0: Wallet, cart0: CartLine[], vendor: Vendor, now: number): { wallet: Wallet; quote: BuyQuote } {
  const { wallet: w } = settle(w0, now);
  const market = marketOf(now);
  const cart = cleanCart(cart0);
  const lines: BuyLine[] = [];
  let total = 0;
  const fail = (problem: Reason, problemItem?: string) => ({ wallet: w, quote: { lines, total, problem, problemItem } });
  if (!cart.length) return fail('nothing_selected');
  if (cart.reduce((s, l) => s + l.qty, 0) > SHOP.maxCart) return fail('too_many');
  for (const l of cart) {
    const it = SHOP_BY_ID[l.id];
    if (!it) return fail('unknown_item', l.id);
    if (it.soon) return fail('not_for_sale', l.id);
    if (it.vendor !== vendor) return fail('wrong_vendor', l.id);
    if (it.use === 'cooler_upgrade' && l.qty > 1) return fail('too_many', l.id);
    const unit = itemPrice(l.id, market, w.coolerLevel, COOLER.upgradePrices);
    if (unit === null) return fail('cooler_max', l.id);
    if (it.dailyLimit !== undefined && (w.boughtToday[l.id] ?? 0) + l.qty > it.dailyLimit) return fail('daily_limit', l.id);
    lines.push({ id: l.id, qty: l.qty, unit, total: unit * l.qty, special: market.special === l.id });
    total += unit * l.qty;
  }
  if (total > w.coins) return fail('not_enough_coins');
  if (!goodsAfter(w.goods, cart, now, () => 'x')) return fail('bag_full');
  return { wallet: w, quote: { lines, total } };
}

/** Buy an order at one counter. All or nothing. */
export function buy(w0: Wallet, cart0: CartLine[], vendor: Vendor, ctx: Ctx): Ok<{ lines: BuyLine[]; spent: number }> | Fail {
  const { wallet: w, quote } = quoteBuy(w0, cart0, vendor, ctx.now);
  if (quote.problem) return { ok: false, wallet: w, reason: quote.problem, item: quote.problemItem };
  const cart = cleanCart(cart0);
  const goods = goodsAfter(w.goods, cart, ctx.now, ctx.uid ?? defaultUid)!;
  const boughtToday = { ...w.boughtToday };
  let coolerLevel = w.coolerLevel;
  for (const l of cart) {
    boughtToday[l.id] = (boughtToday[l.id] ?? 0) + l.qty;
    if (SHOP_BY_ID[l.id].use === 'cooler_upgrade') coolerLevel += 1;
  }
  const what = quote.lines.length === 1 ? `${quote.lines[0].qty > 1 ? `${quote.lines[0].qty}× ` : ''}${itemName(quote.lines[0].id)}` : `${quote.lines.reduce((s, l) => s + l.qty, 0)} things`;
  const next = withLog({ ...w, coins: w.coins - quote.total, goods, boughtToday, coolerLevel },
    { at: ctx.now, kind: 'buy', text: `Bought ${what}`, coins: -quote.total });
  return { ok: true, wallet: next, lines: quote.lines, spent: quote.total };
}

// ---- using and giving goods ------------------------------------------------------------------

/** Use one of a bag item (today: a Block of ice cools every fish in the cooler). */
export function useGoods(w0: Wallet, uid: string, ctx: Ctx): Ok<{ used: string }> | Fail {
  const { wallet: w } = settle(w0, ctx.now);
  const g = w.goods.find((x) => x.uid === uid);
  if (!g) return { ok: false, wallet: w, reason: 'not_owned' };
  const it = SHOP_BY_ID[g.id];
  if (it.use !== 'ice') return { ok: false, wallet: w, reason: 'cant_use', item: g.id };
  const helps = w.cooler.some((c) => c.icedMin < FRESH.iceMaxPerFishMin);
  if (!helps) return { ok: false, wallet: w, reason: 'nothing_to_cool', item: g.id };
  const cooler = w.cooler.map((c) => ({ ...c, icedMin: Math.min(FRESH.iceMaxPerFishMin, c.icedMin + FRESH.iceExtendMin) }));
  const next = withLog(takeOne(w, uid, cooler), { at: ctx.now, kind: 'use', text: `Iced ${cooler.length} fish`, coins: 0 });
  return { ok: true, wallet: next, used: g.id };
}

function takeOne(w: Wallet, uid: string, cooler = w.cooler): Wallet {
  const goods = w.goods.flatMap((g) => (g.uid !== uid ? [g] : g.qty > 1 ? [{ ...g, qty: g.qty - 1 }] : []));
  return { ...w, goods, cooler };
}

/** Take one item out of the bag (for giving it to an NPC — the gift system calls this). */
export function takeGoods(w0: Wallet, uid: string, now: number): Ok<{ id: string }> | Fail {
  const { wallet: w } = settle(w0, now);
  const g = w.goods.find((x) => x.uid === uid);
  if (!g) return { ok: false, wallet: w, reason: 'not_owned' };
  return { ok: true, wallet: takeOne(w, uid), id: g.id };
}
