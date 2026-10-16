// Optional production-browser check for the first-open boot intro (src/boot, ui/boot-intro.md).
// Run against the production preview (Preact build), the same way as scripts/test-identity-browser.mjs:
//   npm run build && npx vite preview --port 4173 --host 127.0.0.1
//   PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-boot-browser.mjs
// BOOT_URL defaults to http://127.0.0.1:4173/ ; BOOT_REVIEW_DIR selects the screenshot folder (default /tmp/boot-review).
// Fresh browser contexts and test-only identities only, never the user's normal browser profile.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { mockIdentityAuth } from './identity-auth-mocks.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BOOT_URL || 'http://127.0.0.1:4173/';
const output = process.env.BOOT_REVIEW_DIR || '/tmp/boot-review';
await mkdir(output, { recursive: true });

// Records what the page does with sound and with the .boot layer, with timestamps (performance.now()).
const instrument = () => {
  const log = (window.bootLog = { starts: [], stops: 0, bootAdded: null, bootRemoved: null, bootDone: null, press: null, skipGain: false });
  const AC = window.AudioContext;
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, ...rest) {
    const ctx = this.context;
    log.starts.push({ at: performance.now(), lead: (when - ctx.currentTime) * 1000, dur: this.buffer ? this.buffer.duration : 0, loop: this.loop, rate: this.playbackRate.value, offset });
    return start.call(this, when, offset, ...rest);
  };
  const stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function (...a) { log.stops++; return stop.apply(this, a); };
  void AC;
  window.addEventListener('boot:done', () => { log.bootDone = performance.now(); });
  window.addEventListener('pointerdown', () => { if (log.press === null) log.press = performance.now(); }, { capture: true });
  window.addEventListener('keydown', () => { if (log.press === null) log.press = performance.now(); }, { capture: true });
  new MutationObserver(() => {
    const has = !!document.querySelector('.boot');
    if (!has && log.bootAdded === null && document.querySelector('.ls-leaving')) log.loadingFadedBeforeBoot = true;
    if (has && log.bootAdded === null) { log.bootAdded = performance.now(); log.loadingUnderBoot = !!document.querySelector('.ls-root'); }
    if (!has && log.bootAdded !== null && log.bootRemoved === null) log.bootRemoved = performance.now();
  }).observe(document, { childList: true, subtree: true });
};

// Playwright's open-source Chromium cannot decode AAC (.m4a). Serve short silent WAVs in their place so the
// start chime (0.6 s, plays once) and room music (3 s, loops) still decode and their timing can be checked.
const silentWav = (seconds, rate = 8000) => {
  const n = Math.round(seconds * rate), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
};

const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 't', 'o', 'x'];

async function newPlayer(browser, viewport, mobile) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, colorScheme: 'light', serviceWorkers: 'block' });
  await mockIdentityAuth(context, new URL(base).origin);
  await context.route('**/audio/*.m4a', (route) => route.fulfill({ contentType: 'audio/wav', body: silentWav(route.request().url().includes('start_chime') ? 0.6 : 3) }));
  await context.addInitScript(instrument);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !ignore(m.location()?.url ?? '')) errors.push(`console: ${m.text()}${m.location()?.url ? ` (${m.location().url})` : ''}`); });
  // `vite preview` has no serverless API, so the cloud-save call (/api/items) 404s there. Not part of this check.
  const ignore = (text) => text.includes('/api/items');
  page.on('response', (res) => { if (res.status() >= 400 && !ignore(res.url())) errors.push(`http ${res.status()}: ${new URL(res.url()).pathname}`); });
  const button = (name) => page.getByRole('button', { name, exact: true });
  await page.goto(base);
  await button('I’m new — create an identity').click();
  await page.getByRole('heading', { name: 'Write these down' }).waitFor();
  const words = await page.locator('.identity-words li').evaluateAll((items) => items.map((i) => i.childNodes[i.childNodes.length - 1].textContent));
  await page.getByLabel('I wrote all 12 words on paper.').check();
  await button('Check my backup').click();
  const fields = page.locator('form input[type=password]');
  for (let i = 0; i < 3; i++) {
    const label = await fields.nth(i).locator('..').innerText();
    await fields.nth(i).fill(words[Number(label.match(/Word (\d+)/)[1]) - 1]);
  }
  await button('My backup is ready').click();
  await page.getByRole('heading', { name: 'Choose your secret code' }).waitFor();
  for (const k of keys) await page.keyboard.press(k);
  await button('Use this code').click();
  for (const k of keys) await page.keyboard.press(k);
  await button('Confirm').click();
  await page.getByRole('heading', { name: 'Ready for Lumen Bay' }).waitFor().catch(async (e) => { await page.screenshot({ path: output + '/identity-fail.png' }); console.log(await page.locator('body').innerText()); throw e; });
  return { context, page, errors };
}

