import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameBudget } from '../src/game/frameBudget.ts';

for (const refreshRate of [60, 90, 120, 144]) {
  for (const targetRate of [30, 60]) {
    test(`${refreshRate} Hz callbacks render at ${targetRate} fps with elapsed time preserved`, () => {
      const budget = new FrameBudget();
      budget.reset(0);
      const durationSeconds = 10;
      let renderedFrames = 0;
      let simulationSeconds = 0;
      let lastRenderedAt = 0;
      for (let callback = 1; callback <= refreshRate * durationSeconds; callback++) {
        const now = callback * 1000 / refreshRate;
        const dt = budget.advance(now, targetRate);
        if (dt === null) continue;
        assert.ok(dt >= 0 && dt <= 0.1);
        assert.ok(Math.abs(dt - (now - lastRenderedAt) / 1000) < 1e-10);
        simulationSeconds += dt;
        lastRenderedAt = now;
        renderedFrames++;
      }
      assert.ok(Math.abs(renderedFrames - targetRate * durationSeconds) <= 1,
        `rendered ${renderedFrames} frames`);
      assert.ok(Math.abs(simulationSeconds - durationSeconds) < 1 / targetRate);
    });
  }
}

test('a late callback caps simulation time and never queues a rendering catch-up burst', () => {
  const budget = new FrameBudget();
  budget.reset(0);
  budget.advance(1000 / 60, 30);
  assert.equal(budget.advance(10_000, 30), 0.1);
  for (const time of [10_000, 10_005, 10_010, 10_020, 10_030]) {
    assert.equal(budget.advance(time, 30), null);
  }
  assert.ok(Math.abs(budget.advance(10_000 + 1000 / 30, 30) - 1 / 30) < 1e-10);
});

test('reset after backgrounding excludes hidden time and resumes one regular stream', () => {
  const budget = new FrameBudget();
  budget.reset(0);
  budget.advance(16, 60);
  budget.reset(600_000);
  assert.equal(budget.advance(600_000, 60), 0);
  assert.equal(budget.advance(600_000, 60), null);
  assert.equal(budget.advance(600_005, 60), null);
  assert.ok(Math.abs(budget.advance(600_000 + 1000 / 60, 60) - 1 / 60) < 1e-10);
});

test('switching quality preserves elapsed simulation time', () => {
  const budget = new FrameBudget();
  budget.reset(0);
  let elapsed = 0;
  let lastRenderedAt = 0;
  for (let frame = 1; frame <= 120 * 6; frame++) {
    const now = frame * 1000 / 120;
    const target = now < 2000 || now >= 4000 ? 60 : 30;
    const dt = budget.advance(now, target);
    if (dt === null) continue;
    elapsed += dt;
    lastRenderedAt = now;
  }
  assert.ok(Math.abs(elapsed - lastRenderedAt / 1000) < 1e-10);
  assert.ok(Math.abs(elapsed - 6) < 1 / 30);
});
