import './register-api-ts.mjs';
import { fixtureCatch, saleEnv } from './fishing-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createItemsHandler, DailyLimiter } = await import('../server/saves/handlers.ts');
const { IpLimiter } = await import('../server/identity/http.ts');
const { LIMITS, STORY, emptyPlayer, normalizePlayer, playerView, checkedCoinBalance } = await import('../server/saves/rules.ts');

// ID-01 (c): /api/items with an in-memory transaction store. No Firebase, no network, no credentials.
const address = '0x' + 'ab'.repeat(20);
const origin = 'https://test-lumen-bay.vercel.app';
const env = { VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app', ECONOMY_API: 'on', ...saleEnv };
const NOON = Date.UTC(2026, 9, 10, 5, 0); // 12:00 Bangkok, rainy season
const TOKEN = 'mock-id-token-for-tests-0123456789';

function harness(start = NOON, realPlayerLimits = false, envOverride = env) {
  let clock = start;
  const players = new Map();
  const logs = new Map();
  let claims = { uid: address, walletSignedInAt: start - 60_000, walletLoginOrigin: origin };
  const services = {
    verifyToken: async token => { if (token !== TOKEN) throw new Error('bad'); return claims; },
    readControl: async () => true,
    readPlayer: async a => structuredClone(players.get(a) ?? null),
    transact: async (a, opId, fn) => {
      const key = `${a}/${opId}`;
      const out = fn(structuredClone(players.get(a) ?? null), structuredClone(logs.get(key) ?? null), {open:true});
      if (out.write) {
        if (logs.has(key)) throw new Error('log exists'); // create-only, like tx.create
        players.set(a, structuredClone(out.write.player));
        logs.set(key, structuredClone(out.write.log));
      }
      return out.response;
    },
  };
  const limits = realPlayerLimits ? {} : { playerLimiter: new IpLimiter(1000), playerDaily: new DailyLimiter(100_000) };
  const handler = createItemsHandler({ env: envOverride, now: () => clock, limiter: new IpLimiter(1000), ...limits }, services);
  return {
    players, logs,
    setClock: v => { clock = v; }, tick: ms => { clock += ms; }, now: () => clock,
    setClaims: v => { claims = v; },
    call: async (body, o = {}) => {
      if (['shop.sell','shop.buy','bag.use'].includes(body?.op)) body={econEpoch:1,...body};
      const headers = { origin, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.7', authorization: `Bearer ${TOKEN}`, ...o.headers };
      const req = { method: o.method ?? 'POST', body, headers, socket: { remoteAddress: '127.0.0.1' } };
      const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = JSON.parse(v); } };
      await handler(req, res);
      assert.equal(res.headers['Cache-Control'], 'no-store');
      return res;
    },
  };
}
let seq = 0;
const opId = () => `op-test-${String(++seq).padStart(12, '0')}`;

test('rejects non-POST, foreign origins and missing or invalid tokens', async () => {
  const h = harness();
  assert.equal((await h.call({ op: 'load' }, { method: 'GET' })).statusCode, 405);
  assert.equal((await h.call({ op: 'load' }, { headers: { origin: 'https://evil.example' } })).statusCode, 403);
  assert.equal((await h.call({ op: 'load' }, { headers: { authorization: '' } })).statusCode, 401);
  assert.equal((await h.call({ op: 'load' }, { headers: { authorization: 'Bearer wrong-token-0123456789abc' } })).statusCode, 401);
  h.setClaims({ uid: address, walletSignedInAt: NOON - 49 * 3600_000, walletLoginOrigin: origin });
  assert.equal((await h.call({ op: 'load' })).statusCode, 401, '48-hour wallet window applies to saves');
  h.setClaims({ uid: address, walletSignedInAt: NOON - 1000, walletLoginOrigin: 'https://other.vercel.app' });
  assert.equal((await h.call({ op: 'load' })).statusCode, 401, 'token from another origin');
  h.setClaims({ uid: 'not-an-address', walletSignedInAt: NOON - 1000, walletLoginOrigin: origin });
  assert.equal((await h.call({ op: 'load' })).statusCode, 401);
});

