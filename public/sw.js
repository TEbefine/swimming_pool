/* Pixel Poolside service worker: makes every visit after the first one almost free.
 *
 *  - Game code (/assets/*, hashed names): cache-first, kept forever (a new deploy = new names).
 *  - Art, fonts, manifests: served from the phone instantly, refreshed quietly in the background
 *    (stale-while-revalidate), so new art still arrives on the next visit.
 *  - The page itself: network first, phone copy only when offline.
 *  Bump VERSION to throw every cached file away. */
const VERSION = 'v1';
const CODE = `code-${VERSION}`;
const ART = `art-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const ART_LIMIT = 1200;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CODE, ART, PAGES]);
    for (const name of await caches.keys()) if (!keep.has(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

const isArt = (path) => /^\/(sprites|maps|ui|fonts)\//.test(path) || path === '/favicon.svg' || path === '/icons.svg';

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(CODE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(ART);
  const hit = await cache.match(request);
  const refresh = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone()).then(() => trim(ART, ART_LIMIT));
    return res;
  }).catch(() => hit);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return refresh;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put('/', res.clone());
    return res;
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  } else if (isArt(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
