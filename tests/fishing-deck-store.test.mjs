import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { FishingDeckStore, parseFishingDeck } = await import('../src/game/fishing/deckStore.ts');
const { issueFishingDeck } = await import('../server/fishing/deck.ts');
const { FISHING_DECK } = await import('../src/game/fishing/deckConfig.ts');
const A = '0x' + 'ab'.repeat(20), B = '0x' + 'cd'.repeat(20), NOW = Date.UTC(2026, 9, 29, 5);
const SECRET = 'test-deck-client-secret-at-least-32-bytes';
function rig({ enabled = true, storage = new Map(), clockOffset = 0 } = {}) {
  const w = { now: NOW, online: true, calls: 0, random: 0, storage, failWrite: false };
  w.store = new FishingDeckStore({ enabled, clock: () => w.now + clockOffset, online: () => w.online, randomIndex: () => { w.random++; return 8191; },
    storage: { get: key => storage.get(key) ?? null, set: (key, value) => { if (w.failWrite) throw Error('quota'); storage.set(key, value); } } });
  w.store.setTransport(async () => { w.calls++; return issueFishingDeck(w.store.getAddress(), w.now, SECRET); });
  w.store.attach(A); return w;
}
test('disabled economy, guest and offline never fetch a deck', async () => {
  const off = rig({ enabled: false }); await off.store.sync(); assert.equal(off.calls, 0); assert.equal(off.store.getDeck(), null);
  const w = rig(); w.store.attach(null); await w.store.sync(); assert.equal(w.calls, 0);
  w.store.attach(A); w.online = false; await w.store.sync(); assert.equal(w.calls, 0);
});
test('one fetch per window, concurrent requests coalesce; same ID reload restores deck and cursor', async () => {
  const w = rig({ clockOffset: 120_000 }); await Promise.all([w.store.sync(), w.store.sync()]);
  assert.equal(w.calls, 1); assert.equal(w.store.now(), NOW);
  assert.equal(w.store.reserveCast(w.now).castIndex, 8191);
  assert.equal(w.store.reserveCast(w.now).castIndex, 0);
  await w.store.sync(); assert.equal(w.calls, 1); assert.equal(w.random, 1);
  const reload = rig({ storage: w.storage, clockOffset: 120_000 }); reload.online = false;
  await reload.store.sync(); assert.equal(reload.calls, 0); assert.equal(reload.random, 0);
  assert.equal(reload.store.reserveCast(reload.now).castIndex, 1);
  assert.equal(w.store.reserveCast(w.now).castIndex, 2, 'sequential tabs pick up persisted draws');
});
test('wrap once, then exhaustion is Book-only; same-window sync cannot replenish cards', async () => {
  const w = rig(); await w.store.sync(); const indices = new Set();
  for (let i = 0; i < FISHING_DECK.casts; i++) indices.add(w.store.reserveCast(w.now).castIndex);
  assert.equal(indices.size, FISHING_DECK.casts); assert.equal(w.store.reserveCast(w.now), null);
  await w.store.sync(); assert.equal(w.calls, 1); assert.equal(w.store.reserveCast(w.now), null);
});
test('expired cache is unusable offline; exact next window gets a new deck/start online', async () => {
  const w = rig(); await w.store.sync(); const old = w.store.getDeck();
  w.now = old.window.endAt; w.online = false; await w.store.sync();
  assert.equal(w.store.getDeck(), null); assert.equal(w.store.reserveCast(w.now), null); assert.equal(w.calls, 1);
  w.online = true; await w.store.sync(); assert.equal(w.store.getDeck().deckId, old.deckId + 1); assert.equal(w.random, 2);
});
test('old account answers never replace a newly attached ID; other IDs have separate caches', async () => {
  const w = rig(); let release;
  w.store.setTransport(() => new Promise(resolve => { release = resolve; }));
  const old = w.store.sync(); await Promise.resolve(); w.store.attach(B);
  w.store.setTransport(async () => issueFishingDeck(B, NOW, SECRET)); await w.store.sync();
  release(issueFishingDeck(A, NOW, SECRET)); await old;
  assert.equal(w.store.getDeck().address, B);
  w.store.attach(A); assert.equal(w.store.getDeck(), null);
  w.store.attach(B); assert.equal(w.store.getDeck().address, B);
});
test('missing config/auth, synchronous transport errors and storage errors never escape to gameplay', async () => {
  const w = rig(); w.store.setTransport(() => { throw Error('closed'); }); await w.store.sync();
  assert.equal(w.store.reserveCast(w.now), null);
  w.store.setTransport(async () => issueFishingDeck(A, NOW, SECRET)); await w.store.sync();
  w.failWrite = true; assert.equal(w.store.reserveCast(w.now), null, 'a card is never returned before persistence');
  w.failWrite = false; assert.ok(w.store.reserveCast(w.now));
});
test('failed reservation persistence keeps draws unchanged and retries the same index, including wrap', async () => {
  for (const used of [0, 1]) {
    const w = rig(); await w.store.sync();
    for (let i = 0; i < used; i++) assert.ok(w.store.reserveCast(w.now));
    const key = `sp_fishing_deck_v1_${A}`;
    const before = w.storage.get(key), cached = JSON.parse(before);
    const expected = (cached.startIndex + cached.draws) % FISHING_DECK.casts;
    w.failWrite = true;
    for (let i = 0; i < 2; i++) {
      assert.equal(w.store.reserveCast(w.now), null);
      assert.equal(w.storage.get(key), before, 'failed writes leave persisted draws unchanged');
    }
    w.failWrite = false;
    assert.equal(w.store.reserveCast(w.now).castIndex, expected, 'failed writes also leave in-memory draws unchanged');
    assert.equal(JSON.parse(w.storage.get(key)).draws, cached.draws + 1);
    const reload = rig({ storage: w.storage });
    assert.equal(reload.store.reserveCast(reload.now).castIndex, (expected + 1) % FISHING_DECK.casts);
  }
});
test('malformed/other-owner cache and responses are ignored; returned decks cannot mutate storage', async () => {
  const deck = issueFishingDeck(A, NOW, SECRET);
  for (const raw of [null, {}, { ...deck, address: B }, { ...deck, seed: 'bad' }, { ...deck, casts: 1 }, { ...deck, deckId: deck.deckId + 1 }, { ...deck, window: { startAt: 0, endAt: 1 } }]) assert.equal(parseFishingDeck(raw, A), null);
  const w = rig(); await w.store.sync(); const copy = w.store.getDeck(); copy.seed = 'bad'; assert.notEqual(w.store.getDeck().seed, 'bad');
  w.storage.set(`sp_fishing_deck_v1_${A}`, '{bad json'); w.store.attach(null); w.store.attach(A); assert.equal(w.store.getDeck(), null);
});

