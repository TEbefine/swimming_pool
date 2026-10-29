import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureCatch, TEST_SECRET } from './fishing-fixtures.mjs';
import { saleHarness, NOON, ADDRESS, operationId } from './sale-harness.mjs';
const { emptyPlayer } = await import('../server/saves/rules.ts');
const { FISHING_DECK: C } = await import('../src/game/fishing/deckConfig.ts');
const { SELL, ECONOMY_SAVE } = await import('../src/game/economy/economyConfig.ts');
const { quoteFish, marketOf } = await import('../src/game/economy/market.ts');
const { markPaidTickets } = await import('../server/saves/deckRedemptions.ts');
const next = c => fixtureCatch(ADDRESS, c.caughtAt, { startIndex: c.ticket.castIndex + 1 });
const paid = (doc, c) => !!(Buffer.from(doc.paidDecks.find(s => s.deckId === c.ticket.deckId).bits, 'base64')[c.ticket.castIndex >> 3] & 1 << (c.ticket.castIndex % 8));

test('verified sale atomically prices the reconstructed fish, marks indices and updates only best/sold; view hides sold', async () => {
  const h = saleHarness(), c = fixtureCatch(ADDRESS, NOON - 10000), d = next(c);
  const r = await h.sell([c, d]); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const saved = h.players.get(ADDRESS), result = r.body.result;
  assert.deepEqual(saved.fishBook, { sardine: { best: Math.max(c.sizeCm, d.sizeCm), sold: 2 } });
  assert.deepEqual(r.body.fishBook.sardine, { best: saved.fishBook.sardine.best, starred: false });
  assert.equal(r.body.totalKinds, 27); assert.equal(Object.hasOwn(r.body.fishBook.sardine, 'sold'), false);
  assert.ok(paid(saved, c) && paid(saved, d)); assert.equal(saved.coins, result.earned);
  assert.equal(h.reads, 2); assert.equal(h.writes, 2); assert.equal(h.logs.size, 1);
  for (const [i, f] of [c, d].entries()) {
    const q = quoteFish({ fishId: f.fish, sizeCm: f.sizeCm, caughtAt: f.caughtAt, icedMin: 0 }, NOON, marketOf(NOON), i);
    for (const key of Object.keys(q)) assert.deepEqual(result.sold[i][key], q[key]);
  }
});

test('entire sale refuses wrong species/size, missing ticket, owner/secret mismatch, index/version/quality/time claims', async () => {
  const c = fixtureCatch(ADDRESS, NOON - 10000), valid = next(c);
  const variants = [
    { ...c, fish: 'invented' }, { ...c, sizeCm: c.sizeCm + 1 }, { fish: c.fish, sizeCm: c.sizeCm, caughtAt: c.caughtAt },
    fixtureCatch('0x' + 'ef'.repeat(20), c.caughtAt), fixtureCatch(ADDRESS, c.caughtAt, { secret: TEST_SECRET + 'wrong' }),
    ...[{ castIndex: -1 }, { castIndex: C.casts }, { version: 2 }, { deckId: c.ticket.deckId + 1 },
      { castInfo: { distance: .8, nice: false } }, { castInfo: { distance: 1.1, nice: false } },
      { castAt: c.caughtAt + 1 }, { castAt: c.caughtAt - C.maxCastDurationMs - 1 },
      { castAt: (c.ticket.deckId + 1) * C.windowMs }, { deckId: c.ticket.deckId - 2 }].map(t => ({ ...c, ticket: { ...c.ticket, ...t } })),
    fixtureCatch(ADDRESS, NOON + 10001), fixtureCatch(ADDRESS, NOON, { fish: 'bottle_message' }),
    fixtureCatch(ADDRESS, NOON, { fish: 'sun_carp' }),
  ];
  for (const bad of variants) {
    const h = saleHarness(), before = h.snapshot();
    const r = await h.sell([valid, bad]); assert.equal(r.statusCode, 422, JSON.stringify({ bad, response: r.body }));
    assert.deepEqual(h.snapshot(), before);
  }
});

