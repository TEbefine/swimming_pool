import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixtureCatch, TEST_SECRET } from './fishing-fixtures.mjs';
import { saleHarness, NOON, ADDRESS, operationId } from './sale-harness.mjs';
const { FISHING_DECK: C } = await import('../src/game/fishing/deckConfig.ts');
const { DECK_TIERS_V1, DECK_SPECIES_V1 } = await import('../src/game/fishing/deckRollV1.ts');
const { DECK_TIERS_V2, DECK_SPECIES_V2, createDeckRngV2 } = await import('../src/game/fishing/deckRollV2.ts');
const { rollDeckCatch } = await import('../src/game/fishing/deckRoll.ts');
const { fishingDeckSeed, issueFishingDeck } = await import('../server/fishing/deck.ts');
const { parseFishingDeck } = await import('../src/game/fishing/deckStore.ts');
const { parseCatchTicket } = await import('../src/game/fishing/catchTicket.ts');
const { readPaidDecks } = await import('../server/saves/deckRedemptions.ts');
const { emptyPlayer } = await import('../server/saves/rules.ts');
const { SELL, ECONOMY_SAVE } = await import('../src/game/economy/economyConfig.ts');
const { marketOf, quoteFish } = await import('../src/game/economy/market.ts');
const input = patch => ({ version: 2, seed: '0'.repeat(64), castIndex: 0,
  castInfo: { distance: .5, nice: false }, castAt: Date.UTC(2026, 9, 29, 5), ...patch });

test('v2 is current with legend weight 0.9 and 3000/day; frozen v1 and the absolute balance bound stay intact', () => {
  assert.equal(C.version, 2); assert.equal(SELL.dailyCap, 3000); assert.equal(ECONOMY_SAVE.maxBalance, 2_000_000);
  assert.equal(DECK_TIERS_V1.find(t => t.id === 'legend').weight, 3.5);
  assert.deepEqual(DECK_TIERS_V2, DECK_TIERS_V1.map(t => ({ ...t, weight: t.id === 'legend' ? .9 : t.weight })));
  assert.deepEqual(DECK_SPECIES_V2, DECK_SPECIES_V1);
  assert.ok(Object.isFrozen(DECK_TIERS_V2));
  assert.throws(() => { DECK_TIERS_V2[1].weight = 3.5; }, TypeError);
  assert.throws(() => { DECK_SPECIES_V2[0].size[0] = 99; }, TypeError);
});

test('ticket.version dispatch pins independent v2 RNG/roll vectors and version-bound owner seeds while retaining v1 vectors', () => {
  assert.deepEqual(Array.from({ length: 5 }, createDeckRngV2('0'.repeat(64), 0)),
    [.6564847743138671, .9054383407346904, .9816751775797457, .5578384608961642, .9145299920346588]);
  assert.deepEqual(rollDeckCatch(input()), { fish: 'bottle_message', sizeCm: null, baseDiff: 1, big: false });
  assert.deepEqual(rollDeckCatch(input({ castIndex: 8191, castInfo: { distance: .86, nice: true }, castAt: Date.UTC(2026, 9, 29, 15) })), { fish: 'sardine', sizeCm: 14, baseDiff: 1, big: false });
  assert.deepEqual(rollDeckCatch(input({ seed: 'f'.repeat(64), castIndex: 12, castInfo: { distance: .05, nice: false }, castAt: Date.UTC(2026, 1, 16) })), { fish: 'sardine', sizeCm: 16, baseDiff: 1, big: false });
  assert.deepEqual(rollDeckCatch(input({ seed: '0123456789abcdef'.repeat(4), castIndex: 4096, castInfo: { distance: .75, nice: false }, castAt: Date.UTC(2026, 4, 16, 12) })), { fish: 'sardine', sizeCm: 15, baseDiff: 1, big: false });
  assert.deepEqual(rollDeckCatch(input({ version: 1 })), { fish: 'barramundi', sizeCm: 54, baseDiff: 3, big: false });
  const id = Math.floor(NOON / C.windowMs), v1 = fishingDeckSeed(ADDRESS, 1, id, TEST_SECRET), v2 = fishingDeckSeed(ADDRESS, 2, id, TEST_SECRET);
  assert.notEqual(v1, v2); assert.equal(issueFishingDeck(ADDRESS, NOON, TEST_SECRET).seed, v2);
  assert.throws(() => fishingDeckSeed(ADDRESS, 3, id, TEST_SECRET), RangeError);
  for (const version of [0, 3, '2', null, undefined]) assert.throws(() => rollDeckCatch(input({ version })), RangeError);
});

