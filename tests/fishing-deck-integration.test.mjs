import './register-api-ts.mjs';
const { ECONOMY_EPOCH: EPOCH } = await import('../src/game/economy/economyConfig.ts');
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
const { prepareFreeCast, finishFreeCast, PRACTICE_CATCH } = await import('../src/game/fishing/freeCast.ts');
const { FishingDeckStore } = await import('../src/game/fishing/deckStore.ts');
const { EconomyStore } = await import('../src/game/economy/economyStore.ts');
const { issueFishingDeck } = await import('../server/fishing/deck.ts');
const { rollDeckCatch } = await import('../src/game/fishing/deckRoll.ts');
const { cast, TUNING, step } = await import('../src/game/story/fishing.ts');
const { FREE_FISH } = await import('../src/game/fishing/freeFishCatalog.ts');
const { parseWallet } = await import('../src/game/economy/wallet.ts');
const { FISHING_DECK } = await import('../src/game/fishing/deckConfig.ts');
const { emptyPlayer, playerView } = await import('../server/saves/rules.ts');
const A = '0x' + 'ab'.repeat(20), B = '0x' + 'cd'.repeat(20);
const NOW = Date.UTC(2026, 9, 29, 5), SECRET = 'integration-deck-secret-at-least-32-bytes';
function storage() { const m = new Map(); return { get: k => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: k => m.delete(k), m }; }
function card(at = NOW, castIndex = 20) { return { deck: issueFishingDeck(A, at, SECRET), castIndex }; }
function economy(s, clock) { const e = new EconomyStore({ sandbox: false, storage: s, clock, online: () => true, newOperationId: () => 'op-stage4-000000001' }); e.attach(A); if (!s.get(`sp_econ_v2_${A}`)) e.receiveView(A, { ...playerView(emptyPlayer(clock()), clock()), redeemFromDeckId: 0 }); return e; }

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
  const base = { econEpoch: EPOCH, revision: 1, coins: 0, coolerLevel: 0, goods: [{ uid: 'ice-one', id: 'ice_block', qty: 1, at: NOW, expiresAt: null }],
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
const bundles = new Map();
async function sessionRig({ withDeck = true, dev = false, seedStorage = {} } = {}) {
  let bundle = bundles.get(dev);
  if (!bundle) {
    const { build } = await import('vite');
    const root = fileURLToPath(new URL('../src/', import.meta.url));
    const built = await build({ configFile: false, logLevel: 'silent', define: { 'import.meta.env.DEV': JSON.stringify(dev) },
      plugins: [{ name: 'session-test-entry', enforce: 'pre', resolveId(id) { if (id === root + 'stage4-test-entry.ts' || id === 'react') return id === 'react' ? '\0react' : '\0session-test'; },
        load(id) { if (id === '\0react') return 'export const useSyncExternalStore = (_, get) => get();';
          if (id === '\0session-test') return `export * from '${root}game/story/fishingSession.ts'; export * from '${root}game/fishing/deckClient.ts'; export * from '${root}game/economy/walletStore.ts'; export * from '${root}game/fishing/freeFish.ts'; export {sound} from '${root}game/audio.ts';`; } }],
      build: { minify: false, write: false, lib: { entry: root + 'stage4-test-entry.ts', name: 'Session', formats: ['iife'] } } });
    bundle = (Array.isArray(built) ? built : [built]).flatMap(b => b.output).find(c => c.type === 'chunk' && c.isEntry).code;
    bundles.set(dev, bundle);
  }
  const { createContext, Script } = await import('node:vm');
  const w = { time: NOW, perf: 1000, timers: [], audio: [], failStorage: false, calls: 0, net: .1 };
  const mem = storage();
  for (const [key, value] of Object.entries(seedStorage)) mem.set(key, value);
  const math = Object.create(Math); math.random = () => .5;
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [w.time])); } static now() { return w.time; } }
  const context = createContext({ atob, btoa, Math: math, Date: ClockDate, structuredClone, URLSearchParams,
    performance: { now: () => w.perf, timeOrigin: 1_700_000_000_000 }, location: { search: '' }, navigator: { onLine: true },
    localStorage: { getItem: k => { if (w.failStorage) throw Error('blocked'); return mem.get(k); }, setItem: (k, v) => { if (w.failStorage) throw Error('quota'); mem.set(k, v); }, removeItem: k => mem.remove(k) },
    crypto: { getRandomValues: a => a.fill(4) }, document: { hidden: false, addEventListener() {} }, window: { location: { search: '' }, addEventListener() {}, setTimeout() {} },
    setTimeout: (fn, delay) => { w.timers.push({fn,delay,at:w.perf+delay}); return w.timers.length; }, clearTimeout(id) { if(w.timers[id-1])w.timers[id-1].cancelled=true; }, setInterval: () => 1, clearInterval() {}, fetch: async () => ({ json: async () => ({}) }), Image: class { complete = false; },
  });
  new Script(bundle).runInContext(context); const api = context.Session;
  api.attachWallet(A); api.attachFishBook(A); api.attachFishingDeck(A);
  api.receiveServerView(A, { ...playerView(emptyPlayer(w.time), w.time), redeemFromDeckId: 0, serverNow: w.time });
  api.registerDeckTransport(async () => { w.calls++; if (!withDeck) throw Error('offline'); return issueFishingDeck(A, w.time, SECRET); });
  await api.refreshFishingDeck();
  const engine = { localPlayer: { x: 452, y: 222, facing: 1, currentAction: 'idle' }, getRoom: () => ({ outfit: 'test-stage4' }),
    walkPlayerTo: async () => {}, setDialogFrozen() {}, setPlayerPose() {}, triggerEmote() {}, sendChat() {} };
  const ctx = new Proxy({ fillRect(x, y, width, height) { if ((this.fillStyle === '#C9A56B' || this.fillStyle === '#DDBB78') && width === 22 && height === 32) w.net = (176 - y) / 160 - .2; } }, { get: (obj, k) => k in obj ? obj[k] : () => {} });
  await api.startFishing(engine, 'free');
  api.sound.playEmoteSound = action => w.audio.push({action,at:w.perf});
  w.api = api; w.mem = mem; w.context = context; w.engine = engine;
  w.throwAt = (distance, sweep = 0) => { w.perf = Math.ceil(w.perf) + 1000; api.fishingPress(); api.fishingHold(true); w.perf += (sweep ? 2 - distance : distance) * TUNING.chargeSweepMs; api.fishingHold(false); };
  w.land = () => {
    let lastNet = w.net;
    for (let i = 0; i < 1600; i++) {
      const before = api.useFishingView();
      if (before.phase === 'bite') api.fishingPress();
      if (before.phase === 'reel') {
        const velocity = (w.net - lastNet) / .02; lastNet = w.net;
        api.fishingHold(w.net + velocity * .25 < .40);
      }
      w.perf += 20; w.time += 20;
      w.beforeDraw?.();
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

test('real DEV reset response clears old v1 cooler/pending/Book/cache revisions together, never identity or an automatic sale', async () => {
  const oldTicket = { version: 1, deckId: Math.floor(NOW / FISHING_DECK.windowMs), castIndex: 4, castAt: NOW - 1000, castInfo: { distance: .85, nice: true } };
  const pending = { op: 'shop.sell', at: NOW, uids: ['old-v1'], tickets: [oldTicket], body: {
    op: 'shop.sell', operationId: 'op-old-v1-pending-0001', catches: [{ fish: 'sardine', sizeCm: 20, caughtAt: NOW, ticket: oldTicket }],
  } };
  const oldView = { ...playerView(emptyPlayer(NOW), NOW), revision: 99, coins: 999,
    fishBook: { sardine: { best: 22, starred: true } }, redeemFromDeckId: 0 };
  const w = await sessionRig({ dev: true, seedStorage: {
    identity_vault: 'keep', [`sp_econ_v2_${A}`]: JSON.stringify(oldView),
    [`sp_pending_v2_${A}`]: JSON.stringify(pending),
    [`sp_cooler_v2_${A}`]: JSON.stringify([{ uid: 'old-v1', fishId: 'sardine', sizeCm: 20, caughtAt: NOW, ticket: oldTicket }]),
    [`sp_verified_book_v1_${A}`]: JSON.stringify(oldView),
  } });
  let sends = 0; w.api.registerEconomyTransport(async () => { sends++; throw Error('must not upload old pending'); });
  assert.equal(w.api.getWallet().coins, 0); assert.equal(w.api.getEconomyStatus().pending.body.operationId, pending.body.operationId);
  assert.equal(w.api.getFishBook().entries.sardine, undefined);
  const reserved = w.api.reserveFishingCast(w.time); assert.equal(reserved.deck.version, 2);
  const fresh = { ...playerView(emptyPlayer(NOW), NOW), redeemFromDeckId: 0, devFishingResetId: 'new-v2-dataset', serverNow: NOW };
  w.api.receiveServerView(A, fresh); await w.api.refreshFishingDeck();
  assert.equal(w.api.getWallet().coins, 0); assert.equal(w.api.getWallet().cooler.length, 0);
  assert.equal(w.api.getEconomyStatus().pending, null); assert.equal(Object.keys(w.api.getFishBook().entries).length, 0);
  assert.equal(w.mem.get(`sp_pending_v2_${A}`), null); assert.equal(w.mem.get('identity_vault'), 'keep');
  const again = w.api.reserveFishingCast(w.time); assert.equal(again.castIndex, reserved.castIndex, 'reset also clears the cursor');
  const stamp = { caughtAt: NOW, ticket: { ...oldTicket, version: 2 } };
  assert.equal(w.api.catchToCooler('sardine', 20, stamp).ok, true);
  w.api.receiveServerView(A, fresh); assert.equal(w.api.getWallet().cooler.length, 1, 'same reset token cannot erase a new catch');
  assert.equal(sends, 0);
});

test('actual session catches a ticketed fish without awarding a local Book entry; Gen message is explicit', async () => {
  const w = await sessionRig(); w.throwAt(.85);
  const v = w.land(); assert.equal(v.phase, 'caught');
  const fish = w.api.getWallet().cooler[0]; assert.ok(fish, JSON.stringify(v));
  const expected = rollDeckCatch({ ...fish.ticket, seed: w.api.getFishingDeck().seed });
  assert.equal(fish.fishId, expected.fish); assert.equal(fish.sizeCm, expected.sizeCm);
  assert.equal(Object.keys(w.api.getFishBook().entries).length, 0);
  assert.equal(v.info.bookMessage, 'New! Sell it to Gen to add it to your Fish Book.');
  assert.match(v.info.cooler.text, /^Cooler /); assert.equal(w.calls, 1);
});

test('backwards game clock never re-stamps catches for an obsolete Book gap; only the cast’s own ordering matters', async () => {
  const w = await sessionRig(); w.throwAt(.85); const first = w.land(); assert.equal(first.phase, 'caught');
  const original = w.api.getWallet().cooler[0];
  w.api.stopFishing(); await w.api.startFishing(w.engine, 'free');
  w.api.receiveServerView(A, { serverNow: w.api.gameNow() - 60000 });
  w.throwAt(.85); const second = w.land(); assert.equal(second.phase, 'caught');
  const fish = w.api.getWallet().cooler[1]; assert.ok(fish.ticket); assert.ok(fish.caughtAt < original.caughtAt);
  assert.ok(fish.ticket.castAt <= fish.caughtAt); assert.equal(Object.keys(w.api.getFishBook().entries).length, 0);
});

test('actual no-deck and storage-failure casts still land as practice, with no cooler or Book award', async () => {
  for (const reason of ['offline', 'storage', 'exhausted']) {
    const w = await sessionRig({ withDeck: reason !== 'offline' });
    if (reason === 'storage') w.failStorage = true;
    if (reason === 'exhausted') for (let i = 0; i < FISHING_DECK.casts; i++) assert.ok(w.api.reserveFishingCast(w.api.gameNow()));
    w.throwAt(.85); const v = w.land(); assert.equal(v.phase, 'caught', reason);
    assert.equal(v.info.bookMessage, PRACTICE_CATCH); assert.equal(w.api.getWallet().cooler.length, 0);
    assert.equal(Object.keys(w.api.getFishBook().entries).length, 0); assert.equal(w.calls, 1);
  }
});

test('whole loop: real minigame catch → verified Gen sale → Book update; lost answer/Retry and second device never invent entries', async () => {
  const { saleHarness } = await import('./sale-harness.mjs');
  const w = await sessionRig(), h = saleHarness({ address: A, start: w.time, env: { FISHING_DECK_SECRET: SECRET } });
  w.api.registerEconomyTransport(async body => {
    h.clock = w.time; const res = await h.call(body);
    if (res.statusCode !== 200) throw Object.assign(new Error(res.body.error), { status: res.statusCode, data: res.body });
    w.api.receiveServerView(A, res.body); return res.body;
  });
  // Give the real store varying IDs; the deterministic VM crypto fixture otherwise repeats one ID.
  let byte = 0; w.context.crypto.getRandomValues = a => a.fill(++byte);
  w.throwAt(.85); assert.equal(w.land().phase, 'caught');
  const fish = w.api.getWallet().cooler[0]; assert.ok(fish.ticket); assert.equal(Object.keys(w.api.getFishBook().entries).length, 0);
  const sale = await w.api.sellToGen([fish.uid]); assert.equal(sale.ok, true, JSON.stringify(sale));
  assert.equal(sale.receipt.vendor, 'gen'); assert.equal(w.api.getWallet().cooler.length, 0);
  assert.equal(w.api.getFishBook().entries[fish.fishId].best, fish.sizeCm); assert.equal(h.players.get(A).fishBook[fish.fishId].sold, 1);
  const second = await sessionRig(); assert.equal(Object.keys(second.api.getFishBook().entries).length, 0);
  second.api.receiveServerView(A, (await h.call({ op: 'load' })).body);
  assert.equal(second.api.getFishBook().entries[fish.fishId].best, fish.sizeCm);
  // A lost answer commits on the server but does not speculatively update the local Book.
  w.api.stopFishing(); await w.api.startFishing(w.engine, 'free'); w.throwAt(.85); assert.equal(w.land().phase, 'caught');
  const next = w.api.getWallet().cooler[0], before = JSON.stringify(w.api.getFishBook()), sent = []; let lose = true;
  w.api.registerEconomyTransport(async body => {
    sent.push(JSON.parse(JSON.stringify(body))); h.clock = w.time; const res = await h.call(body);
    if (res.statusCode !== 200) throw Object.assign(new Error(res.body.error), { status: res.statusCode, data: res.body });
    if (lose) { lose = false; throw Error('lost'); }
    w.api.receiveServerView(A, res.body); return res.body;
  });
  assert.equal((await w.api.sellToGen([next.uid])).kind, 'uncertain'); assert.equal(JSON.stringify(w.api.getFishBook()), before);
  assert.equal((await w.api.retryTrade()).ok, true); assert.deepEqual(sent[1], sent[0]);
  assert.equal(h.logs.size, 2); assert.equal(Object.values(h.players.get(A).fishBook).reduce((n, e) => n + e.sold, 0), 2);
  assert.equal(w.api.getWallet().cooler.length, 0);
});


test('real free session judges a delayed press by event time rather than frame time', async () => {
  const w = await sessionRig(); w.throwAt(.85);
  const text=[];
  const ctx=new Proxy({ fillText(value){text.push(value);} },{get:(o,k)=>k in o?o[k]:()=>{}});
  for(let n=0;n<1000&&w.api.useFishingView().phase!=='bite';n++){
    w.perf+=20;w.time+=20;w.api.drawFishing(ctx,'world',w.perf);
  }
  assert.equal(w.api.useFishingView().phase,'bite');
  const epoch=w.perf;w.api.fishingPress(epoch);
  const ticket=w.api.getFishingDeck();
  // Actual selected fish determines tempo; accepting any of the five possible beats is
  // not sufficient here: read the authoritative roll for this reserved index.
  const rolled=rollDeckCatch({...ticket,castIndex:4,castInfo:{distance:.85,nice:true},castAt:w.time});
  // The rig's crypto source starts the real deck cursor at index 4.
  const d=Math.min(5,rolled.baseDiff+(rolled.big?1:0));
  const interval=60000/[72,80,88,96,104][d-1];
  w.perf=epoch+interval+350;
  w.api.fishingPress(epoch+interval);
  w.api.drawReelBar(ctx,w.perf,true);
  assert.ok(text.some(t=>String(t).includes('Perfect ×1')),JSON.stringify({d,text}));
  w.api.stopFishing();
});


test('free cast whoosh is synchronous and bite deadline fires without any draw frame; stop cancels it',async()=>{
 const w=await sessionRig();w.throwAt(.85);
 assert.equal(w.audio.at(-1).action,'jump');assert.equal(w.audio.at(-1).at,w.perf);
 const wake=w.timers.at(-1);assert.ok(wake.delay>0);
 w.perf=wake.at;wake.fn();
 assert.equal(w.api.useFishingView().phase,'bite');
 assert.equal(w.audio.at(-1).action,'surprise');assert.equal(w.audio.at(-1).at,wake.at);
 const count=w.audio.length;wake.fn();assert.equal(w.audio.length,count,'one bite cue');
 w.api.stopFishing();assert.ok(wake.cancelled);
});


test('input-time advance that lands a fish awards exactly one catch before the next draw',async()=>{
 const baseline=await sessionRig();baseline.throwAt(.85);assert.equal(baseline.land().phase,'caught');const finishAt=baseline.perf;
 const w=await sessionRig();w.throwAt(.85);let fired=false;
 w.beforeDraw=()=>{if(w.perf===finishAt){fired=true;w.api.fishingPress(w.perf);assert.equal(w.api.useFishingView().phase,'caught');}};
 assert.equal(w.land().phase,'caught');assert.ok(fired);assert.equal(w.api.getWallet().cooler.length,1);
});