test('strict cast boundary, five-minute inclusive duration and ten-second future tolerance', async () => {
  const edge = Math.ceil(NOON / C.windowMs) * C.windowMs;
  for (const [at, duration, status] of [[edge - 1, C.maxCastDurationMs, 200], [edge - 1, C.maxCastDurationMs + 1, 422], [edge, 1000, 200]]) {
    const h = saleHarness({ start: at + duration }), c = fixtureCatch(ADDRESS, at + duration, { castAt: at });
    assert.equal((await h.sell([c])).statusCode, status);
  }
  assert.equal((await saleHarness().sell([fixtureCatch(ADDRESS, NOON + 10000)])).statusCode, 200);
});

test('ticket duplicates refuse; distinct indices at the same timestamp pay; capacity and wire fields are bounded', async () => {
  const c = fixtureCatch(ADDRESS, NOON - 10000), d = next(c), h = saleHarness();
  assert.equal((await h.sell([c, c])).statusCode, 422);
  assert.equal((await h.sell([c, d])).statusCode, 200);
  const before = h.snapshot(); assert.equal((await h.sell([c])).statusCode, 409); assert.deepEqual(h.snapshot(), before);
  for (const extra of [{ price: 999 }, { icedMin: 30 }, { owner: ADDRESS }, { seed: TEST_SECRET }, { starred: true }, { best: 999, sold: 999 }]) {
    assert.equal((await saleHarness().sell([{ ...c, ...extra }])).statusCode, 400);
    assert.equal((await saleHarness().sell([{ ...c, ticket: { ...c.ticket, ...extra } }])).statusCode, 400);
  }
  const many = []; let f = c; for (let i = 0; i < 20; i++) { many.push(f); f = next(f); }
  assert.equal((await saleHarness().sell(many.slice(0, 11))).statusCode, 422);
  const upgraded = saleHarness(); upgraded.players.set(ADDRESS, { ...emptyPlayer(NOON), coolerLevel: 2 });
  assert.equal((await upgraded.sell(many)).statusCode, 200);
  assert.equal((await upgraded.sell([...many, f])).statusCode, 400);
});

test('spoiled and daily-cap lines stay unpaid/unrecorded; an invalid last line never partially awards', async () => {
  const h = saleHarness(), stale = fixtureCatch(ADDRESS, NOON - 30 * 60000), fresh = next(stale);
  fresh.caughtAt = NOON - 1000; fresh.ticket.castAt = NOON - 2000;
  // Roll calendar/quality are unchanged within this window.
  const r = await h.sell([stale, fresh]); assert.equal(r.statusCode, 200);
  const saved = h.players.get(ADDRESS); assert.equal(saved.fishBook.sardine.sold, 1);
  assert.equal(paid(saved, stale), false); assert.equal(paid(saved, fresh), true);
  const all = saleHarness(), before = all.snapshot(); assert.equal((await all.sell([stale])).statusCode, 422); assert.deepEqual(all.snapshot(), before);
  const c = fixtureCatch(ADDRESS, NOON - 1000), d = next(c), cap = saleHarness(), doc = emptyPlayer(NOON);
  const price = quoteFish({ fishId: c.fish, sizeCm: c.sizeCm, caughtAt: c.caughtAt, icedMin: 0 }, NOON, marketOf(NOON), 0).price;
  doc.econ.earnedToday = SELL.dailyCap - price; cap.players.set(ADDRESS, doc);
  const capped = await cap.sell([c, d]); assert.equal(capped.statusCode, 200);
  assert.equal(capped.body.result.keptLines[0].reason, 'daily_cap');
  assert.equal(paid(cap.players.get(ADDRESS), d), false); assert.equal(cap.players.get(ADDRESS).fishBook.sardine.sold, 1);
});

