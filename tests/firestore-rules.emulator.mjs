import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    await setDoc(doc(context.firestore(), 'players/alice'), { test: true });
    await setDoc(doc(context.firestore(), 'players/bob'), { test: true });
    await setDoc(doc(context.firestore(), 'usedNonces/test'), { usedAt: 1 });
    await setDoc(doc(context.firestore(), 'players/alice/log/op-1'), { op: 'fishbook.record' });
    await setDoc(doc(context.firestore(), 'players/bob/log/op-1'), { op: 'fishbook.record' });
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
  await test('save transactions: one write per operation id, concurrent saves never lose a catch', async () => {
    await import('./register-api-ts.mjs');
    const { makeSaveServices } = await import('../server/saves/admin.ts');
    const { createItemsHandler } = await import('../server/saves/handlers.ts');
    const { IpLimiter } = await import('../server/identity/http.ts');
    const app = initializeApp({ projectId: 'demo-lumen-bay' }, 'saves-tx-test');
    try {
      const address = '0x' + 'cd'.repeat(20);
      const origin = 'https://test-lumen-bay.vercel.app';
      const now = Date.UTC(2026, 9, 10, 5, 0);
      const services = makeSaveServices(() => getFirestore(app), () => ({
        verifyIdToken: async () => ({ uid: address, walletSignedInAt: now - 1000, walletLoginOrigin: origin }),
      }));
      const handler = createItemsHandler({ env: { VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app' }, now: () => now, limiter: new IpLimiter(1000) }, services);
      const call = async body => {
        const req = { method: 'POST', body, socket: { remoteAddress: '127.0.0.1' },
          headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.9', authorization: 'Bearer emulator-test-token-0123456789' } };
        const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = JSON.parse(v); } };
        await handler(req, res);
        return res;
      };
      const catches = [{ fish: 'sardine', sizeCm: 15, caughtAt: now - 60_000 }];
      const same = await Promise.all([1, 2, 3].map(() => call({ op: 'fishbook.record', operationId: 'op-emulator-same-000001', catches })));
      assert.ok(same.every(r => r.statusCode === 200), JSON.stringify(same.map(r => r.body)));
      assert.equal(same.filter(r => r.body.replayed).length, 2, 'exactly one of three identical requests writes');
      const logs = await getFirestore(app).collection(`players/${address}/log`).get();
      assert.equal(logs.size, 1);
      const later = await Promise.all([1, 2].map(i => call({ op: 'fishbook.record', operationId: `op-emulator-diff-00000${i}`,
        catches: [{ fish: 'sardine', sizeCm: 15 + i, caughtAt: now - 50_000 + i * 10_000 }] })));
      assert.ok(later.some(r => r.statusCode === 200));
      const saved = (await getFirestore(app).doc(`players/${address}`).get()).data();
      assert.equal(saved.revision, 1 + later.filter(r => r.statusCode === 200).length, 'revision counts every accepted save exactly once');
      assert.equal(saved.fishTotal, saved.revision, 'no accepted catch was lost to a race');
    } finally { await deleteApp(app); }
  });
} finally { await env.cleanup(); }