test('load returns an empty save for a new Player ID and rejects extra fields', async () => {
  const h = harness();
  const res = await h.call({ op: 'load' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { revision: 0, paidDecks: [], redeemFromDeckId: 0, fishBook: {}, totalKinds: 27, story: { dalbit: null }, econEpoch: 1, shopOpen: true, coins: 0, coolerLevel: 0, rodLevel: 0, goods: [], iceUsedAt: [], econ: { day: Math.floor((NOON + 7 * 3600_000) / 86400_000), soldToday: {}, earnedToday: 0, boughtToday: {} }, serverNow: NOON });
  assert.equal(h.players.size, 0, 'load creates no document');
  assert.equal(h.logs.size, 0);
  assert.equal((await h.call({ op: 'load', catches: [] })).statusCode, 400);
  assert.equal((await h.call({ op: 'load', extra: 1 })).statusCode, 400);
  assert.equal((await h.call({ op: 'delete' })).statusCode, 400);
});

test('Firestore-reserved names and per-player request flooding are refused', async () => {
  const h = harness(NOON, true);
  assert.equal((await h.call({ op: 'shop.sell', operationId: '__reserved_name_xx__', catches: [{ fish: 'sardine', sizeCm: 15, caughtAt: NOON - 9_000 }] })).statusCode, 400);
  const bad = await h.call({ op: 'story.saveDay', operationId: opId(), world: 'dalbit', baseRevision: null, state: { ...day1(), flags: { __name__: true } } });
  assert.equal(bad.statusCode, 422);
  // Refused saves and loads are not written, so the stored per-minute window can't see them: the
  // in-memory per-player limiter does (40/min per instance).
  let limited = false;
  for (let i = 0; i < 60 && !limited; i++) limited = (await h.call({ op: 'load' })).statusCode === 429;
  assert.ok(limited, 'flooding one Player ID with loads is limited');
  // …and per day, even when spread out under the per-minute limit.
  const d = harness(NOON, true);
  let dayLimited = false;
  for (let i = 0; i < 700 && !dayLimited; i++) { d.tick(4_000); dayLimited = (await d.call({ op: 'load' })).statusCode === 429; }
  assert.ok(dayLimited, 'a daily request cap per Player ID applies');
});

test('story flags and counters must be ones the story can actually set', async () => {
  const h = harness();
  assert.equal((await saveDay(h, { ...day1(), flags: { ...day1().flags, unlocked_day5_shop: true } }, null)).statusCode, 422);
  assert.equal((await saveDay(h, { ...day1(), counters: { free_coins: 3 } }, null)).statusCode, 422);
  const ok = await saveDay(h, { ...day1(), flags: { ...day1().flags, caught_eel: true, gave_yeot_father: true, gift_mother_d1: true }, counters: { sold_gu: 4, inn_sold_d1: 2 } }, null);
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
});

const day1 = () => ({
  version: 1, step: 'd1_end', day: 1, coins: 9, energy: 3,
  bag: { small_net: 1, mackerel: 2 }, flags: { ate_breakfast: true, day1_done: true },
  ledger: [{ day: 1, text: 'You looked into the rice jar. Lower than last week.' }],
  records: { mackerel: 38 }, counters: { inn_sold_d1: 2 },
});
const saveDay = (h, state, baseRevision, id = opId()) => h.call({ op: 'story.saveDay', operationId: id, world: 'dalbit', baseRevision, state });

test('saves the Dalbit story at the end of a day, in order, with revision checks', async () => {
  const h = harness();
  STORY.lastDay = 3; // pretend Days 2–3 have shipped
  const first = await saveDay(h, day1(), null);
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(first.body.story.dalbit.day, 1);
  assert.equal(first.body.story.dalbit.revision, 1);
  assert.deepEqual(first.body.story.dalbit.state, day1());
  assert.equal((await h.call({ op: 'load' })).body.story.dalbit.state.coins, 9);

  assert.equal((await saveDay(h, day1(), 1)).statusCode, 409, 'day 1 cannot be saved twice (no coin farming)');
  const d2 = { ...day1(), day: 2, step: 'd2_end', coins: 20, ledger: [...day1().ledger, { day: 2, text: 'Day two.' }] };
  assert.equal((await saveDay(h, d2, null)).statusCode, 409, 'stale base revision');
  assert.equal((await saveDay(h, { ...d2, ledger: [{ day: 2, text: 'Rewritten history.' }] }, 1)).statusCode, 422, 'ledger only grows');
  const ok = await saveDay(h, d2, 1);
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.story.dalbit.revision, 2);
  STORY.lastDay = 1;
  const d3 = { ...d2, day: 3, step: 'd3_end' };
  assert.equal((await saveDay(h, d3, 2)).statusCode, 422, 'days the game does not have yet are refused');
});

test('a missed day-end save is caught up by the next day, with bounds scaled by the days covered', async () => {
  const h = harness();
  STORY.lastDay = 3;
  try {
    const d2 = { ...day1(), day: 2, step: 'd2_end', coins: 2 * LIMITS.coinGainPerDay };
    const res = await saveDay(h, d2, null);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal((await saveDay(h, { ...day1(), day: 3, step: 'd3_end', coins: 2 * LIMITS.coinGainPerDay + LIMITS.coinGainPerDay + 1 }, 1)).statusCode, 422);
  } finally { STORY.lastDay = 1; }
});