test('the actual compiled client fetches only in an economy preview, never production or sandbox', async () => {
  const { build } = await import('vite');
  const { createContext, Script } = await import('node:vm');
  const { fileURLToPath } = await import('node:url');
  for (const [preview, search, expected] of [[false, '', 0], [true, '', 1], [true, '?test=free', 0]]) {
    const bundle = await build({ configFile: false, logLevel: 'silent', define: { 'import.meta.env.ECONOMY_PREVIEW': JSON.stringify(preview) },
      build: { minify: false, write: false, lib: { entry: fileURLToPath(new URL('../src/game/fishing/deckClient.ts', import.meta.url)), name: 'DeckClient', formats: ['iife'] } } });
    const chunk = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(output => output.output).find(item => item.type === 'chunk' && item.isEntry);
    const storage = new Map(); let calls = 0;
    const context = createContext({ location: { search }, navigator: { onLine: true }, structuredClone, URLSearchParams,
      localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
      crypto: { getRandomValues: array => array.fill(7) }, document: { hidden: false, addEventListener() {} },
      window: { addEventListener() {} }, setTimeout: () => 1, clearTimeout() {},
    });
    new Script(chunk.code).runInContext(context);
    context.DeckClient.registerDeckTransport(async () => { calls++; return issueFishingDeck(A, NOW, SECRET); });
    context.DeckClient.attachFishingDeck(A);
    await context.DeckClient.refreshFishingDeck();
    assert.equal(calls, expected, JSON.stringify({ preview, search }));
    assert.equal(context.DeckClient.getFishingDeck() !== null, expected === 1);
  }
});
