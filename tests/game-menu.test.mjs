import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MenuStore, FIELD_IDS, createInitialState, reduce, selectedItem, selectedRow, activePocket,
} from '../src/components/gameMenu/menuModel.ts';
import {
  menuInputFromKey, KeyGate, DpadAdapter, directionFromDpad,
  KEY_REPEAT_MS, DPAD_REPEAT_DELAY_MS, DPAD_REPEAT_EVERY_MS,
} from '../src/components/gameMenu/menuInput.ts';

const IDX = Object.fromEntries(FIELD_IDS.map((id, i) => [id, i]));

/** A store wired to a fake bag and a host that records everything the menu asks for. */
function rig(bag = { items: ['yeot', 'rice_sack'], fish: ['mackerel', 'eel', 'clams'], cards: [], key: ['small_net'] }) {
  const calls = [];
  const ctx = {
    pocketIds: ['items', 'fish', 'cards', 'key'],
    itemsIn: (p) => bag[p] ?? [],
    actionsFor: (id) => (id === 'yeot' ? ['eat', 'check'] : ['check']),
    emoteCount: 8,
    optionCount: 4,
  };
  const host = {
    sfx: (k) => calls.push(['sfx', k]),
    openFishBook: () => calls.push(['fishbook']),
    openNameEditor: () => calls.push(['name']),
    openHelp: () => calls.push(['help']),
    chooseEmote: (i) => calls.push(['emote', i]),
    changeOption: (i, d) => calls.push(['option', i, d]),
    runItemAction: (id, action) => {
      calls.push(['action', id, action]);
      if (action === 'eat') bag.items = bag.items.filter((x) => x !== 'yeot'); // last one eaten
      return `did ${action} ${id}`;
    },
    openChanged: (o) => calls.push(['open', o]),
  };
  const store = new MenuStore(() => ctx, host);
  const press = (...inputs) => inputs.forEach((i) => store.press(i));
  const s = () => store.getSnapshot();
  return { store, press, s, calls, ctx, bag };
}
const named = (calls, name) => calls.filter((c) => c[0] === name);

test('START opens the field menu and closes the whole system from any depth', () => {
  const { store, press, s, calls } = rig();
  store.toggleStart();
  assert.deepEqual(s().stack, ['field']);
  press('down', 'confirm');               // field → Bag
  press('confirm');                       // Bag → item actions
  assert.deepEqual(s().stack, ['field', 'bag']);
  assert.ok(s().popup);
  press('start');                         // START: everything closes at once
  assert.equal(s().open, false);
  assert.equal(s().popup, null);
  assert.deepEqual(named(calls, 'open'), [['open', true], ['open', false]]);
});

test('field cursor moves, wraps, and is remembered after the menu closes', () => {
  const { store, press, s } = rig();
  store.open();
  press('up');
  assert.equal(s().field, FIELD_IDS.length - 1);   // wraps to Resume
  press('down');
  assert.equal(s().field, 0);
  press('down', 'down', 'down');
  assert.equal(s().field, IDX.emotes);
  press('back');                                   // field menu → gameplay
  assert.equal(s().open, false);
  store.open();
  assert.equal(s().field, IDX.emotes);             // still on Emotes
});

test('Back returns exactly one level: item actions → Bag → Field → gameplay', () => {
  const { store, press, s } = rig();
  store.open();
  press('down', 'confirm', 'confirm');             // field → Bag → popup
  assert.ok(s().popup);
  press('back');
  assert.equal(s().popup, null);
  assert.deepEqual(s().stack, ['field', 'bag']);
  press('back');
  assert.deepEqual(s().stack, ['field']);
  assert.equal(s().field, IDX.bag);                // field cursor preserved on "Bag"
  press('back');
  assert.equal(s().open, false);
});

test('Bag opened straight from B / the HUD closes to gameplay, not to a field menu', () => {
  const { store, press, s } = rig();
  store.open('bag');
  assert.deepEqual(s().stack, ['bag']);
  press('back');
  assert.equal(s().open, false);
  store.open('bag');
  press('bag');                                    // B toggles the bag
  assert.equal(s().open, false);
});

test('opening the Bag from the field menu with B or the HUD pushes a level', () => {
  const { store, press, s } = rig();
  store.open();
  press('bag');
  assert.deepEqual(s().stack, ['field', 'bag']);
  store.open('bag');                               // already there: no extra level
  assert.deepEqual(s().stack, ['field', 'bag']);
});

