import test from 'node:test';
import assert from 'node:assert/strict';
import { bangkokHour } from '../src/game/world/cityView.ts';

test('the lighting clock formats once per minute and advances across midnight', (t) => {
  const formatter = t.mock.method(Intl.DateTimeFormat.prototype, 'formatToParts');
  assert.equal(bangkokHour(new Date('2027-01-02T16:59:01Z')), 23 + 59 / 60);
  assert.equal(bangkokHour(new Date('2027-01-02T16:59:59Z')), 23 + 59 / 60);
  assert.equal(formatter.mock.callCount(), 1);
  assert.equal(bangkokHour(new Date('2027-01-02T17:00:00Z')), 0);
  assert.equal(formatter.mock.callCount(), 2);
  assert.equal(bangkokHour(new Date('2027-01-02T16:59:30Z')), 23 + 59 / 60);
  assert.equal(formatter.mock.callCount(), 3);
});

test('the default clock reads current time without formatting each frame', (t) => {
  const formatter = t.mock.method(Intl.DateTimeFormat.prototype, 'formatToParts');
  const now = t.mock.method(Date, 'now', () => Date.parse('2027-02-03T05:34:01Z'));
  assert.equal(bangkokHour(), 12 + 34 / 60);
  now.mock.mockImplementation(() => Date.parse('2027-02-03T05:34:59Z'));
  assert.equal(bangkokHour(), 12 + 34 / 60);
  assert.equal(formatter.mock.callCount(), 1);
});

test('URL lighting changes override room time immediately without stale cached values', (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const location = { search: '?hour=19.5' };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  });
  const formatter = t.mock.method(Intl.DateTimeFormat.prototype, 'formatToParts');
  const now = new Date('2027-03-04T05:00:00Z');
  assert.equal(bangkokHour(now, 8), 19.5);
  location.search = '?hour=25.5';
  assert.equal(bangkokHour(now, 8), 1.5);
  location.search = '?hour=invalid';
  assert.equal(bangkokHour(now, 8), 8);
  location.search = '?hour=Infinity';
  assert.equal(bangkokHour(now, 9), 9);
  location.search = '';
  assert.equal(bangkokHour(now, 10), 10);
  assert.equal(formatter.mock.callCount(), 0);
  assert.equal(bangkokHour(now), 12);
  assert.equal(formatter.mock.callCount(), 1);
});
