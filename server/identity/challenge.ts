import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getAddress, verifyMessage } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { LOGIN_STATEMENT } from '../../src/identity/loginMessage.ts';

export const CHAIN_ID = 80002;
export const CHALLENGE_MS = 5 * 60 * 1000;
export const SESSION_MS = 48 * 60 * 60 * 1000;
export interface Challenge {
  version: 1; address: `0x${string}`; nonce: string; origin: string;
  chainId: typeof CHAIN_ID; issuedAt: number; expiresAt: number;
}
export class LoginError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function canonicalAddress(value: unknown): `0x${string}` {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new LoginError(400, 'Invalid player address.');
  return value.toLowerCase() as `0x${string}`;
}
export function nonceSecret(env: NodeJS.ProcessEnv): string {
  const value = env.NONCE_SECRET;
  if (!value || Buffer.byteLength(value) < 32 || Buffer.byteLength(value) > 4096) throw new LoginError(503, 'Online sign-in is not configured.');
  return value;
}
function encode(payload: Challenge) {
  return Buffer.from(JSON.stringify([payload.version, payload.address, payload.nonce, payload.origin, payload.chainId, payload.issuedAt, payload.expiresAt])).toString('base64url');
}
function mac(encoded: string, secret: string) { return createHmac('sha256', secret).update(encoded).digest(); }
export function issueChallenge(address: unknown, origin: string, secret: string, now: number) {
  const payload: Challenge = { version: 1, address: canonicalAddress(address), nonce: randomBytes(32).toString('hex'),
    origin, chainId: CHAIN_ID, issuedAt: now, expiresAt: now + CHALLENGE_MS };
  const encoded = encode(payload);
  return { challenge: `${encoded}.${mac(encoded, secret).toString('base64url')}`, message: siweMessage(payload) };
}
export function readChallenge(token: unknown, origin: string, secret: string, now: number): Challenge {
  const invalid = () => new LoginError(401, 'This sign-in challenge is invalid or expired. Try again.');
  if (typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
  const [encoded, signature] = token.split('.');
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== 32 || supplied.toString('base64url') !== signature || !timingSafeEqual(supplied, mac(encoded, secret))) throw invalid();
  let parts: unknown;
  try { parts = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw invalid(); }
  if (!Array.isArray(parts) || parts.length !== 7) throw invalid();
  const [version, address, nonce, signedOrigin, chainId, issuedAt, expiresAt] = parts;
  if (version !== 1 || typeof address !== 'string' || !/^0x[0-9a-f]{40}$/.test(address) || typeof nonce !== 'string' || !/^[0-9a-f]{64}$/.test(nonce) ||
    signedOrigin !== origin || chainId !== CHAIN_ID || !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) ||
    issuedAt > now || expiresAt - issuedAt !== CHALLENGE_MS || now >= expiresAt) throw invalid();
  const payload: Challenge = { version, address: address as `0x${string}`, nonce, origin, chainId, issuedAt, expiresAt };
  if (encode(payload) !== encoded) throw invalid();
  return payload;
}
export function siweMessage(payload: Challenge): string {
  const url = new URL(payload.origin);
  return createSiweMessage({ address: getAddress(payload.address), domain: url.host, scheme: url.protocol.slice(0, -1),
    statement: LOGIN_STATEMENT, uri: payload.origin,
    version: '1', chainId: payload.chainId, nonce: payload.nonce, issuedAt: new Date(payload.issuedAt), expirationTime: new Date(payload.expiresAt) });
}
export async function verifyWallet(payload: Challenge, signature: unknown): Promise<void> {
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new LoginError(401, 'The wallet signature is invalid.');
  let valid = false;
  try { valid = await verifyMessage({ address: payload.address, message: siweMessage(payload), signature: signature as `0x${string}` }); }
  catch { /* Invalid signatures fail closed without exposing details. */ }
  if (!valid) throw new LoginError(401, 'The wallet signature is invalid.');
}
export function validSessionClaims(claims: { uid: string; walletSignedInAt?: unknown; walletLoginOrigin?: unknown }, address: string, origin: string, now: number) {
  return claims.uid === address && claims.walletLoginOrigin === origin && typeof claims.walletSignedInAt === 'number' &&
    Number.isSafeInteger(claims.walletSignedInAt) && claims.walletSignedInAt <= now && now - claims.walletSignedInAt < SESSION_MS;
}
