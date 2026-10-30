// Optional local browser check for the verified Book flow. No Firebase credentials or shared DB.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test-saves-browser.mjs
// The actual minigame is driven by tests/fishing-deck-integration.test.mjs; this check seeds a
// legitimately reserved/rolled catch, then exercises real authenticated sale/load + rendered UI.
import '../tests/register-api-ts.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const { createItemsHandler, DailyLimiter } = await import('../server/saves/handlers.ts');
const { createFishingDeckHandler } = await import('../server/fishing/deck.ts');
const { IpLimiter } = await import('../server/identity/http.ts');
const { DEV_TEST_ADDRESS: ADDRESS, DEV_TEST_TOKEN: TOKEN } = await import('../src/identity/devTestIdentity.ts');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const env = { LOGIN_ALLOWED_ORIGINS: origin, ECONOMY_API: 'on', FISHING_DECK_SECRET: 'browser-only-stable-secret-0123456789abcdef', FISHING_DECK_REDEEM_FROM_DECK_ID: '0' };
const players = new Map(), logs = new Map(), calls = [];
const verifyToken = async token => { assert.equal(token, TOKEN); return { uid: ADDRESS, walletSignedInAt: Date.now() - 1000, walletLoginOrigin: origin }; };
const services = { verifyToken, readPlayer: async a => structuredClone(players.get(a)), transact: async (a, id, fn) => {
  const out = fn(structuredClone(players.get(a)), structuredClone(logs.get(`${a}/${id}`)));
  if (out.write) { players.set(a, structuredClone(out.write.player)); logs.set(`${a}/${id}`, structuredClone(out.write.log)); }
  return out.response;
} };
const items = createItemsHandler({ env, limiter: new IpLimiter(10000), playerLimiter: new IpLimiter(10000), playerDaily: new DailyLimiter(10000) }, services);
const deck = createFishingDeckHandler({ env }, { verifyToken });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}), args: JSON.parse(process.env.CHROME_ARGS || '[]') });
const errors = [];
async function device() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  for (const [path, handler] of [['items', items], ['fishing-deck', deck]]) await context.route(`**/api/${path}`, async route => {
    const req = route.request(), body = req.postDataJSON(); if (path === 'items') calls.push(body.op);
    const response = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = v; } };
    await handler({ method: req.method(), body, headers: { ...req.headers(), origin }, socket: { remoteAddress: '127.0.0.1' } }, response);
    await route.fulfill({ status: response.statusCode, headers: response.headers, body: response.body });
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${origin}/?room=lake_pier&autostart`);
  await page.waitForFunction(() => window.__shop?.status().signedIn);
  await page.waitForFunction(async () => (await import('/src/game/saves/cloud.ts')).useCloud !== undefined);
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(e => e.name.includes('/api/items')));
  await page.waitForTimeout(300);
  return { context, page };
}
try {
  const { context, page } = await device();
  const fish = await page.evaluate(async () => {
    const wallet = await import('/src/game/economy/walletStore.ts'), decks = await import('/src/game/fishing/deckClient.ts');
    const { prepareFreeCast } = await import('/src/game/fishing/freeCast.ts');
    const { FISH_BOOK_BY_ID } = await import('/src/game/fishing/fishBookConfig.ts');
    const { FREE_BY_ID } = await import('/src/game/fishing/freeFishCatalog.ts');
    await wallet.syncEconomy(); await decks.refreshFishingDeck();
    for (let i = 0; i < 100; i++) {
      const cast = prepareFreeCast({ distance: .85, nice: true }, wallet.gameNow(), decks.reserveFishingCast);
      if (!cast.rolled) throw Error('No deck');
      if (!Object.hasOwn(FISH_BOOK_BY_ID, cast.rolled.fish)) continue;
      const result = wallet.catchToCooler(cast.rolled.fish, cast.rolled.sizeCm, { caughtAt: wallet.gameNow(), ticket: cast.ticket });
      if (!result?.ok) throw Error('No cooler catch');
      return { ...result.fish, name: FREE_BY_ID[result.fish.fishId].name };
    }
    throw Error('No bookable roll');
  });
  const before = await page.evaluate(async () => (await import('/src/game/fishing/freeFish.ts')).getFishBook());
  assert.deepEqual(before.entries, {}, 'catching never awards the Book');
  const sale = await page.evaluate(() => window.__shop.sellAll()); assert.equal(sale.ok, true, JSON.stringify(sale)); assert.equal(sale.receipt.vendor, 'gen');
  assert.equal(players.get(ADDRESS).fishBook[fish.fishId].sold, 1); assert.equal(logs.size, 1);
  await page.getByRole('button', { name: /Fish Book 1\/27/ }).click();
  await page.getByRole('button', { name: fish.name, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Fish Book' }); await dialog.getByText(`best ${fish.sizeCm} cm`, { exact: false }).first().waitFor();
  assert.doesNotMatch(await dialog.innerText(), /waiting|\d+ caught|×\d+/);
  if (process.env.SAVES_REVIEW_DIR) { await mkdir(process.env.SAVES_REVIEW_DIR, { recursive: true }); await page.screenshot({ path: `${process.env.SAVES_REVIEW_DIR}/verified-book-phone.png` }); }
  await context.close();
  const second = await device();
  const restored = await second.page.evaluate(async () => (await import('/src/game/fishing/freeFish.ts')).getFishBook());
  assert.equal(restored.entries[fish.fishId].best, fish.sizeCm);
  assert.equal(calls.includes('fishbook.record'), false); assert.deepEqual(errors, []);
  await second.context.close();
  console.log('PASS: phone-size UI, reserved/rolled catch → verified Gen sale → 1/27 Book, best size, no quantity/pending labels, second-device load; no browser errors/shared DB.');
} finally { await browser.close(); await server.close(); }
