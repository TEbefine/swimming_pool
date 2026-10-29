import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
registerHooks({ resolve(s, c, next) {
  if (s.startsWith('.') && !/\.[a-z]+$/i.test(s)) {
    const u = new URL(s + '.ts', c.parentURL); if (existsSync(u)) return next(u.href, c);
  }
  return next(s, c);
} });
const { prepareFreeCast, finishFreeCast, BOOK_ONLY_CATCH } = await import('../src/game/fishing/freeCast.ts');
const { FishingDeckStore } = await import('../src/game/fishing/deckStore.ts');
const { EconomyStore } = await import('../src/game/economy/economyStore.ts');
const { issueFishingDeck } = await import('../server/fishing/deck.ts');
const { rollDeckCatch } = await import('../src/game/fishing/deckRoll.ts');
const { cast, TUNING, step } = await import('../src/game/story/fishing.ts');
const { FREE_FISH } = await import('../src/game/fishing/freeFishCatalog.ts');
const { parseWallet } = await import('../src/game/economy/wallet.ts');
const { FISHING_DECK } = await import('../src/game/fishing/deckConfig.ts');
const { LIMITS, applyCatches, emptyPlayer, parseCatches } = await import('../server/saves/rules.ts');
const A = '0x' + 'ab'.repeat(20), B = '0x' + 'cd'.repeat(20);
const NOW = Date.UTC(2026, 9, 29, 5), SECRET = 'integration-deck-secret-at-least-32-bytes';
function storage() { const m = new Map(); return { get: k => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: k => m.delete(k), m }; }
function card(at = NOW, castIndex = 20) { return { deck: issueFishingDeck(A, at, SECRET), castIndex }; }
function economy(s, clock) { const e = new EconomyStore({ sandbox: false, storage: s, clock, online: () => true, newOperationId: () => 'op-stage4-000000001' }); e.attach(A); return e; }

test('reservation and both stamps use the economy clock across an edge, despite a different deck offset', async () => {
  const edge = Math.ceil(NOW / FISHING_DECK.windowMs) * FISHING_DECK.windowMs;
  for (const deckAhead of [-4000, 4000]) {
    let time = edge - 8000;
    const s = storage(), e = economy(s, () => time);
    e.receiveView(A, { serverNow: time + 2000 }); // economy offset +2s
    const d = new FishingDeckStore({ enabled: true, clock: () => time, online: () => true, randomIndex: () => 0, storage: s });
    d.attach(A); d.setTransport(async () => issueFishingDeck(A, time + 2000 + deckAhead, SECRET)); await d.sync();
    time = edge - 3000; // economy = edge -1s, deck clock may already be past the edge
    const prepared = prepareFreeCast({ distance: .8, nice: false }, e.now(), at => d.reserveCast(at));
    assert.ok(prepared.ticket); assert.equal(prepared.castAt, edge - 1000);
    assert.notEqual(d.now(), e.now());
    time += 3000;
    const finished = finishFreeCast(prepared, e.now(), A);
    assert.equal(finished.caughtAt, edge + 2000); assert.ok(prepared.castAt <= finished.caughtAt);
    assert.deepEqual(finished.ticket, prepared.ticket, 'crossing the edge during the catch keeps the original ticket');
    assert.equal(d.reserveCast(e.now()), null, 'an expired deck refuses even if its own clock still says valid');
  }
});

test('bad/unavailable reservations never escape; long casts and a changed owner are Book-only', () => {
  for (const reserve of [() => null, () => { throw Error('storage'); }, () => ({ ...card(), deck: { ...card().deck, seed: 'bad' } }), () => ({ ...card(), castIndex: -1 })]) {
    const p = prepareFreeCast({ distance: .8, nice: false }, NOW, reserve);
    assert.equal(p.rolled, undefined); assert.equal(finishFreeCast(p, NOW + 1000, A).ticket, undefined);
  }
  const p = prepareFreeCast({ distance: .92, nice: false }, NOW, () => card());
  assert.equal(p.ticket.castInfo.nice, true);
  assert.ok(finishFreeCast(p, NOW + FISHING_DECK.maxCastDurationMs, A).ticket);
  assert.equal(finishFreeCast(p, NOW + FISHING_DECK.maxCastDurationMs + 1, A).ticket, undefined);
  assert.equal(finishFreeCast(p, NOW + 1000, B).ticket, undefined);
  const backwards = finishFreeCast(p, NOW - 2000, A);
  assert.equal(backwards.caughtAt, p.castAt); assert.equal(backwards.ticket, undefined);
});

