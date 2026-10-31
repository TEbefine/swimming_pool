import './register-api-ts.mjs';
import { saleEnv } from './fishing-fixtures.mjs';
const { createItemsHandler, DailyLimiter } = await import('../server/saves/handlers.ts');
const { IpLimiter } = await import('../server/identity/http.ts');
export const ORIGIN = 'https://test-lumen-bay.vercel.app';
export const NOON = Date.UTC(2026, 9, 10, 5);
export const ADDRESS = '0x' + 'ab'.repeat(20);
let seq = 0;
export const operationId = () => `op-verified-${String(++seq).padStart(12, '0')}`;
export function saleHarness({ address = ADDRESS, start = NOON, services, env = {} } = {}) {
  const h = { address, clock: start, players: new Map(), logs: new Map(), control: {open:true}, reads: 0, writes: 0,
    env: { VERCEL: '1', VERCEL_URL: 'test-lumen-bay.vercel.app', ECONOMY_API: 'on', ...saleEnv, ...env } };
  const auth = async () => ({ uid: address, walletSignedInAt: h.clock - 1000, walletLoginOrigin: ORIGIN });
  h.auth = auth;
  h.services = services ? services(auth) : {
    verifyToken: auth,
    readControl: async () => true,
    readPlayer: async a => { h.reads++; return structuredClone(h.players.get(a)); },
    transact: async (a, id, fn) => {
      h.reads += 2;
      const out = fn(structuredClone(h.players.get(a)), structuredClone(h.logs.get(`${a}/${id}`)), h.control);
      if (out.write) { h.writes += 2; h.players.set(a, structuredClone(out.write.player)); h.logs.set(`${a}/${id}`, structuredClone(out.write.log)); }
      return out.response;
    },
  };
  const handler = createItemsHandler({ env: h.env, now: () => h.clock, limiter: new IpLimiter(1e6), playerLimiter: new IpLimiter(1e6), playerDaily: new DailyLimiter(1e6) }, h.services);
  h.call = async body => {
    if (['shop.sell','shop.buy','bag.use'].includes(body.op) && !Object.hasOwn(body,'econEpoch')) body={...body,econEpoch:1};
    const req = { method: 'POST', body, headers: { origin: ORIGIN, 'content-type': 'application/json', authorization: 'Bearer emulator-test-token-0123456789', 'x-forwarded-for': '192.0.2.9' }, socket: { remoteAddress: '127.0.0.1' } };
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = JSON.parse(v); } };
    await handler(req, res); return res;
  };
  h.sell = (catches, id = operationId()) => h.call({ op: 'shop.sell', operationId: id, catches });
  h.snapshot = () => structuredClone({ players: [...h.players], logs: [...h.logs], writes: h.writes });
  return h;
}
