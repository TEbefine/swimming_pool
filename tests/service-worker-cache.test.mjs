import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function setup() {
  const handlers = {};
  const entries = new Map();
  let scans = 0;
  let online = true;
  const cache = {
    async match(req) { return entries.get(req.url); },
    async put(req, res) { entries.set(req.url, res); },
    async keys() { scans++; return [...entries.keys()].map(url => ({url})); },
    async delete(req) { entries.delete(req.url); },
  };
  const context = { URL, Response, Promise, self: { location: {origin: 'https://game.test'}, addEventListener(type, fn) { handlers[type] = fn; } },
    caches: { async open() { return cache; } },
    fetch: async () => { if (!online) throw new Error('offline'); return new Response('fresh'); },
  };
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  async function request(path) {
    let response, update;
    handlers.fetch({ request: {method:'GET', url: `https://game.test${path}`, mode:'cors'},
      respondWith(p) { response = p; }, waitUntil(p) { update = p; } });
    const result = await response;
    await update;
    return result;
  }
  return {request, entries, get scans() { return scans; }, offline() { online = false; }};
}

test('cached art stays available offline and misses return an error response', async () => {
  const sw = await setup();
  assert.equal(await (await sw.request('/sprites/one.webp')).text(), 'fresh');
  sw.offline();
  assert.equal(await (await sw.request('/sprites/one.webp')).text(), 'fresh');
  assert.equal((await sw.request('/sprites/missing.webp')).type, 'error');
});

test('art refreshes and cache scans are batched with bounded cleanup', async () => {
  const sw = await setup();
  for (let i = 0; i < 1233; i++) await sw.request(`/sprites/${i}.webp`);
  assert.ok(sw.scans <= 40, `expected batched scans, got ${sw.scans}`);
  assert.ok(sw.entries.size <= 1231);
  sw.entries.set('https://game.test/sprites/1232.webp', new Response('old'));
  assert.equal(await (await sw.request('/sprites/1232.webp')).text(), 'old');
  assert.equal(await sw.entries.get('https://game.test/sprites/1232.webp').text(), 'fresh');
});