test('refuses impossible story states', async () => {
  const h = harness();
  const bad = async (patch, status, why) => {
    const res = await saveDay(h, { ...day1(), ...patch }, null);
    assert.equal(res.statusCode, status, `${why}: ${JSON.stringify(res.body)}`);
  };
  await bad({ step: 'd1_market' }, 409, 'mid-day');
  await bad({ day: 2, step: 'd2_end' }, 422, 'Day 2 is not in the game yet');
  await bad({ coins: LIMITS.coinGainPerDay + 1 }, 422, 'too many coins');
  await bad({ coins: -1 }, 422, 'negative coins');
  await bad({ energy: 11 }, 422, 'energy above 10');
  await bad({ bag: { gold_bar: 1 } }, 422, 'unknown item');
  await bad({ bag: { small_net: 2 } }, 422, 'two key items');
  await bad({ bag: { mackerel: 31 } }, 422, 'one item grew more than a day allows');
  await bad({ bag: { mackerel: 20, eel: 20, clams: 21 } }, 422, 'the whole bag grew more than a day allows');
  await bad({ records: { mackerel: 500 } }, 422, 'record outside size range');
  await bad({ flags: { 'Bad Key': true } }, 422, 'flag key');
  await bad({ ledger: [{ day: 1, text: 'x'.repeat(LIMITS.maxLedgerText + 1) }] }, 422, 'long ledger text');
  await bad({ version: 2 }, 422, 'version');
  const extra = { ...day1(), admin: true };
  assert.equal((await saveDay(h, extra, null)).statusCode, 422, 'unexpected field');
  assert.equal((await h.call({ op: 'story.saveDay', operationId: opId(), world: 'lumen', baseRevision: null, state: day1() })).statusCode, 400);
  assert.equal(h.players.size, 0);
});

test('bodies over the size limit are refused before any work', async () => {
  const h = harness();
  const res = await h.call({ op: 'story.saveDay', operationId: opId(), world: 'dalbit', baseRevision: null, state: { ...day1(), pad: 'x'.repeat(30_000) } });
  assert.equal(res.statusCode, 413);
});


// ECO-02(a): schema/load only. No money endpoint or client-cache migration yet.
test('goods expire exactly at expiresAt; keepers survive; load never writes cleanup', async () => {
  const h = harness();
  const keeper = { uid: 'nori-1', id: 'nori', qty: 2, at: NOON - 100, expiresAt: null };
  const food = { uid: 'food-1', id: 'sashimi_akami', qty: 1, at: NOON - 100, expiresAt: NOON + 1 };
  h.players.set(address, { ...emptyPlayer(NOON), coins: 123, coolerLevel: 2, goods: [keeper, food] });
  assert.deepEqual((await h.call({ op: 'load' })).body.goods, [keeper, food]);
  h.tick(1);
  const res = await h.call({ op: 'load' });
  assert.deepEqual(res.body.goods, [keeper]);
  assert.equal(res.body.coins, 123);
  assert.equal(res.body.coolerLevel, 2);
  assert.equal(h.players.get(address).goods.length, 2, 'read-only expiry');
  assert.equal(h.logs.size, 0);
  await saveDay(h, day1(), null);
  assert.deepEqual(h.players.get(address).goods, [keeper], 'next accepted write persists cleanup');
  assert.equal(h.players.get(address).coins, 123);
});

test('Bangkok midnight resets only economy daily counters', () => {
  const midnight = Date.UTC(2026, 9, 10, 17);
  const doc = emptyPlayer(midnight - 1);
  doc.coins = 90; doc.coolerLevel = 1;
  doc.econ.soldToday = { sardine: 3 }; doc.econ.boughtToday = { nori: 2 }; doc.econ.earnedToday = 50;
  assert.equal(normalizePlayer(doc, midnight - 1).econ.earnedToday, 50);
  const next = normalizePlayer(doc, midnight);
  assert.deepEqual(next.econ, emptyPlayer(midnight).econ);
  assert.equal(next.coins, 90);
  assert.equal(next.coolerLevel, 1);
  assert.equal(doc.econ.earnedToday, 50, 'normalization is pure');
});

