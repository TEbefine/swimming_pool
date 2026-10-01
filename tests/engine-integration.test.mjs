import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

// Production uses Vite's extensionless TS imports; resolve those identically
// while exercising the real engine with Node's native TypeScript support.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const base = new URL(specifier, context.parentURL);
      for (const suffix of ['.ts', '/index.ts']) {
        const url = new URL(base.href + suffix);
        if (existsSync(url)) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const { GameEngine } = await import('../src/game/Engine.ts');
const { rooms } = await import('../src/game/rooms/index.ts');
const publicRoot = new URL('../public/', import.meta.url);
const flush = () => new Promise((resolve) => setImmediate(resolve));

function environment(t, { holdImages = false, missingManifests = [] } = {}) {
  const originals = new Map();
  const frames = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  const requests = [];
  const images = [];
  const inFlight = new Set();
  const drawCalls = [];
  let peakImages = 0;
  let nextId = -1;
  let clock = 0;
  const gradient = { addColorStop() {} };
  const context = new Proxy({
    measureText: (text) => ({ width: text.length * 8 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    getImageData: (_, __, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    drawImage: (...args) => drawCalls.push(args),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  function canvas() {
    return Object.assign(new EventTarget(), {
      width: 1024, height: 576, style: {}, getContext: () => context,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1024, height: 576 }),
    });
  }
  class FakeImage {
    onload = null;
    onerror = null;
    complete = false;
    width = 48;
    height = 82;
    constructor() { images.push(this); }
    set src(value) {
      this.source = value;
      requests.push(value);
      inFlight.add(this);
      peakImages = Math.max(peakImages, inFlight.size);
      if (!holdImages) queueMicrotask(() => this.succeed());
    }
    get src() { return this.source ?? ''; }
    removeAttribute() { this.source = ''; inFlight.delete(this); }
    succeed() {
      inFlight.delete(this);
      this.complete = true;
      this.onload?.();
    }
  }
  const nativeClearTimeout = globalThis.clearTimeout;
  const nativeClearInterval = globalThis.clearInterval;
  const win = Object.assign(new EventTarget(), {
    location: { search: '', protocol: 'https:', hostname: 'example.test' },
    matchMedia: () => Object.assign(new EventTarget(), { matches: true }),
    setInterval: (callback) => { const id = nextId--; intervals.set(id, callback); return id; },
    setTimeout: (callback) => { const id = nextId--; timeouts.set(id, callback); return id; },
  });
  const doc = Object.assign(new EventTarget(), { hidden: false, createElement: canvas });
  const globals = {
    window: win, document: doc, Image: FakeImage,
    navigator: { onLine: true, deviceMemory: 4 },
    localStorage: { getItem: () => null, setItem() {} },
    performance: { now: () => clock },
    requestAnimationFrame: (callback) => { const id = nextId--; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    clearInterval: (id) => { if (!intervals.delete(id)) nativeClearInterval(id); },
    clearTimeout: (id) => { if (!timeouts.delete(id)) nativeClearTimeout(id); },
    fetch: async (path, { signal } = {}) => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (missingManifests.includes(path)) return { ok: false, status: 404 };
      const file = new URL(path.replace(/^\//, ''), publicRoot);
      assert.ok(fileURLToPath(file).startsWith(fileURLToPath(publicRoot)));
      return existsSync(file)
        ? { ok: true, json: async () => JSON.parse(readFileSync(file, 'utf8')) }
        : { ok: false, status: 404 };
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  const engines = [];
  t.after(() => {
    engines.forEach((engine) => engine.destroy());
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return {
    frames, intervals, requests, images, inFlight, drawCalls,
    peakImages: () => peakImages,
    engine(room = 'cafe') {
      const engine = new GameEngine(canvas(), rooms[room], 'Tester', 'red');
      engines.push(engine);
      return engine;
    },
    frame(ms = 1000 / 60) {
      clock += ms;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(clock));
    },
    visible(value) {
      doc.hidden = !value;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

test('café startup loads no water images and respects the six-image budget', async (t) => {
  const env = environment(t);
  const engine = env.engine();
  await engine.loadAssets();
  assert.equal(engine.isAssetsLoaded, true);
  assert.ok(env.requests.includes('/maps/cafe_room.webp'));
  assert.ok(env.requests.some((path) => path.includes('/outfits/cafe/')));
  assert.equal(env.requests.filter((path) => path.includes('/water/')).length, 0);
  assert.ok(env.peakImages() <= 6);
});

test('travel releases old room sprites and returning to café has the original cache size', async (t) => {
  const env = environment(t);
  const engine = env.engine();
  await engine.loadAssets();
  const initialSize = engine.sprites.size + engine.npcSprites.size + engine.elementImages.size + engine.moverSprites.size;
  engine.start();
  for (const destination of ['home', 'poolside', 'town', 'cafe']) {
    const changed = engine.changeRoom(destination);
    for (let frame = 0; frame < 45; frame++) { env.frame(); await flush(); }
    assert.equal(await changed, true);
    assert.equal(engine.getRoom().roomId, destination);
    assert.equal(engine.isAssetsLoaded, true);
    for (const key of engine.sprites.keys()) {
      if (key.startsWith('outfit_')) assert.ok(key.startsWith(`outfit_${rooms[destination].outfit}_`));
      if (key.startsWith('water_')) assert.equal(destination, 'poolside');
    }
    if (destination === 'poolside') {
      const waterRequests = env.requests.filter((path) => path.includes('/water/'));
      assert.ok(waterRequests.length > 0);
      assert.ok(waterRequests.every((path) => path.includes('/water/red/')));
    }
  }
  const finalSize = engine.sprites.size + engine.npcSprites.size + engine.elementImages.size + engine.moverSprites.size;
  assert.equal(finalSize, initialSize);
  assert.ok(env.peakImages() <= 6);
});

test('backgrounding cancels rendering and heartbeat; repeated resumes create one loop', async (t) => {
  const env = environment(t);
  const engine = env.engine();
  await engine.loadAssets();
  engine.start();
  engine.start();
  assert.equal(env.frames.size, 1);
  assert.equal(env.intervals.size, 1);
  env.frame();
  assert.ok(env.drawCalls.length > 0);
  env.visible(false);
  assert.equal(env.frames.size, 0);
  assert.equal(env.intervals.size, 0);
  const draws = env.drawCalls.length;
  env.frame(600_000);
  assert.equal(env.drawCalls.length, draws);
  env.visible(true);
  env.visible(true);
  assert.equal(env.frames.size, 1);
  assert.equal(env.intervals.size, 1);
  env.frame();
  assert.ok(env.drawCalls.length > draws);
  assert.equal(env.frames.size, 1);
  engine.destroy();
  assert.equal(env.frames.size, 0);
  assert.equal(env.intervals.size, 0);
  env.visible(true);
  assert.equal(env.frames.size, 0);
});

test('destroy cancels loading without late asset mutations or new requests', async (t) => {
  const env = environment(t, { holdImages: true });
  const engine = env.engine();
  const loading = engine.loadAssets();
  await flush();
  assert.equal(env.inFlight.size, 6);
  const callbacks = env.images.map((img) => img.onload);
  const requests = env.requests.length;
  engine.destroy();
  await loading;
  callbacks.forEach((callback) => callback?.());
  await flush();
  assert.equal(env.requests.length, requests);
  assert.equal(env.inFlight.size, 0);
  assert.equal(engine.sprites.size + engine.npcSprites.size + engine.elementImages.size + engine.moverSprites.size, 0);
  assert.equal(engine.bgImage, null);
  assert.equal(engine.cityImage, null);
  assert.equal(engine.isAssetsLoaded, false);
  assert.equal(env.frames.size, 0);
});

test('missing optional and scaled manifests preserve playable fallback art', async (t) => {
  const env = environment(t, { missingManifests: [
    '/sprites/land_2_0x/manifest.json', '/sprites/outfits/cafe/manifest.json',
  ] });
  t.mock.method(console, 'warn', () => {});
  const engine = env.engine();
  await engine.loadAssets();
  assert.equal(engine.isAssetsLoaded, true);
  assert.ok(engine.sprites.has('land_idle'));
  assert.equal(engine.sprites.has('land_2_0x_idle'), false);
  assert.equal(engine.sprites.has('outfit_cafe_idle'), false);
  engine.start();
  env.frame();
  assert.ok(env.drawCalls.length > 0);
  assert.equal(env.frames.size, 1);
});
