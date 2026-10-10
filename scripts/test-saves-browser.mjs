// ID-01 (c) browser flow, against the DEV server (it imports game modules to read state):
//   VITE_FIREBASE_* = dummy public config (project lumen-bay), then `npx vite --port 5199`, then
//   PLAYWRIGHT_MODULE=… CHROME_EXECUTABLE=… node scripts/test-saves-browser.mjs
// Real identity UI + real Firebase browser SDK with intercepted Auth REST (identity-auth-mocks.mjs),
// and /api/items served by the REAL handler (server/saves) over an in-memory store. No credentials.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { mockIdentityAuth } from './identity-auth-mocks.mjs';
const { createItemsHandler } = await import('../server/saves/handlers.ts');
const { IpLimiter } = await import('../server/identity/http.ts');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SAVES_URL || 'http://127.0.0.1:5199';
const origin = new URL(base).origin;
const output = process.env.SAVES_REVIEW_DIR || '/tmp/id01c-review';
await mkdir(output, { recursive: true });

// One "Firestore" shared by both devices.
const players = new Map();
const logs = new Map();
const itemsCalls = [];
async function mockItems(context, verifyToken) {
  const services = {
    verifyToken,
    readPlayer: async a => structuredClone(players.get(a) ?? null),
    transact: async (a, id, fn) => {
      const out = fn(structuredClone(players.get(a) ?? null), structuredClone(logs.get(`${a}/${id}`) ?? null));
      if (out.write) { players.set(a, structuredClone(out.write.player)); logs.set(`${a}/${id}`, structuredClone(out.write.log)); }
      return out.response;
    },
  };
  const handler = createItemsHandler({ env: { LOGIN_ALLOWED_ORIGINS: origin }, limiter: new IpLimiter(1000) }, services);
  await context.route('**/api/items', async route => {
    const req = route.request();
    const body = req.postDataJSON();
    itemsCalls.push(body?.op);
    const request = { method: req.method(), headers: { ...req.headers(), origin }, body, socket: { remoteAddress: '127.0.0.1' } };
    const headers = {};
    const res = { statusCode: 0, setHeader(k, v) { headers[k] = v; }, end(v) { this.body = v; } };
    await handler(request, res);
    await route.fulfill({ status: res.statusCode, headers, body: res.body });
  });
}

// The reel bar (56×192 canvas): fish shadow = dark bluish pixels, net = hemp colour.
const SENSE = `() => { const c = [...document.querySelectorAll('canvas')].find(c => c.width === 56 && c.height === 192);
  if (!c) return null; const d = c.getContext('2d').getImageData(0, 0, 56, 192).data; const net = [], fish = [];
  for (let y = 16; y < 176; y++) for (const x of [13, 21, 27]) { const i = (y * 56 + x) * 4, r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
    if (a > 200 && Math.abs(r - 201) < 14 && Math.abs(g - 165) < 14 && Math.abs(b - 107) < 14) net.push(y);
    if (a > 200 && Math.abs(r - 221) < 14 && Math.abs(g - 187) < 14 && Math.abs(b - 120) < 14) net.push(y);
    if (a > 200 && r + g + b < 170 && b > r) fish.push(y); }
  if (!net.length || !fish.length) return null; const avg = v => v.reduce((s, x) => s + x, 0) / v.length; return [avg(fish), avg(net)]; }`;