test('deck-selected fish retains the existing wait/nibbles, strike and reel rules; story ignores deck input', () => {
  const info = { distance: .85, nice: true };
  const rolled = rollDeckCatch({ ...card().deck, castIndex: 20, castInfo: info, castAt: NOW });
  const sp = FREE_FISH.find(f => f.id === rolled.fish);
  // Legacy forced fish consumes one size draw (if sized), then exactly the same timing stream.
  const stream = () => { const values = [.37, .63, .21, .8, .11]; let i = 0; return () => values[(i++) % values.length]; };
  const legacy = cast(stream(), { table: { species: [sp] }, forceFish: sp.id, info });
  const rng = stream(); if (sp.size) rng();
  const current = cast(rng, { table: { species: [sp] }, rolled: { ...rolled, sizeCm: legacy.sizeCm, big: legacy.big }, info });
  assert.deepEqual(current, legacy);
  for (const phase of ['waiting', 'bite', 'reel']) assert.deepEqual(step({ ...current, phase }, .02, () => .5, true), step({ ...legacy, phase }, .02, () => .5, true));
  assert.deepEqual(cast(stream(), { firstCatch: true }), cast(stream(), { firstCatch: true, rolled }));
});

test('cooler and pending sale keep ticket/stamps across reloads and exact retries', async () => {
  const s = storage(); let time = NOW + 1000, e = economy(s, () => time);
  const p = prepareFreeCast({ distance: .8, nice: false }, NOW, () => card());
  const stamp = finishFreeCast(p, e.now(), A);
  // Use a known sellable species to isolate persistence from the roll's tier.
  const r = e.addCatch('sardine', 15, stamp); assert.ok(r.ok);
  assert.deepEqual(r.fish.ticket, p.ticket); assert.equal(r.fish.caughtAt, stamp.caughtAt);
  assert.deepEqual(parseWallet({ ...e.getWallet(), version: 1 }, time).cooler[0].ticket, p.ticket);
  e = economy(s, () => time); assert.deepEqual(e.getWallet().cooler[0].ticket, p.ticket);
  const bodies = [];
  e.setTransport(async body => { bodies.push(structuredClone(body)); throw Error('lost answer'); });
  await e.sell([r.fish.uid]);
  assert.deepEqual(e.getStatus().pending.tickets, [p.ticket]);
  e = economy(s, () => time); e.setTransport(async body => { bodies.push(structuredClone(body)); throw Error('lost again'); });
  await e.retry(); assert.deepEqual(bodies[1], bodies[0]); assert.deepEqual(e.getStatus().pending.tickets, [p.ticket]);
  assert.equal(bodies[0].catches[0].caughtAt, stamp.caughtAt);
});

test('pending ice keeps a ticketed fish through apparent spoilage, a new catch and reload', async () => {
  const s = storage(); let time = NOW;
  let e = economy(s, () => time);
  const caughtAt = NOW - 30 * 60_000 + 1000;
  const prepared = prepareFreeCast({ distance: .8, nice: false }, caughtAt - 5000, () => card(caughtAt));
  const stamp = finishFreeCast(prepared, caughtAt, A);
  assert.ok(stamp.ticket);
  const old = e.addCatch('sardine', 15, stamp); assert.ok(old.ok);
  const base = { revision: 1, coins: 0, coolerLevel: 0, goods: [{ uid: 'ice-one', id: 'ice_block', qty: 1, at: NOW, expiresAt: null }],
    econ: { day: e.getWallet().day, soldToday: {}, earnedToday: 0, boughtToday: {} }, iceUsedAt: [], serverNow: time };
  e.receiveView(A, base);
  let deliver;
  e.setTransport(() => new Promise(resolve => { deliver = resolve; }));
  const use = e.useItem('ice-one');
  assert.equal(e.getStatus().pending?.op, 'bag.use');
  time += 2000; e.refresh(); // looks spoiled without the server's in-flight ice
  const newer = prepareFreeCast({ distance: .8, nice: true }, time, () => card(time, 21));
  e.addCatch('sardine', 16, finishFreeCast(newer, time, A));
  deliver({ ...base, revision: 2, goods: [], iceUsedAt: [NOW], serverNow: time, result: {} }); await use;
  e = economy(s, () => time);
  assert.equal(e.getWallet().cooler.length, 2);
  assert.deepEqual(e.getWallet().cooler.find(f => f.uid === old.fish.uid).ticket, prepared.ticket);
  assert.equal(e.getWallet().cooler.find(f => f.uid === old.fish.uid).caughtAt, caughtAt);
});

