import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createItemsHandler, DailyLimiter } = await import('../server/saves/handlers.ts');
const { IpLimiter } = await import('../server/identity/http.ts');
const { LIMITS, STORY, emptyPlayer, normalizePlayer, playerView, checkedCoinBalance } = await import('../server/saves/rules.ts');

// ID-01 (c): /api/items with an in-memory transaction store. No Firebase, no network, no credentials.
const address = '0x' + 'ab'.repeat(20);
const origin = 'https://test-lumen-bay.vercel.app';
const env = { VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app', ECONOMY_API: 'on' };
const NOON = Date.UTC(2026, 9, 10, 5, 0); // 12:00 Bangkok, rainy season
const NIGHT = Date.UTC(2026, 9, 10, 15, 0); // 22:00 Bangkok
const TOKEN = 'mock-id-token-for-tests-0123456789';

function harness(start = NOON, realPlayerLimits = false, envOverride = env) {
  let clock = start;
  const players = new Map();
  const logs = new Map();
  let claims = { uid: address, walletSignedInAt: start - 60_000, walletLoginOrigin: origin };
  const services = {
    verifyToken: async token => { if (token !== TOKEN) throw new Error('bad'); return claims; },
    readPlayer: async a => structuredClone(players.get(a) ?? null),
    transact: async (a, opId, fn) => {
      const key = `${a}/${opId}`;
      const out = fn(structuredClone(players.get(a) ?? null), structuredClone(logs.get(key) ?? null));
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
const record = (h, catches, id = opId()) => h.call({ op: 'fishbook.record', operationId: id, catches });

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
  assert.deepEqual(res.body, { revision: 0, fishBook: {}, fishTotal: 0, lastCatchAt: null, story: { dalbit: null }, coins: 0, coolerLevel: 0, goods: [], iceUsedAt: [], econ: { day: Math.floor((NOON + 7 * 3600_000) / 86400_000), soldToday: {}, earnedToday: 0, boughtToday: {} }, serverNow: NOON });
  assert.equal(h.players.size, 0, 'load creates no document');
  assert.equal(h.logs.size, 0);
  assert.equal((await h.call({ op: 'load', catches: [] })).statusCode, 400);
  assert.equal((await h.call({ op: 'load', extra: 1 })).statusCode, 400);
  assert.equal((await h.call({ op: 'delete' })).statusCode, 400);
});

test('records valid catches once, with an append-only log, and replays retries safely', async () => {
  const h = harness();
  const t = NOON - 60_000;
  const catches = [
    { fish: 'sardine', sizeCm: 15, caughtAt: t },
    { fish: 'sardine', sizeCm: 20, caughtAt: t + 5_000 },
    { fish: 'bottle_message', sizeCm: null, caughtAt: t + 10_000 },
  ];
  const id = opId();
  const first = await record(h, catches, id);
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(first.body.revision, 1);
  assert.equal(first.body.fishTotal, 3);
  assert.deepEqual(first.body.fishBook.sardine, { count: 2, best: 20, first: t, last: t + 5_000 });
  assert.deepEqual(first.body.result.newKinds, ['sardine', 'bottle_message']);
  assert.equal(h.logs.size, 1);
  const log = [...h.logs.values()][0];
  assert.equal(log.op, 'fishbook.record');
  assert.equal(log.prevRevision, 0);
  assert.equal(log.newRevision, 1);
  assert.match(log.requestHash, /^[0-9a-f]{64}$/);

  // Network retry: same operation, same catches (keys in another order) → same answer, no double count.
  const retry = await record(h, catches.map(c => ({ caughtAt: c.caughtAt, sizeCm: c.sizeCm, fish: c.fish })), id);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.replayed, true);
  assert.equal(retry.body.fishTotal, 3);
  assert.equal(h.logs.size, 1);

  // Same operation id, different content → refused.
  assert.equal((await record(h, [{ fish: 'sardine', sizeCm: 22, caughtAt: t + 20_000 }], id)).statusCode, 409);

  // The same catches again under a new id are older than the newest recorded catch → refused.
  assert.equal((await record(h, catches)).statusCode, 422);
});

test('refuses catches that break the catalogue, sizes, time, season or speed rules', async () => {
  const h = harness();
  const t = NOON - 120_000;
  const bad = async (c, why) => {
    const res = await record(h, [c]);
    assert.equal(res.statusCode, 422, `${why}: ${JSON.stringify(res.body)}`);
  };
  await bad({ fish: 'golden_dragon', sizeCm: 10, caughtAt: t }, 'unknown fish');
  await bad({ fish: 'mango_threadfin', sizeCm: 20, caughtAt: t }, 'sheet C is not in the game yet');
  await bad({ fish: 'sardine', sizeCm: 99, caughtAt: t }, 'size above range');
  await bad({ fish: 'sardine', sizeCm: 15.5, caughtAt: t }, 'sizes are whole cm');
  await bad({ fish: 'sardine', sizeCm: null, caughtAt: t }, 'missing size');
  await bad({ fish: 'bottle_message', sizeCm: 5, caughtAt: t }, 'no size for a bottle');
  await bad({ fish: 'jade_moon_koi', sizeCm: 60, caughtAt: t }, 'night fish at noon');
  await bad({ fish: 'sardine', sizeCm: 15, caughtAt: NOON + 5 * 60_000 }, 'future');
  await bad({ fish: 'sardine', sizeCm: 15, caughtAt: NOON - 8 * 24 * 3600_000 }, 'older than a week');
  const unordered = await record(h, [{ fish: 'sardine', sizeCm: 15, caughtAt: t + 9_000 }, { fish: 'sardine', sizeCm: 15, caughtAt: t }]);
  assert.equal(unordered.statusCode, 400);
  assert.equal(h.players.size, 0, 'nothing was written by any refused request');
  assert.equal((await h.call({ op: 'fishbook.record', operationId: 'short', catches: [] })).statusCode, 400);
  assert.equal((await h.call({ op: 'fishbook.record', operationId: opId(), catches: [{ fish: 'sardine', sizeCm: 15, caughtAt: t, extra: 1 }] })).statusCode, 400);
  const many = Array.from({ length: LIMITS.catchesPerRequest + 1 }, (_, i) => ({ fish: 'sardine', sizeCm: 15, caughtAt: t + i * 5_000 }));
  assert.equal((await record(h, many)).statusCode, 400);
});

test('a batch keeps its valid catches and reports the bad ones (one bad catch never sinks the rest)', async () => {
  const h = harness();
  const t = NOON - 120_000;
  const res = await record(h, [
    { fish: 'sardine', sizeCm: 15, caughtAt: t },
    { fish: 'sardine', sizeCm: 16, caughtAt: t + 1_000 }, // faster than anyone can fish
    { fish: 'jade_moon_koi', sizeCm: 60, caughtAt: t + 10_000 }, // night fish at noon
    { fish: 'sardine', sizeCm: 99, caughtAt: t + 20_000 }, // impossible size
    { fish: 'tilapia', sizeCm: 20, caughtAt: t + 30_000 },
  ]);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.result.recorded, 2);
  assert.deepEqual(res.body.result.rejected.map(r => r.index), [1, 2, 3]);
  assert.equal(res.body.fishTotal, 2);
  assert.equal(res.body.lastCatchAt, t + 30_000);
});

