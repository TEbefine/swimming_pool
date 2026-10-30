// ECO-01 — fish shop economy: pure logic (market, cooler, sell, buy, ice, daily limits, safety).
import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { SELL, FRESH, COOLER, BAG, SHOP } = await import('../src/game/economy/economyConfig.ts');
const { SHOP_ITEMS, SHOP_BY_ID, FRESHWATER_FISH } = await import('../src/game/economy/shopCatalog.ts');
const { bkkDay, marketOf, isSellableFish, freshnessOf, sizeFactor, glutFactor, quoteFish } = await import('../src/game/economy/market.ts');
const W = await import('../src/game/economy/wallet.ts');
const { ALL_FREE_FISH, FREE_FISH, FREE_BY_ID, TIERS, thaiSeasonAt } = await import('../src/game/fishing/freeFishCatalog.ts');

const NOON = Date.UTC(2026, 9, 27, 5, 0); // 12:00 Bangkok, 27 Oct 2026 (cool season)
const MIN = 60_000;
let n = 0;
const ctx = (now = NOON) => ({ now, uid: () => `u${++n}` });
const rich = (coins = 100_000, now = NOON) => ({ ...W.freshWallet(now), coins });
/** A sellable common fish that is NOT wanted today, so prices are plain. */
const plainCommon = (now = NOON) => {
  const m = marketOf(now);
  return FREE_FISH.find((f) => f.tier === 'common' && isSellableFish(f) && !m.wanted.includes(f.id)).id;
};

test('catalog: 48 goods, one per sheet cell, sane prices, real vendors', () => {
  assert.equal(SHOP_ITEMS.length, 52);
  const ids = new Set(); const cells = new Set();
  for (const it of SHOP_ITEMS) {
    assert.ok(!ids.has(it.id), `duplicate id ${it.id}`); ids.add(it.id);
    const key = `${it.sheet}:${it.cell}`;
    assert.ok(!cells.has(key), `two items on ${key}`); cells.add(key);
    assert.ok(it.cell >= 0 && it.cell <= 15, it.id);
    assert.ok(Number.isInteger(it.price) && (it.price > 0 || it.id === 'rod_bamboo'), it.id);
    assert.ok(it.vendor === 'minato' || it.vendor === 'gen', it.id);
    if (it.perishMin !== undefined) assert.ok(it.perishMin > 0, it.id);
  }
  assert.equal(cells.size, 52);
});

test('sashimi is only ever cut from real, sellable SALTWATER catches (the liver-fluke rule)', () => {
  for (const it of SHOP_ITEMS) for (const f of it.fromFish ?? []) {
    assert.ok(FREE_BY_ID[f], `${it.id}: unknown fish ${f}`);
    assert.ok(isSellableFish(FREE_BY_ID[f]), `${it.id}: ${f} can't be sold`);
    assert.ok(!FRESHWATER_FISH.includes(f), `${it.id}: ${f} is freshwater`);
  }
  for (const f of FRESHWATER_FISH) assert.ok(FREE_BY_ID[f], `freshwater list has unknown ${f}`);
});

test('Bangkok day changes at midnight Bangkok, not UTC', () => {
  const lastSecond = Date.UTC(2026, 9, 27, 16, 59, 59); // 23:59:59 Bangkok
  assert.equal(bkkDay(lastSecond) + 1, bkkDay(lastSecond + 1000));
  assert.equal(bkkDay(NOON), bkkDay(Date.UTC(2026, 9, 26, 17, 0, 0))); // 00:00 Bangkok, same day
});

test('market: same for everyone on a day, wanted fish are everyday kinds you can catch now', () => {
  const a = marketOf(NOON), b = marketOf(NOON + 5 * 3600_000);
  assert.deepEqual(a, b);
  assert.equal(a.wanted.length, SELL.wantedPerDay);
  for (const id of a.wanted) {
    const f = FREE_BY_ID[id];
    assert.ok(FREE_FISH.includes(f) && isSellableFish(f) && (f.tier === 'common' || f.tier === 'rare'), id);
    assert.ok(!f.season || f.season === thaiSeasonAt(NOON), id);
  }
  assert.equal(SHOP_BY_ID[a.special].category, 'sashimi');
  assert.equal(SHOP_BY_ID[a.special].dailyLimit, undefined);
  const days = new Set(Array.from({ length: 14 }, (_, i) => marketOf(NOON + i * 86_400_000).wanted.join()));
  assert.ok(days.size > 7, 'the wanted list changes from day to day');
});

