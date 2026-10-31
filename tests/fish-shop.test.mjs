// ECO-01 step 2–4 — the Harbour Fish Shop room, its people and their talk.
// Under plain Node the money system is OFF (no Vite dev, no ?test=shop), exactly like the live game,
// so these tests also prove the shop never appears there.
import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
// Vite's extensionless TS imports (same hook as engine-integration.test.mjs)
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
const { ECONOMY_SANDBOX } = await import('../src/game/economy/flags.ts');
const { rooms } = await import('../src/game/rooms/index.ts');
const { fishShopRoom } = await import('../src/game/rooms/fishShop.ts');
const { genScript, minatoScript, shopAfter, SHOP_NODE_OPENS, SHOP_NPCS } = await import('../src/game/economy/shopTalk.ts');

const inside = (r, x, y) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
const walkable = (room, x, y) => room.walkableZones.some((z) => inside(z, x, y)) && !room.obstacles.some((o) => inside(o, x, y));

test('ECO-04 live game: the fish shop room is registered and Quiet Bay\'s left shore leads there; no sandbox', () => {
  assert.equal(ECONOMY_SANDBOX, false);
  assert.equal(rooms.fish_shop, fishShopRoom);
  assert.deepEqual(rooms.lake_pier.exits.map((e) => e.targetRoom), ['fish_shop']);
});

test('the shop room: spawn, arrival, NPC talk spots and the exit are all on the walkway', () => {
  const r = fishShopRoom;
  assert.ok(walkable(r, r.spawnPoint.x, r.spawnPoint.y), 'spawn');
  const a = r.arrivals.lake_pier;
  assert.ok(walkable(r, a.x, a.y), 'arrival from the bay');
  const [ex, ey, ew, eh] = r.exits[0].triggerBox;
  assert.equal(r.exits[0].targetRoom, 'lake_pier');
  assert.ok(walkable(r, ex + ew / 2, ey + eh / 2), 'exit reachable');
  assert.ok(!inside({ x: ex, y: ey, width: ew, height: eh }, a.x, a.y), 'arriving never re-triggers the exit');
  for (const n of r.npcs) {
    const spot = { x: n.x + n.standAt.dx, y: n.y + n.standAt.dy };
    assert.ok(walkable(r, spot.x, spot.y), `${n.id} talk spot`);
    assert.ok(existsSync(`public${n.sprite}/manifest.json`), `${n.id} sprites`);
    const m = JSON.parse(readFileSync(`public${n.sprite}/manifest.json`, 'utf8'));
    for (const p of [...(n.wander?.idlePoses ?? []), 'idle', 'walk1', 'walk2', 'talk', 'bow']) assert.ok(m[p], `${n.id} has pose ${p}`);
  }
  assert.ok(existsSync('public/maps/fish_shop.webp') && existsSync('public/maps/thumbs/fish_shop.webp'));
});

test('Quiet Bay arrival from the shop is on the breakwater, outside the shop exit', () => {
  const bay = rooms.lake_pier;
  const a = bay.arrivals.fish_shop;
  assert.ok(bay.walkableZones.some((z) => inside(z, a.x, a.y)));
  assert.ok(a.x > 80 + 12, 'not inside the left-shore exit');
});

test('Gen and Minato: every choice leads somewhere, every counter node exists, poses exist', () => {
  for (const [id, script] of [['gen', genScript()], ['minato', minatoScript()]]) {
    assert.ok(SHOP_NPCS.has(id));
    const poses = JSON.parse(readFileSync(`public/sprites/npc/${id}/manifest.json`, 'utf8'));
    for (const [nodeId, node] of Object.entries(script.nodes)) {
      for (const c of node.choices ?? []) assert.ok(script.nodes[c.next], `${id}.${nodeId} → ${c.next}`);
      for (const l of node.lines) {
        assert.ok(!l.pose || poses[l.pose], `${id} pose ${l.pose}`);
        assert.ok(l.text.length <= 64, `${id}.${nodeId} line fits two rows: "${l.text}"`);
      }
    }
    assert.equal(script.portraitDir, `/sprites/npc/${id}/portrait`);
    for (const f of script.faces) assert.ok(existsSync(`public${script.portraitDir}/${f}.webp`), `${id} portrait ${f}`);
    for (const node of Object.values(script.nodes)) for (const l of node.lines) assert.ok(script.faces.includes(l.face), `${id} face ${l.face}`);
    for (const nodeId of Object.keys(SHOP_NODE_OPENS[id])) assert.ok(script.nodes[nodeId], `${id} opens from ${nodeId}`);
  }
  const after = shopAfter({ vendor: 'gen', soldFish: 3, earned: 42, boughtItems: 0, spent: 0 });
  assert.match(after.nodes.after.lines[0].text, /3 fish\. 42 coins/);
});
