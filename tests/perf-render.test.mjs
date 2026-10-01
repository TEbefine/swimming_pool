import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVisibleRect, findOpenArea, intersectRect, spanVisible } from '../src/game/renderView.ts';
import { ThrottleWatch, TIERS } from '../src/game/quality.ts';

test('phone portrait sees under half of the world; desktop sees all of it', () => {
  const portrait = computeVisibleRect(1024, 576, 336, 425, 'cover', 50, 50, 0);
  assert.ok(portrait.w < 1024 * 0.5, `visible width ${portrait.w}`);
  assert.equal(portrait.h, 576);
  assert.equal(portrait.x + portrait.w / 2, 512);
  assert.deepEqual(computeVisibleRect(1024, 576, 1280, 720, 'contain', 50), { x: 0, y: 0, w: 1024, h: 576 });
  const left = computeVisibleRect(1024, 576, 336, 425, 'cover', 0, 50, 0);
  const right = computeVisibleRect(1024, 576, 336, 425, 'cover', 100, 50, 0);
  assert.equal(left.x, 0);
  assert.equal(right.x + right.w, 1024);
});

test('culling and intersections', () => {
  const view = { x: 300, y: 0, w: 400, h: 576 };
  assert.equal(spanVisible(view, 250, 60), true);
  assert.equal(spanVisible(view, 200, 60), false);
  assert.equal(spanVisible(view, 770, 60), false);
  assert.deepEqual(intersectRect(view, { x: 0, y: 0, w: 350, h: 100 }), { x: 300, y: 0, w: 50, h: 100 });
  assert.equal(intersectRect(view, { x: 0, y: 0, w: 100, h: 100 }), null);
});

test('open (see-through) area of a painting is found, solid paintings have none', () => {
  const w = 64, h = 32;
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  assert.equal(findOpenArea(px, w, h), null);
  for (let y = 4; y < 12; y++) for (let x = 10; x < 30; x++) px[(y * w + x) * 4 + 3] = 0;
  const area = findOpenArea(px, w, h);
  assert.ok(area.x <= 10 && area.y <= 4 && area.x + area.w >= 29 && area.y + area.h >= 11, JSON.stringify(area));
  assert.ok(area.w < w && area.h < h);
});

test('throttle watch stays calm at a steady cost and reacts to sustained slow-down', () => {
  const watch = new ThrottleWatch(1000, 3);
  let t = 0;
  const run = (seconds, workMs, budget = 33.3) => {
    let stepped = false;
    for (let i = 0; i < seconds * 30; i++) {
      t += budget;
      stepped = watch.sample(t, workMs, budget, budget) || stepped;
    }
    return stepped;
  };
  assert.equal(run(20, 3), false, 'steady frames never step down');
  assert.equal(run(2, 9), false, 'a short spike is ignored');
  assert.equal(run(5, 9), true, 'a sustained 3x slow-down steps down');
});

test('throttle watch steps down when frames keep arriving late', () => {
  const watch = new ThrottleWatch(1000, 3);
  let t = 0;
  let stepped = false;
  for (let i = 0; i < 200; i++) {
    t += 70;
    stepped = watch.sample(t, 2, 70, 33.3) || stepped;
  }
  assert.equal(stepped, true);
});

test('every tier keeps phones at or below 30 fps and the battery tier lower still', () => {
  assert.ok(TIERS.balanced.active <= 30 && TIERS.battery.active < TIERS.balanced.active);
  for (const tier of Object.values(TIERS)) {
    assert.ok(tier.deep < tier.idle && tier.idle < tier.active);
  }
});

test('walking after standing still is not mistaken for overheating', () => {
  const watch = new ThrottleWatch(1000, 3);
  let t = 0;
  let stepped = false;
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < 15 * 5; i++) { t += 66.7; stepped = watch.sample(t, 1.5, 66.7, 66.7) || stepped; } // idle 15 fps, cheap
    for (let i = 0; i < 30 * 5; i++) { t += 33.3; stepped = watch.sample(t, 5, 33.3, 33.3) || stepped; } // walking 30 fps, 3x the work
  }
  assert.equal(stepped, false);
});
