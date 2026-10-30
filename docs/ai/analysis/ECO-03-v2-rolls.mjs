// Offline report of the ACTUAL shared v2 kernel. Public fake key/owners; no account, DB or network.
import '../../../tests/register-api-ts.mjs';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { fishingDeckSeed } = await import('../../../server/fishing/deck.ts');
const { rollDeckCatch } = await import('../../../src/game/fishing/deckRoll.ts');
const { FISHING_DECK } = await import('../../../src/game/fishing/deckConfig.ts');
const { FREE_BY_ID } = await import('../../../src/game/fishing/freeFishCatalog.ts');
const { isSellableFish } = await import('../../../src/game/economy/market.ts');
const SECRET = 'planning-only-not-a-live-deck-secret-20261030';
const MODES = [
  ['weak-near', .05, false], ['normal-near', .2, false], ['normal-mid', .5, false],
  ['normal-far', .98, false], ['Nice-far', .85, true],
];
export function sampleV2Rolls(n = 100_000) {
  const rows = [];
  for (const [context, castAt] of [['day', Date.UTC(2026, 9, 30, 5)], ['night', Date.UTC(2026, 9, 30, 15)]]) {
    const seeds = Array.from({ length: Math.ceil(n / FISHING_DECK.casts) }, (_, block) => {
      const owner = '0x' + createHash('sha256').update('odds/' + block).digest('hex').slice(0, 40);
      return fishingDeckSeed(owner, 2, Math.floor(castAt / FISHING_DECK.windowMs), SECRET);
    });
    for (const [mode, distance, nice] of MODES) {
      const counts = { common: 0, rare: 0, epic: 0, legend: 0, god: 0 };
      let sellableLegend = 0, nonSellable = 0;
      for (let i = 0; i < n; i++) {
        const c = rollDeckCatch({ version: 2, seed: seeds[Math.floor(i / FISHING_DECK.casts)],
          castIndex: i % FISHING_DECK.casts, castInfo: { distance, nice }, castAt });
        const fish = FREE_BY_ID[c.fish]; counts[fish.tier]++;
        if (!isSellableFish(fish)) nonSellable++;
        else if (fish.tier === 'legend') sellableLegend++;
      }
      rows.push({ version: 2, context, mode, castAt, n, counts, sellableLegend, nonSellable });
    }
  }
  return rows;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = ['deckKernelV1.ts', 'deckRollV1.ts', 'deckRoll.ts', 'deckRollV2.ts'];
  const sources = Object.fromEntries(files.map(name => [name,
    createHash('sha256').update(readFileSync(new URL('../../../src/game/fishing/' + name, import.meta.url))).digest('hex')]));
  const rows = sampleV2Rolls();
  const result = { source: 'Actual shared kernel, ECO-03 stage 6 step 2; not a scratch candidate',
    baseCommit: 'a9977f3cda2f4b3cfc1ca913e8da1584463f4ef1', sourceSha256: sources,
    publicFakeKey: SECRET, samplesPerRow: 100_000, totalRolls: 1_000_000, rows };
  writeFileSync(new URL('./ECO-03-v2-rolls-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  for (const r of rows) console.log(r.context, r.mode, JSON.stringify(r.counts), 'sellable legends:', r.sellableLegend);
}
