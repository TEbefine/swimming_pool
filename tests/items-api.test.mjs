import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createItemsHandler } = await import('../server/saves/handlers.ts');
const { IpLimiter } = await import('../server/identity/http.ts');
const { LIMITS } = await import('../server/saves/rules.ts');

// ID-01 (c): /api/items with an in-memory transaction store. No Firebase, no network, no credentials.
const address = '0x' + 'ab'.repeat(20);
const origin = 'https://test-lumen-bay.vercel.app';
const env = { VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app' };
const NOON = Date.UTC(2026, 9, 10, 5, 0); // 12:00 Bangkok, rainy season
const NIGHT = Date.UTC(2026, 9, 10, 15, 0); // 22:00 Bangkok
const TOKEN = 'mock-id-token-for-tests-0123456789';

function harness(start = NOON) {
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
  const handler = createItemsHandler({ env, now: () => clock, limiter: new IpLimiter(1000) }, services);
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
  assert.deepEqual(res.body, { revision: 0, fishBook: {}, fishTotal: 0, lastCatchAt: null, story: { dalbit: null } });
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
  const fast = await record(h, [{ fish: 'sardine', sizeCm: 15, caughtAt: t }, { fish: 'sardine', sizeCm: 15, caughtAt: t + 1_000 }]);
  assert.equal(fast.statusCode, 422, 'two catches one second apart');
  const unordered = await record(h, [{ fish: 'sardine', sizeCm: 15, caughtAt: t + 9_000 }, { fish: 'sardine', sizeCm: 15, caughtAt: t }]);
  assert.equal(unordered.statusCode, 422);
  assert.equal(h.players.size, 0, 'nothing was written by any refused request');
  assert.equal((await h.call({ op: 'fishbook.record', operationId: 'short', catches: [] })).statusCode, 400);
  assert.equal((await h.call({ op: 'fishbook.record', operationId: opId(), catches: [{ fish: 'sardine', sizeCm: 15, caughtAt: t, extra: 1 }] })).statusCode, 400);
  const many = Array.from({ length: LIMITS.catchesPerRequest + 1 }, (_, i) => ({ fish: 'sardine', sizeCm: 15, caughtAt: t + i * 5_000 }));
  assert.equal((await record(h, many)).statusCode, 400);
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
});

test('refuses impossible story states', async () => {
  const h = harness();
  const bad = async (patch, status, why) => {
    const res = await saveDay(h, { ...day1(), ...patch }, null);
    assert.equal(res.statusCode, status, `${why}: ${JSON.stringify(res.body)}`);
  };
  await bad({ step: 'd1_market' }, 409, 'mid-day');
  await bad({ day: 2, step: 'd2_end' }, 409, 'skipped day 1');
  await bad({ coins: LIMITS.coinGainPerDay + 1 }, 422, 'too many coins');
  await bad({ coins: -1 }, 422, 'negative coins');
  await bad({ energy: 11 }, 422, 'energy above 10');
  await bad({ bag: { gold_bar: 1 } }, 422, 'unknown item');
  await bad({ bag: { small_net: 2 } }, 422, 'two key items');
  await bad({ bag: { mackerel: 61 } }, 422, 'over the stack/day gain');
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
