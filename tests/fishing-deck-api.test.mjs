import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { createFishingDeckHandler } = await import('../server/fishing/deck.ts');
const { IpLimiter } = await import('../server/identity/http.ts');
const { FISHING_DECK } = await import('../src/game/fishing/deckConfig.ts');
const { DEV_TEST_ADDRESS, DEV_TEST_TOKEN } = await import('../src/identity/devTestIdentity.ts');
const ADDRESS = '0x' + 'ab'.repeat(20), OTHER = '0x' + 'cd'.repeat(20);
const ORIGIN = 'https://test-lumen-bay.vercel.app';
const TOKEN = 'mock-deck-id-token-0123456789';
const NOW = Date.UTC(2026, 9, 29, 5);
const SECRET = 'test-only-fishing-secret-at-least-32-bytes';
function rig(env = {}, limits = {}) {
  const w = { now: NOW, calls: 0, claims: { uid: ADDRESS, walletSignedInAt: NOW - 1000, walletLoginOrigin: ORIGIN } };
  w.handler = createFishingDeckHandler({ env: { VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app', ECONOMY_API: 'on', FISHING_DECK_SECRET: SECRET, ...env }, now: () => w.now,
    limiter: new IpLimiter(100), playerLimiter: new IpLimiter(100), ...limits }, {
    // There is deliberately NO database capability in the service interface.
    readControl: async () => true,
    verifyToken: async token => { w.calls++; if (token !== TOKEN) throw Error('bad token'); return w.claims; },
  });
  return w;
}
async function call(w, { body = {}, method = 'POST', headers = {} } = {}) {
  const response = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = JSON.parse(v); } };
  await w.handler({ method, body, headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.1', authorization: `Bearer ${TOKEN}`, ...headers }, socket: { remoteAddress: '127.0.0.1' } }, response);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  return response;
}
test('issuance is stateless, owner-bound and identical throughout one window', async () => {
  const w = rig(); const a = await call(w);
  assert.equal(a.statusCode, 200);
  const d = a.body;
  assert.equal(d.address, ADDRESS); assert.equal(d.casts, 8192); assert.equal(d.version, 2);
  assert.equal(d.deckId, Math.floor(NOW / FISHING_DECK.windowMs));
  assert.equal(d.seed, createHmac('sha256', SECRET).update(JSON.stringify(['lumen-bay/fishing-deck', 2, ADDRESS, d.deckId])).digest('hex'));
  assert.ok(!JSON.stringify(d).includes(SECRET));
  w.now = d.window.endAt - 1;
  const b = (await call(w)).body;
  assert.deepEqual({ ...b, serverNow: d.serverNow }, d);
  w.now = d.window.endAt;
  const next = (await call(w)).body;
  assert.equal(next.deckId, d.deckId + 1); assert.notEqual(next.seed, d.seed);
  w.claims = { ...w.claims, uid: OTHER };
  assert.notEqual((await call(w)).body.seed, next.seed);
});
test('closed economy refuses before auth, malformed requests or any service call', async () => {
  for (const ECONOMY_API of [undefined, '', 'true', 'ON']) {
    const w = rig({ ECONOMY_API, FISHING_DECK_SECRET: undefined });
    const r = await call(w, { body: { address: OTHER }, headers: { authorization: '' } });
    assert.equal(r.statusCode, 403); assert.equal(r.body.shopClosed, true);
    assert.equal(r.body.error, "The shop isn't open yet."); assert.equal(w.calls, 0);
  }
});
test('Vercel fails closed for missing/short/dev-only secrets, with no fallback or auth calls', async () => {
  for (const FISHING_DECK_SECRET of [undefined, '', 'short', 'dev-only-fishing-deck-no-production-use-2026']) {
    const w = rig({ FISHING_DECK_SECRET }); const r = await call(w);
    assert.equal(r.statusCode, 503); assert.equal(w.calls, 0);
    assert.ok(!JSON.stringify(r.body).includes('dev-only-'));
  }
});
test('requires POST, allowed origin, JSON and empty bounded body; callers cannot choose player/window', async () => {
  const w = rig();
  assert.equal((await call(w, { method: 'GET' })).statusCode, 405);
  assert.equal((await call(w, { headers: { origin: 'https://evil.invalid' } })).statusCode, 403);
  assert.equal((await call(w, { headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  for (const body of [{ address: OTHER }, { deckId: 9 }, { seed: '0'.repeat(64) }, [], null, 'bad json']) assert.equal((await call(w, { body })).statusCode, 400);
  assert.equal((await call(w, { body: ' '.repeat(1025) })).statusCode, 413);
  assert.equal(w.calls, 0);
});
test('checks real-token verifier, wallet age, canonical owner and origin binding', async () => {
  const w = rig();
  assert.equal((await call(w, { headers: { authorization: '' } })).statusCode, 401);
  assert.equal((await call(w, { headers: { authorization: `Bearer ${DEV_TEST_TOKEN}` } })).statusCode, 401);
  for (const claims of [
    { uid: 'not-an-address', walletSignedInAt: NOW, walletLoginOrigin: ORIGIN },
    { uid: ADDRESS, walletSignedInAt: NOW - 48 * 3600_000, walletLoginOrigin: ORIGIN },
    { uid: ADDRESS, walletSignedInAt: NOW + 1, walletLoginOrigin: ORIGIN },
    { uid: ADDRESS, walletSignedInAt: NOW, walletLoginOrigin: 'https://other.invalid' },
  ]) { w.claims = claims; assert.equal((await call(w)).statusCode, 401); }
});
test('bounded IP and Player ID request limits add no persisted counters', async () => {
  let w = rig({}, { limiter: new IpLimiter(1) });
  assert.equal((await call(w)).statusCode, 200); assert.equal((await call(w)).statusCode, 429);
  w = rig({}, { playerLimiter: new IpLimiter(1) });
  assert.equal((await call(w)).statusCode, 200);
  const limited = await call(w, { headers: { 'x-forwarded-for': '192.0.2.2' } });
  assert.equal(limited.statusCode, 429); assert.equal(limited.headers['Retry-After'], '60');
});
test('real Vite dev middleware issues tickets with zero env setup and only the fixed test token', async () => {
  const { createServer } = await import('vite');
  const { devDeck } = await import('../server/dev/devDeck.ts');
  const { mkdtemp, symlink, rm } = await import('node:fs/promises');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const root = await mkdtemp(join(tmpdir(), 'lumen-deck-api-')), repo = fileURLToPath(new URL('../', import.meta.url));
  await symlink(join(repo, 'server'), join(root, 'server'), 'dir'); await symlink(join(repo, 'src'), join(root, 'src'), 'dir');
  const saved = process.env.FISHING_DECK_SECRET; delete process.env.FISHING_DECK_SECRET;
  const server = await createServer({ configFile: false, root, appType: 'custom', logLevel: 'silent', plugins: [devDeck()], server: { host: '127.0.0.1', port: 0, fs: { allow: [repo, root] } } });
  try {
    await server.listen(); const port = server.httpServer.address().port;
    const post = token => fetch(`http://127.0.0.1:${port}/api/fishing-deck`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}' });
    const a = await post(DEV_TEST_TOKEN), d = await a.json();
    assert.equal(a.status, 200); assert.equal(d.address, DEV_TEST_ADDRESS); assert.match(d.seed, /^[0-9a-f]{64}$/);
    assert.equal((await (await post(DEV_TEST_TOKEN)).json()).seed, d.seed);
    assert.equal((await post(TOKEN)).status, 401);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); if (saved === undefined) delete process.env.FISHING_DECK_SECRET; else process.env.FISHING_DECK_SECRET = saved; }
});