// Compile the REAL session and its stores. Only React's subscription hook is replaced with snapshot reads.
// No gameplay implementation is mocked; casts use real press/hold/release, timing and physics.
let bundle;
async function sessionRig({ withDeck = true } = {}) {
  if (!bundle) {
    const { build } = await import('vite');
    const root = fileURLToPath(new URL('../src/', import.meta.url));
    const built = await build({ configFile: false, logLevel: 'silent', define: { 'import.meta.env.ECONOMY_PREVIEW': 'true' },
      plugins: [{ name: 'session-test-entry', enforce: 'pre', resolveId(id) { if (id === root + 'stage4-test-entry.ts' || id === 'react') return id === 'react' ? '\0react' : '\0session-test'; },
        load(id) { if (id === '\0react') return 'export const useSyncExternalStore = (_, get) => get();';
          if (id === '\0session-test') return `export * from '${root}game/story/fishingSession.ts'; export * from '${root}game/fishing/deckClient.ts'; export * from '${root}game/economy/walletStore.ts'; export * from '${root}game/fishing/freeFish.ts';`; } }],
      build: { minify: false, write: false, lib: { entry: root + 'stage4-test-entry.ts', name: 'Session', formats: ['iife'] } } });
    bundle = (Array.isArray(built) ? built : [built]).flatMap(b => b.output).find(c => c.type === 'chunk' && c.isEntry).code;
  }
  const { createContext, Script } = await import('node:vm');
  const w = { time: NOW, perf: 1000, failStorage: false, calls: 0, net: .1 };
  const mem = storage();
  const math = Object.create(Math); math.random = () => .5;
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [w.time])); } static now() { return w.time; } }
  const context = createContext({ Math: math, Date: ClockDate, structuredClone, URLSearchParams,
    performance: { now: () => w.perf }, location: { search: '' }, navigator: { onLine: true },
    localStorage: { getItem: k => { if (w.failStorage) throw Error('blocked'); return mem.get(k); }, setItem: (k, v) => { if (w.failStorage) throw Error('quota'); mem.set(k, v); }, removeItem: k => mem.remove(k) },
    crypto: { getRandomValues: a => a.fill(7) }, document: { hidden: false, addEventListener() {} }, window: { location: { search: '' }, addEventListener() {}, setTimeout() {} },
    setTimeout: () => 1, clearTimeout() {}, fetch: async () => ({ json: async () => ({}) }), Image: class { complete = false; },
  });
  new Script(bundle).runInContext(context); const api = context.Session;
  api.attachWallet(A); api.attachFishBook(A); api.attachFishingDeck(A);
  api.registerDeckTransport(async () => { w.calls++; if (!withDeck) throw Error('offline'); return issueFishingDeck(A, w.time, SECRET); });
  await api.refreshFishingDeck();
  const engine = { localPlayer: { x: 452, y: 222, facing: 1, currentAction: 'idle' }, getRoom: () => ({ outfit: 'test-stage4' }),
    walkPlayerTo: async () => {}, setDialogFrozen() {}, setPlayerPose() {}, triggerEmote() {}, sendChat() {} };
  const ctx = new Proxy({ fillRect(x, y, width, height) { if ((this.fillStyle === '#C9A56B' || this.fillStyle === '#DDBB78') && width === 22 && height === 48) w.net = (176 - y) / 160 - .3; } }, { get: (obj, k) => k in obj ? obj[k] : () => {} });
  await api.startFishing(engine, 'free');
  w.api = api; w.mem = mem; w.context = context; w.engine = engine;
  w.throwAt = (distance, sweep = 0) => { w.perf = Math.ceil(w.perf) + 1000; api.fishingPress(); api.fishingHold(true); w.perf += (sweep ? 2 - distance : distance) * TUNING.chargeSweepMs; api.fishingHold(false); };
  w.land = () => {
    let lastNet = w.net;
    for (let i = 0; i < 1600; i++) {
      const before = api.useFishingView();
      if (before.phase === 'bite') api.fishingPress();
      if (before.phase === 'reel') {
        const velocity = (w.net - lastNet) / .02; lastNet = w.net;
        api.fishingHold(w.net + velocity * .25 < .34);
      }
      w.perf += 20; w.time += 20;
      api.drawFishing(ctx, 'world', w.perf); api.drawReelBar(ctx, w.perf, true);
      const v = api.useFishingView(); if (['caught', 'escaped', 'stolen', 'scared'].includes(v.phase)) return v;
    }
    assert.fail('minigame did not finish');
  };
  return w;
}