test('Gen only buys real fish: not protected animals, God trophies or treasure', () => {
  assert.ok(isSellableFish(FREE_BY_ID.sardine));
  for (const id of ['seahorse', 'sea_turtle', 'sun_carp', 'moon_whale', 'bottle_message', 'treasure_chest', 'fossil_fish']) {
    assert.ok(!isSellableFish(FREE_BY_ID[id]), id);
  }
});

test('freshness bands, spoiling, and ice', () => {
  assert.equal(freshnessOf(NOON, 0, NOON).id, 'fresh');
  assert.equal(freshnessOf(NOON, 0, NOON + 12 * MIN).id, 'good');
  assert.equal(freshnessOf(NOON, 0, NOON + 25 * MIN).id, 'tired');
  assert.equal(freshnessOf(NOON, 0, NOON + FRESH.lifetimeMin * MIN), null);
  assert.equal(freshnessOf(NOON, 15, NOON + 24 * MIN).id, 'fresh'); // 24 − 15 ice = 9 min old
  assert.equal(freshnessOf(NOON, 15, NOON + 25 * MIN).id, 'good');  // exactly 10 = Good
});

test('size: smallest ×0.8 … biggest ×1.3; glut never below the floor', () => {
  const s = FREE_BY_ID.sardine;
  assert.equal(sizeFactor(s, s.size[0]), SELL.sizeMin);
  assert.equal(sizeFactor(s, s.size[1]), SELL.sizeMax);
  assert.equal(sizeFactor(s, 999), SELL.sizeMax);
  assert.equal(sizeFactor(s, null), 1);
  assert.equal(glutFactor(0), 1);
  assert.ok(glutFactor(3) < glutFactor(2));
  assert.equal(glutFactor(100), SELL.glutFloor);
});

test('cooler: catches go in, non-sellables never do, it fills up, upgrades add room', () => {
  let w = W.freshWallet(NOON);
  const r0 = W.addCatch(w, 'seahorse', 10, ctx());
  assert.equal(r0.ok, false); assert.equal(r0.reason, 'not_sellable');
  for (let i = 0; i < COOLER.baseSlots; i++) {
    const r = W.addCatch(w, 'sardine', 15, ctx(NOON + i * 1000));
    assert.ok(r.ok); w = r.wallet;
  }
  const full = W.addCatch(w, 'sardine', 15, ctx(NOON + 20_000));
  assert.equal(full.ok, false); assert.equal(full.reason, 'cooler_full');
  assert.equal(W.coolerSlots({ ...w, coolerLevel: 1 }), COOLER.baseSlots + COOLER.upgradeSlots);
});

test('fish spoil on read after 30 minutes and the log says so', () => {
  let w = W.addCatch(W.freshWallet(NOON), 'sardine', 15, ctx()).wallet;
  const { wallet, spoiled } = W.settle(w, NOON + 31 * MIN);
  assert.equal(spoiled.length, 1);
  assert.equal(wallet.cooler.length, 0);
  assert.equal(wallet.log.at(-1).kind, 'spoil');
});

test('sell: Gen pays the quoted price, coins go up, the fish leave the cooler', () => {
  const id = plainCommon();
  let w = W.freshWallet(NOON);
  w = W.addCatch(w, id, FREE_BY_ID[id].size[1], ctx()).wallet;
  const uid = w.cooler[0].uid;
  const { quote } = W.quoteSell(w, [uid], NOON + MIN);
  const expect = Math.round(SELL.tierBase.common * SELL.sizeMax);
  assert.equal(quote.total, expect);
  const r = W.sellFish(w, [uid], ctx(NOON + MIN));
  assert.ok(r.ok);
  assert.equal(r.wallet.coins, expect);
  assert.equal(r.wallet.cooler.length, 0);
  assert.equal(r.wallet.soldToday[id], 1);
  assert.equal(r.wallet.log.at(-1).coins, expect);
});

