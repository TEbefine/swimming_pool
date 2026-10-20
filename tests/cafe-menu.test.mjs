import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRINKS, CATEGORIES, MAX_CUPS, ICED_EXTRA, OAT_EXTRA,
  defaultLine, drinkById, unitPrice, linePrice, orderTotal, cupCount,
  addLine, setLineQty, lineName, lineOptions, readBackLine,
} from '../src/game/cafe/cafeMenu.ts';

const line = (id, patch = {}) => ({ ...defaultLine(drinkById(id)), ...patch });

test('every drink is valid: known category, a default temperature, a price, 1+ colour layers', () => {
  const cats = new Set(CATEGORIES.map((c) => c.id));
  const ids = new Set();
  for (const d of DRINKS) {
    assert.ok(cats.has(d.category), d.id);
    assert.ok(d.temps.length >= 1 && d.temps.length <= 2, d.id);
    assert.ok(d.price > 0 && Number.isInteger(d.price), d.id);
    assert.ok(d.layers.length >= 1, d.id);
    assert.ok(d.strength >= 0 && d.strength <= 5, d.id);
    assert.ok(!ids.has(d.id), `duplicate ${d.id}`);
    ids.add(d.id);
  }
});

test('prices: iced costs extra only when the drink comes both ways; oat milk only for milk drinks', () => {
  assert.equal(unitPrice(line('latte')), 70);
  assert.equal(unitPrice(line('latte', { temp: 'iced' })), 70 + ICED_EXTRA);
  assert.equal(unitPrice(line('latte', { temp: 'iced', milk: 'oat' })), 70 + ICED_EXTRA + OAT_EXTRA);
  assert.equal(unitPrice(line('oliang')), 45); // iced-only: already included
  assert.equal(unitPrice(line('americano', { milk: 'oat' })), 60); // no milk choice → no oat charge
  assert.equal(linePrice(line('latte', { qty: 3 })), 210);
});

test('the same cup with the same options merges into one basket row', () => {
  let b = addLine([], line('latte', { temp: 'iced' }));
  b = addLine(b, line('latte', { temp: 'iced' }));
  b = addLine(b, line('latte', { temp: 'hot' }));
  assert.equal(b.length, 2);
  assert.equal(b[0].qty, 2);
  assert.equal(cupCount(b), 3);
  assert.equal(orderTotal(b), 2 * 80 + 70);
});

test('the basket never holds more than MAX_CUPS; qty 0 removes the row', () => {
  let b = addLine([], line('drip', { qty: MAX_CUPS - 1 }));
  b = addLine(b, line('cocoa', { qty: 3 }));
  assert.equal(cupCount(b), MAX_CUPS);
  assert.equal(addLine(b, line('espresso')), b);
  b = setLineQty(b, 0, 99);
  assert.equal(cupCount(b), MAX_CUPS);
  b = setLineQty(b, 1, 0);
  assert.equal(b.length, 1);
});

test('names and the barista read-back', () => {
  assert.equal(lineName(line('latte', { temp: 'iced' })), 'Iced Latte');
  assert.equal(lineName(line('oliang')), 'Oliang');
  assert.equal(lineOptions(line('espresso')), '');
  assert.equal(lineOptions(line('latte', { milk: 'oat', sweet: 25 })), 'Oat milk · 25% sweet');
  assert.equal(readBackLine(line('latte', { temp: 'iced', milk: 'oat', sweet: 25 })), 'One Iced Latte, oat milk, 25% sweet.');
  assert.equal(readBackLine(line('espresso', { qty: 2 })), 'Two Espressos.');
  assert.equal(readBackLine(line('americano', { sweet: 0 })), 'One Hot Americano, no sugar.');
});