// Open the game at `query` (room=town: a room with music, so the music hand-over can be checked), wait for "Press ◯/SPACE", press, and return the log after `waitMs`.
async function openAndPress(page, query, { waitMs = 6500, press = 'tap', during } = {}) {
  await page.goto(base + query);
  await page.locator('.identity-cover').waitFor({ state: 'detached' });
  await page.locator('.ls-ready').waitFor();
  await page.waitForTimeout(400);
  if (press === 'tap') await page.locator('.ls-root').click();
  else await page.keyboard.press(press);
  if (during) await during();
  await page.waitForTimeout(waitMs);
  return page.evaluate(() => window.bootLog);
}

const isBootSound = (s) => !s.loop && (Math.abs(s.dur - 0.22) < 0.005 || Math.abs(s.dur - 2.0) < 0.05);
const summary = (log) => {
  const boot = log.starts.filter(isBootSound);
  const music = log.starts.filter((s) => s.loop);
  const chime = log.starts.filter((s) => !s.loop && !isBootSound(s));
  return {
    shownMs: log.bootAdded && log.bootRemoved ? Math.round(log.bootRemoved - log.bootAdded) : null,
    pressToBootMs: log.bootAdded && log.press ? Math.round(log.bootAdded - log.press) : null,
    bootSounds: boot.length,
    firstSoundAfterBootMs: boot.length ? Math.round(boot[0].at + boot[0].lead - log.bootAdded) : null,
    noteOffsetsSec: [...new Set(boot.filter((s) => s.dur < 1).map((s) => s.offset))],
    chimes: chime.length,
    musicStartsAfterDone: music.length ? (log.bootDone ? music[0].at >= log.bootDone : null) : 'no music yet',
    musicCount: music.length,
    bootDone: log.bootDone !== null,
    // hand-over: the loading scene must still be on screen when the intro's first frame covers it
    handOverOk: log.bootAdded === null ? null : log.loadingUnderBoot === true && !log.loadingFadedBeforeBoot,
  };
};

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=user-gesture-required'], ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
const results = {};
try {
  for (const [name, viewport, mobile] of [['handheld 390x844', { width: 390, height: 844 }, true], ['desktop 1280x720', { width: 1280, height: 720 }, false]]) {
    const { context, page, errors } = await newPlayer(browser, viewport, mobile);
    const r = (results[name] = {});
    const shot = (tag) => page.screenshot({ path: `${output}/${name.split(' ')[0]}-${tag}.png` });

    // 1) First open: Press START → intro (~5 s) with sound → room music fades in after it
    const first = await openAndPress(page, '?room=town', { during: async () => { await page.waitForTimeout(1900); await shot('first-open-1.9s'); await page.waitForTimeout(800); await shot('first-open-2.7s'); } });
    r.firstOpen = summary(first);
    assert.equal(await page.locator('.boot').count(), 0, 'no leftover .boot element');
    assert.ok(r.firstOpen.shownMs > 4500 && r.firstOpen.shownMs < 5600, `intro ~5 s (got ${r.firstOpen.shownMs})`);
    assert.equal(r.firstOpen.bootSounds, 13, '12 letter pops + 1 ending');
    assert.equal(r.firstOpen.chimes, 0, 'the boot sound replaces the chime');
    assert.equal(r.firstOpen.handOverOk, true, 'no blank frame between the loading scene and the intro');
    assert.equal(r.firstOpen.musicStartsAfterDone, true, 'room music only after the intro');
    assert.equal(await page.evaluate(() => localStorage.getItem('swimming_pool.boot.seen.v1')), '1');
    await shot('first-open-after');

    // 2) Reload: no intro, the normal chime
    const again = await openAndPress(page, '?room=town', { waitMs: 2500 });
    r.reload = summary(again);
    assert.equal(again.bootAdded, null, 'no intro on later opens');
    assert.equal(r.reload.chimes, 1, 'chime plays');
    assert.ok(r.reload.musicCount >= 1, 'room music plays');

    // 3) ?boot=1 shows it again
    const forced = await openAndPress(page, '?room=town&boot=1', { waitMs: 6000 });
    r.forced = summary(forced);
    assert.ok(forced.bootAdded !== null && forced.bootRemoved !== null, '?boot=1 shows the intro');

    // 4) Tap at ~1.5 s skips in ~0.2 s and fades the sound out; nothing left behind
    let skipAt = 0;
    const skipped = await openAndPress(page, '?room=town&boot=1', {
      waitMs: 1500,
      during: async () => {
        await page.waitForFunction(() => window.bootLog.bootAdded !== null);
        await page.waitForTimeout(1500);
        skipAt = await page.evaluate(() => performance.now());
        if (mobile) await page.touchscreen.tap(viewport.width / 2, 200); else await page.mouse.click(viewport.width / 2, viewport.height / 2);
      },
    });
    r.skipTap = { endsAfterTapMs: Math.round(skipped.bootRemoved - skipAt), soundStops: skipped.stops, ...summary(skipped) };
    assert.ok(r.skipTap.endsAfterTapMs < 350, `skip ends in ~0.2 s (got ${r.skipTap.endsAfterTapMs})`);
    assert.ok(skipped.stops >= 13, 'the boot sound is stopped after the fade');
    assert.equal(await page.locator('.boot').count(), 0, 'no leftover .boot after skip');
    assert.equal(r.skipTap.musicStartsAfterDone, true);

    // 5) Skip by the shell buttons (◯ and START on the handheld) / any key (desktop); a press in the first 0.6 s is ignored
    if (mobile) {
      for (const title of ['Circle: Pool / Land', 'Start (START Menu)']) {
        let at = 0;
        const viaButton = await openAndPress(page, '?room=town&boot=1', {
          waitMs: 800,
          during: async () => {
            await page.waitForFunction(() => window.bootLog.bootAdded !== null);
            await page.getByTitle(title).click(); // an early press (< 0.6 s) is ignored
            await page.waitForTimeout(1200);
            at = await page.evaluate(() => performance.now());
            await page.getByTitle(title).click();
          },
        });
        r[`skip ${title}`] = Math.round(viaButton.bootRemoved - at);
        assert.ok(viaButton.bootRemoved > at, `${title}: the early press (< 0.6 s) is ignored`);
        assert.ok(viaButton.bootRemoved - at < 350, `${title} skips`);
        assert.equal(await page.locator('.gm-field').count(), 0, 'START during the intro does not also open the menu');
      }
    } else {
      let at = 0;
      const viaKey = await openAndPress(page, '?room=town&boot=1', {
        press: 'Space',
        waitMs: 800,
        during: async () => {
          await page.waitForFunction(() => window.bootLog.bootAdded !== null);
          await page.waitForTimeout(1200);
          at = await page.evaluate(() => performance.now());
          await page.keyboard.press('m'); // START-menu key: skips the intro, must not open the menu
        },
      });
      r.skipKey = Math.round(viaKey.bootRemoved - at);
      assert.ok(viaKey.bootRemoved - at < 350, 'a key skips');
      assert.equal(await page.locator('.gm-field').count(), 0, 'the key does not also open the menu');
    }

    // 6) Sound off in Options → the intro plays silent
    await page.evaluate(() => localStorage.setItem('pixel_pool_muted', 'true'));
    const silent = await openAndPress(page, '?room=town&boot=1', { waitMs: 6000 });
    r.soundOff = summary(silent);
    assert.equal(r.soundOff.bootSounds, 0, 'silent intro');
    assert.ok(silent.bootAdded !== null, 'the picture still plays');
    await page.evaluate(() => localStorage.removeItem('pixel_pool_muted'));

    r.errors = errors;
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
for (const [name, r] of Object.entries(results)) assert.deepEqual(r.errors, [], `${name}: zero console errors`);
console.log('PASS: boot intro first open, reload, ?boot=1, skips, sound off, zero console errors.');