test('each pocket remembers its selected item; the pocket itself survives closing the menu', () => {
  const { store, press, s, ctx } = rig();
  store.open('bag');
  press('down');                                   // Items: row 1 (rice_sack)
  assert.equal(selectedItem(s(), ctx), 'rice_sack');
  press('right', 'down', 'down');                  // Fish: row 2 (clams)
  assert.equal(activePocket(s(), ctx), 'fish');
  assert.equal(selectedItem(s(), ctx), 'clams');
  press('left');                                   // back to Items: still rice_sack
  assert.equal(selectedItem(s(), ctx), 'rice_sack');
  press('right');
  assert.equal(selectedItem(s(), ctx), 'clams');
  press('back');
  store.open('bag');                               // reopen later
  assert.equal(activePocket(s(), ctx), 'fish');
  assert.equal(selectedItem(s(), ctx), 'clams');
});

test('pockets wrap both ways and an empty pocket has nothing to select or open', () => {
  const { store, press, s, ctx } = rig();
  store.open('bag');
  press('left');
  assert.equal(activePocket(s(), ctx), 'key');
  press('right');
  assert.equal(activePocket(s(), ctx), 'items');
  press('right', 'right');                         // → Cards (empty)
  assert.equal(activePocket(s(), ctx), 'cards');
  assert.equal(selectedItem(s(), ctx), null);
  press('down', 'confirm');
  assert.equal(s().popup, null);
});

test('while the action menu is open the lists underneath do not respond', () => {
  const { store, press, s, ctx } = rig();
  store.open('bag');
  press('confirm');                                // popup on yeot: [Eat, Check, Cancel]
  const before = { pocket: s().pocket, row: selectedRow(s(), ctx) };
  press('left', 'right');                          // must be ignored
  assert.equal(s().pocket, before.pocket);
  press('down');                                   // moves the POPUP cursor only
  assert.equal(s().popup.cursor, 1);
  assert.equal(selectedRow(s(), ctx), before.row);
  press('down', 'down');                           // Cancel, then wraps to Eat
  assert.equal(s().popup.cursor, 0);
});

test('a valid item action changes game state, shows feedback, and returns to the same item', () => {
  const { store, press, s, calls, ctx } = rig();
  store.open('bag');
  press('right', 'down');                          // Fish → eel
  press('confirm');                                // popup: [Check, Cancel]
  assert.deepEqual([...s().popup.actions], ['check']);
  press('confirm');                                // Check
  assert.deepEqual(named(calls, 'action'), [['action', 'eel', 'check']]);
  assert.equal(s().feedback, 'did check eel');
  assert.equal(s().popup, null);
  assert.equal(activePocket(s(), ctx), 'fish');
  assert.equal(selectedItem(s(), ctx), 'eel');
  press('down');                                   // any input clears the message
  assert.equal(s().feedback, null);
});

test('Cancel closes only the action menu', () => {
  const { store, press, s, calls } = rig();
  store.open('bag');
  press('down', 'confirm');                        // rice_sack → [Check, Cancel]
  press('down', 'confirm');                        // Cancel
  assert.equal(s().popup, null);
  assert.deepEqual(s().stack, ['bag']);
  assert.equal(named(calls, 'action').length, 0);
});

test('eating the last one clamps the cursor to a real row', () => {
  const { store, press, s, ctx } = rig();
  store.open('bag');
  press('confirm');                                // yeot popup: Eat first
  press('confirm');                                // Eat → yeot is gone
  assert.equal(s().feedback, 'did eat yeot');
  assert.equal(selectedItem(s(), ctx), 'rice_sack');
  assert.equal(selectedRow(s(), ctx), 0);
});

test('emotes: pick one → menu closes; Back returns to the field menu with the cursor remembered', () => {
  const { store, press, s, calls } = rig();
  store.open();
  press('down', 'down', 'down', 'confirm');        // Emotes
  assert.deepEqual(s().stack, ['field', 'emotes']);
  press('down', 'down');
  press('back');
  assert.deepEqual(s().stack, ['field']);
  assert.equal(s().field, IDX.emotes);
  press('confirm');
  assert.equal(s().emotes, 2);                     // remembered
  press('confirm');
  assert.deepEqual(named(calls, 'emote'), [['emote', 2]]);
  assert.equal(s().open, false);
});

test('options: left/right/confirm change the setting under the cursor and refresh the view', () => {
  const { store, press, s, calls } = rig();
  store.open();
  press('down', 'down', 'down', 'down', 'confirm'); // Options
  assert.deepEqual(s().stack, ['field', 'options']);
  const t0 = s().tick;
  press('down', 'left', 'right', 'confirm');
  assert.deepEqual(named(calls, 'option'), [['option', 1, -1], ['option', 1, 1], ['option', 1, 1]]);
  assert.equal(s().tick, t0 + 3);
  assert.deepEqual(s().stack, ['field', 'options']);
});

