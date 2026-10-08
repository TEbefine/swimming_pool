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
    await assertFails(getDoc(doc(alice, 'players/alice/log/test')));
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
} finally { await env.cleanup(); }
