// Server intent adapters around the shared pure buy core. Caller owns the transaction.
import { randomUUID } from 'node:crypto';
import { ICE, SHOP, ECONOMY_SAVE } from '../../src/game/economy/economyConfig.js';
import { SHOP_BY_ID } from '../../src/game/economy/shopCatalog.js';
import type { Vendor } from '../../src/game/economy/shopCatalog.js';
import { quoteBuySettled, buySettled, freshWallet, REASON_LINES } from '../../src/game/economy/wallet.js';
import type { CartLine } from '../../src/game/economy/wallet.js';
import { checkedCoinBalance, SaveError } from './rules.js';
import type { PlayerDoc } from './rules.js';

export function parseBuy(body: Record<string, unknown>) {
  const vendor = body.vendor;
  if (vendor !== 'gen' && vendor !== 'minato') throw new SaveError(400, 'Unknown counter.');
  const raw = body.cart;
  if (!Array.isArray(raw) || !raw.length || raw.length > SHOP.maxCart) throw new SaveError(400, REASON_LINES.too_many);
  const cart: CartLine[] = raw.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== 2
      || typeof row.id !== 'string' || row.id.length > 64 || !Number.isSafeInteger(row.qty) || row.qty < 1 || row.qty > SHOP.maxCart
      || !Object.hasOwn(row, 'id') || !Object.hasOwn(row, 'qty')) throw new SaveError(400, 'Invalid order.');
    return { id: row.id, qty: row.qty };
  });
  if (cart.reduce((n, l) => n + l.qty, 0) > SHOP.maxCart) throw new SaveError(400, REASON_LINES.too_many);
  const expectedTotal = body.expectedTotal;
  if (expectedTotal !== undefined && (typeof expectedTotal !== 'number' || !Number.isSafeInteger(expectedTotal) || expectedTotal < 0)) {
    throw new SaveError(400, 'Invalid quoted total.');
  }
  return { vendor: vendor as Vendor, cart, expectedTotal: expectedTotal as number | undefined };
}

export function applyBuy(doc: PlayerDoc, cart: CartLine[], vendor: Vendor, expectedTotal: number | undefined, now: number) {
  for (const row of cart) if (!Object.hasOwn(SHOP_BY_ID, row.id)) throw new SaveError(422, REASON_LINES.unknown_item);
  const wallet = { ...freshWallet(now), coins: doc.coins, coolerLevel: doc.coolerLevel, goods: doc.goods,
    ...doc.econ };
  const { quote } = quoteBuySettled(wallet, cart, vendor, now);
  if (expectedTotal !== undefined && (!quote.problem || quote.problem === 'not_enough_coins' || quote.problem === 'bag_full') && quote.total > expectedTotal) {
    throw new SaveError(409, 'Prices just changed. Take another look.');
  }
  const out = buySettled(wallet, cart, vendor, { now, uid: randomUUID });
  if (out.ok === false) throw new SaveError(422, REASON_LINES[out.reason]);
  const balanceAfter = checkedCoinBalance(out.wallet.coins);
  const existing = new Map(doc.goods.map(g => [g.uid, g]));
  const goods = out.wallet.goods.map(g => ({ ...g, expiresAt: existing.get(g.uid)?.expiresAt
    ?? (SHOP_BY_ID[g.id].perishMin === undefined ? null : g.at + SHOP_BY_ID[g.id].perishMin! * 60_000) }));
  return {
    fields: { coins: balanceAfter, goods, coolerLevel: out.wallet.coolerLevel,
      econ: { ...doc.econ, boughtToday: out.wallet.boughtToday } },
    changes: { bought: out.lines, spent: out.spent, balanceAfter, vendor, pricedAt: now, marketDay: doc.econ.day,
      expectedTotal: expectedTotal ?? null },
  };
}

export function parseGoodsUid(value: unknown): string {
  if (typeof value !== 'string' || value.length > ECONOMY_SAVE.goodsUidMaxLength || !/^[A-Za-z0-9_-]+$/.test(value)) throw new SaveError(400, 'Invalid bag item.');
  return value;
}
export function applyIce(doc: PlayerDoc, uid: string, now: number) {
  const good = doc.goods.find(g => g.uid === uid);
  if (!good) throw new SaveError(422, REASON_LINES.not_owned);
  if (SHOP_BY_ID[good.id]?.use !== 'ice') throw new SaveError(422, 'Eating and gifts come later');
  if (doc.iceUsedAt.length >= ICE.maxEvents) throw new SaveError(409, 'Enough ice for now. Try again a little later.');
  const goods = doc.goods.flatMap(g => g.uid !== uid ? [g] : g.qty > 1 ? [{ ...g, qty: g.qty - 1 }] : []);
  return { fields: { goods, iceUsedAt: [...doc.iceUsedAt, now] },
    changes: { uid, used: good.id, usedAt: now, balanceAfter: doc.coins } };
}
