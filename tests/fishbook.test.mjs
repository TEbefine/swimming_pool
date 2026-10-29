import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { FISH_BOOK, FISH_BOOK_KINDS, FISH_BOOK_BY_ID } = await import('../src/game/fishing/fishBookConfig.ts');
const { readVerifiedFishBook, verifiedFishBookView, recordVerifiedPaidFish } = await import('../server/saves/fishBook.ts');
const sold = (best, count = 1) => ({ best, sold: count });

test('Book config has exactly the 27 supported sellable kinds and the approved star settings', () => {
  assert.deepEqual(FISH_BOOK.starSales, { common: 25, rare: 12, epic: 6, legend: 3 });
  assert.equal(FISH_BOOK.strikeWindowMultiplier, 1.15);
  assert.equal(FISH_BOOK_KINDS.length, 27);
  assert.deepEqual(Object.fromEntries(Object.keys(FISH_BOOK.starSales).map(t => [t, FISH_BOOK_KINDS.filter(f => f.tier === t).length])), { common: 5, rare: 6, epic: 8, legend: 8 });
  for (const id of ['fossil_fish', 'sun_carp', 'moon_whale', 'bottle_message', 'treasure_chest', 'yellowtail', 'sea_turtle']) assert.equal(Object.hasOwn(FISH_BOOK_BY_ID, id), false);
  assert.equal(new Set(FISH_BOOK_KINDS.map(f => f.id)).size, 27);
  assert.ok(Object.isFrozen(FISH_BOOK) && Object.isFrozen(FISH_BOOK.starSales) && Object.isFrozen(FISH_BOOK_KINDS));
  assert.throws(() => { FISH_BOOK_BY_ID.sardine.size[0] = 0; }, TypeError);
});

test('a fresh Book is empty; presence after the first verified paid line consists only of best and sold', () => {
  assert.deepEqual(readVerifiedFishBook(undefined), { ok: true, state: {} });
  assert.deepEqual(verifiedFishBookView({}), { fishBook: {}, totalKinds: 27 });
  assert.deepEqual(recordVerifiedPaidFish(undefined, [{ fishId: 'sardine', sizeCm: 15 }]), { sardine: { best: 15, sold: 1 } });
});

test('verified paid lines increment lifetime sold and max best without mutating input or taking claimed counts', () => {
  const original = { sardine: sold(18, 4) }, before = structuredClone(original);
  const next = recordVerifiedPaidFish(original, [{ fishId: 'sardine', sizeCm: 15, sold: 999 }, { fishId: 'sardine', sizeCm: 22 }, { fishId: 'coelacanth', sizeCm: 150 }]);
  assert.deepEqual(next, { sardine: sold(22, 6), coelacanth: sold(150) });
  assert.deepEqual(original, before);
  for (const paid of [[], [{ fishId: 'bottle_message', sizeCm: 1 }], [{ fishId: 'sardine', sizeCm: 99 }], [{ fishId: 'sardine', sizeCm: 15.5 }], [{ fishId: '__proto__', sizeCm: 1 }], Array(21).fill({ fishId: 'sardine', sizeCm: 15 })]) {
    assert.throws(() => recordVerifiedPaidFish(original, paid), e => e.code === 'invalid_sale');
  }
  assert.deepEqual(original, before);
  assert.throws(() => recordVerifiedPaidFish({ sardine: sold(18, Number.MAX_SAFE_INTEGER) }, [{ fishId: 'sardine', sizeCm: 20 }]), e => e.code === 'count_overflow');
});

test('Book views expose best/star and never sold counts; every threshold is per-kind', () => {
  for (const id of ['sardine', 'snakehead', 'bluefin_tuna', 'coelacanth']) {
    const fish = FISH_BOOK_BY_ID[id], threshold = FISH_BOOK.starSales[fish.tier];
    for (const count of [threshold - 1, threshold, threshold + 1]) {
      const state = { [id]: sold(fish.size[0], count) };
      const view = verifiedFishBookView(state);
      assert.deepEqual(view.fishBook[id], { best: fish.size[0], starred: count >= threshold });
      assert.equal(JSON.stringify(view).includes('"sold"'), false);
      view.fishBook[id].best = -1; assert.equal(state[id].best, fish.size[0]);
    }
  }
  const view = verifiedFishBookView({ sardine: sold(18, 25), tilapia: sold(20, 1) });
  assert.equal(view.fishBook.sardine.starred, true); assert.equal(view.fishBook.tilapia.starred, false);
});

test('malformed Book entries cannot display as found or accept further paid updates', () => {
  for (const raw of [null, [], { sardine: sold(99) }, { sardine: sold(18, 0) }, { sardine: sold(18, 1.5) },
    { sardine: { ...sold(18), extra: true } }, { sun_carp: sold(150) }, { sardine: { best: 18 } }]) {
    const before = structuredClone(raw);
    assert.deepEqual(readVerifiedFishBook(raw), { ok: false, reason: 'invalid_state' });
    assert.deepEqual(verifiedFishBookView(raw).fishBook, {});
    assert.throws(() => recordVerifiedPaidFish(raw, [{ fishId: 'sardine', sizeCm: 15 }]), e => e.code === 'invalid_state');
    assert.deepEqual(raw, before);
  }
});

test('the maximum Book fits a bounded snapshot without per-catch history', () => {
  const fishBook = Object.fromEntries(FISH_BOOK_KINDS.map(f => [f.id, sold(f.size[1], Number.MAX_SAFE_INTEGER)]));
  assert.equal(readVerifiedFishBook(fishBook).ok, true);
  assert.ok(Buffer.byteLength(JSON.stringify(fishBook)) < 4096);
});
