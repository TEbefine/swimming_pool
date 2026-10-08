import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { backupPositions, createSecret, restoreSecret, encryptVault, decryptVault, validateVault, ITERATIONS } from '../src/identity/vault.ts';
import { COMBO_INPUTS, encodeCombo, needsStepUp, WALLET_SESSION_MS, directionForPress, KEY_INPUTS } from '../src/identity/policy.ts';
import { readIdentity, saveIdentity, requestPersistence, markFirebaseSession } from '../src/identity/storage.ts';

// Public BIP39 test vector, never use this wallet for real identities or assets.
const mnemonic = 'test test test test test test test test test test test junk';
const combo = ['up', 'down', 'left', 'right', 'triangle', 'circle', 'cross'];
const alternate = ['square', 'square', 'left', 'right', 'triangle', 'circle', 'cross'];

test('recovery reproduces the known address and rejects invalid checksum, word and length', () => {
  assert.equal(restoreSecret(mnemonic).address, '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
  assert.deepEqual(restoreSecret(`  ${mnemonic.toUpperCase().replaceAll(' ', '  ')}  `), restoreSecret(mnemonic));
  assert.throws(() => restoreSecret(Array(12).fill('test').join(' ')));
  assert.throws(() => restoreSecret(mnemonic.replace('junk', 'notaword')));
  assert.throws(() => restoreSecret('test test'));
  const generated = createSecret();
  assert.equal(generated.mnemonic.split(' ').length, 12);
  assert.deepEqual(restoreSecret(generated.mnemonic), generated);
});

test('seven presses use all eight symbols and every desktop mapping exactly once', () => {
  for (const input of COMBO_INPUTS) assert.equal(encodeCombo(Array(7).fill(input)).length, 7);
  assert.throws(() => encodeCombo(combo.slice(1)));
  assert.throws(() => encodeCombo([...combo, 'square']));
  assert.throws(() => encodeCombo([...combo.slice(1), 'bogus']));
  assert.equal(new Set(Object.values(KEY_INPUTS)).size, 8);
  assert.equal(directionForPress(0, 0), null);
  assert.equal(directionForPress(0, -30), 'up');
  assert.equal(directionForPress(-30, 4), 'left');
  assert.equal(directionForPress(30, 4), 'right');
  assert.equal(directionForPress(20, 30), 'down');
});

test('48-hour policy does not slide with visits and always steps up for sensitive actions', () => {
  const start = 1_000_000;
  assert.equal(needsStepUp('enter', start, start + WALLET_SESSION_MS - 1), false);
  assert.equal(needsStepUp('enter', start, start + WALLET_SESSION_MS), true);
  for (const invalid of [null, NaN, Infinity, '123', start + 1]) assert.equal(needsStepUp('enter', invalid, start), true);
  for (const reason of ['reveal', 'change', 'trade', 'sell']) assert.equal(needsStepUp(reason, start, start), true);
});

test('backup check picks three distinct valid indices', () => {
  for (let i = 0; i < 50; i++) {
    const positions = backupPositions();
    assert.equal(new Set(positions).size, 3);
    assert.ok(positions.every(value => value >= 0 && value < 12));
  }
});

test('vault encrypts secrets with exact parameters, unique salt/IV, rejects wrong code and tampering', async () => {
  const secret = restoreSecret(mnemonic);
  const vault = await encryptVault(secret, combo);
  const second = await encryptVault(secret, combo);
  assert.equal(vault.iterations, 600_000);
  assert.equal(ITERATIONS, 600_000);
  assert.equal(Buffer.from(vault.salt, 'base64').length, 16);
  assert.equal(Buffer.from(vault.iv, 'base64').length, 12);
  assert.notEqual(vault.salt, second.salt);
  assert.notEqual(vault.iv, second.iv);
  assert.notEqual(vault.ciphertext, second.ciphertext);
  assert.equal(JSON.stringify(vault).includes(mnemonic), false);
  assert.equal(JSON.stringify(vault).includes(secret.privateKey), false);
  const unlocked = await decryptVault(vault, combo);
  assert.deepEqual(unlocked.secret, secret);
  assert.ok(unlocked.elapsedMs > 0);
  await assert.rejects(decryptVault(vault, alternate));
  await assert.rejects(decryptVault({ ...vault, address: '0x' + '0'.repeat(40) }, combo));
  const bytes = Buffer.from(vault.ciphertext, 'base64'); bytes[0] ^= 1;
  await assert.rejects(decryptVault({ ...vault, ciphertext: bytes.toString('base64') }, combo));
  assert.throws(() => validateVault({ ...vault, iterations: 1 }));
  assert.throws(() => validateVault({ ...vault, ciphertext: 'A'.repeat(3000) }));
  assert.throws(() => validateVault({ ...vault, iv: 'invalid' }));
  const changed = await encryptVault(secret, alternate);
  await assert.rejects(decryptVault(changed, combo));
  assert.deepEqual((await decryptVault(changed, alternate)).secret, secret);
});

test('IndexedDB absent/evicted state, atomic save and competing-tab protection', async () => {
  globalThis.indexedDB = new IDBFactory();
  const vault = await encryptVault(restoreSecret(mnemonic), combo);
  assert.deepEqual(await readIdentity(), { vault: null, sessionAddress: null });
  await saveIdentity(vault, null);
  assert.deepEqual(await readIdentity(), { vault, sessionAddress: null });
  await markFirebaseSession(vault.address, vault);
  assert.deepEqual(await readIdentity(), { vault, sessionAddress: vault.address });
  await assert.rejects(saveIdentity(vault, null));
  const next = await encryptVault(restoreSecret(mnemonic), alternate);
  const attempts = await Promise.allSettled([saveIdentity(next, vault), saveIdentity(vault, vault)]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  globalThis.indexedDB = new IDBFactory(); // eviction looks exactly like a first visit
  assert.deepEqual(await readIdentity(), { vault: null, sessionAddress: null });
  await assert.rejects(saveIdentity(next, vault)); // no resurrection from stale in-memory vault
  delete globalThis.indexedDB;
  await assert.rejects(readIdentity());
});

test('persistence being unavailable does not claim success', async () => {
  assert.equal(await requestPersistence(), 'unavailable');
});
