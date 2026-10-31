// ECO-04 step B: what the PRODUCTION client bundle may and may not contain once the shop is open.
// Builds the real modules with Vite (production mode, no DEV) and runs them in a sandboxed context.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createContext, Script } from 'node:vm';

const root = fileURLToPath(new URL('../src/', import.meta.url));
async function bundle(entry, testPages) {
  const { build } = await import('vite');
  const out = await build({ configFile: false, logLevel: 'silent', mode: 'production',
    define: { 'import.meta.env.ECONOMY_TEST_PAGES': JSON.stringify(testPages) },
    plugins: [{ name: 'react-stub', enforce: 'pre', resolveId: (id) => (id === 'react' ? '\0react' : null),
      load: (id) => (id === '\0react' ? 'export const useSyncExternalStore = (_, get) => get();' : null) }],
    build: { minify: false, write: false, lib: { entry: root + entry, name: 'Mod', formats: ['iife'] } } });
  return (Array.isArray(out) ? out : [out]).flatMap((b) => b.output).find((c) => c.type === 'chunk' && c.isEntry).code;
}
function run(code, search) {
  const context = createContext({ location: { search }, URLSearchParams });
  new Script(code).runInContext(context);
  return context.Mod;
}

test('production: ?test=shop / ?test=free never make a sandbox wallet; preview builds still can', async () => {
  const prod = await bundle('game/economy/flags.ts', false);
  for (const search of ['', '?test=shop', '?test=free']) assert.equal(run(prod, search).ECONOMY_SANDBOX, false, search);
  const preview = await bundle('game/economy/flags.ts', true);
  assert.equal(run(preview, '?test=shop').ECONOMY_SANDBOX, true);
  assert.equal(run(preview, '?test=free').ECONOMY_SANDBOX, true);
  assert.equal(run(preview, '').ECONOMY_SANDBOX, false);
});

test('production wallet bundle has no dev console, no client gate and no preview flag', async () => {
  const code = await bundle('game/economy/walletStore.ts', false);
  assert.ok(!code.includes('__shop'), 'dev console __shop must be stripped');
  assert.ok(!code.includes('ECONOMY_PREVIEW'), 'the old preview gate is gone');
  assert.ok(!code.includes('ECONOMY_ON'), 'the client economy gate is gone');
  assert.ok(code.includes('shop.sell') && code.includes('catchToCooler'), 'sanity: this really is the wallet store');
});

test('eco:cutoff prints the deck window the server will issue at 12:00 UTC on the opening day', async () => {
  await import('./register-api-ts.mjs');
  const { FISHING_DECK } = await import('../src/game/fishing/deckConfig.ts');
  const { execFileSync } = await import('node:child_process');
  const script = fileURLToPath(new URL('../scripts/eco-cutoff.mjs', import.meta.url));
  const out = execFileSync(process.execPath, [script, '2099-01-02'], { encoding: 'utf8' });
  assert.match(out, new RegExp(`FISHING_DECK_REDEEM_FROM_DECK_ID = ${Math.floor(Date.UTC(2099, 0, 2, 12) / FISHING_DECK.windowMs)}\\n`));
  assert.match(out, /2099-01-02 19:00 Bangkok/);
  assert.throws(() => execFileSync(process.execPath, [script, '2020-01-01'], { stdio: 'pipe' }), 'past days are refused');
  assert.throws(() => execFileSync(process.execPath, [script, '2099-02-30'], { stdio: 'pipe' }), 'impossible dates are refused');
});
