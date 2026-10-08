import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { createAuthSession } from '../src/identity/authSession.ts';
import { issueChallenge, SESSION_MS } from '../server/identity/challenge.ts';
import { validateLoginMessage } from '../src/identity/loginMessage.ts';
const wallet = privateKeyToAccount('0x' + '11'.repeat(32));
const address = wallet.address.toLowerCase();
const origin = 'https://test.example';
const start = 1_800_000_000_000;
function harness() {
  let clock = start; let current = null;
  const calls = []; let loads = 0;
  const port = { current: async () => current, signIn: async token => {
    assert.equal(token, 'mock-token');
    current = { uid: address, idToken: 'id-token', claims: { walletSignedInAt: clock, walletLoginOrigin: origin } };
  }, signOut: async () => { current = null; } };
  let allowSession = true;
  const session = createAuthSession({ loadAuth: async () => { loads++; return port; }, origin: () => origin, now: () => clock,
    post: async (path, body) => {
      calls.push({ path, body });
      if (path === '/api/nonce') return issueChallenge(body.address, origin, 'test'.repeat(16), clock);
      if (body.idToken) return allowSession ? { address, walletSignedInAt: current.claims.walletSignedInAt } : null;
      return { token: 'mock-token' };
    } });
  return { session, calls, loads: () => loads, setClock: n => { clock = n; }, setUser: u => { current = u; }, deny: () => { allowSession = false; } };
}
test('Firebase load follows local signing; only public proofs and SDK ID token leave the client', async () => {
  const h = harness();
  const signed = await h.session.login(address, message => { assert.equal(h.loads(), 0); return wallet.signMessage({ message }); });
  assert.deepEqual(signed, { address, walletSignedInAt: start });
  assert.equal(h.calls.length, 3);
  assert.deepEqual(Object.keys(h.calls[0].body), ['address']);
  assert.deepEqual(Object.keys(h.calls[1].body), ['challenge', 'signature']);
  assert.ok(!JSON.stringify(h.calls).includes('11'.repeat(32)));
});
test('return within 48 hours checks the persisted ID token; new device, wrong user, expiry and server rejection require unlock', async () => {
  const h = harness();
  assert.equal(await h.session.resume(address), null);
  await h.session.login(address, message => wallet.signMessage({ message }));
  h.setClock(start + SESSION_MS - 1);
  assert.equal((await h.session.resume(address)).walletSignedInAt, start);
  h.setClock(start + SESSION_MS);
  assert.equal(await h.session.resume(address), null);
  h.setClock(start); h.deny();
  assert.equal(await h.session.resume(address), null);
  h.setUser({ uid: 'wrong', idToken: 'id', claims: { walletSignedInAt: start, walletLoginOrigin: origin } });
  assert.equal(await h.session.resume(address), null);
});
test('untrusted message domain, address, chain, expiry or extra text is never signed', () => {
  const issued = issueChallenge(address, origin, 'test'.repeat(16), start);
  validateLoginMessage(issued.message, address, origin, start);
  for (const value of [issued.message.replace('test.example', 'evil.example'), issued.message.replace('80002', '1'), issued.message + '\nExtra', issued.message.replace(wallet.address, '0x' + '22'.repeat(20))]) {
    assert.throws(() => validateLoginMessage(value, address, origin, start));
  }
  assert.throws(() => validateLoginMessage(issued.message, address, origin, start + 300_000));
});
test('cancelled signing does not load Firebase or exchange a proof after abort', async () => {
  const h = harness(); const controller = new AbortController();
  await assert.rejects(h.session.login(address, async message => { controller.abort(); return wallet.signMessage({ message }); }, controller.signal));
  assert.equal(h.loads(), 0); assert.equal(h.calls.length, 1);
});
