// ECO-02(d): the phone's economy store talking to the REAL /api/items handler (in memory, no network).
// Proves: one request per tap, lost answers retried exactly once (also after a reload), offline sends nothing,
// the cooler keeps exactly the fish the server did not take, old device coins are never imported,
// older answers never overwrite newer ones, and answers for another Player ID are ignored.
import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createItemsHandler, DailyLimiter } = await import('../server/saves/handlers.ts');
const { IpLimiter } = await import('../server/identity/http.ts');
const { EconomyStore } = await import('../src/game/economy/economyStore.ts');
const { SELL } = await import('../src/game/economy/economyConfig.ts');
const { marketOf, quoteFish } = await import('../src/game/economy/market.ts');

const ADDRESS = '0x' + 'cd'.repeat(20);
const OTHER = '0x' + 'ef'.repeat(20);
const origin = 'https://test-lumen-bay.vercel.app';
const TOKEN = 'mock-id-token-for-tests-0123456789';
const NOON = Date.UTC(2026, 9, 10, 5, 0); // 12:00 Bangkok
const MIN = 60_000;

/** The real server handler + an in-memory Firestore; `serverAhead` makes the server clock run ahead. */
function world({ economyApi = 'on' } = {}) {
  const w = { clock: NOON, serverAhead: 0, players: new Map(), logs: new Map(), sent: [], online: true, loseAnswers: 0 };
  const services = {
    verifyToken: async (t) => { if (t !== TOKEN) throw new Error('bad'); return { uid: w.who, walletSignedInAt: NOON - 30 * MIN, walletLoginOrigin: origin }; },
    readPlayer: async (a) => structuredClone(w.players.get(a) ?? null),
    transact: async (a, id, fn) => {
      const key = `${a}/${id}`;
      const out = fn(structuredClone(w.players.get(a) ?? null), structuredClone(w.logs.get(key) ?? null));
      if (out.write) { w.players.set(a, structuredClone(out.write.player)); w.logs.set(key, structuredClone(out.write.log)); }
      return out.response;
    },
  };
  const handler = createItemsHandler({
    env: { VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app', ...(economyApi ? { ECONOMY_API: economyApi } : {}) },
    now: () => w.clock + w.serverAhead, limiter: new IpLimiter(1e6), playerLimiter: new IpLimiter(1e6), playerDaily: new DailyLimiter(1e7),
  }, services);
  w.who = ADDRESS;
  /** What cloud.ts does: POST, throw {status, message, data} on a refusal. */
  w.transport = async (body) => {
    w.sent.push(structuredClone(body));
    const req = { method: 'POST', body: structuredClone(body), headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.9', authorization: `Bearer ${TOKEN}` }, socket: { remoteAddress: '127.0.0.1' } };
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = JSON.parse(v); } };
    await handler(req, res);
    if (w.loseAnswers > 0) { w.loseAnswers--; throw Object.assign(new Error('Saving timed out.'), { status: 0 }); } // committed, answer lost
    if (res.statusCode !== 200) throw Object.assign(new Error(res.body.error), { status: res.statusCode, data: res.body });
    return res.body;
  };
  return w;
}

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { map: m, get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) };
}
let opSeq = 0;
function phone(w, storage = memoryStorage(), address = ADDRESS) {
  const s = new EconomyStore({ sandbox: false, storage, clock: () => w.clock, online: () => w.online, newOperationId: () => `op-client-${String(++opSeq).padStart(10, '0')}` });
  s.setTransport(w.transport);
  s.attach(address);
  return s;
}
/** Catch a sardine `ago` ms before now (the cooler only; fishing never talks to the server). */
function catchAt(w, s, ago, size = 15) {
  const keep = w.clock;
  w.clock = keep - ago;
  const r = s.addCatch('sardine', size);
  w.clock = keep;
  assert.ok(r.ok, 'catch goes in the cooler');
  return r.fish.uid;
}
const coinsOnServer = (w) => w.players.get(ADDRESS)?.coins ?? 0;

