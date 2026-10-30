import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) {
  if (s.startsWith('.') && !/\.[a-z]+$/i.test(s)) { const u = new URL(s + '.ts', c.parentURL); if (existsSync(u)) return next(u.href, c); }
  return next(s, c);
} });
import { fileURLToPath } from 'node:url';
const { FishBookStore } = await import('../src/game/fishing/fishBookState.ts');
const { FISH_BOOK } = await import('../src/game/fishing/fishBookConfig.ts');
const { cast, step, TUNING } = await import('../src/game/story/fishing.ts');
const { rollDeckCatch } = await import('../src/game/fishing/deckRoll.ts');
const { issueFishingDeck } = await import('../server/fishing/deck.ts');
const { FREE_FISH } = await import('../src/game/fishing/freeFishCatalog.ts');
const A = '0x' + 'ab'.repeat(20), B = '0x' + 'cd'.repeat(20), NOW = Date.UTC(2026, 9, 30, 5);
const view = (revision, entries) => ({ revision, fishBook: entries, totalKinds: 27 });
function memory() { const m = new Map(); return { m, get: k => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: k => m.delete(k) }; }

test('read-only Book switches accounts, ignores stale/foreign answers and restores only its verified cache offline', () => {
  const storage = memory(), s = new FishBookStore(storage); s.attach(A);
  s.receive(A, view(3, { sardine: { best: 18, starred: true } }));
  s.receive(A, view(2, {})); s.receive(B, view(9, {}));
  assert.deepEqual(s.get().entries, { sardine: { best: 18, starred: true } });
  s.attach(B); assert.deepEqual(s.get().entries, {});
  s.receive(A, view(10, { tilapia: { best: 20, starred: true } })); assert.deepEqual(s.get().entries, {});
  const reloaded = new FishBookStore(storage); reloaded.attach(A); assert.deepEqual(reloaded.get(), { entries: { sardine: { best: 18, starred: true } }, totalKinds: 27 });
  reloaded.reset(A); reloaded.receive(A, view(0, {})); assert.deepEqual(reloaded.get().entries, {}, 'explicit dev reset accepts the fresh server revision');
  reloaded.attach(null); reloaded.receive(null, view(100, { sardine: { best: 20, starred: true } })); assert.deepEqual(reloaded.get().entries, {});
});

test('old Book/pending data is discarded without parsing/upload; malformed or blocked storage never awards entries or crashes', () => {
  const storage = memory();
  for (const key of ['free_fishing_book_v1', 'free_fishing_book_test', `free_fishing_pending_v1_${A}`, `free_fishing_pending_op_v1_${A}`]) storage.set(key, '{broken');
  const s = new FishBookStore(storage); s.attach(A); assert.equal(storage.m.size, 0); assert.deepEqual(s.get().entries, {});
  for (const entries of [{ sardine: { count: 999, best: 20, first: NOW } }, { sardine: { best: 20, sold: 999 } }, { bottle_message: { best: 0, starred: true } }, { sardine: { best: 999, starred: true } }]) s.receive(A, view(9, entries));
  assert.deepEqual(s.get().entries, {});
  const blocked = new FishBookStore({ get() { throw Error('blocked'); }, set() { throw Error('blocked'); }, remove() { throw Error('blocked'); } });
  blocked.attach(A); blocked.receive(A, view(1, { sardine: { best: 15, starred: false } })); assert.equal(blocked.get().entries.sardine.best, 15);
  blocked.attach(null); assert.deepEqual(blocked.get().entries, {});
});

test('star is snapshotted per species, gives precisely 1.15x strike time and changes no roll, wait, reel or story behavior', () => {
  const deck = issueFishingDeck(A, NOW, 'test-only-fishing-secret-at-least-32-bytes'), info = { distance: .85, nice: true };
  const roll = rollDeckCatch({ ...deck, castIndex: 5, castInfo: info, castAt: NOW });
  const opts = { table: { species: FREE_FISH }, info, rolled: roll };
  const plain = cast(() => .5, opts), star = cast(() => .5, { ...opts, starred: id => id === roll.fish });
  assert.equal(star.strikeMultiplier, FISH_BOOK.strikeWindowMultiplier);
  assert.deepEqual({ ...star, strikeMultiplier: 1 }, plain);
  const foreign = cast(() => .5, { ...opts, starred: id => id !== roll.fish }); assert.deepEqual(foreign, plain);
  const hardest = { ...star, phase: 'bite', baseDiff: 5, big: false, t: 0 };
  assert.equal(step({ ...hardest, strikeMultiplier: 1 }, .4, () => .5).phase, 'stolen');
  assert.equal(step(hardest, .4, () => .5).phase, 'bite');
  assert.equal(step(hardest, TUNING.biteWindow(5) * FISH_BOOK.strikeWindowMultiplier - 1e-9, () => .5).phase, 'bite');
  assert.equal(step(hardest, TUNING.biteWindow(5) * FISH_BOOK.strikeWindowMultiplier, () => .5).phase, 'stolen');
  for (const phase of ['waiting', 'reel']) assert.deepEqual({ ...step({ ...star, phase }, .02, () => .5), strikeMultiplier: 1 }, step({ ...plain, phase }, .02, () => .5));
  assert.deepEqual(cast(() => .5, { firstCatch: true, starred: () => true }), cast(() => .5, { firstCatch: true }));
  assert.deepEqual(rollDeckCatch({ ...deck, castIndex: 5, castInfo: info, castAt: NOW }), roll);
});

test('real Book markup lists 27 bookable kinds, best and star, with no catch/sold quantities or guide recording flow', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  const saved = globalThis.localStorage; const storage = memory();
  globalThis.localStorage = { getItem: storage.get, setItem: storage.set, removeItem: storage.remove };
  try {
    const api = await server.ssrLoadModule('/src/game/fishing/freeFish.ts');
    const { FishBook } = await server.ssrLoadModule('/src/components/FishBook.tsx');
    api.attachFishBook(A); api.receiveFishBook(A, view(25, { sardine: { best: 18, starred: true } }));
    const html = renderToStaticMarkup(createElement(FishBook, { open: true, onToggle() {} }));
    assert.match(html, /1\/27/); assert.match(html, /best 18 cm/); assert.match(html, /Starred fish/);
    assert.equal((html.match(/aria-label="Unknown fish"/g) ?? []).length, 26);
    for (const text of ['waiting', '×25', 'sold', 'bottle_message.webp', 'treasure_chest.webp', 'sun_carp.webp', 'moon_whale.webp', 'fossil_fish.webp']) assert.equal(html.includes(text), false, text);
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(app, /guideRecord|recordPendingCatches|withRecordResult/);
    const cloud = readFileSync(new URL('../src/game/saves/cloud.ts', import.meta.url), 'utf8'); assert.doesNotMatch(cloud, /fishbook\.record|pendingOperation|MIN_GAP/);
  } finally { await server.close(); if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
});