test('legend/epic tier allowances aggregate across kinds, keep excess with Gen’s line and reset only daily usage', async () => {
  for (const [fish, other, cap] of [['coelacanth', 'armorfish', 2], ['bluefin_tuna', 'arowana', 10]]) {
    const h = saleHarness(), c = fixtureCatch(ADDRESS, NOON - 1000, { fish }), d = fixtureCatch(ADDRESS, NOON - 1000, { fish, startIndex: c.ticket.castIndex + 1 });
    const doc = emptyPlayer(NOON); doc.econ.soldToday[other] = cap - 1; h.players.set(ADDRESS, doc);
    const r = await h.sell([c, d]); assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.result.keptLines[0].reason, 'tier_cap'); assert.equal(r.body.result.keptLines[0].message, 'I can’t take another trophy today');
    assert.equal(h.players.get(ADDRESS).fishBook[fish].sold, 1); assert.equal(paid(h.players.get(ADDRESS), d), false);
    const before = h.snapshot(); assert.equal((await h.sell([d])).statusCode, 422); assert.deepEqual(h.snapshot(), before);
  }
  const midnight = Date.UTC(2026, 9, 10, 17), h = saleHarness({ start: midnight - 1 }), c = fixtureCatch(ADDRESS, midnight - 1000, { fish: 'bluefin_tuna' });
  const doc = emptyPlayer(midnight - 1); doc.econ.soldToday.bluefin_tuna = 10; doc.fishBook = { bluefin_tuna: { best: c.sizeCm, sold: 11 } }; h.players.set(ADDRESS, doc);
  assert.equal((await h.sell([c])).statusCode, 422); h.clock = midnight;
  assert.equal((await h.sell([c])).statusCode, 200); assert.equal(h.players.get(ADDRESS).fishBook.bluefin_tuna.sold, 12);
});

test('exact receipt retries survive retired markers, missing configuration and changed request key order; changed body refuses', async () => {
  const h = saleHarness(), c = fixtureCatch(ADDRESS, NOON - 1000), id = operationId();
  const first = await h.sell([c], id); assert.equal(first.statusCode, 200);
  h.clock += 3 * C.windowMs; delete h.env.FISHING_DECK_SECRET; delete h.env.FISHING_DECK_REDEEM_FROM_DECK_ID;
  const before = h.snapshot(), retry = await h.sell([{ ticket: { castAt: c.ticket.castAt, castInfo: { nice: true, distance: .85 }, castIndex: c.ticket.castIndex, deckId: c.ticket.deckId, version: c.ticket.version }, caughtAt: c.caughtAt, sizeCm: c.sizeCm, fish: c.fish }], id);
  assert.equal(retry.statusCode, 200); assert.equal(retry.body.replayed, true); assert.deepEqual(retry.body.result, first.body.result); assert.deepEqual(h.snapshot(), before);
  assert.equal((await h.sell([{ ...c, sizeCm: c.sizeCm + 1 }], id)).statusCode, 409);
  assert.equal((await h.sell([c])).statusCode, 503);
});

test('missing/invalid cutoff and Vercel dev secret fail closed; pre-cutoff, unsafe Book/markers and balance overflow never write', async () => {
  const c = fixtureCatch(ADDRESS, NOON - 1000);
  for (const env of [{ FISHING_DECK_REDEEM_FROM_DECK_ID: undefined }, { FISHING_DECK_REDEEM_FROM_DECK_ID: '-1' }, { FISHING_DECK_SECRET: 'dev-only-fishing-deck-no-production-use-2026' }]) {
    const h = saleHarness({ env }); assert.equal((await h.sell([c])).statusCode, 503); assert.equal(h.writes, 0);
  }
  assert.equal((await saleHarness({ env: { FISHING_DECK_REDEEM_FROM_DECK_ID: String(c.ticket.deckId + 1) } }).sell([c])).statusCode, 422);
  for (const patch of [{ paidDecks: null }, { fishBook: { sardine: { best: 999, sold: 1 } } }, { coins: SELL.dailyCap * ECONOMY_SAVE.balanceCapDays }]) {
    const h = saleHarness(); h.players.set(ADDRESS, { ...emptyPlayer(NOON), ...patch }); const before = h.snapshot();
    const r = await h.sell([c]); assert.ok([409, 503].includes(r.statusCode), JSON.stringify(r.body)); assert.deepEqual(h.snapshot(), before);
  }
});

test('fishbook.record is retired before database access; no unticketed catch writes the new Book', async () => {
  const h = saleHarness(); assert.equal((await h.call({ op: 'fishbook.record', operationId: operationId(), catches: [{ fish: 'sardine', sizeCm: 15, caughtAt: NOON }] })).statusCode, 400);
  assert.equal(h.reads, 0); assert.equal(h.writes, 0);
});

