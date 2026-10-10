import '../tests/register-api-ts.mjs';
// Playwright-only test backend. All Firebase REST calls are intercepted; no real credentials.
import { randomUUID } from 'node:crypto';
const { createNonceHandler, createLoginHandler } = await import('../server/identity/handlers.ts');
const { IpLimiter } = await import('../server/identity/http.ts');
export async function mockIdentityAuth(context, origin) {
  const used = new Set(), custom = new Map(), ids = new Map(), refresh = new Map();
  let expired = false;
  const signedLogins = [];
  const apiRequests = [];
  const jwt = claims => {
    const now = Math.floor(Date.now() / 1000);
    const payload = { ...claims, sub: claims.uid, user_id: claims.uid, iat: now, exp: now + 3600, auth_time: now,
      iss: 'https://securetoken.google.com/lumen-bay', aud: 'lumen-bay', firebase: { sign_in_provider: 'custom', identities: {} } };
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.test-only`;
    ids.set(token, claims); return token;
  };
  const services = {
    consumeNonce: async id => { if (used.has(id)) throw Object.assign(new Error('used'), { code: 6 }); used.add(id); },
    mintToken: async (uid, claims) => { const token = randomUUID(); custom.set(token, { uid, ...claims }); signedLogins.push(claims.walletSignedInAt); return token; },
    verifyToken: async token => {
      const claims = ids.get(token); if (!claims) throw new Error('invalid mock token');
      return expired ? { ...claims, walletSignedInAt: Date.now() - 49 * 60 * 60 * 1000 } : claims;
    },
  };
  const options = { env: { LOGIN_ALLOWED_ORIGINS: origin, NONCE_SECRET: 'test-only-hmac'.repeat(4) }, limiter: new IpLimiter(1000) };
  const nonce = createNonceHandler(options), login = createLoginHandler(options, services);
  await context.route('**/api/nonce', async route => {
    expired = false;
    await endpoint(nonce, route);
  });
  await context.route('**/api/login', route => endpoint(login, route));
  async function endpoint(handler, route) {
    const req = route.request();
    apiRequests.push({ path: new URL(req.url()).pathname, method: req.method(),
      kind: req.postDataJSON()?.idToken ? 'session' : 'signature' });
    const request = { method: req.method(), headers: { ...req.headers(), origin }, body: req.postDataJSON(), socket: { remoteAddress: '127.0.0.1' } };
    const headers = {};
    const res = { statusCode: 0, setHeader(key, value) { headers[key] = value; }, end(value) { this.body = value; } };
    await handler(request, res);
    await route.fulfill({ status: res.statusCode, headers, body: res.body });
  }
  await context.route('https://identitytoolkit.googleapis.com/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const data = route.request().postDataJSON();
    if (path.endsWith('accounts:signInWithCustomToken')) {
      const claims = custom.get(data.token);
      if (!claims) return route.fulfill({ status: 400, json: { error: { message: 'INVALID_CUSTOM_TOKEN' } } });
      const refreshToken = randomUUID(); refresh.set(refreshToken, claims);
      return route.fulfill({ json: { idToken: jwt(claims), refreshToken, expiresIn: '3600', localId: claims.uid, isNewUser: false } });
    }
    if (path.endsWith('accounts:lookup')) {
      const claims = ids.get(data.idToken);
      return route.fulfill({ json: { users: claims ? [{ localId: claims.uid, createdAt: String(Date.now()), lastLoginAt: String(Date.now()), providerUserInfo: [] }] : [] } });
    }
    return route.fulfill({ status: 400, json: { error: { message: 'TEST_ROUTE_UNSUPPORTED' } } });
  });
  await context.route('https://securetoken.googleapis.com/**', async route => {
    const data = new URLSearchParams(route.request().postData());
    const claims = refresh.get(data.get('refresh_token'));
    if (!claims) return route.fulfill({ status: 400, json: { error: { message: 'INVALID_REFRESH_TOKEN' } } });
    return route.fulfill({ json: { access_token: jwt(claims), id_token: jwt(claims), refresh_token: data.get('refresh_token'),
      expires_in: '3600', token_type: 'Bearer', user_id: claims.uid, project_id: 'lumen-bay' } });
  });
  return { expire: () => { expired = true; }, signedLogins, apiRequests, verifyToken: services.verifyToken };
}
