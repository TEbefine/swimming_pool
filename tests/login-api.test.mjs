import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
const { createNonceHandler, createLoginHandler } = await import('../server/identity/handlers.ts');
const { IpLimiter } = await import('../server/identity/http.ts');
const { CHALLENGE_MS, SESSION_MS, readChallenge, siweMessage } = await import('../server/identity/challenge.ts');

// Generated-in-test keys and mock services only. No production credentials or Firebase network.
const key = '0x' + '11'.repeat(32);
const wallet = privateKeyToAccount(key);
const other = privateKeyToAccount('0x' + '22'.repeat(32));
const origin = 'https://test-lumen-bay.vercel.app';
const secret = 'test-only-hmac-key-never-used-in-production-123';
const env = { NONCE_SECRET: secret, VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app' };
const start = 1_800_000_000_000;
function harness() {
  let clock = start;
  const used = new Map();
  const minted = [];
  let verifiedToken = { uid: wallet.address.toLowerCase(), walletSignedInAt: start, walletLoginOrigin: origin };
  const services = {
    consumeNonce: async (id, data) => {
      if (used.has(id)) throw Object.assign(new Error('already used'), { code: 6 });
      used.set(id, data);
    },
    mintToken: async (uid, claims) => { minted.push({ uid, claims }); return 'mock-custom-token'; },
    verifyToken: async token => { if (token !== 'mock-id-token') throw new Error('invalid'); return verifiedToken; },
  };
  const options = { env, now: () => clock, limiter: new IpLimiter(100) };
  return { used, minted, services, setClock: value => { clock = value; }, setClaims: value => { verifiedToken = value; },
    nonce: createNonceHandler(options), login: createLoginHandler(options, services) };
}
async function call(handler, body, overrides = {}) {
  const headers = { origin, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.1', ...overrides.headers };
  const req = { method: overrides.method ?? 'POST', body, headers, socket: { remoteAddress: '127.0.0.1' } };
  const response = { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
  await handler(req, response);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  return response;
}
async function signed(h, account = wallet) {
  const issued = await call(h.nonce, { address: wallet.address });
  assert.equal(issued.statusCode, 200);
  return { challenge: issued.body.challenge, signature: await account.signMessage({ message: issued.body.message }) };
}
function forged(original, change) {
  const [encoded] = original.split('.');
  const parts = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  change(parts);
  const data = Buffer.from(JSON.stringify(parts)).toString('base64url');
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}
test('nonce is stateless; valid SIWE login makes one create-only write before minting lowercase UID + fixed wallet time', async () => {
  const h = harness();
  const request = await signed(h);
  assert.equal(h.used.size, 0);
  const response = await call(h.login, request);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.token, 'mock-custom-token');
  assert.equal(h.used.size, 1);
  assert.deepEqual([...h.used.values()], [{ usedAt: start, expiresAt: start + CHALLENGE_MS }]);
  assert.deepEqual(h.minted, [{ uid: wallet.address.toLowerCase(), claims: { walletSignedInAt: start, walletLoginOrigin: origin } }]);
});
test('a replay and simultaneous duplicate attempts mint exactly one token', async () => {
  const h = harness();
  const request = await signed(h);
  const responses = await Promise.all([call(h.login, request), call(h.login, request)]);
  assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 409]);
  assert.equal((await call(h.login, request)).statusCode, 409);
  assert.equal(h.used.size, 1); assert.equal(h.minted.length, 1);
});
test('expired and future challenges fail even after an expired marker is deleted', async () => {
  const h = harness(); const request = await signed(h);
  h.setClock(start + CHALLENGE_MS);
  assert.equal((await call(h.login, request)).statusCode, 401);
  h.used.clear();
  assert.equal((await call(h.login, request)).statusCode, 401);
  h.setClock(start - 1);
  assert.equal((await call(h.login, request)).statusCode, 401);
  assert.equal(h.used.size, 0); assert.equal(h.minted.length, 0);
});
test('wrong origin, chain, domain, payload MAC and another wallet signature never write', async () => {
  const h = harness(); const request = await signed(h);
  assert.equal((await call(h.login, request, { headers: { origin: 'https://evil.example' } })).statusCode, 403);
  const wrongChain = forged(request.challenge, p => { p[4] = 1; });
  assert.equal((await call(h.login, { ...request, challenge: wrongChain })).statusCode, 401);
  const wrongOrigin = forged(request.challenge, p => { p[3] = 'https://evil.example'; });
  assert.equal((await call(h.login, { ...request, challenge: wrongOrigin })).statusCode, 401);
  const payload = readChallenge(request.challenge, origin, secret, start);
  const domainSignature = await wallet.signMessage({ message: siweMessage({ ...payload, origin: 'https://evil.example' }) });
  assert.equal((await call(h.login, { ...request, signature: domainSignature })).statusCode, 401);
  assert.equal((await call(h.login, await signed(h, other))).statusCode, 401);
  assert.equal((await call(h.login, { ...request, challenge: request.challenge.slice(0, -1) + '!' })).statusCode, 401);
  assert.equal(h.used.size, 0); assert.equal(h.minted.length, 0);
});
test('expired, mismatched, altered or invalid Firebase sessions fail; fresh token refresh never extends wallet time', async () => {
  const h = harness(); const body = { idToken: 'mock-id-token', address: wallet.address };
  h.setClock(start + SESSION_MS - 1);
  const response = await call(h.login, body);
  assert.equal(response.statusCode, 200); assert.equal(response.body.walletSignedInAt, start);
  h.setClock(start + SESSION_MS);
  assert.equal((await call(h.login, body)).statusCode, 401);
  h.setClock(start);
  h.setClaims({ uid: other.address.toLowerCase(), walletSignedInAt: start, walletLoginOrigin: origin });
  assert.equal((await call(h.login, body)).statusCode, 401);
  h.setClaims({ uid: wallet.address.toLowerCase(), walletSignedInAt: start, walletLoginOrigin: 'https://evil.example' });
  assert.equal((await call(h.login, body)).statusCode, 401);
  assert.equal((await call(h.login, { ...body, idToken: 'tampered' })).statusCode, 401);
  assert.equal(h.used.size, 0); assert.equal(h.minted.length, 0);
});
test('per-IP limits, untrusted Host, methods, payload caps and unknown fields fail closed without admin work', async () => {
  const limited = createNonceHandler({ env, now: () => start, limiter: new IpLimiter(2) });
  assert.equal((await call(limited, { address: wallet.address })).statusCode, 200);
  assert.equal((await call(limited, { address: wallet.address })).statusCode, 200);
  const blocked = await call(limited, { address: wallet.address });
  assert.equal(blocked.statusCode, 429); assert.equal(blocked.headers['Retry-After'], '60');
  assert.equal((await call(limited, { address: wallet.address }, { headers: { 'x-forwarded-for': '192.0.2.2' } })).statusCode, 200);
  const h = harness();
  assert.equal((await call(h.nonce, {}, { method: 'GET' })).statusCode, 405);
  assert.equal((await call(h.nonce, { address: wallet.address }, { headers: { origin: 'https://evil.example', host: 'evil.example' } })).statusCode, 403);
  assert.equal((await call(h.nonce, { address: wallet.address, secret: 'unexpected' })).statusCode, 400);
  assert.equal((await call(h.nonce, { address: wallet.address }, { headers: { 'content-length': '9000' } })).statusCode, 413);
  assert.equal((await call(h.nonce, { address: wallet.address }, { headers: { 'x-forwarded-for': 'malformed' } })).statusCode, 400);
  const bounded = new IpLimiter(1, 1);
  bounded.check('first', start);
  assert.throws(() => bounded.check('second', start));
  bounded.check('second', start + 60_001);
});
test('admin errors are sanitized and a token failure cannot reopen a consumed challenge', async () => {
  const h = harness(); const request = await signed(h);
  h.services.mintToken = async () => { throw new Error('secret fixture should not reach response'); };
  assert.equal((await call(h.login, request)).statusCode, 503);
  const replay = await call(h.login, request);
  assert.equal(replay.statusCode, 409); assert.ok(!JSON.stringify(replay.body).includes('secret fixture'));
});