test('future paid slot from a worker 4 ms ahead refuses safely, then exact boundary retains both slots and blocks repayment', async () => {
  const edge = Math.ceil(NOON / C.windowMs) * C.windowMs, h = saleHarness({ start: edge - 2 });
  const old = fixtureCatch(ADDRESS, edge - 1, { castAt: edge - 1000 }), future = fixtureCatch(ADDRESS, edge + 1, { castAt: edge });
  const doc = emptyPlayer(edge + 2); doc.paidDecks = markPaidTickets(undefined, [future.ticket], { now: edge + 2, redeemFromDeckId: 0 }); h.players.set(ADDRESS, doc);
  const before = h.snapshot(); assert.equal((await h.sell([old])).statusCode, 503); assert.deepEqual(h.snapshot(), before);
  h.clock = edge; assert.equal((await h.sell([old])).statusCode, 200); assert.ok(paid(h.players.get(ADDRESS), future)); assert.ok(paid(h.players.get(ADDRESS), old));
  const after = h.snapshot(); assert.equal((await h.sell([future])).statusCode, 409); assert.deepEqual(h.snapshot(), after);
});

test('operation-budget exhaustion never marks a verified catch; exact replay works after capacity changes', async () => {
  const c = fixtureCatch(ADDRESS, NOON - 1000), h = saleHarness(), doc = emptyPlayer(NOON);
  doc.writeDay = { day: '2026-10-10', count: 40 }; h.players.set(ADDRESS, doc); const before = h.snapshot();
  assert.equal((await h.sell([c])).statusCode, 429); assert.deepEqual(h.snapshot(), before);
  const fresh = saleHarness(), id = operationId(), many = []; let f = c;
  for (let i = 0; i < 20; i++) { many.push(f); f = next(f); }
  fresh.players.set(ADDRESS, { ...emptyPlayer(NOON), coolerLevel: 2 });
  const first = await fresh.sell(many, id); assert.equal(first.statusCode, 200);
  fresh.players.get(ADDRESS).coolerLevel = 0;
  const snapshot = fresh.snapshot(), retry = await fresh.sell(many, id);
  assert.equal(retry.statusCode, 200); assert.deepEqual(retry.body.result, first.body.result); assert.deepEqual(fresh.snapshot(), snapshot);
});

test('story, buy and ice writes retain the current verified Book and paid-bit protection', async () => {
  const h = saleHarness(), c = fixtureCatch(ADDRESS, NOON - 1000);
  h.players.set(ADDRESS, { ...emptyPlayer(NOON), coins: 1000 }); assert.equal((await h.sell([c])).statusCode, 200);
  const initial = structuredClone(h.players.get(ADDRESS));
  const buy = await h.call({ op: 'shop.buy', operationId: operationId(), vendor: 'gen', cart: [{ id: 'ice_block', qty: 1 }] }); assert.equal(buy.statusCode, 200);
  const ice = await h.call({ op: 'bag.use', operationId: operationId(), uid: buy.body.goods[0].uid }); assert.equal(ice.statusCode, 200);
  const story = { version: 1, day: 1, step: 'd1_end', coins: 0, energy: 1, bag: {}, flags: {}, ledger: [], records: {}, counters: {} };
  assert.equal((await h.call({ op: 'story.saveDay', operationId: operationId(), world: 'dalbit', baseRevision: null, state: story })).statusCode, 200);
  assert.deepEqual(h.players.get(ADDRESS).fishBook, initial.fishBook); assert.deepEqual(h.players.get(ADDRESS).paidDecks, initial.paidDecks);
  assert.equal((await h.sell([c])).statusCode, 409);
});

test('accepted writes retain the per-minute operation limit after retiring the recording API', async () => {
  const { LIMITS } = await import('../server/saves/limits.ts');
  const h = saleHarness(); h.players.set(ADDRESS, { ...emptyPlayer(NOON), coins: 10000 });
  const buy = () => h.call({ op: 'shop.buy', operationId: operationId(), vendor: 'gen', cart: [{ id: 'ice_block', qty: 1 }] });
  for (let i = 0; i < LIMITS.opsPerMinute; i++) assert.equal((await buy()).statusCode, 200);
  const before = h.snapshot(); assert.equal((await buy()).statusCode, 429); assert.deepEqual(h.snapshot(), before);
  h.clock += 60000; assert.equal((await buy()).statusCode, 200);
});
