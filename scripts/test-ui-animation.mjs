import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startVisibleAnimation } from '../src/ui/visibleAnimation.ts';

function environment(hidden = false) {
  const page = new EventTarget();
  page.hidden = hidden;
  let id = 0;
  const callbacks = new Map();
  const frames = {
    requestAnimationFrame: (callback) => { callbacks.set(++id, callback); return id; },
    cancelAnimationFrame: (frame) => callbacks.delete(frame),
  };
  return {
    page,
    frames,
    pending: () => callbacks.size,
    advance(now) {
      const next = [...callbacks.values()];
      callbacks.clear();
      next.forEach((callback) => callback(now));
    },
    hide(hidden) {
      page.hidden = hidden;
      page.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

for (const displayHz of [60, 90, 120, 144]) {
  for (const fps of [30, 60]) {
    test(`${displayHz} Hz display respects a ${fps} FPS draw limit`, () => {
      const env = environment();
      let draws = 0;
      const stop = startVisibleAnimation(() => { draws++; return true; }, fps, env.page, env.frames);
      // Rounded browser timestamps exercise frame-boundary tolerance, too.
      for (let i = 0; i <= displayHz * 5; i++) env.advance(Math.round(i * 100000 / displayHz) / 100);
      assert.ok(draws >= fps * 5 - 1 && draws <= fps * 5 + 1, `${draws} draws in five seconds`);
      stop();
      assert.equal(env.pending(), 0);
    });
  }
}

test('hidden pages cancel work and resume with one fresh frame', () => {
  const env = environment(true);
  const draws = [];
  const stop = startVisibleAnimation((now) => { draws.push(now); return true; }, 30, env.page, env.frames);
  assert.equal(env.pending(), 0);
  env.hide(false);
  env.advance(0);
  env.hide(true);
  assert.equal(env.pending(), 0);
  env.advance(10000);
  assert.deepEqual(draws, [0]);
  env.hide(false);
  env.advance(10001);
  assert.deepEqual(draws, [0, 10001]);
  stop();
  env.hide(false);
  assert.equal(env.pending(), 0);
});

test('completed catch animations do not keep drawing or restart on tab focus', () => {
  const env = environment();
  let draws = 0;
  const stop = startVisibleAnimation(() => { draws++; return false; }, 30, env.page, env.frames);
  env.advance(0);
  assert.equal(env.pending(), 0);
  env.hide(true);
  env.hide(false);
  env.advance(1000);
  assert.equal(draws, 1);
  assert.equal(env.pending(), 0);
  stop();
});
