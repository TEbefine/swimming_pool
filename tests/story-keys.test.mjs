import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const { isStoryFlag, isStoryCounter } = await import('../src/game/story/storyKeys.ts');

// Drift guard: every literal flag/counter the story code writes must pass the server's allowlist,
// otherwise Player ID saves would be refused after a content change.
test('every story flag / counter literal in the game passes the save allowlist', () => {
  const dir = new URL('../src/game/story/', import.meta.url);
  const code = readdirSync(dir).filter(f => f.endsWith('.ts')).map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n')
    + readFileSync(new URL('../src/game/story/bagActions.ts', import.meta.url), 'utf8');
  const flags = [...code.matchAll(/setFlag\('([a-z0-9_]+)'/g)].map(m => m[1]);
  const counters = [...code.matchAll(/addCounter\('([a-z0-9_]+)'/g)].map(m => m[1]);
  assert.ok(flags.length >= 15, 'found the story flags');
  for (const f of flags) assert.ok(isStoryFlag(f), `flag ${f} must be listed in storyKeys.ts`);
  for (const c of counters) assert.ok(isStoryCounter(c), `counter ${c} must be listed in storyKeys.ts`);
  for (const f of ['caught_sea_bream', 'gave_coins_mother', 'gave_dried_croaker_father', 'gift_father_d1']) assert.ok(isStoryFlag(f), f);
  for (const c of ['sold_gu', 'sold_inn', 'inn_sold_d1']) assert.ok(isStoryCounter(c), c);
  for (const bad of ['admin', 'caught_', 'gift_mother_d0', '__proto__']) assert.equal(isStoryFlag(bad), false, bad);
});
