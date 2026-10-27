import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentation } from '../src/components/roomTransition/presentation.ts';

test('five seconds starts when the scene is painted, not when loading begins', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = createPresentation(5000);
  let done = false;
  void gate.finished.then(() => { done = true; });
  t.mock.timers.tick(9000);
  await Promise.resolve();
  assert.equal(done, false);
  gate.presented();
  t.mock.timers.tick(4999);
  await Promise.resolve();
  assert.equal(done, false);
  gate.presented(); // rerenders must not restart the clock
  t.mock.timers.tick(1);
  await gate.finished;
  assert.equal(done, true);
});

test('loading and the viewing minimum overlap, while slower real loading still gates entry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = createPresentation(5000);
  let loaded;
  let entered = false;
  const assets = new Promise(resolve => { loaded = resolve; });
  const completion = Promise.all([gate.finished, assets]).then(() => { entered = true; });
  gate.presented();
  t.mock.timers.tick(5000);
  await Promise.resolve();
  assert.equal(entered, false);
  loaded();
  await completion; // no second five-second delay
  assert.equal(entered, true);
});

test('cancellation releases pending travel, and a repeat visit gets its own five seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const painted of [false, true]) {
    const gate = createPresentation(5000);
    if (painted) gate.presented();
    gate.cancel();
    await gate.finished;
    gate.presented();
  }
  const next = createPresentation(5000);
  let done = false;
  void next.finished.then(() => { done = true; });
  next.presented();
  t.mock.timers.tick(4999);
  await Promise.resolve();
  assert.equal(done, false);
  t.mock.timers.tick(1);
  await next.finished;
});