test('sell: wanted fish pay ×1.5; selling a lot of one kind lowers its price (supply and demand)', () => {
  const m = marketOf(NOON);
  const wantedId = m.wanted[0];
  let w = W.freshWallet(NOON);
  for (let i = 0; i < 4; i++) w = W.addCatch(w, wantedId, null, ctx(NOON + i)).wallet;
  const { quote } = W.quoteSell(w, w.cooler.map((c) => c.uid), NOON + MIN);
  assert.equal(quote.lines[0].wanted, SELL.wantedBonus);
  const prices = quote.lines.map((l) => l.price);
  for (let i = 1; i < prices.length; i++) assert.ok(prices[i] <= prices[i - 1], `price ${i} not lower: ${prices}`);
  const sold = W.sellFish(w, w.cooler.map((c) => c.uid), ctx(NOON + MIN));
  // a later sale the same day continues from where the glut left off
  let w2 = W.addCatch(sold.wallet, wantedId, null, ctx(NOON + 2 * MIN)).wallet;
  const later = W.quoteSell(w2, [w2.cooler[0].uid], NOON + 2 * MIN).quote.lines[0];
  assert.ok(later.glut < 1);
  // a new Bangkok day forgets it
  w2 = W.addCatch(sold.wallet, wantedId, null, ctx(NOON + 86_400_000)).wallet;
  assert.equal(w2.soldToday[wantedId], undefined);
});

test('sell: the daily ceiling pays what fits; the rest stays in the cooler', () => {
  const id = plainCommon();
  let w = { ...W.freshWallet(NOON), earnedToday: SELL.dailyCap - 5 };
  for (let i = 0; i < 3; i++) w = W.addCatch(w, id, FREE_BY_ID[id].size[1], ctx(NOON + i)).wallet;
  const uids = w.cooler.map((c) => c.uid);
  const r = W.sellFish(w, uids, ctx(NOON + MIN));
  assert.equal(r.ok, false); assert.equal(r.reason, 'daily_cap'); // every fish (≥ 6 coins) is over the 5 left
  assert.equal(r.wallet.cooler.length, 3);
});

test('sell: goods, unknown ids and spoiled fish are refused with the right line', () => {
  let w = W.buy(rich(), [{ id: 'nori', qty: 1 }], 'gen', ctx()).wallet;
  const r = W.sellFish(w, [w.goods[0].uid], ctx());
  assert.equal(r.ok, false); assert.equal(r.reason, 'nothing_selected'); // no buy-low/sell-high loop
  w = W.addCatch(w, 'sardine', 15, ctx()).wallet;
  const late = W.sellFish(w, [w.cooler[0].uid], ctx(NOON + 40 * MIN));
  assert.equal(late.reason, 'spoiled');
});

test('buy: all or nothing, at the right counter, within money, limits and bag space', () => {
  const poor = { ...W.freshWallet(NOON), coins: 10 };
  const no = W.buy(poor, [{ id: 'sashimi_akami', qty: 1 }], 'minato', ctx());
  assert.equal(no.reason, 'not_enough_coins'); assert.equal(no.wallet.coins, 10); assert.equal(no.wallet.goods.length, 0);
  assert.equal(W.buy(rich(), [{ id: 'nori', qty: 1 }], 'minato', ctx()).reason, 'wrong_vendor');
  assert.equal(W.buy(rich(), [{ id: 'chef_knife', qty: 1 }], 'gen', ctx()).reason, 'not_for_sale');
  assert.equal(W.buy(rich(), [{ id: 'nope', qty: 1 }], 'gen', ctx()).reason, 'unknown_item');
  assert.equal(W.buy(rich(), [{ id: 'nori', qty: SHOP.maxCart + 1 }], 'gen', ctx()).reason, 'too_many');
  assert.equal(W.buy(rich(), [], 'gen', ctx()).reason, 'nothing_selected');

  const ok = W.buy(rich(1000), [{ id: 'miso_soup', qty: 2 }, { id: 'ramune', qty: 3 }], 'minato', ctx());
  assert.ok(ok.ok);
  assert.equal(ok.spent, 2 * SHOP_BY_ID.miso_soup.price + 3 * SHOP_BY_ID.ramune.price);
  assert.equal(ok.wallet.coins, 1000 - ok.spent);
  assert.equal(ok.wallet.goods.filter((g) => g.id === 'miso_soup').length, 2, 'perishables: one slot each');
  assert.equal(ok.wallet.goods.filter((g) => g.id === 'ramune').length, 1, 'keepers stack in one slot');
  assert.equal(ok.wallet.goods.find((g) => g.id === 'ramune').qty, 3);
});

