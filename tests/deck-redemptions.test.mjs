import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { FISHING_DECK: C } = await import('../src/game/fishing/deckConfig.ts');
const { readPaidDecks, checkRedemptionWindow, markPaidTickets } = await import('../server/saves/deckRedemptions.ts');
const NOW = Date.UTC(2026, 9, 29, 5), D = Math.floor(NOW / C.windowMs);
const ctx = { now: NOW, redeemFromDeckId: D - 1 };
const t = (castIndex, deckId = D) => ({ version: C.version, deckId, castIndex });
const slot = (deckId = D, bits = Buffer.alloc(C.casts / 8).toString('base64')) => ({ version: C.version, deckId, bits });

test('paid bits distinguish boundary indices and preserve all earlier payments', () => {
  const tickets = [0, 1, 7, 8, 255, 256, C.casts - 1].map(i => t(i));
  const marked = markPaidTickets(undefined, tickets, ctx);
  assert.equal(marked.length, 2); const bytes = Buffer.from(marked.find(s => s.deckId === D).bits, 'base64');
  for (let i = 0; i < C.casts; i++) assert.equal(!!(bytes[Math.floor(i / 8)] & (1 << (i % 8))), tickets.some(v => v.castIndex === i));
  const before = structuredClone(marked);
  for (const ticket of tickets) assert.throws(() => markPaidTickets(marked, [ticket], ctx), e => e.code === 'already_paid');
  assert.deepEqual(marked, before);
  const next = markPaidTickets(marked, [t(9)], ctx);
  assert.notDeepEqual(next, marked); assert.deepEqual(marked, before);
});

test('two devices and in-batch duplicates use deck identity, with no timestamp identity or gap', () => {
  assert.throws(() => markPaidTickets(undefined, [t(4), t(4)], ctx), e => e.code === 'duplicate');
  let marked = markPaidTickets(undefined, [t(4)], ctx);
  assert.throws(() => markPaidTickets(marked, [t(4)], ctx), e => e.code === 'already_paid');
  marked = markPaidTickets(marked, [t(5), t(4, D - 1)], ctx);
  assert.equal(readPaidDecks(marked, NOW).ok, true);
});

test('activation is fixed/injected and fails closed; only current/previous windows can redeem', () => {
  for (const missing of [null, undefined]) assert.throws(() => checkRedemptionWindow(t(0), { now: NOW, redeemFromDeckId: missing }), e => e.code === 'inactive');
  assert.throws(() => checkRedemptionWindow(t(0, D - 1), { now: NOW, redeemFromDeckId: D }), e => e.code === 'before_activation');
  assert.throws(() => checkRedemptionWindow(t(0, D + 1), ctx), e => e.code === 'outside_window');
  assert.throws(() => checkRedemptionWindow(t(0, D - 2), { now: NOW, redeemFromDeckId: 0 }), e => e.code === 'outside_window');
  for (const ticket of [t(0), t(0, D - 1)]) assert.doesNotThrow(() => checkRedemptionWindow(ticket, ctx));
  for (const ticket of [t(-1), t(1.5), t(C.casts), { ...t(0), version: 1 }, { ...t(0), deckId: NaN }]) assert.throws(() => checkRedemptionWindow(ticket, ctx), e => e.code === 'invalid_ticket');
  assert.throws(() => checkRedemptionWindow(t(0), { now: NOW, redeemFromDeckId: -1 }), e => e.code === 'invalid_state');
});

test('rotation retains the whole previous window, ignores request order and does not reset at Bangkok midnight', () => {
  const initial = markPaidTickets(undefined, [t(8191), t(0, D - 1)], ctx), before = structuredClone(initial);
  const edge = (D + 1) * C.windowMs;
  for (const at of [edge - 1, NOW]) assert.equal(readPaidDecks(initial, at).windows.length, 2);
  const rotated = markPaidTickets(initial, [t(3, D + 1), t(4, D)], { now: edge, redeemFromDeckId: D - 1 });
  assert.deepEqual(rotated.map(s => s.deckId), [D, D + 1]);
  assert.throws(() => markPaidTickets(rotated, [t(8191)], { now: edge, redeemFromDeckId: D - 1 }), e => e.code === 'already_paid');
  assert.deepEqual(initial, before);
  const midnight = Date.UTC(2026, 9, 29, 17); // 00:00 Bangkok, not a UTC deck boundary
  const md = Math.floor(midnight / C.windowMs), midnightCtx = { now: midnight - 1, redeemFromDeckId: md - 1 };
  const paid = markPaidTickets(undefined, [t(1, md)], midnightCtx);
  assert.throws(() => markPaidTickets(paid, [t(1, md)], { ...midnightCtx, now: midnight }), e => e.code === 'already_paid');
});

test('unsafe active markers never become empty; malformed retired slots cannot erase a live slot', () => {
  assert.deepEqual(readPaidDecks(undefined, NOW), { ok: true, windows: [] });
  for (const raw of [null, {}, [slot(), slot()], [slot(), slot(D - 1), slot(D - 2)], [slot(D + 1)],
    [{ ...slot(), version: 1 }], [slot(D, 'bad')], [slot(D, Buffer.alloc(1023).toString('base64'))], [{ ...slot(), extra: true }], [{ bits: slot().bits }]]) {
    assert.deepEqual(readPaidDecks(raw, NOW), { ok: false, reason: 'invalid_state' });
    assert.throws(() => markPaidTickets(raw, [t(0)], ctx), e => e.code === 'invalid_state');
  }
  const live = markPaidTickets(undefined, [t(7)], ctx).find(s => s.deckId === D);
  const read = readPaidDecks([{ deckId: D - 2, bits: 'obsolete-invalid', version: -1 }, live], NOW);
  assert.equal(read.ok, true); assert.deepEqual(read.windows, [live]);
  assert.throws(() => markPaidTickets(read.windows, [t(7)], ctx), e => e.code === 'already_paid');
});

test('two bitmaps have a fixed serialized bound, with pure errors/no partial updates', () => {
  const paid = markPaidTickets(undefined, [t(0)], ctx), before = structuredClone(paid);
  assert.equal(paid.reduce((n, s) => n + Buffer.from(s.bits, 'base64').length, 0), 2048);
  assert.equal(paid.reduce((n, s) => n + s.bits.length, 0), 2736);
  assert.ok(Buffer.byteLength(JSON.stringify(paid)) < 3072);
  assert.throws(() => markPaidTickets(paid, [t(5), t(0)], ctx), e => e.code === 'already_paid');
  assert.deepEqual(paid, before);
  assert.throws(() => markPaidTickets(paid, [], ctx), e => e.code === 'invalid_ticket');
  assert.deepEqual(readPaidDecks(paid, (D + 2) * C.windowMs), { ok: true, windows: [] });
});
