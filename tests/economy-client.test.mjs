// ECO-02(d): the phone's economy store talking to the REAL /api/items handler (in memory, no network).
// Proves: one request per tap, lost answers retried exactly once (also after a reload), offline sends nothing,
// the cooler keeps exactly the fish the server did not take, old device coins are never imported,
// older answers never overwrite newer ones, and answers for another Player ID are ignored.
import './register-api-ts.mjs';
import { fixtureCatch, saleEnv } from './fishing-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createItemsHandler, DailyLimiter } = await import('../server/saves/handlers.ts');
const { emptyPlayer, normalizePlayer, playerView } = await import('../server/saves/rules.ts');
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
  const set=w.players.set.bind(w.players);w.players.set=(k,v)=>set(k,{econEpoch:1,...v});
  const services = {
    verifyToken: async (t) => { if (t !== TOKEN) throw new Error('bad'); return { uid: w.who, walletSignedInAt: NOON - 30 * MIN, walletLoginOrigin: origin }; },
    readControl: async () => true,
    readPlayer: async (a) => structuredClone(w.players.get(a) ?? null),
    transact: async (a, id, fn) => {
      const key = `${a}/${id}`;
      const out = fn(structuredClone(w.players.get(a) ?? null), structuredClone(w.logs.get(key) ?? null), {open:true});
      if (out.write) { w.players.set(a, structuredClone(out.write.player)); w.logs.set(key, structuredClone(out.write.log)); }
      return out.response;
    },
  };
  const handler = createItemsHandler({
    env: { VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app', ...saleEnv, ...(economyApi ? { ECONOMY_API: economyApi } : {}) },
    now: () => w.clock + w.serverAhead, limiter: new IpLimiter(1e6), playerLimiter: new IpLimiter(1e6), playerDaily: new DailyLimiter(1e7),
  }, services);
  w.who = ADDRESS;
  /** What cloud.ts does: POST, throw {status, message, data} on a refusal. */
  w.transport = async (body) => {
    w.sent.push(structuredClone(body));
    const req = { method: 'POST', body: structuredClone(body), headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.9', authorization: `Bearer ${w.badToken ? 'expired-session-token-000000000' : TOKEN}` }, socket: { remoteAddress: '127.0.0.1' } };
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = JSON.parse(v); } };
    await handler(req, res);
    if (w.hold) await w.hold; // the server has answered; the network delivers it later
    if (w.garbled > 0 && res.statusCode === 200) { w.garbled--; throw Object.assign(new Error('Saving is unavailable right now.'), { status: 200 }); } // committed, unreadable body
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
  s.receiveView(address, { ...playerView(normalizePlayer(w.players.get(address) ?? emptyPlayer(w.clock), w.clock), w.clock), redeemFromDeckId: 0 });
  return s;
}
/** Catch a sardine `ago` ms before now (the cooler only; fishing never talks to the server). */
function catchAt(w, s, ago, size = 15) {
  const keep = w.clock;
  w.clock = keep - ago;
  const c = fixtureCatch(w.who, s.now(), { size, startIndex: w.nextIndex ?? 0 });
  w.nextIndex = c.ticket.castIndex + 1;
  const r = s.addCatch(c.fish, c.sizeCm, { caughtAt: c.caughtAt, ticket: c.ticket });
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
  assert.ok(w.sent[0].catches.every(c => c.ticket && Object.keys(c.ticket).length === 5), 'fresh sale carries the persisted ticket');
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
  assert.equal(w.players.get(ADDRESS).fishBook.sardine.sold, 2, 'Retry records each verified sale only once');
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

test('old device coins are never imported; new epoch also retires the old cooler', () => {
  const w = world();
  const old = { version: 1, coins: 99_999, coolerLevel: 2, goods: [{ uid: 'g1', id: 'nori', qty: 3, at: NOON }],
    cooler: [{ uid: 'f1', fishId: 'sardine', sizeCm: 15, caughtAt: NOON - MIN, icedMin: 30 }], day: 0, soldToday: {}, earnedToday: 0, boughtToday: {}, log: [] };
  const storage = memoryStorage({ [`sp_wallet_v1_${ADDRESS}`]: JSON.stringify(old) });
  const s = phone(w, storage);
  const wallet = s.getWallet();
  assert.equal(wallet.coins, 0);
  assert.equal(wallet.coolerLevel, 0);
  assert.equal(wallet.goods.length, 0);
  assert.deepEqual(wallet.cooler.map((c) => c.uid), []);
  assert.equal(wallet.iceUsedAt.length, 0, 'old per-fish ice is not imported either');
  assert.equal(storage.get(`sp_wallet_v1_${ADDRESS}`), null, 'the old wallet is retired');
});

test('an older answer never overwrites a newer one; answers for another Player ID are ignored', async () => {
  const w = world();
  const s = phone(w);
  s.receiveView(ADDRESS, { econEpoch: 1, revision: 5, coins: 300, coolerLevel: 0, goods: [], econ: { day: 1, soldToday: {}, earnedToday: 0, boughtToday: {} }, iceUsedAt: [] });
  s.receiveView(ADDRESS, { econEpoch: 1, revision: 4, coins: 10, coolerLevel: 0, goods: [], econ: { day: 1, soldToday: {}, earnedToday: 0, boughtToday: {} }, iceUsedAt: [] });
  assert.equal(s.getWallet().coins, 300);
  s.receiveView(OTHER, { econEpoch: 1, revision: 9, coins: 7, coolerLevel: 0, goods: [], econ: { day: 1, soldToday: {}, earnedToday: 0, boughtToday: {} }, iceUsedAt: [] });
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
  assert.equal(r.message, "The shop is closed today.");
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

// ---- ChatGPT's PR #20 review: three edge cases, reproduced here as regressions --------------------------------

test('review P1: a lost purchase whose Retry gets 401 stays pending; after unlocking, Retry replays; never charged twice', async () => {
  const w = world();
  const s = phone(w);
  w.players.set(ADDRESS, { coins: 500 });
  await s.sync();
  w.loseAnswers = 1;
  const lost = await s.buy([{ id: 'ice_block', qty: 1 }], 'gen', 15);
  assert.equal(lost.kind, 'uncertain');
  assert.equal(w.players.get(ADDRESS).coins, 485, 'the server DID charge');
  w.badToken = true; // the session expired meanwhile
  const denied = await s.retry();
  assert.equal(denied.kind, 'signin');
  assert.ok(s.getStatus().pending, 'a 401 on Retry says nothing about the first attempt: keep it');
  assert.equal((await s.buy([{ id: 'ice_block', qty: 1 }], 'gen', 15)).kind, 'pending', 'no second Pay while it is unresolved');
  w.badToken = false; // unlocked again
  const again = await s.retry();
  assert.equal(again.ok, true, 'the server replays the first purchase');
  assert.equal(w.logs.size, 1, 'ONE purchase in the ledger');
  assert.equal(w.players.get(ADDRESS).coins, 485);
  assert.equal(s.getWallet().coins, 485);
  assert.equal(s.getWallet().goods.reduce((n, g) => n + (g.id === 'ice_block' ? g.qty : 0), 0), 1);
});

test('review P1: an unreadable success answer keeps the trade; a 401 on a FIRST attempt settles it', async () => {
  const w = world();
  const s = phone(w);
  w.players.set(ADDRESS, { coins: 500 });
  await s.sync();
  w.garbled = 1;
  assert.equal((await s.buy([{ id: 'ice_block', qty: 1 }], 'gen', 15)).kind, 'uncertain');
  assert.ok(s.getStatus().pending, 'unreadable 200: it may have committed');
  assert.equal((await s.retry()).ok, true);
  assert.equal(w.logs.size, 1);
  // a 401 on the very first attempt: nothing was written, so nothing is kept
  w.badToken = true;
  const first = await s.buy([{ id: 'ice_block', qty: 1 }], 'gen', 15);
  assert.equal(first.kind, 'signin');
  assert.equal(s.getStatus().pending, null);
  assert.equal(w.logs.size, 1);
});

test('review P2: ice that the server applied just in time keeps the fish, even if the answer is late', async () => {
  const w = world();
  const s = phone(w);
  w.players.set(ADDRESS, { coins: 100 });
  await s.sync();
  await s.buy([{ id: 'ice_block', qty: 1 }], 'gen', 15);
  const uid = catchAt(w, s, 30 * MIN - 1_000); // 29:59 old
  const ice = s.getWallet().goods.find((g) => g.id === 'ice_block').uid;
  let release;
  w.hold = new Promise((r) => { release = r; });
  const using = s.useItem(ice); // commits on the server now; the answer waits
  await new Promise((r) => setImmediate(r));
  w.clock += 2_000; // 30:01 here, before the ice event is known
  s.refresh();
  assert.ok(s.getWallet().cooler.length === 0, 'looks spoiled on screen for a moment…');
  release(); w.hold = null;
  assert.equal((await using).ok, true);
  assert.deepEqual(s.getWallet().cooler.map((c) => c.uid), [uid], '…and is back once the server says it was iced');
  assert.equal((await s.sell([uid])).ok, true, 'and the server agrees it is fresh');
});

test('review P2: a lost ice answer + reload still keeps the fish until Retry settles it', async () => {
  const w = world();
  const storage = memoryStorage();
  let s = phone(w, storage);
  w.players.set(ADDRESS, { coins: 100 });
  await s.sync();
  await s.buy([{ id: 'ice_block', qty: 1 }], 'gen', 15);
  const uid = catchAt(w, s, 30 * MIN - 1_000);
  w.loseAnswers = 1;
  assert.equal((await s.useItem(s.getWallet().goods.find((g) => g.id === 'ice_block').uid)).kind, 'uncertain');
  w.clock += 2_000;
  s.refresh();
  s = phone(w, storage); // reload
  s.refresh();
  catchAt(w, s, 0); // a new catch while it is unresolved must not drop the old fish either
  assert.equal((await s.retry()).ok, true);
  assert.ok(s.getWallet().cooler.some((c) => c.uid === uid), 'the iced fish survived the reload');
});

test('review P3: the Bag follows the server food clock (shorter, longer, keeper), not today\'s catalogue', async () => {
  const w = world();
  const s = phone(w);
  const day = Math.floor((NOON + 7 * 3600_000) / 86_400_000);
  w.players.set(ADDRESS, { coins: 0, econ: { day, soldToday: {}, earnedToday: 0, boughtToday: {} }, goods: [
    { uid: 'short', id: 'sashimi_tai', qty: 1, at: NOON, expiresAt: NOON + 1 * MIN },
    { uid: 'long', id: 'sashimi_tai', qty: 1, at: NOON, expiresAt: NOON + 300 * MIN },
    { uid: 'keeper', id: 'nori', qty: 2, at: NOON, expiresAt: null },
  ] });
  await s.sync();
  assert.deepEqual(s.getWallet().goods.map((g) => g.uid).sort(), ['keeper', 'long', 'short']);
  w.clock += 2 * MIN;
  assert.deepEqual(s.refresh().goods.map((g) => g.uid).sort(), ['keeper', 'long'], 'the short one went off on its own clock');
  w.clock += 120 * MIN; // past today's catalogue time (60 min) but inside the saved 300
  assert.deepEqual(s.refresh().goods.map((g) => g.uid).sort(), ['keeper', 'long']);
  const load = await w.transport({ op: 'load' });
  assert.deepEqual(load.goods.map((g) => g.uid).sort(), ['keeper', 'long'], 'phone and server agree');
});

test('client offers/sends only eligible tickets, skipping unticketed and server-known paid catches', async () => {
  const w = world(), first = phone(w), a = catchAt(w, first, 10000), b = catchAt(w, first, 5000);
  const original = first.getWallet().cooler.find(c => c.uid === a);
  const practice = first.addCatch('sardine', 15).fish.uid;
  const other = phone(w); other.addCatch(original.fishId, original.sizeCm, { caughtAt: original.caughtAt, ticket: original.ticket });
  assert.equal((await other.sell(other.getWallet().cooler.map(c => c.uid))).ok, true);
  await first.sync();
  assert.equal(first.sellableFish().some(c => c.uid === a), false); assert.equal(first.sellableFish().some(c => c.uid === practice), false);
  assert.deepEqual(first.quoteSell([a, b, practice]).lines.map(c => c.uid), [b]);
  const expectedTicket = first.getWallet().cooler.find(c => c.uid === b).ticket;
  const r = await first.sell([practice, a, b]); assert.equal(r.ok, true);
  const body = w.sent.filter(c => c.op === 'shop.sell').at(-1); assert.equal(body.catches.length, 1); assert.deepEqual(body.catches[0].ticket, expectedTicket);
  assert.ok(first.getWallet().cooler.some(c => c.uid === practice));
});

test('a cross-device paid collision drops only the indexed fish with Gen’s message; remaining fish sell on the next tap', async () => {
  const w = world(), first = phone(w), a = catchAt(w, first, 10000), b = catchAt(w, first, 5000);
  const original = first.getWallet().cooler.find(c => c.uid === a), other = phone(w);
  other.addCatch(original.fishId, original.sizeCm, { caughtAt: original.caughtAt, ticket: original.ticket });
  assert.equal((await other.sell(other.getWallet().cooler.map(c => c.uid))).ok, true);
  const refused = await first.sell([a, b]); assert.equal(refused.ok, false); assert.match(refused.message, /already paid/);
  assert.deepEqual(first.getWallet().cooler.map(c => c.uid), [b]); assert.equal(first.getStatus().pending, null);
  assert.equal((await first.sell([b])).ok, true); assert.equal(w.players.get(ADDRESS).fishBook.sardine.sold, 2);
});

test('invalid roll drops only that fish; no partial payment and the rest can still sell', async () => {
  const w = world(), s = phone(w), c = fixtureCatch(ADDRESS, w.clock - 10000, { size: 15 });
  const bad = s.addCatch(c.fish, 16, { caughtAt: c.caughtAt, ticket: c.ticket }).fish.uid;
  w.nextIndex = c.ticket.castIndex + 1; const good = catchAt(w, s, 5000);
  const refused = await s.sell([bad, good]); assert.equal(refused.ok, false); assert.match(refused.message, /doesn't match/);
  assert.equal(coinsOnServer(w), 0); assert.deepEqual(s.getWallet().cooler.map(c => c.uid), [good]);
  assert.equal((await s.sell([good])).ok, true); assert.equal(w.players.get(ADDRESS).fishBook.sardine.sold, 1);
});

test('missing policy, pre-cutoff, expired windows and duplicate indices are never sent; exact pending Retry ignores new filters', async () => {
  const { FISHING_DECK: C } = await import('../src/game/fishing/deckConfig.ts');
  const w = world(), s = phone(w), uid = catchAt(w, s, 1000), fish = s.getWallet().cooler[0];
  const initial = { econEpoch: 1, revision: 10, coins: 0, coolerLevel: 0, goods: [], econ: { day: 1, soldToday: {}, earnedToday: 0, boughtToday: {} }, iceUsedAt: [], paidDecks: [] };
  s.receiveView(ADDRESS, initial); assert.equal((await s.sell([uid])).ok, false); assert.equal(w.sent.length, 0);
  s.receiveView(ADDRESS, { ...initial, redeemFromDeckId: fish.ticket.deckId + 1 }); assert.equal((await s.sell([uid])).ok, false); assert.equal(w.sent.length, 0);
  s.receiveView(ADDRESS, { ...initial, redeemFromDeckId: 0 });
  s.addCatch(fish.fishId, fish.sizeCm, { caughtAt: fish.caughtAt, ticket: fish.ticket }); assert.equal(s.sellableFish().length, 1);
  w.clock += 2 * C.windowMs; assert.equal(s.sellableFish().length, 0); assert.equal((await s.sell([uid])).ok, false); assert.equal(w.sent.length, 0);
  const live = world(), storage = memoryStorage(); let p = phone(live, storage); catchAt(live, p, 1000); live.loseAnswers = 1;
  assert.equal((await p.sell(p.getWallet().cooler.map(c => c.uid))).kind, 'uncertain'); const body = structuredClone(live.sent[0]);
  live.clock += 2 * C.windowMs; p = phone(live, storage); assert.equal(p.sellableFish().length, 0);
  assert.equal((await p.retry()).ok, true); assert.deepEqual(live.sent.findLast(c => c.op === 'shop.sell'), body); assert.equal(live.players.get(ADDRESS).fishBook.sardine.sold, 1);
});

test('dev reset token clears only local game economy/pending state once; production stores ignore it', async () => {
  const storage = memoryStorage({ identity_vault: 'keep' }), w = world();
  const make = enabled => { const s = new EconomyStore({ sandbox: false, allowDevReset: enabled, storage, clock: () => w.clock, online: () => true, newOperationId: () => 'op-reset-pending-00001' }); s.attach(ADDRESS); return s; };
  let s = make(true); s.receiveView(ADDRESS, { econEpoch: 1, revision: 1, coins: 99, coolerLevel: 0, goods: [], econ: { day: 1 }, paidDecks: [], redeemFromDeckId: 0 });
  s.addCatch('sardine', 15); assert.equal(s.resetDevState(ADDRESS, 'reset-a'), true); assert.equal(s.getWallet().cooler.length, 0); assert.equal(s.getWallet().coins, 0);
  s.addCatch('sardine', 15); assert.equal(s.resetDevState(OTHER, 'foreign-reset'), false); assert.equal(s.resetDevState(ADDRESS, 'reset-a'), false); assert.equal(s.getWallet().cooler.length, 1);
  s = make(true); assert.equal(s.resetDevState(ADDRESS, 'reset-a'), false); assert.equal(s.resetDevState(ADDRESS, 'reset-b'), true); assert.equal(s.getWallet().cooler.length, 0);
  s = make(false); s.addCatch('sardine', 15); assert.equal(s.resetDevState(ADDRESS, 'reset-c'), false); assert.equal(s.getWallet().cooler.length, 1);
  assert.equal(storage.get('identity_vault'), 'keep');
  const blocked = new EconomyStore({ sandbox: false, allowDevReset: true, storage: { get: () => null, set() { throw Error('quota'); }, remove() { throw Error('quota'); } }, clock: () => w.clock, online: () => true, newOperationId: () => 'op-blocked-reset-0001' });
  blocked.attach(ADDRESS); assert.equal(blocked.resetDevState(ADDRESS, 'once'), true); blocked.addCatch('sardine', 15);
  assert.equal(blocked.resetDevState(ADDRESS, 'once'), false); assert.equal(blocked.getWallet().cooler.length, 1);
});

test('new epoch overrides older revision, clears cooler/cache, quarantines exact pending bytes and ignores stale epoch answers',async()=>{
 const w=world(),storage=memoryStorage(),s=phone(w,storage);catchAt(w,s,MIN);w.loseAnswers=1;
 await s.sell(s.getWallet().cooler.map(c=>c.uid));const pending=structuredClone(s.getStatus().pending.body);
 const current={...playerView(emptyPlayer(w.clock),w.clock),econEpoch:2,revision:0,redeemFromDeckId:0};
 s.receiveView(ADDRESS,current);assert.equal(s.getWallet().cooler.length,0);assert.equal(s.getWallet().coins,0);assert.deepEqual(s.getStatus().pending.body,pending);
 s.receiveView(ADDRESS,{...current,econEpoch:1,revision:999,coins:999});assert.equal(s.getWallet().coins,0);assert.equal(s.getStatus().econEpoch,2);
});

test('an edited cached epoch/revision cannot outrank the first authoritative server load',()=>{
 const w=world();const fresh={...playerView(emptyPlayer(w.clock),w.clock),redeemFromDeckId:0};
 const storage=memoryStorage({[`sp_econ_v2_${ADDRESS}`]:JSON.stringify({...fresh,econEpoch:999,revision:999,coins:999999})});
 const s=phone(w,storage);assert.equal(s.getWallet().coins,0);assert.equal(s.getStatus().econEpoch,1);
});
