import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './register-api-ts.mjs';
import { fixtureCatch } from './fishing-fixtures.mjs';
import { saleHarness, NOON, operationId } from './sale-harness.mjs';
const { makeSaveServices } = await import('../server/saves/admin.ts');
const { emptyPlayer } = await import('../server/saves/rules.ts');
const { FISHING_DECK: C } = await import('../src/game/fishing/deckConfig.ts');
const { quoteFish, marketOf } = await import('../src/game/economy/market.ts');
const { SELL, ECONOMY_SAVE } = await import('../src/game/economy/economyConfig.ts');
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host ?? '', /^127\.0\.0\.1:\d+$/, 'Rules tests require the local emulator and never production');
const [hostname, port] = host.split(':');
const env = await initializeTestEnvironment({ projectId: 'demo-lumen-bay', firestore: {
  host: hostname, port: Number(port), rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
} });
try {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'config/economy'), {open:true});
    await setDoc(doc(context.firestore(), 'players/alice'), { test: true });
    await setDoc(doc(context.firestore(), 'players/bob'), { test: true });
    await setDoc(doc(context.firestore(), 'usedNonces/test'), { usedAt: 1 });
    await setDoc(doc(context.firestore(), 'players/alice/log/op-1'), { op: 'shop.sell' });
    await setDoc(doc(context.firestore(), 'players/bob/log/op-1'), { op: 'shop.sell' });
  });
  await test('owner can read their document; other player, anonymous, all writes and server nonce records are denied', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    const anonymous = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(alice, 'players/alice')));
    await assertFails(getDoc(doc(alice, 'players/bob')));
    await assertFails(getDoc(doc(anonymous, 'players/alice')));
    await assertFails(setDoc(doc(alice, 'players/alice'), { test: false }));
    await assertFails(deleteDoc(doc(alice, 'players/alice')));
    await assertFails(setDoc(doc(alice, 'players/bob'), { test: false }));
    await assertFails(getDoc(doc(alice, 'usedNonces/test')));
    await assertFails(setDoc(doc(alice, 'usedNonces/test'), { usedAt: 2 }));
    // ID-01 (c): the owner may read their own save log; nobody else, and nobody writes it.
    await assertSucceeds(getDoc(doc(alice, 'players/alice/log/op-1')));
    await assertFails(getDoc(doc(alice, 'players/bob/log/op-1')));
    await assertFails(getDoc(doc(anonymous, 'players/alice/log/op-1')));
    await assertFails(setDoc(doc(alice, 'players/alice/log/op-1'), { op: 'rewritten' }));
    await assertFails(setDoc(doc(alice, 'players/alice/log/op-2'), { op: 'forged' }));
    await assertFails(deleteDoc(doc(alice, 'players/alice/log/op-1')));
    await assertFails(getDoc(doc(alice, 'anything/test')));
  });
  await test('Firestore create-only nonce consumption rejects a simultaneous replay', async () => {
    // Explicit demo project + emulator; no service account or real ADC is supplied.
    const app = initializeApp({ projectId: 'demo-lumen-bay' }, 'rules-replay-test');
    try {
      const reference = getFirestore(app).doc('usedNonces/race-fixture');
      const results = await Promise.allSettled([
        reference.create({ expiresAt: 100, usedAt: 1 }), reference.create({ expiresAt: 100, usedAt: 1 }),
      ]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.find(r => r.status === 'rejected').reason.code, 6);
    } finally { await deleteApp(app); }
  });
  await test('shop.buy and bag.use: competing spends cannot double-spend coins or the last ice', async () => {
    await import('./register-api-ts.mjs');
    const { makeSaveServices } = await import('../server/saves/admin.ts');
    const { createItemsHandler, DailyLimiter } = await import('../server/saves/handlers.ts');
    const { IpLimiter } = await import('../server/identity/http.ts');
    const app = initializeApp({ projectId: 'demo-lumen-bay' }, 'buy-use-tx-test');
    try {
      const address = '0x' + 'da'.repeat(20);
      const other = '0x' + 'fe'.repeat(20);
      const origin = 'https://test-lumen-bay.vercel.app';
      const now = Date.UTC(2026, 9, 10, 5, 0);
      const db = getFirestore(app);
      await db.doc(`players/${other}`).set({ coins: 77 });
      const services = makeSaveServices(() => db, () => ({
        verifyIdToken: async () => ({ uid: address, walletSignedInAt: now - 1000, walletLoginOrigin: origin }),
      }));
      const handler = createItemsHandler({ env: { VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app', ECONOMY_API: 'on' },
        now: () => now, limiter: new IpLimiter(1000), playerLimiter: new IpLimiter(1000), playerDaily: new DailyLimiter(1000) }, services);
      const call = async body => {
        body={econEpoch:1,...body};
        const req = { method: 'POST', body, socket: { remoteAddress: '127.0.0.1' },
          headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.9', authorization: 'Bearer emulator-test-token-0123456789' } };
        const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = JSON.parse(v); } };
        await handler(req, res); return res;
      };
      const ref = db.doc(`players/${address}`);
      await ref.set({...emptyPlayer(now), coins: 30 });
      const race = await Promise.all([1,2].map(i => call({op:'shop.buy',operationId:`op-buy-race-00000${i}`,vendor:'gen',cart:[{id:'nori',qty:1}],expectedTotal:30})));
      assert.deepEqual(race.map(r=>r.statusCode).sort(),[200,422]);
      let saved=(await ref.get()).data();
      assert.equal(saved.coins,0); assert.equal(saved.goods[0].qty,1);
      assert.equal((await ref.collection('log').get()).size,1);
      await ref.update({goods:[{uid:'last-ice',id:'ice_block',qty:1,at:now,expiresAt:null}]});
      const uses=await Promise.all([1,2].map(i=>call({op:'bag.use',operationId:`op-use-race-00000${i}`,uid:'last-ice'})));
      assert.deepEqual(uses.map(r=>r.statusCode).sort(),[200,422]);
      saved=(await ref.get()).data();
      assert.equal(saved.goods.length,0); assert.deepEqual(saved.iceUsedAt,[now]);
      assert.equal((await ref.collection('log').get()).size,2);
      await ref.update({coins:60});
      const body={op:'shop.buy',operationId:'op-buy-replay-00001',vendor:'gen',cart:[{id:'nori',qty:1}]};
      const repeats=await Promise.all([call(body),call(body)]);
      assert.ok(repeats.every(r=>r.statusCode===200));
      assert.equal(repeats.filter(r=>r.body.replayed).length,1);
      assert.deepEqual(repeats[0].body.result,repeats[1].body.result);
      assert.equal((await ref.get()).data().coins,30);
      assert.equal((await call({...body,operationId:'op-buy-foreign-0001',address:other})).statusCode,400);
      const owner=env.authenticatedContext(address).firestore();
      const stranger=env.authenticatedContext(other).firestore();
      await assertSucceeds(getDoc(doc(owner,`players/${address}`)));
      await assertFails(setDoc(doc(owner,`players/${address}`),{iceUsedAt:[now],coins:999}));
      await assertFails(getDoc(doc(stranger,`players/${address}`)));
    } finally { await deleteApp(app); }
  });
  let fixtureSeq = 0;
  async function fixture(run, start = NOON) {
    const address = '0x' + (++fixtureSeq).toString(16).padStart(40, '0');
    const app = initializeApp({ projectId: 'demo-lumen-bay' }, `verified-sales-${fixtureSeq}`), db = getFirestore(app);
    const h = saleHarness({ address, start, services: auth => makeSaveServices(() => db, () => ({ verifyIdToken: auth })) });
    const ref = db.doc(`players/${address}`);
    h.ref = ref; h.db = db;
    h.saved = async () => (await ref.get()).data();
    h.logsOnServer = async () => (await ref.collection('log').get()).docs.map(d => d.data());
    h.snapshotOnServer = async () => ({ player: await h.saved(), logs: await h.logsOnServer() });
    h.catch = (at = h.clock - 1000, options) => fixtureCatch(address, at, options);
    try { await run(h); } finally { await db.terminate(); await deleteApp(app); }
  }
  const bit = (saved, c) => !!(Buffer.from(saved.paidDecks.find(s => s.deckId === c.ticket.deckId).bits, 'base64')[c.ticket.castIndex >> 3] & 1 << (c.ticket.castIndex % 8));

  await test('absolute balance limit: reduced daily cap preserves real sale/buy/Retry balances and refuses overflow atomically', async () => {
    const oldCap = SELL.dailyCap;
    try {
      SELL.dailyCap = 3000;
      await fixture(async h => {
        await h.ref.set({ ...emptyPlayer(NOON), coins: 1_500_000 });
        const c = h.catch(), id = operationId();
        const first = await h.sell([c], id);
        assert.equal(first.statusCode, 200, JSON.stringify(first.body));
        let balance = 1_500_000 + first.body.result.earned;
        assert.equal((await h.saved()).coins, balance);
        const buy = await h.call({ op: 'shop.buy', operationId: operationId(), vendor: 'gen', cart: [{ id: 'ice_block', qty: 1 }] });
        assert.equal(buy.statusCode, 200, JSON.stringify(buy.body));
        balance -= buy.body.result.spent;
        assert.equal((await h.saved()).coins, balance);
        const before = await h.snapshotOnServer(), retry = await h.sell([c], id);
        assert.equal(retry.statusCode, 200);
        assert.equal(retry.body.replayed, true);
        assert.deepEqual(retry.body.result, first.body.result);
        assert.equal(retry.body.coins, balance);
        assert.deepEqual(await h.snapshotOnServer(), before);
        const edge = h.catch(NOON - 500, { startIndex: c.ticket.castIndex + 1 });
        const price = quoteFish({ fishId: edge.fish, sizeCm: edge.sizeCm, caughtAt: edge.caughtAt, icedMin: 0 }, NOON, marketOf(NOON), 1).price;
        await h.ref.update({ coins: ECONOMY_SAVE.maxBalance - price });
        assert.equal((await h.sell([edge])).statusCode, 200);
        assert.equal((await h.saved()).coins, 2_000_000);
        const overflow = h.catch(NOON - 250, { startIndex: edge.ticket.castIndex + 1 });
        const full = await h.snapshotOnServer();
        assert.equal((await h.sell([overflow])).statusCode, 409);
        assert.deepEqual(await h.snapshotOnServer(), full, 'no coins/Book/bits/log write on overflow');
      });
    } finally { SELL.dailyCap = oldCap; }
  });

  await test('plan 1: concurrent devices redeeming one index pay once; identical operation IDs replay one commit', async () => {
    await fixture(async h => {
      const c = h.catch(), race = await Promise.all([h.sell([c]), h.sell([c])]);
      assert.deepEqual(race.map(r => r.statusCode).sort(), [200, 409], JSON.stringify(race));
      const winner = race.find(r => r.statusCode === 200).body.result;
      let saved = await h.saved(); assert.equal(saved.coins, winner.earned); assert.equal(saved.fishBook.sardine.sold, 1); assert.ok(bit(saved, c));
      assert.equal((await h.logsOnServer()).length, 1);
      const d = h.catch(c.caughtAt, { startIndex: c.ticket.castIndex + 1 }), id = operationId();
      const retries = await Promise.all([1, 2, 3].map(() => h.sell([d], id)));
      assert.ok(retries.every(r => r.statusCode === 200), JSON.stringify(retries)); assert.equal(retries.filter(r => r.body.replayed).length, 2);
      for (const r of retries) assert.deepEqual(r.body.result, retries[0].body.result);
      saved = await h.saved(); assert.equal(saved.fishBook.sardine.sold, 2); assert.equal((await h.logsOnServer()).length, 2);
    });
  });

  await test('plan 2: concurrent distinct indices at identical timestamps accumulate best/count and cross the species star', async () => {
    await fixture(async h => {
      const c = h.catch(), d = h.catch(c.caughtAt, { startIndex: c.ticket.castIndex + 1 });
      const doc = emptyPlayer(h.clock); doc.fishBook = { sardine: { best: 12, sold: 24 } }; await h.ref.set(doc);
      const results = await Promise.all([h.sell([c]), h.sell([d])]); assert.ok(results.every(r => r.statusCode === 200), JSON.stringify(results));
      const saved = await h.saved(); assert.deepEqual(saved.fishBook.sardine, { best: Math.max(c.sizeCm, d.sizeCm), sold: 26 });
      assert.ok(bit(saved, c) && bit(saved, d)); assert.equal(saved.revision, 2);
      const load = await h.call({ op: 'load' }); assert.deepEqual(load.body.fishBook.sardine, { best: saved.fishBook.sardine.best, starred: true });
      assert.equal(Object.hasOwn(load.body.fishBook.sardine, 'sold'), false);
      const logs = await h.logsOnServer(); assert.equal(logs.length, 2); assert.equal(saved.coins, logs.reduce((n, l) => n + l.changes.earned, 0));
    });
  });

  await test('plan 3: last-ms casts, five-minute/freshness edges, confirmed ice, rollover/midnight and retired receipt replay', async () => {
    const edge = Math.ceil(NOON / C.windowMs) * C.windowMs, minute = 60000;
    await fixture(async h => {
      const c = h.catch(edge + 5 * minute - 1, { castAt: edge - 1 });
      h.clock = c.caughtAt + 59 * minute;
      const doc = emptyPlayer(h.clock); doc.iceUsedAt = [c.caughtAt + 29 * minute, c.caughtAt + 44 * minute]; await h.ref.set(doc);
      const id = operationId(), first = await h.sell([c], id); assert.equal(first.statusCode, 200, JSON.stringify(first.body));
      assert.equal(first.body.result.sold[0].fresh.id, 'tired'); assert.ok(bit(await h.saved(), c));
      const d = h.catch(h.clock - 1000), more = await h.sell([d]); assert.equal(more.statusCode, 200); assert.ok(bit(await h.saved(), c));
      h.clock = (c.ticket.deckId + 3) * C.windowMs;
      const later = h.catch(); assert.equal((await h.sell([later])).statusCode, 200);
      assert.ok(!(await h.saved()).paidDecks.some(s => s.deckId === c.ticket.deckId), 'old slot retired by server time');
      const before = await h.snapshotOnServer(); delete h.env.FISHING_DECK_SECRET; delete h.env.FISHING_DECK_REDEEM_FROM_DECK_ID;
      const retry = await h.sell([c], id); assert.equal(retry.statusCode, 200); assert.equal(retry.body.replayed, true); assert.deepEqual(retry.body.result, first.body.result);
      assert.deepEqual(await h.snapshotOnServer(), before); assert.equal((await h.sell([{ ...c, sizeCm: c.sizeCm + 1 }], id)).statusCode, 409);
    }, edge);
    // Freshness is exclusive at expiry; five-minute cast bound is inclusive. Each uses a fresh local demo save.
    for (const [duration, age, iced, expected] of [[5 * minute, 30 * minute - 1, false, 200], [5 * minute + 1, 0, false, 422],
      [1000, 30 * minute, false, 422], [1000, 60 * minute - 1, true, 200], [1000, 60 * minute, true, 422]]) {
      await fixture(async h => {
        const castAt = edge - 1, caughtAt = castAt + duration, c = h.catch(caughtAt, { castAt }); h.clock = caughtAt + age;
        const doc = emptyPlayer(h.clock); if (iced) doc.iceUsedAt = [caughtAt + 29 * minute, caughtAt + 44 * minute]; await h.ref.set(doc);
        const before = await h.snapshotOnServer(), r = await h.sell([c]); assert.equal(r.statusCode, expected, JSON.stringify({ duration, age, iced, r }));
        if (expected !== 200) assert.deepEqual(await h.snapshotOnServer(), before);
      }, edge);
    }
    const midnight = Date.UTC(2026, 9, 10, 17);
    await fixture(async h => {
      const c = h.catch(midnight - 1), doc = emptyPlayer(h.clock); doc.econ.soldToday.sardine = 9; await h.ref.set(doc);
      assert.equal((await h.sell([c])).statusCode, 200); h.clock = midnight;
      assert.equal((await h.sell([c])).statusCode, 409, 'midnight does not erase paid identity');
      const d = h.catch(midnight, { startIndex: c.ticket.castIndex + 1 }); assert.equal((await h.sell([d])).statusCode, 200);
      const saved = await h.saved(); assert.equal(saved.econ.soldToday.sardine, 1); assert.equal(saved.fishBook.sardine.sold, 2); assert.ok(bit(saved, c));
    }, midnight - 1);
  });

  await test('plan 4: competing last tier allowance/coin budget retry atomically; invalid and all-kept requests write nothing', async () => {
    for (const scenario of ['tier', 'coin']) await fixture(async h => {
      const fish = scenario === 'tier' ? 'coelacanth' : 'sardine';
      const c = h.catch(undefined, { fish }), d = h.catch(c.caughtAt, { fish, startIndex: c.ticket.castIndex + 1 });
      const doc = emptyPlayer(h.clock);
      if (scenario === 'tier') doc.econ.soldToday.armorfish = 1;
      else {
        const prices = [c, d].map(f => quoteFish({ fishId: f.fish, sizeCm: f.sizeCm, caughtAt: f.caughtAt, icedMin: 0 }, h.clock, marketOf(h.clock), 0).price);
        doc.econ.earnedToday = SELL.dailyCap - Math.max(...prices);
      }
      await h.ref.set(doc);
      const race = await Promise.all([h.sell([c]), h.sell([d])]); assert.deepEqual(race.map(r => r.statusCode).sort(), [200, 422], JSON.stringify(race));
      const winner = race.find(r => r.statusCode === 200), saved = await h.saved(); assert.equal(saved.coins, winner.body.result.earned);
      assert.equal(saved.fishBook[fish].sold, 1); assert.equal((await h.logsOnServer()).length, 1); assert.notEqual(bit(saved, c), bit(saved, d));
      const unpaid = bit(saved, c) ? d : c, before = await h.snapshotOnServer();
      assert.equal((await h.sell([unpaid])).statusCode, 422); assert.deepEqual(await h.snapshotOnServer(), before);
      const f = h.catch(undefined, { startIndex: Math.max(c.ticket.castIndex, d.ticket.castIndex) + 1 });
      assert.equal((await h.sell([f, { ...unpaid, sizeCm: 9999 }])).statusCode, 422); assert.deepEqual(await h.snapshotOnServer(), before);
    });
  });

  await test('plan 5: browser cannot forge best/sold/bits or logs; owner reads only; retired recording costs no database access', async () => {
    await fixture(async h => {
      const c = h.catch(); assert.equal((await h.sell([c])).statusCode, 200); const before = await h.snapshotOnServer();
      const owner = env.authenticatedContext(h.address).firestore(), stranger = env.authenticatedContext('stranger').firestore(), guest = env.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(owner, h.ref.path)));
      for (const patch of [{ fishBook: { sardine: { best: 999, sold: 999 } } }, { paidDecks: [] }, { coins: 999 }]) await assertFails(setDoc(doc(owner, h.ref.path), patch));
      await assertFails(getDoc(doc(stranger, h.ref.path))); await assertFails(getDoc(doc(guest, h.ref.path)));
      const logs = await h.ref.collection('log').get(), path = logs.docs[0].ref.path;
      await assertSucceeds(getDoc(doc(owner, path))); await assertFails(getDoc(doc(stranger, path)));
      await assertFails(setDoc(doc(owner, path), { changes: { earned: 999 } })); await assertFails(deleteDoc(doc(owner, path)));
      await assertFails(setDoc(doc(owner, `${h.ref.path}/log/forged`), { changes: {} }));
      assert.equal((await h.call({ op: 'fishbook.record', operationId: operationId(), catches: [c] })).statusCode, 400);
      assert.deepEqual(await h.snapshotOnServer(), before);
      const noReads = saleHarness({ services: auth => ({ verifyToken: auth, readPlayer: async () => assert.fail('no read'), transact: async () => assert.fail('no transaction') }) });
      assert.equal((await noReads.call({ op: 'fishbook.record', operationId: operationId(), catches: [c] })).statusCode, 400);
    });
  });

  await test('extra boundary: fast writer E+2 ms, slow sale worker E-2 ms refuses without losing next-slot bits; exact E blocks double pay', async () => {
    const edge = Math.ceil(NOON / C.windowMs) * C.windowMs;
    await fixture(async h => {
      // At the real boundary two workers differ by 4 ms. Commit with the fast clock first.
      h.clock = edge + 2; const future = h.catch(edge + 1, { castAt: edge }), id = operationId();
      const first = await h.sell([future], id); assert.equal(first.statusCode, 200);
      const before = await h.snapshotOnServer(); h.clock = edge - 2;
      const old = h.catch(edge - 1, { castAt: edge - 1000 });
      const blocked = await h.sell([old]); assert.equal(blocked.statusCode, 503, JSON.stringify(blocked.body));
      assert.deepEqual(await h.snapshotOnServer(), before, 'no player/log write or bitmap pruning while a slot looks future');
      const retry = await h.sell([future], id); assert.equal(retry.statusCode, 200); assert.deepEqual(retry.body.result, first.body.result);
      h.clock = edge; assert.equal((await h.sell([old])).statusCode, 200);
      const saved = await h.saved(); assert.ok(bit(saved, old)); assert.ok(bit(saved, future)); assert.deepEqual(saved.paidDecks.map(s => s.deckId), [old.ticket.deckId, future.ticket.deckId]);
      const after = await h.snapshotOnServer(); assert.equal((await h.sell([future])).statusCode, 409); assert.equal((await h.sell([old])).statusCode, 409);
      assert.deepEqual(await h.snapshotOnServer(), after); assert.equal((await h.logsOnServer()).length, 2);
    }, edge);
  });
  await test('rod purchase race: one payment/upgrade, exact Retry and forged ownership denied',async()=>{
    await fixture(async h=>{
      await h.ref.set({...emptyPlayer(h.clock),coins:2000});
      const req=()=>({op:'shop.buy',operationId:operationId(),vendor:'gen',cart:[{id:'rod_fiberglass',qty:1}]});
      const a=req(),b=req();const answers=await Promise.all([h.call(a),h.call(b)]);
      assert.equal(answers.filter(x=>x.statusCode===200).length,1);
      const saved=await h.saved();assert.equal(saved.rodLevel,1);assert.equal(saved.coins,1400);
      const winner=answers[0].statusCode===200?a:b;assert.equal((await h.call(winner)).statusCode,200);
      assert.equal((await h.saved()).coins,1400);assert.equal((await h.logsOnServer()).length,1);
      const owner=env.authenticatedContext(h.address).firestore();await assertFails(setDoc(doc(owner,`players/${h.address}`),{rodLevel:3},{merge:true}));
    });
  });
  await test('epoch concurrent first sales close once; a warm advisory cache cannot authorize a closed shop',async()=>{
    await fixture(async h=>{
      const control=h.db.doc('config/economy');await control.set({open:true});
      await h.ref.set({...emptyPlayer(h.clock),econEpoch:0,coins:300,rodLevel:3,coolerLevel:2,fishBook:{kinds:['sardine']}});
      assert.equal((await h.call({op:'load'})).body.coins,0);assert.equal((await h.saved()).coins,300,'load writes nothing');
      const a=fixtureCatch(h.address,h.clock),b=fixtureCatch(h.address,h.clock,{startIndex:a.ticket.castIndex+1});
      const id=operationId();const results=await Promise.all([h.sell([a],id),h.sell([b])]);assert.ok(results.every(r=>r.statusCode===200));
      const saved=await h.saved();assert.equal(saved.econEpoch,1);assert.equal(saved.rodLevel,0);assert.equal(saved.coolerLevel,0);
      assert.equal((await h.logsOnServer()).filter(l=>l.changes.epoch?.reason==='epoch').length,1);
      await control.set({open:false});const before=await h.snapshotOnServer();
      const rejected=await h.call({op:'shop.buy',operationId:operationId(),vendor:'gen',cart:[{id:'ice_block',qty:1}]});assert.equal(rejected.statusCode,403);assert.equal(rejected.body.shopClosed,true);
      assert.deepEqual(await h.snapshotOnServer(),before);assert.equal((await h.sell([a],id)).statusCode,200);assert.deepEqual(await h.snapshotOnServer(),before);
      await control.set({open:true});
    });
  });
} finally { await env.cleanup(); }
