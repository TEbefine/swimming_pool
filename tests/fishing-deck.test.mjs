import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { build } from 'vite';
const { FISHING_DECK } = await import('../src/game/fishing/deckConfig.ts');
const { canonicalDeckCast, createDeckRng, deckContextAt, rollDeckCatch } = await import('../src/game/fishing/deckKernelV1.ts');
const { DECK_RULES_V1, DECK_SPECIES_V1, DECK_TIERS_V1 } = await import('../src/game/fishing/deckRollV1.ts');
const { FREE_FISH, FREE_BY_ID, TIERS, thaiSeasonAt, bangkokHourAt, isDayHourAt } = await import('../src/game/fishing/freeFishCatalog.ts');
const { FRESH, SALE } = await import('../src/game/economy/economyConfig.ts');

// Only the legacy reference uses Vite's extensionless imports. The new protocol has ordinary .js
// imports, and is also compiled/tested below without any source-resolution hook.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(new URL('../src/', import.meta.url).href) && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(url)) return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});
const legacy = await import('../src/game/story/fishing.ts');
const MIN = 60_000;
const NOON = Date.UTC(2026, 9, 29, 5);
const ZERO = '0'.repeat(64);
const INFOS = [
  { distance: 0.05, nice: false }, { distance: 0.2, nice: false },
  { distance: 0.5, nice: false }, { distance: 0.75, nice: false }, { distance: 0.86, nice: true },
];
const TIMES = [
  Date.UTC(2026, 1, 15, 16, 59), Date.UTC(2026, 1, 15, 17), // cool -> hot
  Date.UTC(2026, 4, 15, 16, 59), Date.UTC(2026, 4, 15, 17), // hot -> rainy
  Date.UTC(2026, 9, 15, 16, 59), Date.UTC(2026, 9, 15, 17), // rainy -> cool
  Date.UTC(2026, 9, 28, 22, 59), Date.UTC(2026, 9, 28, 23), // 05:59 -> 06:00
  Date.UTC(2026, 9, 29, 11, 59), Date.UTC(2026, 9, 29, 12), // 18:59 -> 19:00
  Date.UTC(2026, 9, 29, 16, 59), Date.UTC(2026, 9, 29, 17), // Bangkok midnight
];
const input = (overrides = {}) => ({ version: 1, seed: ZERO, castIndex: 0, castInfo: INFOS[2], castAt: NOON, ...overrides });
function* cases() {
  for (const castAt of TIMES) for (const castInfo of INFOS) for (let i = 0; i < 128; i++) {
    yield input({ castAt, castInfo, seed: createHash('sha256').update(`test-deck-${i}`).digest('hex'), castIndex: i * 131 % FISHING_DECK.casts });
  }
}
const fields = ({ fish, sizeCm, baseDiff, big }) => ({ fish, sizeCm, baseDiff, big });

test('v1 pins the current free roll data and coefficients; later tuning must retain v1', () => {
  const keys = ['id', 'tier', 'where', 'size', 'difficulty', 'time', 'season'];
  assert.deepEqual(DECK_SPECIES_V1, FREE_FISH.map((fish) => Object.fromEntries(Object.entries(fish).filter(([key]) => keys.includes(key)))));
  assert.deepEqual(DECK_TIERS_V1, ['god', 'legend', 'epic', 'rare', 'common'].map((id) => ({ id, weight: TIERS[id].weight, nice: TIERS[id].nice, weak: TIERS[id].weak })));
  for (const key of ['weakMax', 'niceMin', 'niceMax', 'habitatMatch', 'habitatAny', 'habitatMiss', 'bigShare']) assert.equal(DECK_RULES_V1[key], legacy.TUNING[key]);
  assert.ok(Object.isFrozen(DECK_SPECIES_V1));
  for (const fish of DECK_SPECIES_V1) { assert.ok(Object.isFrozen(fish)); if (fish.size) assert.ok(Object.isFrozen(fish.size)); }
  assert.throws(() => { DECK_SPECIES_V1[0].size[0] = 99; }, TypeError);
  assert.deepEqual(FISHING_DECK.dailySaleLimits, { common: null, rare: null, epic: 10, legend: 2, god: 0 });
});

test('7680 deck results match the unchanged legacy free cast, including size and big-fish difficulty', () => {
  let count = 0;
  for (const c of cases()) {
    const table = {
      species: FREE_FISH.filter((fish) => !fish.season || fish.season === thaiSeasonAt(c.castAt)),
      tiers: ['god', 'legend', 'epic', 'rare', 'common'].map((id) => ({ id, ...TIERS[id] })),
    };
    const reference = legacy.cast(createDeckRng(c.seed, c.castIndex), { table, info: c.castInfo, hour: bangkokHourAt(c.castAt) });
    assert.deepEqual(rollDeckCatch(c), fields(reference), JSON.stringify(c));
    count++;
  }
  assert.equal(count, 7680);
});