test('sections that live outside the screen close the menu and fire once', () => {
  for (const [id, call] of [['fishbook', 'fishbook'], ['name', 'name'], ['help', 'help']]) {
    const { store, press, s, calls } = rig();
    store.open();
    for (let i = 0; i < IDX[id]; i++) press('down');
    press('confirm');
    assert.equal(s().open, false, id);
    assert.equal(named(calls, call).length, 1, id);
  }
  const { store, press, s } = rig();
  store.open();
  press('up', 'confirm');                          // Resume
  assert.equal(s().open, false);
});

test('mouse/touch: pointing moves the focused list, pointing + confirm opens', () => {
  const { store, s, calls } = rig();
  store.open();
  store.point(IDX.bag, false);
  assert.equal(s().field, IDX.bag);
  assert.deepEqual(named(calls, 'sfx').at(-1), ['sfx', 'move']);
  const n = calls.length;
  store.point(IDX.bag, false);                     // same row: silent
  assert.equal(calls.length, n);
  store.point(IDX.bag, true);
  assert.deepEqual(s().stack, ['field', 'bag']);
  store.point(1, true);                            // rice_sack → popup
  assert.equal(s().popup.itemId, 'rice_sack');
  store.point(1, false);                           // popup row 1 = Cancel
  assert.equal(s().popup.cursor, 1);
});

test('reduce on a closed menu does nothing', () => {
  const { ctx } = rig();
  const st = createInitialState();
  const r = reduce(st, 'confirm', ctx);
  assert.equal(r.state, st);
  assert.equal(r.effects.length, 0);
});

// ---- input ------------------------------------------------------------------

test('keys map to the same roles the old menus used', () => {
  const k = (code) => menuInputFromKey({ code, key: '' });
  assert.equal(k('ArrowUp'), 'up');
  assert.equal(k('KeyS'), 'down');
  assert.equal(k('KeyA'), 'left');
  assert.equal(k('ArrowRight'), 'right');
  for (const c of ['Enter', 'NumpadEnter', 'KeyZ', 'KeyE', 'KeyO']) assert.equal(k(c), 'confirm', c);
  for (const c of ['KeyX', 'Escape']) assert.equal(k(c), 'back', c);
  for (const c of ['KeyM', 'KeyP', 'Backquote']) assert.equal(k(c), 'start', c);
  assert.equal(k('KeyB'), 'bag');
  assert.equal(k('KeyQ'), null);
  assert.equal(menuInputFromKey({ code: 'KeyM', key: 'm', metaKey: true }), null);
});

test('held keys: arrows repeat at a menu pace, confirm/back/start never repeat', () => {
  const g = new KeyGate();
  assert.equal(g.accept('down', false, 1000), true);
  assert.equal(g.accept('down', true, 1010), false);
  assert.equal(g.accept('down', true, 1000 + KEY_REPEAT_MS), true);
  assert.equal(g.accept('confirm', true, 5000), false);
  assert.equal(g.accept('confirm', false, 5000), true);
});

test('D-pad: ONE step per press however many events arrive, then repeat while held', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const seen = [];
  const pad = new DpadAdapter((i) => seen.push(i));
  for (let n = 0; n < 20; n++) pad.feed(0, 1);     // a finger resting on "down"
  assert.deepEqual(seen, ['down']);
  t.mock.timers.tick(DPAD_REPEAT_DELAY_MS - 1);
  assert.deepEqual(seen, ['down']);
  t.mock.timers.tick(1);                           // the hold delay is over: repeating starts
  t.mock.timers.tick(DPAD_REPEAT_EVERY_MS * 2);
  assert.deepEqual(seen, ['down', 'down', 'down']);
  pad.feed(0, 0);                                  // released
  t.mock.timers.tick(2000);
  assert.equal(seen.length, 3);
  pad.feed(1, 0);                                  // new press → one more step
  assert.deepEqual(seen.at(-1), 'right');
  pad.feed(-1, 1);                                 // diagonal counts as vertical
  assert.deepEqual(seen.at(-1), 'down');
  pad.reset();                                     // menu closed under the finger
  t.mock.timers.tick(5000);
  assert.equal(seen.length, 5);
});

test('D-pad dead zone and axis choice', () => {
  assert.equal(directionFromDpad(0, 0), null);
  assert.equal(directionFromDpad(0.3, -0.3), null);
  assert.equal(directionFromDpad(-1, 0), 'left');
  assert.equal(directionFromDpad(1, -1), 'up');
});