const mod = (page, path) => page.evaluate(async p => {
  const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(p));
  return !!url;
}, path);
const call = (page, path, fn, arg) => page.evaluate(async ({ path, fn, arg }) => {
  const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) ?? path;
  const m = await import(url);
  return m[fn](...(arg === undefined ? [] : [arg]));
}, { path, fn, arg });

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
const device = () => browser.newContext({ viewport: { width: 1280, height: 760 }, serviceWorkers: 'block' });
const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 't', 'o', 'x'];
try {
  // ---- device 1: create a Player ID at Quiet Bay (10:00 = Nami's shift) ---------------------------
  const ctx = await device();
  const auth = await mockIdentityAuth(ctx, origin);
  await mockItems(ctx, auth.verifyToken);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const button = name => page.getByRole('button', { name, exact: true });
  const enter = async seq => { for (const k of seq) await page.keyboard.press(k); };
  await page.goto(`${base}/?room=lake_pier&hour=10`);
  await button('I’m new — create an identity').click();
  await page.getByRole('heading', { name: 'Write these down', exact: true }).waitFor();
  const words = await page.locator('.identity-words li').evaluateAll(items => items.map(i => i.childNodes[i.childNodes.length - 1].textContent));
  await page.getByLabel('I wrote all 12 words on paper.').check();
  await button('Check my backup').click();
  const fields = page.locator('form input[type=password]');
  for (let i = 0; i < 3; i++) {
    const label = await fields.nth(i).locator('..').innerText();
    await fields.nth(i).fill(words[Number(label.match(/Word (\d+)/)[1]) - 1]);
  }
  await button('My backup is ready').click();
  await page.getByRole('heading', { name: 'Choose your secret code', exact: true }).waitFor();
  await enter(keys); await button('Use this code').click();
  await enter(keys); await button('Confirm').click();
  await button('Continue to Lumen Bay').click();
  await page.locator('.ls-ready').click();
  await page.locator('.ls-root').waitFor({ state: 'detached' });
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(e => e.name.includes('/game/saves/cloud')));
  await page.waitForTimeout(800);
  const address = await call(page, '/game/saves/cloud', 'getCloudAddress');
  assert.match(address, /^0x[0-9a-f]{40}$/, 'the game is attached to the Player ID');
  assert.ok(itemsCalls.includes('load'), 'the save was loaded from /api/items');

  // ---- fish one sardine for real (forced kind; the bot reads the reel bar) ------------------------
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/story/fishingSession'));
    (await import(url)).setFishingTestHooks({ forceFish: 'sardine', onResult: ph => { window.__res = ph; } });
  });
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(400); await page.keyboard.up('ArrowDown');
  let caught = false;
  for (let attempt = 0; attempt < 20 && !caught; attempt++) {
    await page.evaluate(() => { window.__res = null; });
    if (attempt === 0) { await page.keyboard.press('e'); await page.waitForTimeout(1200); }
    await page.keyboard.down('e'); await page.waitForTimeout(600); await page.keyboard.up('e');
    const t0 = Date.now(); let held = false; let struck = false;
    while (Date.now() - t0 < 25_000) {
      const res = await page.evaluate(() => window.__res);
      if (res) { caught = res === 'caught'; break; }
      if (!struck && (await page.innerText('body')).includes('PULL!')) { await page.keyboard.press('e'); struck = true; }
      if (struck) {
        const s = await page.evaluate(SENSE);
        if (s) { const want = s[0] < s[1] - 2; if (want && !held) { await page.keyboard.down('e'); held = true; } else if (!want && held) { await page.keyboard.up('e'); held = false; } }
      }
      await page.waitForTimeout(30);
    }
    if (held) await page.keyboard.up('e');
    await page.waitForTimeout(1500);
  }
  assert.ok(caught, 'caught a sardine');
  const pending = await call(page, '/fishing/freeFish', 'getPendingCatches');
  assert.equal(pending.length, 1, 'with a Player ID the catch waits for the Fishing Guide');
  assert.equal(players.get(address)?.fishTotal ?? 0, 0, 'nothing reached the server yet');
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);

  // ---- show it to Nami ------------------------------------------------------------------------------
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(350); await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(300);
  let opened = false;
  await page.keyboard.press('e'); // talk
  for (let i = 0; i < 14 && !opened; i++) {
    await page.waitForTimeout(700);
    opened = (await page.getByText('Record my catches (1)').count()) > 0;
    if (!opened) await page.keyboard.press('e'); // finish / next line
  }
  if (!opened) await page.screenshot({ path: `${output}/debug-nami.png` });
  assert.ok(opened, 'Nami offers to record the catch');
  await page.screenshot({ path: `${output}/nami-record-choice.png` });
  await page.getByText('Record my catches (1)').click();
  for (let i = 0; i < 12; i++) {
    if (await page.getByText('now in your Fish Book', { exact: false }).count()) break;
    await page.keyboard.press('e'); await page.waitForTimeout(700);
  }
  await page.getByText('One fish is now in your Fish Book', { exact: false }).waitFor({ timeout: 8000 });
  await page.screenshot({ path: `${output}/nami-recorded.png` });
  assert.equal(players.get(address).fishBook.sardine.count, 1, 'the server Fish Book has the sardine');
  assert.equal([...logs.keys()].filter(k => k.startsWith(address)).length, 1, 'one append-only log entry');
  assert.equal((await call(page, '/fishing/freeFish', 'getPendingCatches')).length, 0, 'pending list cleared');
  console.log('PASS: real catch waits on the device, Nami records it through /api/items, server Fish Book + log updated.');

  // ---- Dalbit: reach the end of Day 1 → saved to the Player ID ------------------------------------
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/story/storyStore'));
    const m = await import(url);
    m.updateStory(s => ({ ...s, step: 'd1_end', day: 1, coins: 9, energy: 4, bag: { small_net: 1, mackerel: 2 },
      flags: { ate_breakfast: true, day1_done: true }, ledger: [{ day: 1, text: 'You looked into the rice jar. Lower than last week.' }],
      records: { mackerel: 33 }, counters: { inn_sold_d1: 2 } }));
  });
  for (let i = 0; i < 40 && !players.get(address)?.storyWorlds?.dalbit; i++) await page.waitForTimeout(150);
  const saved = players.get(address).storyWorlds.dalbit;
  assert.equal(saved.day, 1);
  assert.equal(saved.state.coins, 9);
  assert.deepEqual(errors, []);
  console.log('PASS: the end of Day 1 saves the Dalbit story to the Player ID (validated, revision 1).');

  // ---- same device, reload in the story room: session resumes, HUD says the day is saved ----------
  await page.goto(`${base}/?room=dalbit_yard`);
  await page.locator('.ls-ready').click();
  await page.locator('.ls-root').waitFor({ state: 'detached' });
  await page.getByText('Day 1 is saved to your Player ID.').waitFor({ timeout: 10_000 });
  await page.screenshot({ path: `${output}/dalbit-day1-saved.png` });
  await ctx.close();

  // ---- device 2: restore with the 12 words → the same Fish Book and story ---------------------------
  const ctx2 = await device();
  const auth2 = await mockIdentityAuth(ctx2, origin);
  await mockItems(ctx2, auth2.verifyToken);
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errors.push(e.message));
  const b2 = name => p2.getByRole('button', { name, exact: true });
  await p2.goto(`${base}/?room=lake_pier&hour=21`);
  await b2('Restore with your 12 words').click();
  await p2.getByLabel('Your recovery words', { exact: true }).fill(words.join(' '));
  await p2.getByLabel('I have kept these 12 words safely on paper.').check();
  await b2('Recover my Player ID').click();
  await p2.getByRole('heading', { name: 'Choose your secret code', exact: true }).waitFor();
  for (const k of keys) await p2.keyboard.press(k);
  await b2('Use this code').click();
  for (const k of keys) await p2.keyboard.press(k);
  await b2('Confirm').click();
  await b2('Continue to Lumen Bay').click();
  await p2.locator('.ls-ready').click();
  await p2.locator('.ls-root').waitFor({ state: 'detached' });
  await p2.waitForFunction(() => performance.getEntriesByType('resource').some(e => e.name.includes('/game/saves/cloud')));
  for (let i = 0; i < 30; i++) { if ((await call(p2, '/game/saves/cloud', 'getCloudAddress')) === address) break; await p2.waitForTimeout(200); }
  await p2.waitForTimeout(800);
  const book = await call(p2, '/fishing/freeFish', 'getFishBook');
  assert.equal(book.entries.sardine?.count, 1, 'the new device shows the server Fish Book');
  const story = await call(p2, '/story/storyStore', 'getStory');
  assert.equal(story.step, 'd1_end', 'the new device continues the saved story');
  assert.equal(story.coins, 9);
  await p2.getByRole('button', { name: /Fish Book/ }).first().click().catch(() => {});
  await p2.waitForTimeout(500);
  await p2.screenshot({ path: `${output}/device2-fishbook.png` });
  assert.deepEqual(errors, []);
  console.log('PASS: a second device restored with the 12 words loads the same Fish Book and Dalbit story; no page errors.');
  await ctx2.close();
} finally { await browser.close(); }
