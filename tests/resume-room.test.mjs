// Resume where you left off: back soon → the same map; away long → the day's default.
import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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
const { rooms, getRoomForToday, rememberRoom, resumableRoom, RESUME_ROOM } = await import('../src/game/rooms/index.ts');

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const WED_NOON = new Date(Date.UTC(2026, 9, 28, 5, 0)); // Wednesday 12:00 Bangkok
const H = 3600_000;
const at = (ms) => new Date(WED_NOON.getTime() + ms);

test('no saved room → the day\'s default', () => {
  assert.equal(getRoomForToday(WED_NOON, mem()).roomId, 'cafe');
});

test('back within 6 hours → the room you left (Quiet Bay)', () => {
  const s = mem();
  rememberRoom('lake_pier', WED_NOON.getTime(), s);
  assert.equal(getRoomForToday(at(10 * 60_000), s).roomId, 'lake_pier');
  assert.equal(getRoomForToday(at(RESUME_ROOM.withinMs), s).roomId, 'lake_pier', 'exactly 6 h still resumes');
});

test('away longer than 6 hours → the default again', () => {
  const s = mem();
  rememberRoom('lake_pier', WED_NOON.getTime(), s);
  assert.equal(getRoomForToday(at(RESUME_ROOM.withinMs + 1), s).roomId, 'cafe');
});

test('never resumes into a story room, an unknown room, a future time or junk', () => {
  const s = mem();
  rememberRoom('dalbit_yard', WED_NOON.getTime(), s);
  assert.equal(s.m.size, 0, 'story rooms are not even saved');
  s.setItem(RESUME_ROOM.key, JSON.stringify({ id: 'dalbit_yard', at: WED_NOON.getTime() }));
  assert.equal(resumableRoom(at(H), s), null);
  s.setItem(RESUME_ROOM.key, JSON.stringify({ id: 'no_such_room', at: WED_NOON.getTime() }));
  assert.equal(resumableRoom(at(H), s), null);
  s.setItem(RESUME_ROOM.key, JSON.stringify({ id: 'lake_pier', at: WED_NOON.getTime() + H }));
  assert.equal(resumableRoom(WED_NOON, s), null, 'a saved time in the future is ignored');
  for (const junk of ['{', 'null', '7', '{"id":5,"at":1}']) { s.setItem(RESUME_ROOM.key, junk); assert.equal(resumableRoom(at(H), s), null, junk); }
  assert.equal(getRoomForToday(at(H), null).roomId, 'cafe', 'no storage at all still works');
});

test('a room that is closed right now is not resumed', () => {
  const closed = Object.values(rooms).find((r) => r.schedule === 'weekends');
  if (!closed) return; // nothing scheduled in this build
  const s = mem();
  rememberRoom(closed.roomId, WED_NOON.getTime(), s);
  assert.equal(resumableRoom(at(H), s), null, `${closed.roomId} is closed on a Wednesday`);
});