test('buy: daily limits reset on a new Bangkok day', () => {
  const first = W.buy(rich(), [{ id: 'sashimi_boat', qty: 1 }], 'minato', ctx());
  assert.ok(first.ok);
  assert.equal(W.buy(first.wallet, [{ id: 'sashimi_boat', qty: 1 }], 'minato', ctx(NOON + MIN)).reason, 'daily_limit');
  assert.ok(W.buy(first.wallet, [{ id: 'sashimi_boat', qty: 1 }], 'minato', ctx(NOON + 86_400_000)).ok);
});

test("buy: today's special plate is cheaper", () => {
  const m = marketOf(NOON);
  const r = W.buy(rich(), [{ id: m.special, qty: 1 }], 'minato', ctx());
  assert.equal(r.spent, Math.round(SHOP_BY_ID[m.special].price * SHOP.specialFactor));
  assert.ok(r.lines[0].special);
});

test('buy: the bag has limited slots', () => {
  const r = W.buy(rich(), [{ id: 'onigiri', qty: SHOP.maxCart }], 'minato', ctx());
  let w = r.wallet;
  w = W.buy(w, [{ id: 'onigiri', qty: SHOP.maxCart }], 'minato', ctx()).wallet;
  assert.equal(w.goods.length, BAG.slots);
  assert.equal(W.buy(w, [{ id: 'onigiri', qty: 1 }], 'minato', ctx()).reason, 'bag_full');
});

test('cooler upgrade: applied at once, price grows, stops at the biggest', () => {
  let w = rich();
  const a = W.buy(w, [{ id: 'cooler_box', qty: 1 }], 'gen', ctx());
  assert.equal(a.spent, COOLER.upgradePrices[0]); assert.equal(a.wallet.coolerLevel, 1);
  assert.equal(a.wallet.goods.length, 0, 'the upgrade is not a bag item');
  const b = W.buy(a.wallet, [{ id: 'cooler_box', qty: 1 }], 'gen', ctx());
  assert.equal(b.spent, COOLER.upgradePrices[1]); assert.equal(b.wallet.coolerLevel, 2);
  assert.equal(W.buy(b.wallet, [{ id: 'cooler_box', qty: 1 }], 'gen', ctx()).reason, 'cooler_max');
  assert.equal(W.buy(w, [{ id: 'cooler_box', qty: 2 }], 'gen', ctx()).reason, 'too_many');
});

test('perishable goods go off; keepers do not', () => {
  const w = W.buy(rich(), [{ id: 'sashimi_tai', qty: 1 }, { id: 'nori', qty: 1 }], 'minato', ctx());
  assert.equal(w.reason, 'wrong_vendor'); // one order = one counter
  let g = W.buy(rich(), [{ id: 'sashimi_tai', qty: 1 }], 'minato', ctx()).wallet;
  g = W.buy(g, [{ id: 'nori', qty: 1 }], 'gen', ctx()).wallet;
  const later = W.settle(g, NOON + (SHOP_BY_ID.sashimi_tai.perishMin + 1) * MIN).wallet;
  assert.deepEqual(later.goods.map((x) => x.id), ['nori']);
});