test('real minigame casts at Nice edges and neighbours always produce valid canonical deck rolls', async () => {
  const w = await sessionRig(); const outputs = [];
  w.api.setFishingTestHooks({ onCast: info => outputs.push(info) });
  for (const distance of [.8 - 1e-9, .8, .8 + 1e-9, .92 - 1e-9, .92, .92 + 1e-9, 0, 1]) {
    for (const sweep of [0, 1]) {
      w.throwAt(distance, sweep);
      const info = outputs.at(-1); assert.ok(Math.abs(info.distance - distance) < 1e-12);
      if (!sweep && (distance === .8 || distance === .92)) assert.equal(info.distance, distance, 'real gauge hits the exact inclusive edge');
      const prepared = prepareFreeCast(info, w.api.gameNow(), () => card(w.api.gameNow()));
      assert.ok(prepared.rolled, JSON.stringify(info));
      assert.equal(prepared.ticket.castInfo.nice, info.distance >= .8 && info.distance <= .92);
      // Also survives a future UI band/flag mismatch.
      assert.ok(prepareFreeCast({ ...info, nice: !info.nice }, w.api.gameNow(), () => card(w.api.gameNow())).rolled);
      w.api.stopFishing(); await w.api.startFishing({ localPlayer: { x: 452, y: 222, facing: 1 }, getRoom: () => ({ outfit: 'test-stage4' }), walkPlayerTo: async () => {}, setDialogFrozen() {}, setPlayerPose() {}, triggerEmote() {} }, 'free');
      w.perf += 1000;
    }
  }
  assert.equal(outputs.length, 16); assert.equal(w.calls, 1, 'casting never requests a deck');
});

test('actual session carries a deck catch to both Book and Bag cooler using the same stamp', async () => {
  const w = await sessionRig(); w.throwAt(.85);
  const v = w.land(); assert.equal(v.phase, 'caught');
  const pending = w.api.getPendingCatches()[0];
  const fish = w.api.getWallet().cooler[0];
  assert.ok(fish, JSON.stringify(v)); assert.deepEqual(fish.ticket, pending.ticket); assert.equal(fish.caughtAt, pending.caughtAt);
  const expected = rollDeckCatch({ ...fish.ticket, seed: w.api.getFishingDeck().seed });
  assert.equal(fish.fishId, expected.fish); assert.equal(fish.sizeCm, expected.sizeCm);
  assert.match(v.info.cooler.text, /^Cooler /); assert.equal(w.calls, 1);
});

test('Fish Book adjusts stamps below the shared minimum gap, drops tickets and preserves exact-gap stamps', async () => {
  for (const delta of [-2000, 0, LIMITS.minCatchGapMs - 1]) {
    const w = await sessionRig();
    const p = prepareFreeCast({ distance: .8, nice: true }, NOW, () => card());
    const first = finishFreeCast(p, NOW + LIMITS.minCatchGapMs, A);
    assert.equal(w.api.addToFishBook('sardine', 15, first).stamp, first, 'unchanged stamps are shared');
    const second = finishFreeCast(p, first.caughtAt + delta, A);
    assert.ok(second.ticket, 'the input is ticketed before the Book adjusts it');
    const original = structuredClone(second);
    const adjusted = w.api.addToFishBook('sardine', 16, second).stamp;
    assert.equal(adjusted.caughtAt, first.caughtAt + LIMITS.minCatchGapMs);
    assert.equal(adjusted.ticket, undefined);
    assert.deepEqual(second, original, 'caller stamp/ticket is not mutated');
    const later = finishFreeCast(p, adjusted.caughtAt + LIMITS.minCatchGapMs, A);
    assert.equal(w.api.addToFishBook('sardine', 17, later).stamp, later);
    const pending = w.api.getPendingCatches();
    assert.equal(pending.length, 3);
    assert.equal(pending[1].caughtAt, adjusted.caughtAt); assert.equal(pending[1].ticket, undefined);
    assert.deepEqual(pending[2].ticket, later.ticket);
    assert.equal(w.api.getFishBook().total, 3);
  }
});

