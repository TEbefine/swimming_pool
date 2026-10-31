import './register-api-ts.mjs';
const { ECONOMY_EPOCH: EPOCH } = await import('../src/game/economy/economyConfig.ts');
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureCatch } from './fishing-fixtures.mjs';
import { saleHarness, NOON, ADDRESS } from './sale-harness.mjs';
const { devFishingPolicy, DEV_DECK_SECRET } = await import('../server/dev/devFishingPolicy.ts');
const { FISHING_DECK: C } = await import('../src/game/fishing/deckConfig.ts');

test('zero-setup dev policy shares issuance secret, pins the current window across restarts and never silently repairs corruption', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-dev-policy-'));
  try {
    const policy = devFishingPolicy(root, NOON), cutoff = Math.floor(NOON / C.windowMs);
    assert.equal(policy.FISHING_DECK_SECRET, DEV_DECK_SECRET); assert.equal(Number(policy.FISHING_DECK_REDEEM_FROM_DECK_ID), cutoff);
    assert.deepEqual(devFishingPolicy(root, NOON + 3 * C.windowMs), policy);
    const h = saleHarness({ start: NOON, env: { ...policy, VERCEL: undefined } });
    const old = fixtureCatch(ADDRESS, cutoff * C.windowMs - 1, { secret: DEV_DECK_SECRET }); assert.equal((await h.sell([old])).statusCode, 422);
    const fresh = fixtureCatch(ADDRESS, h.clock, { secret: DEV_DECK_SECRET }); assert.equal((await h.sell([fresh])).statusCode, 200);
    const file = join(root, '.dev/fishing-policy.json'); await writeFile(file, '{bad json');
    assert.throws(() => devFishingPolicy(root, NOON)); assert.equal(await readFile(file, 'utf8'), '{bad json');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('documented dev reset removes policy, saves and logs together; vault files stay; production reset is refused', async () => {
  const { mkdir } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  const { resetDevFishing } = await import('../scripts/dev-reset-fishing.mjs');
  const root = await mkdtemp(join(tmpdir(), 'lumen-dev-reset-')), url = pathToFileURL(root + '/');
  const savedVercel = process.env.VERCEL, savedMode = process.env.NODE_ENV;
  try {
    delete process.env.VERCEL; delete process.env.NODE_ENV;
    const original = devFishingPolicy(root, NOON); await writeFile(join(root, '.dev/saves.json'), JSON.stringify({ players: { x: { paidDecks: [1] } }, logs: { paid: true } }));
    await mkdir(join(root, 'identity')); await writeFile(join(root, 'identity/vault'), 'untouched');
    resetDevFishing(url); const fresh = devFishingPolicy(root, NOON);
    assert.notEqual(fresh.DEV_FISHING_RESET_ID, original.DEV_FISHING_RESET_ID); assert.equal(Number(fresh.FISHING_DECK_REDEEM_FROM_DECK_ID), Math.floor(NOON / C.windowMs));
    await assert.rejects(readFile(join(root, '.dev/saves.json')), e => e.code === 'ENOENT');
    assert.equal(await readFile(join(root, 'identity/vault'), 'utf8'), 'untouched');
    process.env.VERCEL = '1'; assert.throws(() => resetDevFishing(url), /local dev only/);
    delete process.env.VERCEL; process.env.NODE_ENV = 'production'; assert.throws(() => resetDevFishing(url), /local dev only/);
    assert.ok(await readFile(join(root, '.dev/fishing-policy.json'), 'utf8'));
  } finally {
    if (savedVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = savedVercel;
    if (savedMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedMode;
    await rm(root, { recursive: true, force: true });
  }
});

test('v1 or orphaned dev saves require the coherent reset; policy and saves are never silently rewritten', async () => {
  const { mkdir } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'lumen-v1-policy-'));
  try {
    await mkdir(join(root, '.dev'));
    const policy = JSON.stringify({ version: 1, redeemFromDeckId: 0, resetId: 'old-v1' });
    const saves = JSON.stringify({ players: { [ADDRESS]: { coins: 99, paidDecks: [{ version: 1 }] } }, logs: { old: true } });
    await writeFile(join(root, '.dev/fishing-policy.json'), policy);
    await writeFile(join(root, '.dev/saves.json'), saves);
    assert.throws(() => devFishingPolicy(root, NOON), /npm run dev:reset-fishing/);
    assert.equal(await readFile(join(root, '.dev/fishing-policy.json'), 'utf8'), policy);
    assert.equal(await readFile(join(root, '.dev/saves.json'), 'utf8'), saves);
    await rm(join(root, '.dev/fishing-policy.json'));
    assert.throws(() => devFishingPolicy(root, NOON), /reset them together/);
    await assert.rejects(readFile(join(root, '.dev/fishing-policy.json')), e => e.code === 'ENOENT');
    assert.equal(await readFile(join(root, '.dev/saves.json'), 'utf8'), saves);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fresh real Vite dev middleware issues and sells in the current window with zero env setup; exact Retry pays once', async () => {
  const { createServer } = await import('vite');
  const { symlink } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { devSaves } = await import('../server/dev/devSaves.ts');
  const { devDeck } = await import('../server/dev/devDeck.ts');
  const { DEV_TEST_ADDRESS, DEV_TEST_TOKEN } = await import('../src/identity/devTestIdentity.ts');
  const { rollDeckCatch } = await import('../src/game/fishing/deckRoll.ts');
  const root = await mkdtemp(join(tmpdir(), 'lumen-fresh-dev-')), repo = fileURLToPath(new URL('../', import.meta.url));
  await symlink(join(repo, 'server'), join(root, 'server'), 'dir'); await symlink(join(repo, 'src'), join(root, 'src'), 'dir');
  // Simulate Teera's old local dataset, then execute the documented reset function before Vite starts.
  const { mkdir } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  const { resetDevFishing } = await import('../scripts/dev-reset-fishing.mjs');
  await mkdir(join(root, '.dev'));
  await writeFile(join(root, '.dev/fishing-policy.json'), JSON.stringify({ version: 1, redeemFromDeckId: 0, resetId: 'old-v1' }));
  await writeFile(join(root, '.dev/saves.json'), JSON.stringify({ players: { [DEV_TEST_ADDRESS]: { coins: 999, fishBook: { sardine: { best: 22, sold: 25 } } } }, logs: { old: true } }));
  assert.throws(() => devFishingPolicy(root), /npm run dev:reset-fishing/);
  resetDevFishing(pathToFileURL(root + '/'));
  const server = await createServer({ configFile: false, root, appType: 'custom', logLevel: 'silent', plugins: [devSaves(), devDeck()], server: { host: '127.0.0.1', port: 0, fs: { allow: [repo, root] } } });
  try {
    await server.listen(); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const post = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEV_TEST_TOKEN}` }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
    const deckResponse = await post('/api/fishing-deck', {}); assert.equal(deckResponse.status, 200); const deck = deckResponse.body;
    assert.equal(deck.version, 2);
    const fresh = await post('/api/items', { op: 'load' });
    assert.equal(fresh.status, 200); assert.equal(fresh.body.coins, 0); assert.deepEqual(fresh.body.fishBook, {});
    const policy = JSON.parse(await readFile(join(root, '.dev/fishing-policy.json'), 'utf8'));
    assert.equal(policy.version, 2); assert.notEqual(policy.resetId, 'old-v1');
    const castInfo = { distance: .85, nice: true }, castAt = deck.serverNow; let c;
    for (let castIndex = 0; castIndex < deck.casts; castIndex++) {
      const roll = rollDeckCatch({ ...deck, castIndex, castInfo, castAt });
      if (roll.fish === 'sardine') { c = { fish: roll.fish, sizeCm: roll.sizeCm, caughtAt: Date.now(), ticket: { version: deck.version, deckId: deck.deckId, castIndex, castInfo, castAt } }; break; }
    }
    assert.ok(c); const body = { econEpoch:EPOCH, op: 'shop.sell', operationId: 'op-fresh-dev-sale-0001', catches: [c] };
    const first = await post('/api/items', body); assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.redeemFromDeckId, deck.deckId); assert.ok(first.body.devFishingResetId);
    assert.deepEqual(first.body.fishBook.sardine, { best: c.sizeCm, starred: false });
    const retry = await post('/api/items', body); assert.equal(retry.status, 200); assert.equal(retry.body.replayed, true); assert.deepEqual(retry.body.result, first.body.result);
    const saved = JSON.parse(await readFile(join(root, '.dev/saves.json'), 'utf8')); assert.equal(saved.players[DEV_TEST_ADDRESS].fishBook.sardine.sold, 1); assert.equal(Object.keys(saved.logs).length, 1);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});
