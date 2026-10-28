import assert from 'node:assert/strict';
// Optional regression: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test-bay-loading-browser.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const server=await createServer({root:fileURLToPath(new URL('../', import.meta.url)),server:{host:'127.0.0.1',port:4190}});await server.listen();
const browser=await chromium.launch({headless:true, ...(process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE} : {}), args:JSON.parse(process.env.CHROME_ARGS || '[]')});
const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
const page=await context.newPage();const errors=[];page.on('pageerror', e=>errors.push(e.message));
const base='http://127.0.0.1:4190/';
// Measure in the browser from the painted DOM update, not when Playwright's
// locator poll returns (which can arrive seconds later on a busy/slow page).
await page.addInitScript(() => {
 window.cafePresentations = [];
 let active = null;
 new MutationObserver(() => {
  const scene = document.querySelector('.cfl-painted');
  if (scene && !active) {
   active = { start: performance.now(), end: null };
   window.cafePresentations.push(active);
  } else if (!scene && active) {
   active.end = performance.now();
   active = null;
  }
 }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
});
async function finishScene(label) {
 await page.locator('.cfl-painted').waitFor();
 if(process.env.BAY_REVIEW_DIR && label==='bay travel 1') await page.locator('.cfl-root').screenshot({path:process.env.BAY_REVIEW_DIR+'/bay-desktop.jpg',type:'jpeg',quality:85});
 // Dispatch only while the loading overlay is still mounted; screenshot capture
 // can finish after the five-second handover on a busy machine.
 await page.evaluate(() => {
  if (!document.querySelector('.cfl-root')) return;
  for (const [key, code] of [[' ', 'Space'], ['Tab', 'Tab']]) {
   window.dispatchEvent(new KeyboardEvent('keydown', {key, code, bubbles:true, cancelable:true}));
   window.dispatchEvent(new KeyboardEvent('keyup', {key, code, bubbles:true, cancelable:true}));
  }
 });
 await page.locator('.cfl-root').waitFor({state:'hidden',timeout:30000});
 const timing = await page.evaluate(() => window.cafePresentations.at(-1));
 assert.ok(timing?.end, `${label}: missing painted-frame timing`);
 const elapsed=timing.end-timing.start;
 assert.ok(elapsed>=4950,`${label}: early input bypassed the minimum (${elapsed}ms)`);
 console.log('PASS',label,Math.round(elapsed)+'ms');
}
async function travel(name) {
 // Early Tab can focus chat; start each deliberate map shortcut from the game.
 await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
 await page.waitForTimeout(400); // existing engine fade-in
 await page.keyboard.press('Tab');
 const card=page.getByRole('img',{name,exact:true});await card.click();await card.click();
}
try {
 await page.goto(base+'?room=home&autostart', { waitUntil: 'domcontentloaded' });
 await page.locator('canvas').first().waitFor();await page.waitForTimeout(2000);
 for(let i=0;i<2;i++){
  await travel('Quiet Bay');await finishScene(`bay travel ${i+1}`);
  await travel('My Room');await page.waitForTimeout(2000);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await travel('Quiet Bay');await page.locator('.cfl-painted').waitFor();
 const animations=await page.locator('.cfl-root').evaluate(el=>el.getAnimations({subtree:true}).length);
 assert.equal(animations,0);await finishScene('reduced motion');
 await page.route('**/ui/loading/bay-fishing/kai-v1.webp',route=>route.abort());
 await page.goto(base+'?room=lake_pier&loading', { waitUntil: 'domcontentloaded' });await page.locator('.cfl-fallback').waitFor();await finishScene('failed artwork');
 await page.unroute('**/ui/loading/bay-fishing/kai-v1.webp');
 await page.goto(base+'?room=lake_pier&boot', { waitUntil: 'domcontentloaded' });
 // The first START press can arrive before room assets are ready. Retry it
 // until the boot/story appears instead of assuming a fixed network delay.
 for (let attempt=0; attempt<80; attempt++) {
  if (await page.locator('.cfl-root').count()) break;
  await page.keyboard.press('Enter');
  if (await page.locator('.boot').count()) await page.keyboard.press('Space');
  await page.waitForTimeout(250);
 }
 await finishScene('bay after cold boot');
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'?room=lake_pier&loading',{waitUntil:'domcontentloaded'});
 await page.locator('.cfl-bay.cfl-painted').waitFor();
 if(process.env.BAY_REVIEW_DIR) await page.locator('.cfl-root').screenshot({path:process.env.BAY_REVIEW_DIR+'/bay-phone.jpg',type:'jpeg',quality:85});
 await finishScene('phone startup');
 assert.deepEqual(errors,[]);console.log('PASS no browser errors');
}finally{await browser.close();await server.close();}