test('Firestore-reserved names and per-player request flooding are refused', async () => {
  const h = harness(NOON, true);
  assert.equal((await h.call({ op: 'fishbook.record', operationId: '__reserved_name_xx__', catches: [{ fish: 'sardine', sizeCm: 15, caughtAt: NOON - 9_000 }] })).statusCode, 400);
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

test('night fish are accepted at night, day fish by day', async () => {
  const h = harness(NIGHT);
  const res = await record(h, [{ fish: 'jade_moon_koi', sizeCm: 70, caughtAt: NIGHT - 30_000 }]);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal((await record(h, [{ fish: 'sun_carp', sizeCm: 120, caughtAt: NIGHT - 10_000 }])).statusCode, 422);
});

test('limits save operations per player per minute', async () => {
  const h = harness();
  let t = NOON - 10 * 60_000;
  for (let i = 0; i < LIMITS.opsPerMinute; i++) {
    const res = await record(h, [{ fish: 'sardine', sizeCm: 15, caughtAt: (t += 5_000) }]);
    assert.equal(res.statusCode, 200, `op ${i}: ${JSON.stringify(res.body)}`);
  }
  assert.equal((await record(h, [{ fish: 'sardine', sizeCm: 15, caughtAt: (t += 5_000) }])).statusCode, 429);
  h.tick(61_000);
  assert.equal((await record(h, [{ fish: 'sardine', sizeCm: 15, caughtAt: (t += 5_000) }])).statusCode, 200);
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
test('old player saves load economy defaults without a write or changing story/Fish Book', async () => {
  const h = harness();
  await record(h, [{ fish: 'sardine', sizeCm: 15, caughtAt: NOON - 10_000 }]);
  await saveDay(h, day1(), null);
  const old = h.players.get(address);
  delete old.coins; delete old.goods; delete old.coolerLevel; delete old.econ;
  const before = structuredClone(old);
  const logsBefore = h.logs.size;
  const res = await h.call({ op: 'load' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.coins, 0);
  assert.equal(res.body.coolerLevel, 0);
  assert.deepEqual(res.body.goods, []);
  assert.equal(res.body.fishTotal, 1);
  assert.deepEqual(res.body.story.dalbit.state, day1());
  assert.deepEqual(h.players.get(address), before);
  assert.equal(h.logs.size, logsBefore);
});

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
  await record(h, [{ fish: 'sardine', sizeCm: 15, caughtAt: NOON - 10_000 }]);
  assert.deepEqual(h.players.get(address).goods, [keeper], 'next accepted write persists cleanup');
  assert.equal(h.players.get(address).coins, 123, 'Fish Book writes preserve economy');
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
  assert.equal(view.econ.earnedToday, 5000);
  for (const value of [NaN, '999']) {
    assert.equal(normalizePlayer({ ...raw, coins: value }, NOON).coins, 0);
  }
  const full = Array.from({ length: 21 }, (_, i) => ({ ...good, uid: `nori-${i}` }));
  assert.equal(normalizePlayer({ ...raw, goods: full }, NOON).goods.length, 20);
});

test('40 accepted operations exhaust the shared daily budget; replay and load do not consume it', async () => {
  const h = harness();
  assert.equal(LIMITS.opsPerDay, 40);
  let last, id;
  for (let i = 0; i < 40; i++) {
    h.tick(61_000);
    last = [{ fish: 'sardine', sizeCm: 15, caughtAt: h.now() - 1_000 }];
    id = opId();
    assert.equal((await record(h, last, id)).statusCode, 200);
  }
  assert.equal(h.players.get(address).writeDay.count, 40);
  assert.equal((await record(h, last, id)).body.replayed, true);
  assert.equal((await h.call({ op: 'load' })).statusCode, 200);
  h.tick(61_000);
  assert.equal((await record(h, [{ fish: 'sardine', sizeCm: 15, caughtAt: h.now() - 1_000 }])).statusCode, 429);
  assert.equal(h.logs.size, 40);
  h.setClock(Date.UTC(2026, 9, 10, 17)); // next Bangkok day
  assert.equal((await record(h, [{ fish: 'sardine', sizeCm: 15, caughtAt: h.now() - 1_000 }])).statusCode, 200);
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
  assert.equal(SHOP_ITEMS.length, 48, 'update documented storage budget when the catalogue grows');
  const now = Number.MAX_SAFE_INTEGER - 1;
  const raw = emptyPlayer(now);
  raw.coins = SELL.dailyCap * ECONOMY_SAVE.balanceCapDays; raw.coolerLevel = 2;
  const longestFood = SHOP_ITEMS.filter(i => i.perishMin && !i.soon).sort((a, b) => b.id.length - a.id.length)[0];
  raw.goods = Array.from({ length: BAG.slots }, (_, i) => ({
    uid: String(i).padStart(ECONOMY_SAVE.goodsUidMaxLength, 'a'), id: longestFood.id,
    qty: BAG.maxStack, at: now, expiresAt: Number.MAX_SAFE_INTEGER,
  }));
  raw.econ.soldToday = Object.fromEntries(ALL_FREE_FISH.map(f => [f.id, LIMITS.catchesPerDay]));
  raw.econ.boughtToday = Object.fromEntries(SHOP_ITEMS.map(i => [i.id, LIMITS.opsPerDay * SHOP.maxCart]));
  raw.econ.earnedToday = SELL.dailyCap;
  const { coins, coolerLevel, goods, econ } = normalizePlayer(raw, now);
  const size = Buffer.byteLength(JSON.stringify({ coins, coolerLevel, goods, econ }));
  assert.equal(goods.length, BAG.slots);
  assert.equal(size, 5268, 'maximum compact JSON bytes; not Firestore billing/storage bytes');
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
  const { SELL, ECONOMY_SAVE } = await import('../src/game/economy/economyConfig.ts');
  const cap = SELL.dailyCap * ECONOMY_SAVE.balanceCapDays;
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
  const saved = await record(h, [{ fish: 'sardine', sizeCm: 15, caughtAt: NOON - 10_000 }]);
  assert.equal(saved.statusCode, 200, 'bad stored coins do not block unrelated saves');
  assert.equal(h.players.get(address).coins, cap);
});

// ECO-02(b): sale intent, server quotes and append-only receipts.
const sell = (h, catches, id = opId()) => h.call({ op: 'shop.sell', operationId: id, catches });
const sardine = (at, sizeCm = 15) => ({ fish: 'sardine', sizeCm, caughtAt: at });
const stateOf = h => structuredClone({ players: [...h.players], logs: [...h.logs] });

test('sale returns shared price parts directly consumable by sellReceipt and leaves the Fish Book alone', async () => {
  const { marketOf, quoteFish } = await import('../src/game/economy/market.ts');
  const { sellReceipt } = await import('../src/game/economy/receipt.ts');
  const h = harness();
  // Showing first must not make a catch unsellable.
  const catches = [sardine(NOON - 60_000), sardine(NOON - 30_000, 20)];
  await record(h, catches);
  const original = structuredClone(h.players.get(address));
  const res = await sell(h, catches);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const { result } = res.body;
  assert.equal(result.sold.length, 2);
  for (const [i, c] of catches.entries()) {
    const quote = quoteFish({ fishId: c.fish, sizeCm: c.sizeCm, caughtAt: c.caughtAt, icedMin: 0 }, NOON, marketOf(NOON), i);
    for (const key of Object.keys(quote)) assert.deepEqual(result.sold[i][key], quote[key]);
    assert.equal(result.sold[i].isWanted, quote.wanted > 1);
  }
  assert.equal(result.earned, result.sold.reduce((n, c) => n + c.price, 0));
  assert.equal(result.balanceAfter, result.earned);
  assert.equal(res.body.coins, result.earned);
  assert.equal(result.kept, 0);
  assert.equal(result.pricedAt, NOON);
  const receipt = sellReceipt(result.sold, result.kept, result.balanceAfter, result.pricedAt);
  assert.equal(receipt.total, result.earned); assert.equal(receipt.vat, null);
  const saved = h.players.get(address);
  for (const key of ['fishBook', 'fishTotal', 'lastCatchAt', 'catchDay']) assert.deepEqual(saved[key], original[key]);
  assert.deepEqual(saved.recentSoldAt, catches.map(c => c.caughtAt));
  const log = [...h.logs.values()].at(-1);
  assert.equal(log.op, 'shop.sell'); assert.deepEqual(log.changes, result);
  assert.equal(log.newRevision, log.prevRevision + 1);
});

test('impossible catches refuse the entire sale, including a valid first fish', async () => {
  const { READY_SHEETS } = await import('../src/game/fishing/freeFishCatalog.ts');
  const h = harness();
  const bad = [
    { ...sardine(NOON - 10_000), fish: 'invented' },
    sardine(NOON - 10_000, 999), sardine(NOON - 10_000, 15.5),
    sardine(NOON - 10_000, null), sardine(NOON + 10_001),
    { fish: 'bottle_message', sizeCm: null, caughtAt: NOON - 10_000 },
    { fish: 'jade_moon_koi', sizeCm: 60, caughtAt: NOON - 10_000 },
  ];
  for (const c of bad) {
    const before = stateOf(h);
    const res = await sell(h, [sardine(NOON - 20_000), c]);
    assert.equal(res.statusCode, 422, JSON.stringify(res.body));
    assert.deepEqual(stateOf(h), before);
  }
  // Seasonal sheets are not live yet: enable their catalogue eligibility only within this fixture
  // so the real shared season check, rather than sheet readiness, is what rejects the claim.
  READY_SHEETS.push('c');
  try {
    const res = await sell(h, [{ fish: 'mango_threadfin', sizeCm: 20, caughtAt: NOON - 10_000 }]);
    assert.equal(res.statusCode, 422); assert.match(res.body.error, /season/);
  } finally { READY_SHEETS.pop(); }
  assert.equal(h.players.size, 0); assert.equal(h.logs.size, 0);
});

test('sale allows exactly ten seconds future skew without changing Fish Book tolerance', async () => {
  const h = harness();
  assert.equal((await sell(h, [sardine(NOON + 10_000)])).statusCode, 200);
  const book = harness();
  assert.equal((await record(book, [sardine(NOON + 30_000)])).statusCode, 200);
});

test('spoiled catches are kept while fresh ones sell; all-spoiled writes nothing, even beyond a week', async () => {
  const h = harness();
  const res = await sell(h, [sardine(NOON - 30 * 60_000), sardine(NOON - 10_000)]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.result.keptLines, [{ index: 0, caughtAt: NOON - 30 * 60_000, reason: 'spoiled', message: 'That one went bad on the way.' }]);
  assert.deepEqual(h.players.get(address).recentSoldAt, [NOON - 10_000]);
  const empty = harness();
  for (const age of [30 * 60_000, 8 * 24 * 3600_000]) {
    const before = stateOf(empty);
    const r = await sell(empty, [sardine(NOON - age)]);
    assert.equal(r.statusCode, 422); assert.equal(r.body.result.kept, 1);
    assert.equal(r.body.result.keptLines[0].reason, 'spoiled');
    assert.deepEqual(stateOf(empty), before);
  }
  assert.equal((await sell(empty, [sardine(NOON - 30 * 60_000 + 1)])).statusCode, 200, 'one ms before expiry');
});

test('duplicates, same-millisecond collisions, gap violations and over-capacity batches fail', async () => {
  const h = harness();
  const at = NOON - 60_000;
  assert.equal((await sell(h, [sardine(at), sardine(at)])).statusCode, 422);
  assert.equal((await sell(h, [sardine(at), sardine(at + 2999)])).statusCode, 422);
  assert.equal((await sell(h, Array.from({ length: 11 }, (_, i) => sardine(at + i * 3000)))).statusCode, 422);
  assert.equal((await sell(h, [sardine(at), sardine(at + 3000)])).statusCode, 200);
  const before = stateOf(h);
  assert.equal((await sell(h, [sardine(at)])).statusCode, 409);
  assert.equal((await sell(h, [sardine(at, 20)])).statusCode, 409, 'different size cannot bypass same timestamp identity');
  assert.equal((await sell(h, [sardine(at - 1)])).statusCode, 422, 'gap enforced against existing sales in both directions');
  assert.deepEqual(stateOf(h), before);
  const upgraded = harness();
  upgraded.players.set(address, { ...emptyPlayer(NOON), coolerLevel: 2 });
  assert.equal((await sell(upgraded, Array.from({ length: 20 }, (_, i) => sardine(NOON - 120_000 + i * 3000)))).statusCode, 200);
});

test('client money, ice, address and extra catch fields never enter the sale', async () => {
  const h = harness();
  const other = '0x' + 'ef'.repeat(20);
  h.players.set(other, { ...emptyPlayer(NOON), coins: 77 });
  const before = stateOf(h);
  for (const field of ['price', 'total', 'coins', 'balance', 'address', 'icedMin']) {
    assert.equal((await h.call({ op: 'shop.sell', operationId: opId(), catches: [sardine(NOON)], [field]: other })).statusCode, 400);
  }
  assert.equal((await sell(h, [{ ...sardine(NOON), price: 999 }])).statusCode, 400);
  assert.equal((await sell(h, [{ ...sardine(NOON), icedMin: 30 }])).statusCode, 400);
  assert.deepEqual(stateOf(h), before);
  assert.equal((await sell(h, [sardine(NOON)])).statusCode, 200);
  assert.deepEqual(h.players.get(other), before.players[0][1]);
  assert.ok([...h.logs.keys()].every(k => k.startsWith(address + '/')));
});

test('same operation replays the exact receipt after spoilage, midnight and later sales; changed body fails', async () => {
  const h = harness();
  const id = opId();
  const catches = [sardine(NOON - 10_000)];
  const first = await sell(h, catches, id);
  await sell(h, [sardine(NOON)]);
  const balance = h.players.get(address).coins;
  h.tick(24 * 3600_000);
  const before = stateOf(h);
  const retry = await sell(h, catches.map(c => ({ caughtAt: c.caughtAt, fish: c.fish, sizeCm: c.sizeCm })), id);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.replayed, true);
  assert.deepEqual(retry.body.result, first.body.result);
  assert.equal(retry.body.coins, balance, 'outer view is current, receipt balance is historical');
  assert.deepEqual(stateOf(h), before);
  assert.equal((await sell(h, [sardine(catches[0].caughtAt, 16)], id)).statusCode, 409);
  assert.deepEqual(stateOf(h), before);
});

test('daily cap keeps excess fish without paying them; kept fish do not advance glut or sold-set', async () => {
  const { SELL } = await import('../src/game/economy/economyConfig.ts');
  const { quoteFish, marketOf } = await import('../src/game/economy/market.ts');
  const h = harness();
  const firstAt = NOON - 60_000;
  const firstPrice = quoteFish({ fishId: 'sardine', sizeCm: 15, caughtAt: firstAt, icedMin: 0 }, NOON, marketOf(NOON), 0).price;
  const doc = emptyPlayer(NOON); doc.econ.earnedToday = SELL.dailyCap - firstPrice;
  h.players.set(address, doc);
  const r = await sell(h, [sardine(firstAt), sardine(firstAt + 3000)]);
  assert.equal(r.statusCode, 200); assert.equal(r.body.result.earned, firstPrice);
  assert.equal(r.body.result.kept, 1); assert.equal(r.body.result.keptLines[0].reason, 'daily_cap');
  assert.equal(r.body.econ.earnedToday, SELL.dailyCap);
  assert.equal(r.body.econ.soldToday.sardine, 1);
  assert.deepEqual(h.players.get(address).recentSoldAt, [firstAt]);
  const before = stateOf(h);
  const allKept = await sell(h, [sardine(firstAt + 3000)]);
  assert.equal(allKept.statusCode, 422); assert.equal(allKept.body.result.kept, 1);
  assert.deepEqual(stateOf(h), before);
});

test('sold markers survive Bangkok midnight but expire at exactly caughtAt plus 60 minutes', async () => {
  const midnight = Date.UTC(2026, 9, 10, 17);
  const h = harness(midnight - 1);
  const at = midnight - 10_000;
  await sell(h, [sardine(at)]);
  h.setClock(midnight);
  assert.equal((await sell(h, [sardine(at)])).statusCode, 409);
  const next = await sell(h, [sardine(midnight)]);
  assert.equal(next.statusCode, 200);
  assert.equal(next.body.econ.soldToday.sardine, 1, 'glut resets on server Bangkok day');
  const saved = h.players.get(address);
  assert.ok(normalizePlayer(saved, at + 3600_000 - 1).recentSoldAt.includes(at));
  assert.ok(!normalizePlayer(saved, at + 3600_000).recentSoldAt.includes(at));
});

test('sold-set capacity is derived, never evicts live markers, and refuses overflow atomically', async () => {
  const { SALE, COOLER } = await import('../src/game/economy/economyConfig.ts');
  assert.equal(SALE.maxRecentSold, LIMITS.opsPerDay * (COOLER.baseSlots + COOLER.upgradeSlots * COOLER.upgradePrices.length));
  assert.equal(SALE.maxRecentSold, 800);
  const h = harness();
  const markers = Array.from({ length: 800 }, (_, i) => NOON - 3500_000 + i * 3000);
  h.players.set(address, { ...emptyPlayer(NOON), recentSoldAt: markers });
  const before = stateOf(h);
  assert.equal((await sell(h, [sardine(NOON - 10_000)])).statusCode, 409);
  assert.deepEqual(stateOf(h), before);
  h.players.get(address).recentSoldAt = markers.slice(1);
  const beforeOverflow = stateOf(h);
  assert.equal((await sell(h, [sardine(NOON - 10_000), sardine(NOON)])).statusCode, 409);
  assert.deepEqual(stateOf(h), beforeOverflow);
  assert.equal((await sell(h, [sardine(NOON - 10_000)])).statusCode, 200);
  assert.equal(h.players.get(address).recentSoldAt.length, 800);
  const malformed = { ...emptyPlayer(NOON), recentSoldAt: [...markers, NOON, markers[0], 'bad', NaN] };
  assert.equal(normalizePlayer(malformed, NOON).recentSoldAt.length, 801, 'normalization never truncates live markers to meet a lowered cap');
});

test('sale balance overflow and daily operation exhaustion leave player and ledger untouched', async () => {
  const { SELL, ECONOMY_SAVE } = await import('../src/game/economy/economyConfig.ts');
  const h = harness();
  h.players.set(address, { ...emptyPlayer(NOON), coins: SELL.dailyCap * ECONOMY_SAVE.balanceCapDays });
  const before = stateOf(h);
  assert.equal((await sell(h, [sardine(NOON - 10_000)])).statusCode, 409);
  assert.deepEqual(stateOf(h), before);
  const doc = emptyPlayer(NOON);
  doc.writeDay = { day: '2026-10-10', count: LIMITS.opsPerDay };
  h.players.set(address, doc);
  const exhausted = stateOf(h);
  assert.equal((await sell(h, [sardine(NOON - 10_000)])).statusCode, 429);
  assert.deepEqual(stateOf(h), exhausted);
});

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
test('with ECONOMY_API off, sell/buy/use refuse and write nothing; load and Fish Book still work', async () => {
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
    assert.equal((await record(h, [sardine(NOON - 10_000)])).statusCode, 200, 'Fish Book saves are unaffected');
  }
  // and with the switch on, the same sale goes through
  const on = harness();
  assert.equal((await sell(on, [sardine(NOON - 60_000)])).statusCode, 200);
});
