import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureCatch } from './fishing-fixtures.mjs';
import { saleHarness, NOON, ADDRESS } from './sale-harness.mjs';
const { devFishingPolicy, DEV_DECK_SECRET } = await import('../server/dev/devFishingPolicy.ts');
const { FISHING_DECK: C } = await import('../src/game/fishing/deckConfig.ts');

test('zero-setup dev policy shares issuance secret, pins a new full window across restarts and never silently repairs corruption', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-dev-policy-'));
  try {
    const policy = devFishingPolicy(root, NOON), cutoff = Math.floor(NOON / C.windowMs) + 1;
    assert.equal(policy.FISHING_DECK_SECRET, DEV_DECK_SECRET); assert.equal(Number(policy.FISHING_DECK_REDEEM_FROM_DECK_ID), cutoff);
    assert.deepEqual(devFishingPolicy(root, NOON + 3 * C.windowMs), policy);
    const h = saleHarness({ start: cutoff * C.windowMs + 1000, env: { ...policy, VERCEL: undefined } });
    const old = fixtureCatch(ADDRESS, NOON, { secret: DEV_DECK_SECRET }); assert.equal((await h.sell([old])).statusCode, 422);
    const fresh = fixtureCatch(ADDRESS, h.clock, { secret: DEV_DECK_SECRET }); assert.equal((await h.sell([fresh])).statusCode, 200);
    const file = join(root, '.dev/fishing-policy.json'); await writeFile(file, '{bad json');
    assert.throws(() => devFishingPolicy(root, NOON)); assert.equal(await readFile(file, 'utf8'), '{bad json');
  } finally { await rm(root, { recursive: true, force: true }); }
});
