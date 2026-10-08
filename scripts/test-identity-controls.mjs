// Optional Playwright check of the built app; test-only words and intercepted Firebase/API calls.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { mockIdentityAuth } from './identity-auth-mocks.mjs';
const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.IDENTITY_BROWSER || 'chromium';
const url = new URL(process.env.IDENTITY_URL || 'http://127.0.0.1:4173/?debugcombo=1');
const expectDebug = process.env.IDENTITY_DEBUG_EXPECTED !== 'production';
const output = process.env.IDENTITY_REVIEW_DIR || '/tmp/id01-controls';
await mkdir(output, { recursive: true });
const browser = await playwright[engine].launch({ headless: true,
  ...(engine === 'chromium' && process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
const symbols = { up: '↑', down: '↓', left: '←', right: '→', triangle: '△', circle: '○', cross: '✕', square: '▢' };
// Points are on the visible SVG artwork, independent of the implementation's hit targets.
const arms = {
  up: [[50, 16], [50, 3], [50, 31], [34, 31], [66, 31]],
  down: [[50, 85], [50, 100], [50, 69], [34, 69], [66, 69], [50, 102]],
  left: [[16, 50], [3, 50], [31, 50], [31, 34], [31, 66], [16, 69]],
  right: [[84, 50], [97, 50], [69, 50], [69, 34], [69, 66], [84, 69]],
};
const faces = { triangle: 'Triangle (T)', circle: 'Circle (O)', cross: 'Cross (X)', square: 'Square (Q)' };
const mixed = ['up', 'left', 'right', 'down', 'triangle', 'circle', 'cross'];
const faceOnly = ['triangle', 'circle', 'cross', 'square', 'circle', 'triangle', 'cross'];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const backend = await mockIdentityAuth(context, url.origin);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.addInitScript(() => {
    window.lastControllerPointer = null;
    document.addEventListener('pointerdown', event => { window.lastControllerPointer = { x: event.clientX, y: event.clientY,
      isPrimary: event.isPrimary, tag: event.target.tagName, input: event.target.getAttribute?.('data-identity-input') }; }, true);
    document.addEventListener('touchstart', event => { window.lastControllerTouch = { x: event.changedTouches[0]?.clientX, y: event.changedTouches[0]?.clientY }; }, true);
    window.identityFeedback = { haptics: 0, audio: 0 };
    navigator.vibrate = () => { window.identityFeedback.haptics++; return true; };
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) for (const method of ['createOscillator', 'createBufferSource']) {
      const original = Audio.prototype[method];
      Audio.prototype[method] = function (...args) { window.identityFeedback.audio++; return original.apply(this, args); };
    }
  });
  const button = name => page.getByRole('button', { name, exact: true });
  const heading = name => page.getByRole('heading', { name, exact: true });
  const waitHeading = name => heading(name).waitFor();
  const restore = async () => {
    await button('Restore with your 12 words').click();
    await page.getByLabel('Your recovery words', { exact: true }).fill('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    await page.getByLabel('I have kept these 12 words safely on paper.').check();
    await button('Recover my Player ID').click();
    await waitHeading('Choose your secret code');
  };
  const trace = () => page.getByTestId('combo-debug').locator('span');
  const count = () => page.locator('.identity-dots .filled').count();
  const dpadPoint = async ([x, y]) => {
    const box = await page.getByTestId('controller-dpad-art').boundingBox();
    assert.ok(box);
    return { x: box.x + box.width * x / 100, y: box.y + box.height * y / 104 };
  };
  const facePoint = async (input, position = 'centre') => {
    const box = await page.getByTitle(faces[input], { exact: true }).boundingBox();
    assert.ok(box);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const delta = position === 'tip' ? -1 : 1;
    if (position !== 'centre') {
      if (input === 'triangle') point.y += delta * (box.height / 2 - 3);
      if (input === 'cross') point.y -= delta * (box.height / 2 - 3);
      if (input === 'circle') point.x -= delta * (box.width / 2 - 3);
      if (input === 'square') point.x += delta * (box.width / 2 - 3);
    }
    return point;
  };
  const tap = async (input, variant = 0) => {
    const point = arms[input] ? await dpadPoint(arms[input][variant]) : await facePoint(input, ['centre', 'tip', 'hub'][variant]);
    await page.touchscreen.tap(point.x, point.y);
  };
  const enter = async (sequence, variant = 0) => {
    for (const input of sequence) await tap(input, variant);
    assert.equal(await count(), 7);
    if (expectDebug) assert.equal(await trace().innerText(), sequence.map(input => symbols[input]).join(' '));
  };
  const clear = async () => { await page.keyboard.press('Backspace'); assert.equal(await count(), 0); };
  await page.goto(url.href);
  assert.equal(await page.evaluate(() => devicePixelRatio), 3);
  await button('Restore with your 12 words').waitFor();
  await restore();
  assert.equal(await page.getByTestId('combo-debug').count(), expectDebug ? 1 : 0, 'Production must never show the trace, even with debugcombo=1');
  assert.equal(backend.apiRequests.length, 0, 'No network login before the code has been confirmed');
  if (expectDebug) {
    let taps = 0;
    for (const [input, points] of Object.entries(arms)) for (const xy of points) {
      const point = await dpadPoint(xy);
      await page.touchscreen.tap(point.x, point.y);
      const pressed = await count();
      const missed = pressed === 1 ? '' : JSON.stringify(await page.evaluate(point => ({ point, pointer: window.lastControllerPointer, touch: window.lastControllerTouch,
        boxes: [...document.querySelectorAll('[data-identity-input]')].map(el => ({ input: el.dataset.identityInput, rect: el.getBoundingClientRect().toJSON() })) }), point));
      assert.equal(pressed, 1, `${input} at ${xy}: one press ${missed}`);
      const recorded = await trace().innerText();
      const diagnostic = recorded === symbols[input] ? '' : JSON.stringify(await page.evaluate(point => ({ point,
        pointer: window.lastControllerPointer, hit: document.elementFromPoint(point.x, point.y)?.getAttribute('data-identity-input'),
        boxes: [...document.querySelectorAll('[data-identity-input]')].map(el => ({ input: el.dataset.identityInput, rect: el.getBoundingClientRect().toJSON() })) }), point));
      assert.equal(recorded, symbols[input], `${input} at ${xy}: exact direction ${diagnostic}`);
      await clear(); taps++;
    }
    for (const input of Object.keys(faces)) for (const position of ['centre', 'tip', 'hub']) {
      const point = await facePoint(input, position);
      await page.touchscreen.tap(point.x, point.y);
      assert.equal(await count(), 1, `${input} ${position}: one press`);
      assert.equal(await trace().innerText(), symbols[input], `${input} ${position}: exact button`);
      await clear(); taps++;
    }
    for (const xy of [[50, 50], [5, 5]]) {
      const point = await dpadPoint(xy); await page.touchscreen.tap(point.x, point.y);
      assert.equal(await count(), 0, 'Hub/socket void must not enter a direction');
    }
    const start = await dpadPoint([50, 16]), end = await dpadPoint([84, 50]);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y);
    await page.mouse.up(); assert.equal(await trace().innerText(), '↑', 'Dragging must not append or change input'); await clear();
    for (const input of Object.keys(faces)) {
      const face = page.getByTitle(faces[input], { exact: true });
      assert.ok(!(await face.getAttribute('class')).includes('active:scale-95'));
      const style = () => face.evaluate(el => {
        const css = getComputedStyle(el); return { transform: css.transform, scale: css.scale, shadow: css.boxShadow, color: css.color };
      });
      const before = await style(), point = await facePoint(input);
      await page.mouse.move(point.x, point.y); await page.mouse.down();
      assert.deepEqual(await style(), before, `${input}: no visible press effect`);
      assert.equal(await count(), 1);
      await page.mouse.up(); await clear();
    }
    await enter(mixed); await page.locator('.identity-screen').evaluate(el => el.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/preview-combo-trace-${engine}.png` });
    // Clear seven entries before the real restore/code flow below.
    for (let i = 0; i < 7; i++) await page.keyboard.press('Backspace');
    console.log(`PASS: ${taps} artwork/face touch points at 390x844 DPR 3; exact inputs, inert hub, one press per drag, no face press effect (${engine}).`);
  }
  // Simulate an unavailable nonce endpoint. The vault must survive and the error must be visible.
  let failNonce = true, failLogin = false, dropNonce = false;
  await context.route('**/api/nonce', route => failNonce ? route.fulfill({ status: 503, json: { error: 'test-only unavailable' } }) :
    dropNonce ? route.abort('failed') : route.fallback());
  await context.route('**/api/login', route => failLogin ? route.fulfill({ status: 503, json: { error: 'test-only unavailable' } }) : route.fallback());
  await enter(mixed); await button('Use this code').click();
  await enter(mixed, 2); await button('Confirm').click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /Online sign-in is unavailable/);
  await waitHeading('Welcome back');
  assert.equal(backend.signedLogins.length, 0);
  failNonce = false; failLogin = true;
  await enter(mixed, 1); await button('Confirm').click(); await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /Online sign-in is unavailable/);
  assert.equal(backend.apiRequests.at(-1).path, '/api/nonce');
  assert.equal(backend.signedLogins.length, 0);
  failLogin = false; dropNonce = true;
  await enter(mixed); await button('Confirm').click(); await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /Could not reach online sign-in/);
  dropNonce = false;
  const beforeLogin = backend.apiRequests.length;
  await enter(mixed, 2); await button('Confirm').click(); await waitHeading('A place that’s yours');
  assert.deepEqual(backend.apiRequests.slice(beforeLogin, beforeLogin + 2).map(({ path, method }) => ({ path, method })),
    [{ path: '/api/nonce', method: 'POST' }, { path: '/api/login', method: 'POST' }]);
  assert.equal(backend.signedLogins.length, 1);
  await backend.expire(); await page.reload(); await waitHeading('Welcome back');
  const beforeWrong = backend.apiRequests.length;
  await enter(faceOnly); await button('Confirm').click(); await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /code did not unlock/i);
  assert.equal(backend.apiRequests.length, beforeWrong, 'Wrong local code must never request a nonce or login');
  await enter(mixed, 1); await button('Confirm').click(); await waitHeading('A place that’s yours');
  await button('Show my 12 words').click(); await waitHeading('One quick security check');
  await enter(mixed, 2); await button('Confirm').click(); await waitHeading('Only for your eyes');
  assert.equal(await page.locator('.identity-words li').count(), 12, 'Same recorded code must decrypt the restored vault');
  await button('Hide words').click();
  assert.deepEqual(await page.evaluate(() => window.identityFeedback), { haptics: 0, audio: 0 });
  assert.deepEqual(pageErrors, []);
  console.log(`PASS: restored mixed-arm code decrypts across tap positions; POST nonce then POST login; nonce/login/network errors are visible and retry succeeds (${engine}).`);
  // Independent face-only code round trip; not a claim about a physical phone test.
  await context.close();
  const faceContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const faceBackend = await mockIdentityAuth(faceContext, url.origin);
  const facePage = await faceContext.newPage(); await facePage.goto(url.href);
  await facePage.getByRole('button', { name: 'Restore with your 12 words', exact: true }).click();
  await facePage.getByLabel('Your recovery words', { exact: true }).fill('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  await facePage.getByLabel('I have kept these 12 words safely on paper.').check();
  await facePage.getByRole('button', { name: 'Recover my Player ID', exact: true }).click();
  await facePage.getByRole('heading', { name: 'Choose your secret code', exact: true }).waitFor();
  const faceEnter = async () => { for (const input of faceOnly) await facePage.getByTitle(faces[input], { exact: true }).tap(); };
  await faceEnter(); await facePage.getByRole('button', { name: 'Use this code', exact: true }).click();
  await faceEnter(); await facePage.getByRole('button', { name: 'Confirm', exact: true }).click();
  await facePage.getByRole('heading', { name: 'Ready for Lumen Bay', exact: true }).waitFor();
  assert.deepEqual(faceBackend.apiRequests.slice(0, 2).map(r => r.path), ['/api/nonce', '/api/login']);
  await faceBackend.expire(); await facePage.reload(); await facePage.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
  await faceEnter(); await facePage.getByRole('button', { name: 'Confirm', exact: true }).click();
  await facePage.getByRole('heading', { name: 'A place that’s yours', exact: true }).waitFor();
  console.log(`PASS: face-buttons-only restored code unlocks (${engine}); ${expectDebug ? 'preview trace enabled' : 'production trace absent with debugcombo=1'}.`);
  await faceContext.close();
  for (const query of ['', '0']) {
    const quietUrl = new URL(url);
    if (query) quietUrl.searchParams.set('debugcombo', query); else quietUrl.searchParams.delete('debugcombo');
    const quietContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await mockIdentityAuth(quietContext, url.origin);
    const quietPage = await quietContext.newPage(); await quietPage.goto(quietUrl.href);
    await quietPage.getByRole('button', { name: 'Restore with your 12 words', exact: true }).click();
    await quietPage.getByLabel('Your recovery words', { exact: true }).fill('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    await quietPage.getByLabel('I have kept these 12 words safely on paper.').check();
    await quietPage.getByRole('button', { name: 'Recover my Player ID', exact: true }).click();
    await quietPage.getByRole('heading', { name: 'Choose your secret code', exact: true }).waitFor();
    await quietPage.getByTitle('Triangle (T)', { exact: true }).tap();
    assert.equal(await quietPage.locator('.identity-dots .filled').count(), 1);
    assert.equal(await quietPage.getByTestId('combo-debug').count(), 0, 'Trace requires the exact opt-in debugcombo=1');
    await quietContext.close();
  }
  console.log(`PASS: input trace absent without debugcombo=1 (${engine}).`);
} finally { await browser.close(); }