test('real catches after a backwards gameNow correction stay Book-only at the shared gap and pass the real server recording rule', async () => {
  const w = await sessionRig(); w.throwAt(.85);
  assert.equal(w.land().phase, 'caught');
  const first = w.api.getPendingCatches()[0];
  assert.ok(first.ticket); assert.equal(w.api.getWallet().cooler.length, 1);
  w.api.stopFishing(); await w.api.startFishing(w.engine, 'free');
  w.api.receiveServerView(A, { serverNow: w.api.gameNow() - 60_000 });
  assert.ok(w.api.gameNow() < first.caughtAt);
  w.throwAt(.85); const view = w.land(); assert.equal(view.phase, 'caught');
  assert.ok(w.api.gameNow() < first.caughtAt, 'second catch clock is still earlier than the first');
  const pending = w.api.getPendingCatches();
  assert.equal(pending.length, 2, 'both catches remain in the Book pending list');
  assert.equal(pending[1].caughtAt, first.caughtAt + LIMITS.minCatchGapMs); assert.equal(pending[1].ticket, undefined);
  assert.equal(w.api.getFishBook().total, 2);
  assert.equal(w.api.getWallet().cooler.length, 1, 'the adjusted catch cannot enter the cooler');
  assert.equal(w.api.getWallet().cooler[0].caughtAt, first.caughtAt);
  assert.deepEqual(w.api.getWallet().cooler[0].ticket, first.ticket);
  assert.equal(view.info.cooler.text, BOOK_ONLY_CATCH);
  const savedPending = JSON.parse(w.mem.get(`free_fishing_pending_v1_${A}`));
  assert.equal(savedPending[1].caughtAt, first.caughtAt + LIMITS.minCatchGapMs); assert.equal(savedPending[1].ticket, undefined);
  assert.equal(JSON.parse(w.mem.get(`sp_cooler_v2_${A}`)).length, 1);
  const serverNow = w.api.gameNow();
  assert.ok(pending[1].caughtAt > serverNow, 'the corrected catch is dated ahead of the resynced clock');
  assert.ok(pending[1].caughtAt <= serverNow + LIMITS.clockSkewMs, 'the real future-time allowance covers it');
  const catches = parseCatches(pending.map(({ fish, sizeCm, caughtAt }) => ({ fish, sizeCm, caughtAt })));
  const doc = emptyPlayer(serverNow);
  const together = applyCatches(doc, catches, serverNow);
  assert.equal(together.changes.recorded, 2); assert.deepEqual(together.changes.rejected, []);
  assert.equal(together.fields.fishTotal, 2); assert.equal(together.fields.lastCatchAt, pending[1].caughtAt);
  // Also accepted after the first catch has already advanced the server's lastCatchAt.
  const firstRecorded = applyCatches(doc, [catches[0]], serverNow);
  const secondRecorded = applyCatches({ ...doc, ...firstRecorded.fields }, [catches[1]], serverNow);
  assert.equal(secondRecorded.changes.recorded, 1); assert.deepEqual(secondRecorded.changes.rejected, []);
  assert.equal(secondRecorded.fields.fishTotal, 2);
});

test('actual no-deck and storage-failure casts still land with a plain Book-only catch card and no cooler fish', async () => {
  for (const reason of ['offline', 'storage', 'exhausted']) {
    const w = await sessionRig({ withDeck: reason !== 'offline' });
    if (reason === 'storage') w.failStorage = true;
    if (reason === 'exhausted') for (let i = 0; i < FISHING_DECK.casts; i++) assert.ok(w.api.reserveFishingCast(w.api.gameNow()));
    w.throwAt(.85); const v = w.land(); assert.equal(v.phase, 'caught', reason);
    const legacy = cast(() => .5, { table: w.api.freeTableNow(), info: { distance: .85, nice: true }, hour: 12 });
    assert.equal(v.caught, legacy.fish); assert.equal(v.sizeCm, legacy.sizeCm, 'fallback uses the original local roll');
    assert.equal(v.info.cooler.text, BOOK_ONLY_CATCH); assert.equal(w.api.getWallet().cooler.length, 0);
    assert.equal(w.api.getPendingCatches().length, 1); assert.equal(w.api.getPendingCatches()[0].ticket, undefined);
    assert.equal(w.calls, 1);
  }
});