test('a sale is one request with one operationId; coins and the slip come from the server', async () => {
  const w = world();
  const s = phone(w);
  catchAt(w, s, 2 * MIN); catchAt(w, s, 1 * MIN);
  const r = await s.sell(s.getWallet().cooler.map((c) => c.uid));
  assert.equal(r.ok, true);
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].op, 'shop.sell');
  assert.ok(r.earned > 0);
  assert.equal(s.getWallet().coins, coinsOnServer(w), 'the cached coins are the server coins');
  assert.equal(r.receipt.total, r.earned);
  assert.equal(r.receipt.balance, coinsOnServer(w));
  assert.equal(s.getWallet().cooler.length, 0);
  assert.equal(s.getStatus().pending, null);
});

test('a double tap sends ONE request (the second waits for the first)', async () => {
  const w = world();
  const s = phone(w);
  catchAt(w, s, 2 * MIN);
  const uids = s.getWallet().cooler.map((c) => c.uid);
  const [a, b] = await Promise.all([s.sell(uids), s.sell(uids)]);
  assert.equal(w.sent.length, 1);
  assert.equal([a, b].filter((x) => x.ok).length, 1);
  assert.equal([a, b].find((x) => !x.ok).kind, 'busy');
});

test('a lost answer keeps the exact request; Retry (even after a reload) pays once', async () => {
  const w = world();
  const storage = memoryStorage();
  let s = phone(w, storage);
  catchAt(w, s, 3 * MIN); catchAt(w, s, 2 * MIN);
  w.loseAnswers = 1;
  const lost = await s.sell(s.getWallet().cooler.map((c) => c.uid));
  assert.equal(lost.ok, false);
  assert.equal(lost.kind, 'uncertain');
  const paid = coinsOnServer(w);
  assert.ok(paid > 0, 'the server DID commit');
  assert.equal(s.getStatus().pending.op, 'shop.sell');
  // new trades are blocked until the old one is settled
  assert.equal((await s.buy([{ id: 'ice_block', qty: 1 }], 'gen', 15)).kind, 'pending');
  // reload the page: a new store on the same storage still knows the trade
  s = phone(w, storage);
  assert.equal(s.getStatus().pending.body.operationId, w.sent[0].operationId);
  const again = await s.retry();
  assert.equal(again.ok, true);
  assert.equal(w.sent[1].operationId, w.sent[0].operationId, 'Retry resends the same operationId');
  assert.deepEqual(w.sent[1], w.sent[0], 'byte for byte');
  assert.equal(coinsOnServer(w), paid, 'paid ONCE');
  assert.equal(again.receipt.total, again.earned);
  assert.equal(s.getWallet().cooler.length, 0, 'the sold fish leave the cooler after the replayed answer');
  assert.equal(s.getStatus().pending, null);
});

test('offline: Sell / Pay / Use send nothing and change nothing; Gen says the line is down', async () => {
  const w = world();
  const s = phone(w);
  catchAt(w, s, 2 * MIN);
  w.online = false;
  const before = structuredClone(s.getWallet());
  const r = await s.sell(s.getWallet().cooler.map((c) => c.uid));
  assert.equal(r.kind, 'offline');
  assert.match(r.message, /No signal/);
  assert.equal((await s.buy([{ id: 'ice_block', qty: 1 }], 'gen', 15)).kind, 'offline');
  assert.equal(w.sent.length, 0);
  assert.equal(s.getStatus().pending, null, 'nothing is queued');
  assert.deepEqual(s.getWallet().cooler, before.cooler);
});