test('compiled browser IIFE and NodeNext server agree on 15360 v1/v2 cases without ambient globals', async () => {
  const sourceRoot = fileURLToPath(new URL('../src/game/fishing/', import.meta.url));
  const entry = join(sourceRoot, 'deckRoll.ts');
  const temporary = await mkdtemp(join(tmpdir(), 'lumen-deck-roll-'));
  try {
    // Strict Node production compilation; no DOM/Node ambient types or source-resolution hooks.
    const program = ts.createProgram([entry], {
      target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
      rootDir: sourceRoot, outDir: temporary, strict: true, types: [], skipLibCheck: true, noEmitOnError: true,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(diagnostics.length, 0, diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
    assert.equal(program.emit().emitSkipped, false);
    await writeFile(join(temporary, 'package.json'), '{"type":"module"}');
    const server = await import(pathToFileURL(join(temporary, 'deckRoll.js')).href);
    const bundle = await build({
      configFile: false, logLevel: 'silent',
      build: { target: 'es2023', minify: false, write: false, lib: { entry, name: 'FishingDeckV1', formats: ['iife'] } },
    });
    const outputs = Array.isArray(bundle) ? bundle : [bundle];
    const chunk = outputs.flatMap((output) => output.output).find((item) => item.type === 'chunk' && item.isEntry);
    assert.ok(chunk);
    const browser = createContext({});
    new Script('Math.random = () => { throw new Error("ambient random"); }; Date.now = () => { throw new Error("ambient clock"); };').runInContext(browser);
    new Script(chunk.code).runInContext(browser);
    assert.equal(new Script('typeof window + "/" + typeof process + "/" + typeof localStorage + "/" + typeof crypto').runInContext(browser), 'undefined/undefined/undefined/undefined');
    let count = 0;
    for (const version of [1, 2]) for (const original of cases()) {
      const c = { ...original, version };
      const phone = JSON.parse(JSON.stringify(browser.FishingDeckV1.rollDeckCatch(c)));
      assert.deepEqual(phone, server.rollDeckCatch(c), JSON.stringify(c));
      count++;
    }
    assert.equal(count, 15360);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('protocol vectors pin seed folding, uint32 PRNG and complete rolls', () => {
  const rng = createDeckRng(ZERO, 0);
  assert.deepEqual(Array.from({ length: 5 }, rng), [0.25261682108975947, 0.03359337989240885, 0.14190986449830234, 0.5142372571863234, 0.586656647734344]);
  assert.deepEqual(rollDeckCatch(input()), { fish: 'barramundi', sizeCm: 54, baseDiff: 3, big: false });
  assert.deepEqual(rollDeckCatch(input({ castIndex: 8191, castInfo: INFOS[4], castAt: Date.UTC(2026, 9, 29, 15) })), { fish: 'pufferfish', sizeCm: 14, baseDiff: 2, big: false });
  assert.deepEqual(rollDeckCatch(input({ seed: 'f'.repeat(64), castIndex: 12, castInfo: INFOS[0], castAt: Date.UTC(2026, 1, 16) })), { fish: 'tilapia', sizeCm: 30, baseDiff: 1, big: false });
  assert.deepEqual(rollDeckCatch(input({ seed: '0123456789abcdef'.repeat(4), castIndex: 4096, castInfo: INFOS[3], castAt: Date.UTC(2026, 4, 16, 12) })), { fish: 'pomfret', sizeCm: 17, baseDiff: 2, big: false });
});

test('indices are independent of call order, previous random draws and repeated verification', () => {
  const c = input({ castIndex: 8191 });
  const expected = rollDeckCatch(c);
  const oldStream = createDeckRng(c.seed, c.castIndex);
  for (let i = 0; i < 500; i++) oldStream();
  for (let i = 100; i >= 0; i--) rollDeckCatch(input({ castIndex: i }));
  assert.deepEqual(rollDeckCatch(c), expected);
  assert.deepEqual(rollDeckCatch(structuredClone(c)), expected);
  assert.notDeepEqual(Array.from({ length: 4 }, createDeckRng(ZERO, 0)), Array.from({ length: 4 }, createDeckRng(ZERO, 1)));
  assert.notDeepEqual(Array.from({ length: 4 }, createDeckRng(ZERO, 0)), Array.from({ length: 4 }, createDeckRng('f'.repeat(64), 0)));
});

test('distance precision collapses to five existing cast states, with exact boundary checks', () => {
  const groups = [[0, 0.05, 0.1], [0.100001, 0.2, 0.339999], [0.34, 0.5, 0.679999], [0.68, 0.75, 0.799999, 0.920001, 1], [0.8, 0.86, 0.92]];
  assert.deepEqual(groups.map((group, i) => canonicalDeckCast({ distance: group[0], nice: i === 4 })), [
    { zone: 'near', quality: 'weak' }, { zone: 'near', quality: 'normal' }, { zone: 'mid', quality: 'normal' },
    { zone: 'far', quality: 'normal' }, { zone: 'far', quality: 'nice' },
  ]);
  for (const [i, group] of groups.entries()) for (let index = 0; index < 50; index++) {
    const results = group.map((distance) => rollDeckCatch(input({ castIndex: index, castInfo: { distance, nice: i === 4 } })));
    for (const result of results) assert.deepEqual(result, results[0]);
  }
});

test('Bangkok season/day boundaries use castAt, not local timezone or a later verification time', () => {
  assert.deepEqual(TIMES.map((at) => deckContextAt(at).season), TIMES.map(thaiSeasonAt));
  for (const at of TIMES) assert.equal(deckContextAt(at).day, isDayHourAt(bangkokHourAt(at)));
  assert.equal(deckContextAt(TIMES[6]).day, false);
  assert.equal(deckContextAt(TIMES[7]).day, true);
  assert.equal(deckContextAt(TIMES[8]).day, true);
  assert.equal(deckContextAt(TIMES[9]).day, false);
  assert.deepEqual(TIMES.slice(0, 6).map((at) => deckContextAt(at).season), ['cool', 'hot', 'hot', 'rainy', 'rainy', 'cool']);
  const originalNow = Date.now; const originalRandom = Math.random;
  try {
    Date.now = Math.random = () => { throw new Error('No ambient state in a ticket roll'); };
    const c = Object.freeze(input({ castInfo: Object.freeze({ ...INFOS[4] }) }));
    assert.deepEqual(rollDeckCatch(c), rollDeckCatch(c));
  } finally { Date.now = originalNow; Math.random = originalRandom; }
});

test('all results are ready kinds, legal sizes and correct day/night; treasures and gods still roll for the Book', () => {
  const ready = new Set(FREE_FISH.map((fish) => fish.id));
  const seen = new Set();
  for (const castAt of [NOON, NOON + 10 * 60 * MIN]) for (let castIndex = 0; castIndex < FISHING_DECK.casts; castIndex++) {
    const result = rollDeckCatch(input({ castAt, castIndex, castInfo: INFOS[4] }));
    const fish = FREE_BY_ID[result.fish]; seen.add(result.fish);
    assert.ok(ready.has(result.fish));
    if (fish.time) assert.equal(fish.time === 'day', deckContextAt(castAt).day);
    if (fish.size) assert.ok(Number.isInteger(result.sizeCm) && result.sizeCm >= fish.size[0] && result.sizeCm <= fish.size[1]);
    else { assert.equal(result.sizeCm, null); assert.equal(result.big, false); }
    assert.equal(result.baseDiff, fish.difficulty);
  }
  for (const id of ['sun_carp', 'moon_whale', 'treasure_chest', 'bottle_message']) assert.ok(seen.has(id), id);
  assert.ok(!seen.has('yellowtail'), 'sheet C is not ready in v1');
});

test('malformed seeds, versions, indices, times and inconsistent Nice claims fail explicitly', () => {
  for (const seed of ['', '0'.repeat(63), '0'.repeat(65), 'F'.repeat(64), 'z'.repeat(64), 1, null]) assert.throws(() => rollDeckCatch(input({ seed })), RangeError);
  for (const castIndex of [-1, 8192, 0.5, NaN, Infinity, '1', null]) assert.throws(() => rollDeckCatch(input({ castIndex })), RangeError);
  for (const castAt of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, '1', null]) assert.throws(() => rollDeckCatch(input({ castAt })), RangeError);
  for (const version of [0, 2, '1', null]) assert.throws(() => rollDeckCatch(input({ version })), RangeError);
  for (const castInfo of [null, {}, { distance: NaN, nice: false }, { distance: -0.1, nice: false }, { distance: 1.1, nice: false }, { distance: 0.5, nice: true }, { distance: 0.86, nice: false }, { distance: 0.5, nice: 'yes' }]) assert.throws(() => rollDeckCatch(input({ castInfo })), RangeError);
  assert.doesNotThrow(() => rollDeckCatch(input({ castIndex: 8191, castAt: 0 })));
});

test('retirement invariant: a 5-minute cast plus 60-minute iced life and skew ends before the second rollover', () => {
  assert.equal(FISHING_DECK.windowMs, 360 * MIN);
  assert.equal(FISHING_DECK.maxCastDurationMs, 5 * MIN);
  const life = (FRESH.lifetimeMin + FRESH.iceMaxPerFishMin) * MIN;
  assert.equal(life, 60 * MIN);
  assert.equal(SALE.clockSkewMs, 10_000);
  const conservativeTail = FISHING_DECK.maxCastDurationMs + life + SALE.clockSkewMs;
  assert.equal(conservativeTail, 65 * MIN + 10_000);
  assert.ok(conservativeTail < FISHING_DECK.windowMs, 'otherwise retaining only current/previous bits would be unsafe');
  // No early removal when d becomes previous. Retirement happens only when current = d + 2.
  const d = 100;
  const end = (d + 1) * FISHING_DECK.windowMs;
  const lastCast = end - 1;
  const lastCatch = lastCast + FISHING_DECK.maxCastDurationMs;
  const retire = (d + 2) * FISHING_DECK.windowMs;
  assert.ok(lastCatch + life + SALE.clockSkewMs < retire);
  assert.equal(retire - (end + conservativeTail), 294 * MIN + 50_000);
});
