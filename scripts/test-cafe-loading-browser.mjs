import assert from 'node:assert/strict';
// Optional regression: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test-cafe-loading-browser.mjs
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
 await page.keyboard.press('Space');await page.keyboard.press('Tab');
 await page.locator('.cfl-root').waitFor({state:'hidden',timeout:30000});
 const timing = await page.evaluate(() => window.cafePresentations.at(-1));
 assert.ok(timing?.end, `${label}: missing painted-frame timing`);
 const elapsed=timing.end-timing.start;
 assert.ok(elapsed>=4950,`${label}: early input bypassed the minimum (${elapsed}ms)`);
 console.log('PASS',label,Math.round(elapsed)+'ms');
}
async function travel(name) {
 await page.waitForTimeout(400); // existing engine fade-in
 await page.keyboard.press('Tab');
 const card=page.getByRole('img',{name,exact:true});await card.click();await card.click();
}
try {
 await page.goto(base+'?room=home&autostart', { waitUntil: 'domcontentloaded' });
 await page.locator('canvas').first().waitFor();await page.waitForTimeout(2000);
 for(let i=0;i<2;i++){
  await travel('Weekday Chill Café');await finishScene(`cafe travel ${i+1}`);
  await travel('My Room');await page.waitForTimeout(2000);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await travel('Weekday Chill Café');await page.locator('.cfl-painted').waitFor();
 const animations=await page.locator('.cfl-root').evaluate(el=>el.getAnimations({subtree:true}).length);
 assert.equal(animations,0);await finishScene('reduced motion');
 await page.route('**/ui/loading/cafe-reading/sun-v1.webp',route=>route.abort());
 await page.goto(base+'?room=cafe&loading', { waitUntil: 'domcontentloaded' });await page.locator('.cfl-fallback').waitFor();await finishScene('failed artwork');
 await page.unroute('**/ui/loading/cafe-reading/sun-v1.webp');
 await page.goto(base+'?room=cafe&boot', { waitUntil: 'domcontentloaded' });
 await page.waitForTimeout(1500);await page.keyboard.press('Enter');
 await page.waitForTimeout(500);await page.keyboard.press('Space');
 await finishScene('cafe after cold boot');
 assert.deepEqual(errors,[]);console.log('PASS no browser errors');
}finally{await browser.close();await server.close();}