test('the server sells 3 of 5 (1 spoiled on the way, 1 over the daily cap): the cooler keeps exactly the capped fish', async () => {
  const w = world();
  w.serverAhead = 4_000; // the server's clock is 4 s ahead: one fish is still fresh here, spoiled there
  const s = phone(w);
  const spoiledUid = catchAt(w, s, 30 * MIN - 1_000);
  const fresh = [catchAt(w, s, 60_000), catchAt(w, s, 50_000), catchAt(w, s, 40_000), catchAt(w, s, 30_000)];
  // Leave room in today's cap for exactly the first three fresh fish (same prices the server will compute)
  const serverNow = w.clock + w.serverAhead;
  const market = marketOf(serverNow);
  const prices = [60_000, 50_000, 40_000].map((ago, i) => quoteFish({ fishId: 'sardine', sizeCm: 15, caughtAt: w.clock - ago, icedMin: 0 }, serverNow, market, i).price);
  const day = Math.floor((serverNow + 7 * 3600_000) / 86_400_000);
  w.players.set(ADDRESS, { coins: 0, econ: { day, soldToday: {}, earnedToday: SELL.dailyCap - prices.reduce((a, b) => a + b, 0), boughtToday: {} } });
  assert.equal(s.getWallet().cooler.length, 5, 'all five look fine on the phone');
  const r = await s.sell([spoiledUid, ...fresh].reverse()); // order doesn't matter
  assert.equal(r.ok, true);
  assert.equal(r.earned, prices.reduce((a, b) => a + b, 0));
  assert.deepEqual(s.getWallet().cooler.map((c) => c.uid), [fresh[3]], 'only the capped fish stays');
  assert.match(r.receipt.note, /1 fish went bad on the way\. 1 fish stay in your cooler/);
});

test('a sale where every fish is refused still drops the spoiled ones and keeps the rest', async () => {
  const w = world();
  w.serverAhead = 4_000;
  const s = phone(w);
  const bad = catchAt(w, s, 30 * MIN - 1_000);
  const r = await s.sell([bad]);
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'refused');
  assert.equal(s.getWallet().cooler.length, 0, 'the server said it spoiled: gone here too');
  assert.equal(s.getStatus().pending, null);
});

test('Pay sends what the bar showed as expectedTotal; the server never charges more', async () => {
  const w = world();
  const s = phone(w);
  catchAt(w, s, 3 * MIN); catchAt(w, s, 2 * MIN);
  await s.sell(s.getWallet().cooler.map((c) => c.uid));
  w.players.get(ADDRESS).coins = 500; // pretend a few trips happened
  await s.sync();
  const shown = s.quoteBuy([{ id: 'ice_block', qty: 2 }], 'gen').total;
  const ok = await s.buy([{ id: 'ice_block', qty: 2 }], 'gen', shown);
  assert.equal(ok.ok, true);
  assert.equal(w.sent.at(-1).expectedTotal, shown);
  assert.equal(ok.spent, shown);
  assert.equal(s.getWallet().coins, 500 - shown);
  assert.equal(ok.receipt.vat > 0, true, 'the slip shows the VAT inside the price');
  const tooLow = await s.buy([{ id: 'ice_block', qty: 1 }], 'gen', 1);
  assert.equal(tooLow.ok, false);
  assert.match(tooLow.message, /Prices just changed/);
  assert.equal(s.getWallet().coins, 500 - shown, 'nothing charged');
});

test('ice: the phone and the server use the same events, and ice that helps nobody is not spent', async () => {
  const w = world();
  const s = phone(w);
  w.players.set(ADDRESS, { coins: 200 });
  await s.sync();
  await s.buy([{ id: 'ice_block', qty: 2 }], 'gen', s.quoteBuy([{ id: 'ice_block', qty: 2 }], 'gen').total);
  const ice = s.getWallet().goods.find((g) => g.id === 'ice_block').uid;
  const sentBefore = w.sent.length;
  assert.equal((await s.useItem(ice)).ok, false, 'empty cooler: the ice is kept');
  assert.equal(w.sent.length, sentBefore, 'and nothing was sent');
  catchAt(w, s, 25 * MIN);
  const used = await s.useItem(ice);
  assert.equal(used.ok, true);
  assert.deepEqual(s.getWallet().iceUsedAt, w.players.get(ADDRESS).iceUsedAt);
  w.clock += 10 * MIN; // 35 min old: spoiled without ice, Good with it
  assert.equal(s.refresh().cooler.length, 1);
  const r = await s.sell(s.getWallet().cooler.map((c) => c.uid));
  assert.equal(r.ok, true, 'the server agrees the iced fish is still fresh');
});

