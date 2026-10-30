// Server-only, stateless issuance: authentication verifies a token; no Firestore service is supplied.
import { createHmac } from 'node:crypto';
import { canonicalAddress, LoginError, validSessionClaims } from '../identity/challenge.js';
import { allowedOrigin, clientIp, header, IpLimiter, readBody, reply } from '../identity/http.js';
import type { Request, Response } from '../identity/http.js';
import { FISHING_DECK, isFishingDeckVersion } from '../../src/game/fishing/deckConfig.js';

interface Claims { uid: string; walletSignedInAt?: unknown; walletLoginOrigin?: unknown }
interface Services { verifyToken(token: string): Promise<Claims> }
interface Options { env: NodeJS.ProcessEnv; now?: () => number; limiter?: IpLimiter; playerLimiter?: IpLimiter }

export function fishingDeckSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.FISHING_DECK_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32 || Buffer.byteLength(secret) > 4096
    || (env.VERCEL === '1' && secret.startsWith('dev-only-'))) {
    throw new LoginError(503, 'Fishing tickets are unavailable right now. Try again later.');
  }
  return secret;
}

export function fishingDeckSeed(address: string, version: number, deckId: number, secret: string): string {
  const owner = canonicalAddress(address);
  if (!isFishingDeckVersion(version) || !Number.isSafeInteger(deckId) || deckId < 0) throw new RangeError('Invalid fishing deck.');
  return createHmac('sha256', secret).update(JSON.stringify(['lumen-bay/fishing-deck', version, owner, deckId])).digest('hex');
}

/** Fixed activation, never derived from request time. Missing/invalid configuration fails closed. */
export function fishingRedemptionCutoff(env: NodeJS.ProcessEnv): number {
  const raw = env.FISHING_DECK_REDEEM_FROM_DECK_ID;
  const value = Number(raw);
  if (!raw || !/^(0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(value)) throw new LoginError(503, 'Fishing sales are unavailable right now. Try again later.');
  return value;
}

export function issueFishingDeck(address: string, now: number, secret: string) {
  const owner = canonicalAddress(address);
  const deckId = Math.floor(now / FISHING_DECK.windowMs);
  const seed = fishingDeckSeed(owner, FISHING_DECK.version, deckId, secret);
  return {
    address: owner, version: FISHING_DECK.version, deckId, seed,
    window: { startAt: deckId * FISHING_DECK.windowMs, endAt: (deckId + 1) * FISHING_DECK.windowMs },
    casts: FISHING_DECK.casts, serverNow: now,
  };
}

export function createFishingDeckHandler({ env, now = Date.now,
  limiter = new IpLimiter(FISHING_DECK.requestsPerIpMinute),
  playerLimiter = new IpLimiter(FISHING_DECK.requestsPerPlayerMinute),
}: Options, services: Services) {
  return async (req: Request, res: Response) => {
    try {
      if (req.method !== 'POST') throw new LoginError(405, 'Use POST for fishing tickets.');
      // Exactly the same server switch as the shop ops, before auth or any backing service call.
      if (env.ECONOMY_API !== 'on') {
        reply(res, 403, { error: "The shop isn't open yet.", shopClosed: true }); return;
      }
      const origin = allowedOrigin(req, env);
      limiter.check(clientIp(req, env), now());
      readBody(req, [], FISHING_DECK.requestBodyBytes, 'Fishing ticket request', 'Fishing tickets do not accept player or window fields.');
      const secret = fishingDeckSecret(env); // never fall back to a local secret on Vercel
      const bearer = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(header(req, 'authorization'));
      if (!bearer) throw new LoginError(401, 'Unlock your Player ID for fishing tickets.');
      let claims: Claims;
      try { claims = await services.verifyToken(bearer[1]); } catch { throw new LoginError(401, 'Unlock your Player ID for fishing tickets.'); }
      let address: string;
      try { address = canonicalAddress(claims.uid); } catch { throw new LoginError(401, 'Unlock your Player ID for fishing tickets.'); }
      const t = now();
      if (!validSessionClaims(claims, address, origin, t)) throw new LoginError(401, 'Unlock your Player ID for fishing tickets.');
      playerLimiter.check(address, t);
      reply(res, 200, issueFishingDeck(address, t, secret));
    } catch (error) {
      reply(res, error instanceof LoginError ? error.status : 503,
        { error: error instanceof LoginError ? error.message : 'Fishing tickets are unavailable right now. Try again later.' });
    }
  };
}
