// WOODS-01: Whisker Woods tall grass (planted in code) + random animal encounters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

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

const { GrassField, GRASS_ASSETS, hashString, insideRect } = await import('../src/game/world/grassField.ts');
const { EncounterRoller, ENCOUNTER, encounterScript } = await import('../src/game/world/encounter.ts');
const { rooms } = await import('../src/game/rooms/index.ts');
const publicRoot = new URL('../public/', import.meta.url);

const woods = rooms.woods_1;

test('Whisker Woods is a room with tall grass, its map and every grass image', () => {
  assert.ok(woods, 'woods_1 registered');
  assert.ok(woods.grass?.length >= 3);
  for (const path of [woods.backgroundImage, woods.thumbnail, ...GRASS_ASSETS]) {
    assert.ok(existsSync(new URL('.' + path, publicRoot)), path);
  }
  assert.ok(woods.exits.some((e) => e.targetRoom === 'town'), 'the path leads back to town');
});

test('the same room id plants the same grass on every device', () => {
  const a = new GrassField(woods.grass, hashString('woods_1'));
  const b = new GrassField(woods.grass, hashString('woods_1'));
  assert.ok(a.tufts.length > 100);
  assert.deepEqual(a.tufts.map((t) => [t.x, t.y, t.kind, t.flip]), b.tufts.map((t) => [t.x, t.y, t.kind, t.flip]));
});

test('tufts stay inside their zones and the sandy path stays clear', () => {
  const field = new GrassField(woods.grass, hashString('woods_1'));
  for (const t of field.tufts) {
    assert.ok(woods.grass.some((z) => insideRect(z.rect, t.x, t.y) || insideRect({ ...z.rect, x: z.rect.x - 4, width: z.rect.width + 8 }, t.x, t.y)), `tuft ${t.x},${t.y}`);
    assert.ok(t.y < 378 || t.y > 425, `tuft on the path at y ${t.y}`);
  }
  assert.equal(field.zoneAt(300, 400), null, 'the path is not grass');
  assert.equal(field.zoneAt(500, 500)?.id, 'south');
});

test('walking through grass bends the tufts around your feet, then they spring back', () => {
  const field = new GrassField(woods.grass, hashString('woods_1'));
  field.update(1000, [{ id: 'me', x: 500, y: 500 }]);
  field.update(1016, [{ id: 'me', x: 503, y: 500 }]);
  const near = field.tufts.filter((t) => Math.abs(t.x - 503) <= 14 && t.y >= 494 && t.y <= 510);
  assert.ok(near.length > 0);
  for (const t of near) assert.notEqual(field.stateOf(t, 1016 + 50), 'calm');
  assert.ok(near.some((t) => field.stateOf(t, 1016 + 200) === 'parted'));
  for (const t of near) assert.ok(['calm', 'right'].includes(field.stateOf(t, 1016 + 2000)));
});

test('encounters only happen while walking in grass, never right after arriving, and not back to back', () => {
  let roll = 0;
  const always = new EncounterRoller(() => 0);   // every roll hits
  always.reset(0);
  assert.equal(always.step(ENCOUNTER.stepPx * 3, true, 500), false, 'grace period after arriving');
  assert.equal(always.step(ENCOUNTER.stepPx * 3, false, 5000), false, 'not on the path');
  assert.equal(always.step(ENCOUNTER.stepPx, true, 5000), true);
  assert.equal(always.step(ENCOUNTER.stepPx * 3, true, 5100), false, 'cooldown after an encounter');
  const never = new EncounterRoller(() => 0.99);
  never.reset(0);
  for (let t = 2000; t < 60000; t += 16) assert.equal(never.step(3, true, t), false);
  const counted = new EncounterRoller(() => { roll += 1; return 0.99; });
  counted.reset(0);
  counted.step(ENCOUNTER.stepPx * 2 + 1, true, 5000);
  assert.equal(roll, 2, 'one roll per step of walking');
});

test('the placeholder talk box names a cat from the approved family, in short lines', () => {
  const script = encounterScript(() => 0.5);
  const lines = script.nodes[script.start].lines.map((l) => l.text);
  assert.ok(lines.some((l) => /A wild .+ jumps out!/.test(l)));
  for (const l of lines) assert.ok(l.length <= 64, l);
});