test('ice keeps every fish in the cooler fresh longer, up to a limit', () => {
  let w = W.buy(rich(), [{ id: 'ice_block', qty: 3 }], 'gen', ctx()).wallet;
  const ice = () => w.goods.find((g) => g.id === 'ice_block').uid;
  assert.equal(W.useGoods(w, ice(), ctx()).reason, 'nothing_to_cool');
  w = W.addCatch(w, 'sardine', 15, ctx()).wallet;
  w = W.useGoods(w, ice(), ctx()).wallet;
  assert.equal(W.fishIceMin(w, w.cooler[0]), FRESH.iceExtendMin);
  assert.deepEqual(w.iceUsedAt, [NOON], 'ice is an event, like on the server');
  assert.ok(W.settle(w, NOON + 40 * MIN).wallet.cooler.length === 1, 'still in the cooler at 40 min');
  w = W.useGoods(w, ice(), ctx()).wallet;
  assert.equal(W.useGoods(w, ice(), ctx()).reason, 'nothing_to_cool'); // already at the max
  assert.equal(W.fishIceMin(w, w.cooler[0]), FRESH.iceMaxPerFishMin);
  const nori = W.buy(w, [{ id: 'nori', qty: 1 }], 'gen', ctx()).wallet;
  assert.equal(W.useGoods(nori, nori.goods.find((g) => g.id === 'nori').uid, ctx()).reason, 'cant_use');
});

test('giving: takeGoods removes exactly one', () => {
  let w = W.buy(rich(), [{ id: 'ramune', qty: 2 }], 'minato', ctx()).wallet;
  const uid = w.goods[0].uid;
  w = W.takeGoods(w, uid, NOON).wallet;
  assert.equal(w.goods[0].qty, 1);
  w = W.takeGoods(w, uid, NOON).wallet;
  assert.equal(w.goods.length, 0);
  assert.equal(W.takeGoods(w, uid, NOON).reason, 'not_owned');
});

test('a broken or edited save never crashes the game', () => {
  for (const raw of [null, 7, 'x', [], { version: 2 }]) assert.equal(W.parseWallet(raw, NOON).coins, 0);
  const w = W.parseWallet({ version: 1, coins: -50, coolerLevel: 99, cooler: [{ uid: 'a' }, null],
    goods: [{ uid: 'g', id: 'not_a_thing', qty: 1, at: NOON }, { uid: 'h', id: 'nori', qty: 2, at: NOON }],
    soldToday: { sardine: 'lots' }, log: 'nope' }, NOON);
  assert.equal(w.coins, 0);
  assert.equal(w.coolerLevel, COOLER.upgradePrices.length);
  assert.equal(w.cooler.length, 0);
  assert.deepEqual(w.goods.map((g) => g.id), ['nori']);
  assert.deepEqual(w.soldToday, {});
});

test('tuning report: expected coins per catch stays in the target band', (t) => {
  // tier is rolled first (TIERS weights), then a kind inside it; unsellable kinds pay 0
  const tiers = Object.keys(TIERS);
  const totalW = tiers.reduce((s, k) => s + TIERS[k].weight, 0);
  let ev = 0;
  for (const k of tiers) {
    const kinds = FREE_FISH.filter((f) => f.tier === k);
    if (!kinds.length) continue;
    const avg = kinds.reduce((s, f) => s + (isSellableFish(f) ? SELL.tierBase[k] * (SELL.sizeMin + SELL.sizeMax) / 2 : 0), 0) / kinds.length;
    ev += (TIERS[k].weight / totalW) * avg;
  }
  t.diagnostic(`expected coins per catch (fresh, average size, no market): ${ev.toFixed(1)}`);
  t.diagnostic(`→ a full starter cooler (${COOLER.baseSlots} fish) ≈ ${Math.round(ev * COOLER.baseSlots)} coins; a mixed plate costs ${SHOP_BY_ID.sashimi_mixed.price}`);
  assert.ok(ev >= 10 && ev <= 40, `EV ${ev} outside 10–40: retune SELL.tierBase`);
});

test('every shop item has its icon file (public/sprites/shop/<id>.webp)', async () => {
  const { existsSync } = await import('node:fs');
  for (const it of SHOP_ITEMS) assert.ok(existsSync(new URL(`../public/sprites/shop/${it.id}.webp`, import.meta.url)), `missing icon ${it.id}`);
});
