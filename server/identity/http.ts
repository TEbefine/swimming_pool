import { isIP } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoginError } from './challenge.js';
export interface Request extends IncomingMessage { body?: unknown }
export type Response = ServerResponse;
export function header(req: Request, key: string): string {
  const value = req.headers[key];
  return typeof value === 'string' ? value : '';
}
export function allowedOrigin(req: Request, env: NodeJS.ProcessEnv): string {
  const origin = header(req, 'origin');
  const approved = new Set(['https://swimming-pool-five.vercel.app']);
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host && /^[a-zA-Z0-9.-]+$/.test(host) && !host.includes('..')) approved.add(`https://${host}`);
  }
  for (const entry of (env.LOGIN_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)) {
    try {
      const url = new URL(entry.trim());
      if (url.origin === entry.trim() && (url.protocol === 'https:' || (env.VERCEL !== '1' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) approved.add(url.origin);
    } catch { /* Ignore malformed server configuration; never trust Host. */ }
  }
  if (!approved.has(origin)) throw new LoginError(403, 'Sign-in is not allowed from this origin.');
  return origin;
}
export function clientIp(req: Request, env: NodeJS.ProcessEnv): string {
  // Vercel overwrites X-Forwarded-For at its trusted ingress. Outside Vercel trust only the socket.
  let ip = env.VERCEL === '1' ? header(req, 'x-forwarded-for').split(',')[0].trim() : req.socket.remoteAddress ?? '';
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (!isIP(ip)) throw new LoginError(400, 'Client address is unavailable.');
  return ip;
}
export class IpLimiter {
  private entries = new Map<string, { count: number; endsAt: number }>();
  constructor(privateLimit: number, maxEntries = 5000) { this.limit = privateLimit; this.maxEntries = maxEntries; }
  private limit: number;
  private maxEntries: number;
  check(ip: string, now: number) {
    let entry = this.entries.get(ip);
    if (!entry || entry.endsAt <= now) {
      if (this.entries.size >= this.maxEntries) for (const [key, value] of this.entries) if (value.endsAt <= now) this.entries.delete(key);
      if (!entry && this.entries.size >= this.maxEntries) throw new LoginError(429, 'Too many sign-in requests. Try again in a minute.');
      entry = { count: 0, endsAt: now + 60_000 };
      this.entries.set(ip, entry);
    }
    if (++entry.count > this.limit) throw new LoginError(429, 'Too many sign-in requests. Try again in a minute.');
  }
}
export function readBody(req: Request, keys: string[]): Record<string, unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(header(req, 'content-type'))) throw new LoginError(415, 'Use a JSON request.');
  const length = header(req, 'content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > 8192)) throw new LoginError(413, 'Sign-in request is too large.');
  let body: unknown = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > 8192) throw new LoginError(413, 'Sign-in request is too large.');
    try { body = JSON.parse(body); } catch { throw new LoginError(400, 'Invalid sign-in request.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LoginError(400, 'Invalid sign-in request.');
  if (Buffer.byteLength(JSON.stringify(body)) > 8192) throw new LoginError(413, 'Sign-in request is too large.');
  if (Object.keys(body).some(key => !keys.includes(key))) throw new LoginError(400, 'Invalid sign-in fields.');
  return body as Record<string, unknown>;
}
export function reply(res: Response, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (process.env.VERCEL_REGION) res.setHeader('X-Lumen-Function-Region', process.env.VERCEL_REGION);
  if (status === 429) res.setHeader('Retry-After', '60');
  if (status === 405) res.setHeader('Allow', 'POST');
  // Deployment proof only: fixed status and platform region, never request data or credentials.
  const region = process.env.VERCEL_REGION;
  if (status === 405 && process.env.VERCEL === '1' && region && /^[a-z]{3}\d$/.test(region)) {
    console.info(`identity-api status=405 region=${region}`);
  }
  res.end(JSON.stringify(data));
}
export function fail(res: Response, err: unknown) {
  // No exception, request, signature or credential logging.
  reply(res, err instanceof LoginError ? err.status : 503, { error: err instanceof LoginError ? err.message : 'Online sign-in is temporarily unavailable. Please retry.' });
}