test('malformed economy values, oversized bags and duplicate goods cannot inflate a save', () => {
  const good = { uid: 'nori-1', id: 'nori', qty: 20, at: NOON, expiresAt: null };
  const raw = { ...emptyPlayer(NOON), coins: -2, coolerLevel: 3,
    goods: [good, good, { ...good, uid: 'x'.repeat(65) }, { ...good, uid: 'bad-stack', qty: 21 },
      { ...good, uid: 'bad-id', id: 'invented' }, { ...good, uid: 'food', id: 'sashimi_akami', qty: 1 },
      { ...good, uid: 'bad-date', at: NaN }, { ...good, uid: 'upgrade', id: 'cooler_box' }],
  };
  raw.econ.soldToday = { sardine: 3, invented: 999, tilapia: -1 };
  raw.econ.boughtToday = { nori: 2, invented: 100, ice_block: 401 };
  raw.econ.earnedToday = Infinity;
  const view = playerView(normalizePlayer(raw, NOON));
  assert.equal(view.coins, 0); assert.equal(view.coolerLevel, 0);
  assert.deepEqual(view.goods.map(g => g.uid), ['nori-1', 'food']);
  assert.deepEqual(view.econ.soldToday, { sardine: 3 });
  assert.deepEqual(view.econ.boughtToday, { nori: 2, ice_block: 400 });
  assert.equal(view.econ.earnedToday, 3000);
  for (const value of [NaN, '999']) {
    assert.equal(normalizePlayer({ ...raw, coins: value }, NOON).coins, 0);
  }
  const full = Array.from({ length: 21 }, (_, i) => ({ ...good, uid: `nori-${i}` }));
  assert.equal(normalizePlayer({ ...raw, goods: full }, NOON).goods.length, 20);
});

test('40 accepted operations exhaust the shared daily budget; replay and load do not consume it', async () => {
  const h = harness(); h.players.set(address, { ...emptyPlayer(NOON), coins: 10000 });
  let body;
  for (let i = 0; i < LIMITS.opsPerDay; i++) {
    h.tick(61000); body = { op: 'shop.buy', operationId: opId(), vendor: 'gen', cart: [{ id: 'ice_block', qty: 1 }] };
    assert.equal((await h.call(body)).statusCode, 200);
  }
  assert.equal((await h.call(body)).body.replayed, true);
  assert.equal((await h.call({ op: 'load' })).statusCode, 200);
  assert.equal((await h.call({ ...body, operationId: opId() })).statusCode, 429);
  assert.equal(h.logs.size, 40);
  h.setClock(Date.UTC(2026, 9, 10, 17));
  assert.equal((await h.call({ ...body, operationId: opId() })).statusCode, 200);
  assert.equal(h.players.get(address).writeDay.count, 1);
});

test('incomplete economy operations and client-authoritative fields are refused', async () => {
  const h = harness();
  for (const op of ['shop.sell', 'shop.buy', 'bag.use']) {
    assert.equal((await h.call({ op, operationId: opId() })).statusCode, 400);
  }
  assert.equal((await h.call({ op: 'load', coins: 999 })).statusCode, 400);
  assert.equal(h.players.size, 0);
});

test('new economy fields have an explicit maximum serialized size with the current catalogues', async () => {
  const { ALL_FREE_FISH } = await import('../src/game/fishing/freeFishCatalog.ts');
  const { SHOP_ITEMS } = await import('../src/game/economy/shopCatalog.ts');
  const { BAG, ECONOMY_SAVE, SELL, SHOP } = await import('../src/game/economy/economyConfig.ts');
  assert.equal(ALL_FREE_FISH.length, 64, 'update documented storage budget when the catalogue grows');
  assert.equal(SHOP_ITEMS.length, 52, 'update documented storage budget when the catalogue grows');
  const now = Number.MAX_SAFE_INTEGER - 1;
  const raw = emptyPlayer(now);
  raw.coins = ECONOMY_SAVE.maxBalance; raw.coolerLevel = 2; raw.rodLevel = 3;
  const longestFood = SHOP_ITEMS.filter(i => i.perishMin && !i.soon).sort((a, b) => b.id.length - a.id.length)[0];
  raw.goods = Array.from({ length: BAG.slots }, (_, i) => ({
    uid: String(i).padStart(ECONOMY_SAVE.goodsUidMaxLength, 'a'), id: longestFood.id,
    qty: BAG.maxStack, at: now, expiresAt: Number.MAX_SAFE_INTEGER,
  }));
  raw.econ.soldToday = Object.fromEntries(ALL_FREE_FISH.map(f => [f.id, LIMITS.catchesPerDay]));
  raw.econ.boughtToday = Object.fromEntries(SHOP_ITEMS.map(i => [i.id, LIMITS.opsPerDay * SHOP.maxCart]));
  raw.econ.earnedToday = SELL.dailyCap;
  const { coins, coolerLevel, rodLevel, goods, econ } = normalizePlayer(raw, now);
  const size = Buffer.byteLength(JSON.stringify({ coins, coolerLevel, rodLevel, goods, econ }));
  assert.equal(goods.length, BAG.slots);
  assert.equal(size, 5353, 'maximum compact JSON bytes; not Firestore billing/storage bytes');
});