test('old device coins are never imported; only the cooler moves to the server-mode store', () => {
  const w = world();
  const old = { version: 1, coins: 99_999, coolerLevel: 2, goods: [{ uid: 'g1', id: 'nori', qty: 3, at: NOON }],
    cooler: [{ uid: 'f1', fishId: 'sardine', sizeCm: 15, caughtAt: NOON - MIN, icedMin: 30 }], day: 0, soldToday: {}, earnedToday: 0, boughtToday: {}, log: [] };
  const storage = memoryStorage({ [`sp_wallet_v1_${ADDRESS}`]: JSON.stringify(old) });
  const s = phone(w, storage);
  const wallet = s.getWallet();
  assert.equal(wallet.coins, 0);
  assert.equal(wallet.coolerLevel, 0);
  assert.equal(wallet.goods.length, 0);
  assert.deepEqual(wallet.cooler.map((c) => c.uid), ['f1']);
  assert.equal(wallet.iceUsedAt.length, 0, 'old per-fish ice is not imported either');
  assert.equal(storage.get(`sp_wallet_v1_${ADDRESS}`), null, 'the old wallet is retired');
});

test('an older answer never overwrites a newer one; answers for another Player ID are ignored', async () => {
  const w = world();
  const s = phone(w);
  s.receiveView(ADDRESS, { revision: 5, coins: 300, coolerLevel: 0, goods: [], econ: { day: 1, soldToday: {}, earnedToday: 0, boughtToday: {} }, iceUsedAt: [] });
  s.receiveView(ADDRESS, { revision: 4, coins: 10, coolerLevel: 0, goods: [], econ: { day: 1, soldToday: {}, earnedToday: 0, boughtToday: {} }, iceUsedAt: [] });
  assert.equal(s.getWallet().coins, 300);
  s.receiveView(OTHER, { revision: 9, coins: 7, coolerLevel: 0, goods: [], econ: { day: 1, soldToday: {}, earnedToday: 0, boughtToday: {} }, iceUsedAt: [] });
  assert.equal(s.getWallet().coins, 300);
  // a slow sale answer that arrives after switching Player ID changes nothing for the new ID
  catchAt(w, s, 2 * MIN);
  const pending = s.sell(s.getWallet().cooler.map((c) => c.uid));
  s.attach(OTHER);
  const r = await pending;
  assert.equal(r.ok, false);
  assert.equal(s.getWallet().coins, 0);
});

test('a closed shop (ECONOMY_API off, like production today) refuses in character and keeps the fish', async () => {
  const w = world({ economyApi: null });
  const s = phone(w);
  catchAt(w, s, 2 * MIN);
  const r = await s.sell(s.getWallet().cooler.map((c) => c.uid));
  assert.equal(r.kind, 'closed');
  assert.equal(r.message, "The shop isn't open yet.");
  assert.equal(s.getWallet().cooler.length, 1);
  assert.equal(s.getStatus().pending, null);
  assert.equal(w.players.size, 0, 'nothing written');
});

test('the phone keeps catch times on the server clock (a phone 2 minutes fast can still sell)', async () => {
  const w = world();
  w.serverAhead = -2 * MIN; // this phone's clock is 2 minutes FAST
  const s = phone(w);
  await s.sync(); // any answer carries serverNow
  catchAt(w, s, 1 * MIN);
  const r = await s.sell(s.getWallet().cooler.map((c) => c.uid));
  assert.equal(r.ok, true, 'without the offset this catch would be "dated in the future"');
});

test('guests and missing transport cannot trade', async () => {
  const w = world();
  const s = new EconomyStore({ sandbox: false, storage: memoryStorage(), clock: () => w.clock, online: () => true, newOperationId: () => 'op-x-0000000000' });
  catchAt(w, s, MIN);
  assert.equal((await s.sell(s.getWallet().cooler.map((c) => c.uid))).kind, 'signin');
});

test('sandbox pages stay on the device: no transport, no server', async () => {
  const w = world();
  const s = new EconomyStore({ sandbox: true, storage: memoryStorage(), clock: () => w.clock, online: () => false, newOperationId: () => 'op-x-0000000000' });
  s.setTransport(w.transport);
  s.attach(ADDRESS); // ignored
  catchAt(w, s, MIN);
  const r = await s.sell(s.getWallet().cooler.map((c) => c.uid));
  assert.equal(r.ok, true, 'offline does not matter in the sandbox');
  assert.equal(w.sent.length, 0);
  assert.ok(s.getWallet().coins > 0);
});
