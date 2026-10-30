// ECO-01 receipt slip: VAT is inside the price, one rounding rule, selling is not taxed.
import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { VAT } = await import('../src/game/economy/economyConfig.ts');
const R = await import('../src/game/economy/receipt.ts');
const W = await import('../src/game/economy/wallet.ts');
const { marketOf, isSellableFish } = await import('../src/game/economy/market.ts');
const { FREE_FISH } = await import('../src/game/fishing/freeFishCatalog.ts');

const NOON = Date.UTC(2026, 9, 27, 5, 0); // 12:00 Bangkok
let n = 0;
const ctx = (now = NOON) => ({ now, uid: () => `r${++n}` });

test('VAT 7% included: every total 1..5000 splits into net + vat with 0 <= vat < total', () => {
  assert.equal(VAT.rate, 0.07);
  for (let t = 1; t <= 5000; t++) {
    const v = R.vatIncluded(t);
    assert.ok(Number.isInteger(v) && v >= 0 && v < t, `total ${t} → vat ${v}`);
    assert.ok(Math.abs(v - (t * 0.07) / 1.07) <= 0.5, `total ${t} rounds honestly`);
  }
  assert.equal(R.vatIncluded(150), 10); // a mixed sashimi plate
  assert.equal(R.vatIncluded(15), 1); // a block of ice
  assert.equal(R.vatLabel(), 'VAT 7%');
});

test('VAT never invents coins from bad input', () => {
  for (const bad of [0, -5, NaN, Infinity, -Infinity]) assert.equal(R.vatIncluded(bad), 0, String(bad));
  assert.equal(R.vatIncluded(100, 0), 0);
});

test('buy receipt: lines and total match what buy() charged; VAT inside, balance after', () => {
  const w = { ...W.freshWallet(NOON), coins: 1000 };
  const r = W.buy(w, [{ id: 'ice_block', qty: 2 }], 'gen', ctx());
  assert.ok(r.ok);
  const slip = R.buyReceipt('gen', r.lines, r.wallet.coins, NOON);
  assert.equal(slip.kind, 'buy');
  assert.equal(slip.total, r.spent);
  assert.equal(slip.lines.reduce((s, l) => s + l.amount, 0), r.spent);
  assert.equal(slip.vat, R.vatIncluded(r.spent));
  assert.equal(slip.balance, 1000 - r.spent);
  assert.match(slip.lines[0].detail, /×2/);
});

test('sell receipt: no VAT, total equals coins earned, kept fish are explained', () => {
  const m = marketOf(NOON);
  const id = FREE_FISH.find((f) => f.tier === 'common' && isSellableFish(f) && !m.wanted.includes(f.id)).id;
  let w = W.freshWallet(NOON);
  for (let i = 0; i < 3; i++) { const a = W.addCatch(w, id, null, ctx()); assert.ok(a.ok); w = a.wallet; }
  const s = W.sellFish(w, w.cooler.map((c) => c.uid), ctx());
  assert.ok(s.ok);
  const slip = R.sellReceipt(s.sold, s.kept, s.wallet.coins, NOON);
  assert.equal(slip.vat, null);
  assert.equal(slip.total, s.earned);
  assert.equal(slip.lines.length, 3);
  assert.equal(slip.note, undefined);
  assert.match(R.sellReceipt(s.sold, 2, 0, NOON).note, /2 fish stay in your cooler/);
});

test('receipt time is Bangkok time whatever the phone says', () => {
  assert.equal(R.receiptTime(Date.UTC(2026, 9, 28, 10, 42)), '28 Oct · 17:42');
  assert.equal(R.receiptTime(Date.UTC(2026, 9, 28, 17, 5)), '29 Oct · 00:05'); // past Bangkok midnight
});

// Server tier caps use the existing Gen receipt, without changing counters or buyer roles.
test('tier-kept receipt uses Gen’s trophy line alongside spoiled/daily-cap reasons', () => {
  const slip = R.sellReceipt([], [{ reason: 'tier_cap' }, { reason: 'spoiled' }, { reason: 'daily_cap' }], 0, NOON);
  assert.equal(slip.vendor, 'gen');
  assert.match(slip.note, /I can’t take another trophy today/);
  assert.match(slip.note, /1 fish went bad/);
  assert.match(slip.note, /1 fish stay in your cooler/);
  assert.equal(R.keptNote([{ reason: 'tier_cap' }]), 'I can’t take another trophy today');
});