test('lowering economy configuration clamps counters rather than granting a fresh allowance', async () => {
  const { SELL } = await import('../src/game/economy/economyConfig.ts');
  const raw = emptyPlayer(NOON);
  raw.econ.earnedToday = SELL.dailyCap;
  raw.econ.soldToday = { sardine: LIMITS.catchesPerDay + 1 };
  raw.econ.boughtToday = { nori: LIMITS.opsPerDay * 10 };
  const oldCap = SELL.dailyCap, oldOps = LIMITS.opsPerDay;
  try {
    SELL.dailyCap = 100;
    LIMITS.opsPerDay = 2;
    const next = normalizePlayer(raw, NOON);
    assert.equal(next.econ.earnedToday, 100);
    assert.equal(next.econ.boughtToday.nori, 20);
    assert.equal(next.econ.soldToday.sardine, LIMITS.catchesPerDay);
    assert.equal(raw.econ.earnedToday, oldCap, 'no mutation of stored input');
  } finally { SELL.dailyCap = oldCap; LIMITS.opsPerDay = oldOps; }
});

test('absolute balance maximum survives a reduced daily earnings cap on reads and strict writes', async () => {
  const { SELL, ECONOMY_SAVE } = await import('../src/game/economy/economyConfig.ts');
  const oldCap = SELL.dailyCap;
  try {
    SELL.dailyCap = 3000;
    for (const coins of [1_500_000, 2_000_000]) {
      const raw = { ...emptyPlayer(NOON), coins };
      assert.equal(normalizePlayer(raw, NOON).coins, coins, 'lower daily earnings must not shrink savings');
      assert.equal(checkedCoinBalance(coins), coins);
      assert.equal(raw.coins, coins);
    }
    assert.equal(ECONOMY_SAVE.maxBalance, 2_000_000);
    assert.equal(normalizePlayer({ coins: 2_000_001 }, NOON).coins, ECONOMY_SAVE.maxBalance);
    for (const bad of [2_000_001, Infinity, NaN, -1, 1.5]) {
      assert.throws(() => checkedCoinBalance(bad), /too many coins/);
    }
  } finally { SELL.dailyCap = oldCap; }
});

test('reduced daily cap preserves savings through load, Gen sale, exact Retry, buy, ice and story writes', async () => {
  const { SELL } = await import('../src/game/economy/economyConfig.ts');
  const h = harness();
  h.players.set(address, { ...emptyPlayer(NOON), coins: 1_500_000 });
  const body = { op: 'shop.sell', operationId: opId(), catches: [fixtureCatch(address, NOON - 1000)] };
  const first = await h.call(body);
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  let balance = 1_500_000 + first.body.result.earned;
  assert.equal(first.body.coins, balance);
  const oldCap = SELL.dailyCap;
  try {
    SELL.dailyCap = 3000;
    const before = structuredClone(h.players.get(address));
    const loaded = await h.call({ op: 'load' });
    assert.equal(loaded.statusCode, 200);
    assert.equal(loaded.body.coins, balance);
    assert.deepEqual(h.players.get(address), before, 'load must not rewrite the stored balance');
    const retry = await h.call(body);
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.body.replayed, true);
    assert.deepEqual(retry.body.result, first.body.result, 'original receipt survives cap changes');
    assert.equal(retry.body.coins, balance);
    assert.deepEqual(h.players.get(address), before);
    assert.equal(h.logs.size, 1, 'Retry creates no second payment/log');
    const buy = await h.call({ op: 'shop.buy', operationId: opId(), vendor: 'gen', cart: [{ id: 'ice_block', qty: 1 }] });
    assert.equal(buy.statusCode, 200, JSON.stringify(buy.body));
    balance -= buy.body.result.spent;
    assert.equal(buy.body.coins, balance);
    const ice = await h.call({ op: 'bag.use', operationId: opId(), uid: buy.body.goods[0].uid });
    assert.equal(ice.statusCode, 200, JSON.stringify(ice.body));
    assert.equal(ice.body.coins, balance);
    const story = await saveDay(h, day1(), null);
    assert.equal(story.statusCode, 200, JSON.stringify(story.body));
    assert.equal(story.body.coins, balance);
    assert.equal(h.players.get(address).coins, balance);
    assert.deepEqual(h.players.get(address).fishBook, before.fishBook);
    assert.deepEqual(h.players.get(address).paidDecks, before.paidDecks);
    assert.equal(h.logs.size, 4);
  } finally { SELL.dailyCap = oldCap; }
});

