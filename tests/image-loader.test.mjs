import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners, setMaxListeners } from 'node:events';
import { ImageLoader } from '../src/game/imageLoader.ts';

function fakeImages(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const instances = [];
  const active = new Set();
  let peak = 0;
  class FakeImage {
    onload = null;
    onerror = null;
    decoding = '';
    removedSource = false;
    constructor() { instances.push(this); }
    set src(value) {
      this.source = value;
      active.add(this);
      peak = Math.max(peak, active.size);
    }
    get src() { return this.source ?? ''; }
    removeAttribute(name) {
      assert.equal(name, 'src');
      this.removedSource = true;
      this.source = '';
      active.delete(this);
    }
    succeed() { active.delete(this); this.onload?.(); }
    fail() { active.delete(this); this.onerror?.(); }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'Image', original);
    else delete globalThis.Image;
  });
  return { instances, active, peak: () => peak };
}

function controller(t) {
  const value = new AbortController();
  setMaxListeners(0, value.signal);
  t.after(() => value.abort());
  return value;
}

test('image requests never exceed six in flight, and finished images release listeners', async (t) => {
  const images = fakeImages(t);
  const abort = controller(t);
  const loader = new ImageLoader();
  const requests = Array.from({ length: 23 }, (_, i) => loader.load(`/sprite-${i}.webp`, abort.signal));
  assert.equal(images.instances.length, 6);
  while (images.active.size) [...images.active][0].succeed();
  const results = await Promise.all(requests);
  assert.equal(images.peak(), 6);
  assert.equal(images.instances.length, 23);
  assert.equal(results.filter(Boolean).length, 23);
  assert.equal(getEventListeners(abort.signal, 'abort').length, 0);
  for (const img of results) {
    assert.equal(img.decoding, 'async');
    assert.equal(img.onload, null);
    assert.equal(img.onerror, null);
    assert.equal(img.removedSource, false);
  }
});

test('aborting a room settles active and queued loads without starting more images', async (t) => {
  const images = fakeImages(t);
  const abort = controller(t);
  const loader = new ImageLoader();
  const requests = Array.from({ length: 30 }, (_, i) => loader.load(`/sprite-${i}.webp`, abort.signal));
  const lateOnload = images.instances[0].onload;
  abort.abort();
  const results = await Promise.all(requests);
  assert.equal(images.instances.length, 6);
  assert.equal(images.active.size, 0);
  assert.ok(results.every((value) => value === null));
  assert.equal(getEventListeners(abort.signal, 'abort').length, 0);
  for (const img of images.instances) {
    assert.equal(img.src, '');
    assert.equal(img.onload, null);
    assert.equal(img.onerror, null);
  }
  lateOnload();
  assert.equal(images.instances.length, 6);
  const nextRoom = controller(t);
  const next = loader.load('/next-room.webp', nextRoom.signal);
  assert.equal(images.instances.length, 7);
  images.instances[6].succeed();
  assert.equal(await next, images.instances[6]);
});

test('aborting queued work settles immediately while another room is still loading', async (t) => {
  const images = fakeImages(t);
  const activeRoom = controller(t);
  const queuedRoom = controller(t);
  const loader = new ImageLoader(1);
  const active = loader.load('/active.webp', activeRoom.signal);
  let settled = false;
  const queued = loader.load('/cancelled.webp', queuedRoom.signal).then((result) => {
    settled = true;
    assert.equal(result, null);
  });
  queuedRoom.abort();
  await Promise.resolve();
  assert.equal(settled, true);
  assert.equal(images.instances.length, 1);
  assert.equal(getEventListeners(queuedRoom.signal, 'abort').length, 0);
  images.instances[0].succeed();
  await Promise.all([active, queued]);
  assert.equal(images.instances.length, 1);
});

test('failed and pre-aborted images do not block queued work', async (t) => {
  const images = fakeImages(t);
  const abort = controller(t);
  const alreadyAborted = controller(t);
  alreadyAborted.abort();
  const loader = new ImageLoader(1);
  assert.equal(await loader.load('/never-start.webp', alreadyAborted.signal), null);
  assert.equal(images.instances.length, 0);
  const failure = loader.load('/missing.webp', abort.signal);
  const success = loader.load('/next.webp', abort.signal);
  images.instances[0].fail();
  assert.equal(images.instances.length, 2);
  assert.equal(await failure, null);
  assert.equal(images.instances[0].src, '');
  images.instances[1].succeed();
  assert.equal(await success, images.instances[1]);
  assert.equal(getEventListeners(abort.signal, 'abort').length, 0);
});
