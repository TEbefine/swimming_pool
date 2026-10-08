import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { createAuthSession, post } from '../src/identity/authSession.ts';
const { issueChallenge, SESSION_MS } = await import('../server/identity/challenge.ts');
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

const previewLoginMessage = 'This preview requires Vercel login. Open it while signed in to Vercel.';
const unavailableMessage = 'Online sign-in is unavailable. Please retry.';
test('real post transport sends same-origin preview cookies through nonce, login and session checks', async t => {
  const requests = [];
  const mockServer = request => {
    if (!request.headers.get('cookie')?.includes('_vercel_jwt=test-preview-cookie')) {
      return new Response('<html>Vercel Authentication</html>', { status: 401, headers: { 'content-type': 'text/html' } });
    }
    requests.push(request);
    return Response.json({ accepted: true });
  };
  // Model the browser cookie jar: the server only sees a cookie when credentials allow it.
  const browserFetch = async (path, options) => {
    const request = new Request(new URL(path, origin), options);
    if (request.credentials === 'include' || (request.credentials === 'same-origin' && new URL(request.url).origin === origin)) {
      request.headers.set('cookie', '_vercel_jwt=test-preview-cookie');
    }
    return mockServer(request);
  };
  t.mock.method(globalThis, 'fetch', browserFetch);
  assert.equal((await browserFetch('/api/nonce', { credentials: 'omit' })).status, 401);
  assert.equal((await browserFetch('https://other.example/api/nonce', { credentials: 'same-origin' })).status, 401);
  for (const [path, body] of [
    ['/api/nonce', { address }],
    ['/api/login', { challenge: 'public-challenge', signature: 'public-proof' }],
    ['/api/login', { address, idToken: 'test-id-token' }],
  ]) {
    assert.deepEqual(await post(path, body), { accepted: true });
  }
  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(request.credentials, 'same-origin');
    assert.equal(request.method, 'POST');
    assert.equal(request.cache, 'no-store');
    assert.equal(new URL(request.url).origin, origin);
  }
});
test('non-API 401/403 explain preview protection, including during session restoration', async t => {
  for (const status of [401, 403]) {
    for (const [contentType, responseBody] of [
      ['text/html', '<html>Vercel Authentication</html>'],
      ['text/plain', 'Authentication Required'],
      ['application/json', '<html>Authentication Required</html>'],
      ['application/json', JSON.stringify({ message: 'Authentication Required' })],
    ]) {
      t.mock.method(globalThis, 'fetch', async () => new Response(responseBody, { status, headers: { 'content-type': contentType } }));
      for (const [path, body] of [['/api/nonce', { address }], ['/api/login', { signature: 'test-proof' }], ['/api/login', { address, idToken: 'test-id-token' }]]) {
        await assert.rejects(post(path, body), { message: previewLoginMessage });
      }
      t.mock.restoreAll();
    }
  }
});
test('API auth failures, server errors and rate limits keep their existing handling', async t => {
  for (const status of [401, 403, 500, 503, 429]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Server detail is not displayed' }, { status }));
    await assert.rejects(post('/api/nonce', { address }), {
      message: status === 429 ? 'Too many sign-in attempts. Please wait a minute.' : unavailableMessage,
    });
    if (status === 401) assert.equal(await post('/api/login', { address, idToken: 'expired-token' }), null);
    else await assert.rejects(post('/api/login', { address, idToken: 'test-id-token' }), {
      message: status === 429 ? 'Too many sign-in attempts. Please wait a minute.' : unavailableMessage,
    });
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Unavailable</html>', { status: 503 }));
  await assert.rejects(post('/api/login', { signature: 'test-proof' }), { message: unavailableMessage });
});