test('catalogue perishability changes repair clocks and preserve all units in old stacks', async () => {
  const { SHOP_BY_ID } = await import('../src/game/economy/shopCatalog.ts');
  const item = SHOP_BY_ID.nori;
  const old = item.perishMin;
  const goods = [{ uid: 'nori-stack', id: 'nori', qty: 20, at: NOON, expiresAt: null }];
  try {
    item.perishMin = 60;
    const repaired = normalizePlayer({ ...emptyPlayer(NOON), goods }, NOON).goods;
    assert.deepEqual(repaired, [{ ...goods[0], expiresAt: NOON + 3600_000 }]);
    assert.equal(normalizePlayer({ ...emptyPlayer(NOON), goods }, NOON + 3600_000).goods.length, 0, 'genuinely expired food is removed');
    delete item.perishMin;
    assert.deepEqual(normalizePlayer({ ...emptyPlayer(NOON), goods: repaired }, NOON + 3600_000).goods, goods, 'food -> keeper survives its old deadline');
  } finally {
    if (old === undefined) delete item.perishMin; else item.perishMin = old;
  }
});

test('balance reads clamp without throwing; commit guard still refuses invalid balances', async () => {
  const { ECONOMY_SAVE } = await import('../src/game/economy/economyConfig.ts');
  const cap = ECONOMY_SAVE.maxBalance;
  assert.equal(cap, 2_000_000);
  assert.equal(checkedCoinBalance(cap), cap);
  const cases = [[cap + 1, cap], [Number.MAX_SAFE_INTEGER, cap], [Infinity, cap],
    [1.5, 1], [-1, 0], [-Infinity, 0], [NaN, 0], [undefined, 0], ['999', 0]];
  for (const [value, expected] of cases) {
    assert.equal(normalizePlayer({ ...emptyPlayer(NOON), coins: value }, NOON).coins, expected);
  }
  for (const value of [cap + 1, Number.MAX_SAFE_INTEGER, Infinity, 1.5, -1, NaN]) {
    assert.throws(() => checkedCoinBalance(value), /too many coins/);
  }
  const h = harness();
  h.players.set(address, { ...emptyPlayer(NOON), coins: cap + 1 });
  const before = structuredClone(h.players.get(address));
  const loaded = await h.call({ op: 'load' });
  assert.equal(loaded.statusCode, 200);
  assert.equal(loaded.body.coins, cap);
  assert.deepEqual(h.players.get(address), before, 'load clamps its view without writing');
  assert.equal(h.logs.size, 0);
  const saved = await saveDay(h, day1(), null);
  assert.equal(saved.statusCode, 200, 'bad stored coins do not block unrelated saves');
  assert.equal(h.players.get(address).coins, cap);
});

// Verified Gen sale fixtures; the shared deterministic roll chooses every claimed fish/size.
const sell = (h, catches, id = opId()) => h.call({ op: 'shop.sell', operationId: id, catches });
let fixtureIndex = 0;
const sardine = (at, sizeCm) => { const c = fixtureCatch(address, at, { size: sizeCm, startIndex: fixtureIndex }); fixtureIndex = c.ticket.castIndex + 1; return c; };
const stateOf = h => structuredClone({ players: [...h.players], logs: [...h.logs] });