test('v2 validates seed/index/canonical Nice/time and uses no ambient clock or random source', () => {
  for (const patch of [{ seed: '' }, { seed: 'F'.repeat(64) }, { castIndex: -1 }, { castIndex: 8192 },
    { castAt: -.1 }, { castAt: Infinity }, { castAt: Number.MAX_SAFE_INTEGER }, { castInfo: { distance: .8, nice: false } }]) {
    assert.throws(() => rollDeckCatch(input(patch)), RangeError);
  }
  const kinds = new Map(DECK_SPECIES_V2.map(f => [f.id, f]));
  for (const castAt of [NOON, NOON + 10 * 3600_000]) for (let castIndex = 0; castIndex < 8192; castIndex++) {
    const c = rollDeckCatch(input({ castAt, castIndex, castInfo: { distance: .85, nice: true } })), fish = kinds.get(c.fish);
    assert.ok(fish); assert.equal(c.baseDiff, fish.difficulty);
    if (fish.time) assert.equal(fish.time, castAt === NOON ? 'day' : 'night');
    if (fish.size) {
      assert.ok(Number.isInteger(c.sizeCm) && c.sizeCm >= fish.size[0] && c.sizeCm <= fish.size[1]);
      assert.equal(c.big, c.sizeCm >= fish.size[0] + (fish.size[1] - fish.size[0]) * .8);
    } else { assert.equal(c.sizeCm, null); assert.equal(c.big, false); }
  }
  const now = Date.now, random = Math.random;
  try {
    Date.now = Math.random = () => { throw Error('ambient source'); };
    for (const distance of [.8 - 1e-9, .8, .8 + 1e-9, .92 - 1e-9, .92, .92 + 1e-9]) {
      const c = input({ castInfo: { distance, nice: distance >= .8 && distance <= .92 } });
      assert.deepEqual(rollDeckCatch(c), rollDeckCatch(Object.freeze(c)));
    }
  } finally { Date.now = now; Math.random = random; }
});

test('reset-local v2 readers refuse old-version tickets/caches/active bits without dropping paid protection', async () => {
  const deck = issueFishingDeck(ADDRESS, NOON, TEST_SECRET), oldSeed = fishingDeckSeed(ADDRESS, 1, deck.deckId, TEST_SECRET);
  const ticket = { version: 1, deckId: deck.deckId, castIndex: 0, castInfo: { distance: .5, nice: false }, castAt: NOON - 1000 };
  assert.equal(parseFishingDeck({ ...deck, version: 1, seed: oldSeed }, ADDRESS), null);
  assert.equal(parseCatchTicket(ticket, NOON), null);
  const bits = [{ version: 1, deckId: deck.deckId, bits: Buffer.alloc(C.casts / 8, 255).toString('base64') }];
  assert.equal(readPaidDecks(bits, NOON).ok, false);
  const c = { ...rollDeckCatch({ ...ticket, seed: oldSeed }), caughtAt: NOON, ticket };
  const h = saleHarness(), before = h.snapshot();
  const r = await h.sell([{ fish: c.fish, sizeCm: c.sizeCm, caughtAt: c.caughtAt, ticket }]);
  assert.equal(r.statusCode, 422); assert.deepEqual(h.snapshot(), before);
  h.players.set(ADDRESS, { ...emptyPlayer(NOON), paidDecks: bits });
  const unchanged = h.snapshot(); assert.equal((await h.sell([fixtureCatch(ADDRESS, NOON - 1000)])).statusCode, 503);
  assert.deepEqual(h.snapshot(), unchanged);
});

test('actual v2 kernel matches the independently planned 100000-roll rows, including 1–2% Nice legends day and night', async () => {
  const { sampleV2Rolls } = await import('../docs/ai/analysis/ECO-03-v2-rolls.mjs');
  const planned = JSON.parse(readFileSync(new URL('../docs/ai/analysis/ECO-03-v2-model-results.json', import.meta.url), 'utf8')).odds.filter(r => r.version === 2);
  const actual = sampleV2Rolls(); assert.equal(actual.length, 10);
  for (const r of actual) {
    const expected = planned.find(p => p.context === r.context && p.mode === r.mode);
    assert.equal(r.n, 100_000); assert.equal(Object.values(r.counts).reduce((a, b) => a + b, 0), r.n);
    assert.deepEqual(r.counts, expected.counts); assert.equal(r.sellableLegend, expected.sellableLegend);
    assert.equal(r.nonSellable, expected.nonSellable);
    if (r.mode === 'Nice-far') assert.ok(r.counts.legend >= 1000 && r.counts.legend <= 2000);
  }
});

test('v2 pays at most 3000 per day: buying cannot refill it and exact Retry never pays or records again', async () => {
  const h = saleHarness(), c = fixtureCatch(ADDRESS, NOON - 1000), id = operationId();
  const price = quoteFish({ fishId: c.fish, sizeCm: c.sizeCm, caughtAt: c.caughtAt, icedMin: 0 }, NOON, marketOf(NOON), 0).price;
  const doc = emptyPlayer(NOON); doc.coins = 1_500_000; doc.econ.earnedToday = 3000 - price; h.players.set(ADDRESS, doc);
  const first = await h.sell([c], id); assert.equal(first.statusCode, 200); assert.equal(first.body.econ.earnedToday, 3000);
  const buy = await h.call({ op: 'shop.buy', operationId: operationId(), vendor: 'gen', cart: [{ id: 'ice_block', qty: 1 }] });
  assert.equal(buy.statusCode, 200); assert.equal(buy.body.econ.earnedToday, 3000);
  const next = fixtureCatch(ADDRESS, NOON - 500, { startIndex: c.ticket.castIndex + 1 }), before = h.snapshot();
  const refused = await h.sell([next]); assert.equal(refused.statusCode, 422); assert.equal(refused.body.result.keptLines[0].reason, 'daily_cap');
  assert.deepEqual(h.snapshot(), before);
  const retry = await h.sell([c], id); assert.equal(retry.statusCode, 200); assert.equal(retry.body.replayed, true);
  assert.deepEqual(retry.body.result, first.body.result); assert.deepEqual(h.snapshot(), before);
  assert.equal(h.players.get(ADDRESS).fishBook.sardine.sold, 1); assert.equal(h.logs.size, 2);
});