const buyOrder = (h, cart, extra = {}) => h.call({ op: 'shop.buy', operationId: opId(), vendor: 'gen', cart, ...extra });
const useIce = (h, uid, extra = {}) => h.call({ op: 'bag.use', operationId: opId(), uid, ...extra });
function funded(coins = 10000, at = NOON) {
  const h = harness(at); h.players.set(address, { ...emptyPlayer(at), coins }); return h;
}
test('buy: food slots, keeper stacks, receipt compatibility, upgrade order and expiry preservation', async () => {
  const h = funded();
  const r = await buyOrder(h, [{ id: 'nori', qty: 10 }]);
  assert.equal(r.statusCode, 200); assert.equal(r.body.goods[0].qty, 10);
  assert.equal(r.body.result.expectedTotal, null);
  await buyOrder(h, [{ id: 'nori', qty: 10 }]);
  await buyOrder(h, [{ id: 'nori', qty: 1 }]);
  assert.deepEqual(h.players.get(address).goods.map(g => g.qty), [20, 1]);
  const food = await buyOrder(h, [{ id: 'sashimi_tai', qty: 2 }], { vendor: 'minato' });
  assert.equal(food.statusCode, 200);
  const pieces = food.body.goods.filter(g => g.id === 'sashimi_tai');
  assert.equal(pieces.length, 2); assert.ok(pieces.every(g => g.qty === 1 && g.expiresAt === NOON + 3600000));
  assert.notEqual(pieces[0].uid, pieces[1].uid);
  const { buyReceipt } = await import('../src/game/economy/receipt.ts');
  assert.equal(buyReceipt('minato', food.body.result.bought, food.body.result.balanceAfter, NOON).total, food.body.result.spent);
  h.players.get(address).goods.find(g => g.uid === pieces[0].uid).expiresAt = NOON + 7200000;
  h.tick(3600001);
  const later = await buyOrder(h, [{ id: 'nori', qty: 1 }]);
  assert.equal(later.body.goods.filter(g => g.id === 'sashimi_tai').length, 1);
  assert.equal(later.body.goods.find(g => g.uid === pieces[0].uid).expiresAt, NOON + 7200000);
  for (const [level, spent] of [[1,400],[2,900]]) {
    const upgrade = await buyOrder(h, [{ id: 'cooler_box', qty: 1 }]);
    assert.equal(upgrade.statusCode, 200); assert.equal(upgrade.body.coolerLevel, level); assert.equal(upgrade.body.result.spent, spent);
  }
  assert.equal((await buyOrder(h, [{ id: 'cooler_box', qty: 1 }])).statusCode, 422);
});
test('buy rejects cheats atomically, including daily limits, full bag and malformed quantities', async () => {
  for (const [coins, cart, extra] of [
    [0,[{id:'nori',qty:1}],{}], [10000,[{id:'nori',qty:11}],{}],
    [10000,[{id:'nori',qty:1,price:0}],{}], [10000,[{id:'nori',qty:1}],{price:0}],
    [10000,[{id:'sashimi_tai',qty:1}],{}], [10000,[{id:'fish_crate',qty:1}],{}],
    [10000,[{id:'cooler_box',qty:2}],{}], [10000,[{id:'nori',qty:0}],{}],
    [10000,[{id:'nori',qty:1.5}],{}], [10000,[{id:'__proto__',qty:1}],{}],
    [10000,[{id:'nori',qty:1}],{expectedTotal:-1}], [10000,[{id:'nori',qty:1}],{expectedTotal:null}],
  ]) {
    const h = funded(coins), before = structuredClone(h.players.get(address));
    assert.notEqual((await buyOrder(h, cart, extra)).statusCode, 200);
    assert.deepEqual(h.players.get(address), before); assert.equal(h.logs.size, 0);
  }
  const h = funded();
  assert.equal((await buyOrder(h,[{id:'sashimi_otoro',qty:2}],{vendor:'minato'})).statusCode,200);
  const before = structuredClone(h.players.get(address));
  assert.equal((await buyOrder(h,[{id:'sashimi_otoro',qty:1}],{vendor:'minato'})).statusCode,422);
  assert.deepEqual(h.players.get(address),before);
  const full = funded();
  for(let i=0;i<2;i++) assert.equal((await buyOrder(full,[{id:'sashimi_tai',qty:10}],{vendor:'minato'})).statusCode,200);
  assert.equal((await buyOrder(full,[{id:'nori',qty:1}])).statusCode,422);
});
test('expectedTotal protects midnight special, accepts lower totals, and participates in replay hash', async () => {
  const { marketOf, itemPrice } = await import('../src/game/economy/market.ts');
  let midnight = Date.UTC(2026,9,10,17);
  while(marketOf(midnight-1).special === marketOf(midnight).special) midnight += 86400000;
  const old = marketOf(midnight-1).special;
  const expected = itemPrice(old, marketOf(midnight-1),0,[400,900]);
  const h = funded(10000, midnight-1); h.tick(1);
  const denied = await buyOrder(h,[{id:old,qty:1}],{vendor:'minato',expectedTotal:expected});
  assert.equal(denied.statusCode,409); assert.equal(denied.body.error,'Prices just changed. Take another look.'); assert.equal(h.logs.size,0);
  const id = opId();
  const accepted = await buyOrder(h,[{id:'nori',qty:1}],{operationId:id,expectedTotal:100});
  assert.equal(accepted.body.result.spent,30); assert.equal(accepted.body.result.expectedTotal,100);
  h.tick(86400000);
  const replay = await buyOrder(h,[{id:'nori',qty:1}],{operationId:id,expectedTotal:100});
  assert.deepEqual(replay.body.result,accepted.body.result); assert.equal(replay.body.replayed,true);
  assert.equal((await buyOrder(h,[{id:'nori',qty:2}],{operationId:id,expectedTotal:100})).statusCode,409);
  assert.equal((await buyOrder(h,[{id:'nori',qty:1}],{operationId:id,expectedTotal:101})).statusCode,409);
  assert.equal((await buyOrder(h,[{id:old,qty:1}],{vendor:'minato'})).statusCode,200);
});
test('ice pure boundaries, spending, replay, retention and capacity', async () => {
  const { iceMinutesFor } = await import('../src/game/economy/market.ts');
  const m=60000;
  assert.equal(iceMinutesFor(NOON,[NOON-1]),0);
  assert.equal(iceMinutesFor(NOON,[NOON+30*m]),0);
  assert.equal(iceMinutesFor(NOON,[NOON+29*m,NOON+44*m,NOON+45*m]),30);
  assert.equal(iceMinutesFor(NOON,[NOON+29*m,NOON+45*m]),15);
  const h=funded();
  assert.equal((await useIce(h,'missing')).statusCode,422);
  await buyOrder(h,[{id:'ice_block',qty:10}]); await buyOrder(h,[{id:'ice_block',qty:10}]);
  const uid=h.players.get(address).goods[0].uid, id=opId();
  const used=await useIce(h,uid,{operationId:id}); assert.equal(used.statusCode,200);
  const replay=await useIce(h,uid,{operationId:id}); assert.equal(replay.body.replayed,true); assert.deepEqual(replay.body.result,used.body.result);
  for(let i=1;i<16;i++) assert.equal((await useIce(h,uid)).statusCode,200);
  assert.equal(h.players.get(address).goods[0].qty,4);
  const before=structuredClone(h.players.get(address));
  assert.equal((await useIce(h,uid)).statusCode,409); assert.deepEqual(h.players.get(address),before);
  h.tick(3610000); assert.equal((await useIce(h,uid)).statusCode,200); assert.equal(h.players.get(address).iceUsedAt.length,1);
  await buyOrder(h,[{id:'nori',qty:1}]);
  const other=h.players.get(address).goods.find(g=>g.id==='nori').uid;
  assert.equal((await useIce(h,other)).body.error,'Eating and gifts come later');
});
test('reversed sale retains original indices and uses confirmed ice for both validity and price', async () => {
  const h=funded(); h.players.get(address).iceUsedAt=[NOON-10*60000];
  const reversed=[sardine(NOON-10000),sardine(NOON-35*60000),sardine(NOON-59*60000)];
  const r=await sell(h,reversed); assert.equal(r.statusCode,200);
  assert.deepEqual(r.body.result.sold.map(l=>l.index),[1,0]);
  assert.deepEqual(r.body.result.keptLines.map(l=>l.index),[2]);
  assert.equal(r.body.result.sold[0].fresh.id,'tired');
  assert.equal((await sell(funded(),[{...sardine(NOON-10000),icedMin:30}])).statusCode,400);
});
test('ice history has explicit storage bounds, survives midnight and never truncates live events', async () => {
  const { ICE } = await import('../src/game/economy/economyConfig.ts');
  assert.equal(ICE.maxEvents,16); assert.equal(ICE.retentionMs,3610000);
  assert.equal(JSON.stringify(Array(16).fill(9999999999999)).length,225);
  assert.equal(JSON.stringify(Array(16).fill(Number.MAX_SAFE_INTEGER)).length,273);
  const midnight=Date.UTC(2026,9,10,17), h=funded(1000,midnight-1);
  await buyOrder(h,[{id:'ice_block',qty:2}]); const uid=h.players.get(address).goods[0].uid;
  await useIce(h,uid); h.tick(1);
  assert.deepEqual((await h.call({op:'load'})).body.iceUsedAt,[midnight-1]);
  const raw=h.players.get(address); raw.iceUsedAt=Array(17).fill(midnight-1);
  const before=structuredClone(raw);
  assert.equal((await useIce(h,uid)).statusCode,409); assert.deepEqual(h.players.get(address),before);
  assert.equal((await h.call({op:'load'})).body.iceUsedAt.length,17);
});

// ECO-02(d): the server switch. Production keeps money ops closed until ECO-04 flips ECONOMY_API.
test('with ECONOMY_API off, sell/buy/use refuse and write nothing; load still works and the recording API is retired', async () => {
  for (const offEnv of [{ VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app' }, { VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app', ECONOMY_API: 'true' }]) {
    const h = harness(NOON, false, offEnv);
    const before = stateOf(h);
    for (const body of [
      { op: 'shop.sell', operationId: opId(), catches: [sardine(NOON - 60_000)] },
      { op: 'shop.buy', operationId: opId(), vendor: 'gen', cart: [{ id: 'ice_block', qty: 1 }] },
      { op: 'bag.use', operationId: opId(), uid: 'abc' },
    ]) {
      const r = await h.call(body);
      assert.equal(r.statusCode, 403, body.op);
      assert.equal(r.body.error, "The shop isn't open yet.");
      assert.equal(r.body.shopClosed, true);
    }
    assert.deepEqual(stateOf(h), before, 'a closed shop changes nothing');
    const loaded = await h.call({ op: 'load' });
    assert.equal(loaded.statusCode, 200);
    assert.equal(loaded.body.coins, 0, 'load still shows the economy fields');
    assert.equal((await h.call({ op: 'fishbook.record', operationId: opId(), catches: [sardine(NOON - 10_000)] })).statusCode, 400, 'recording is retired');
  }
  // and with the switch on, the same sale goes through
  const on = harness();
  assert.equal((await sell(on, [sardine(NOON - 60_000)])).statusCode, 200);
});
