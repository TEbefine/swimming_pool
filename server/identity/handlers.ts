import { createHash } from 'node:crypto';
import { canonicalAddress, issueChallenge, LoginError, nonceSecret, readChallenge, validSessionClaims, verifyWallet } from './challenge.ts';
import { allowedOrigin, clientIp, fail, IpLimiter, readBody, reply } from './http.ts';
import type { Request, Response } from './http.ts';
interface Options { env: NodeJS.ProcessEnv; now?: () => number; limiter?: IpLimiter }
export interface LoginServices {
  consumeNonce: (id: string, data: { expiresAt: number; usedAt: number }) => Promise<void>;
  mintToken: (address: string, claims: { walletSignedInAt: number; walletLoginOrigin: string }) => Promise<string>;
  verifyToken: (token: string) => Promise<{ uid: string; walletSignedInAt?: unknown; walletLoginOrigin?: unknown }>;
}
export function createNonceHandler({ env, now = Date.now, limiter = new IpLimiter(10) }: Options) {
  return async (req: Request, res: Response) => {
    try {
      if (req.method !== 'POST') throw new LoginError(405, 'Use POST to sign in.');
      const origin = allowedOrigin(req, env);
      limiter.check(clientIp(req, env), now());
      const body = readBody(req, ['address']);
      reply(res, 200, issueChallenge(body.address, origin, nonceSecret(env), now()));
    } catch (err) { fail(res, err); }
  };
}
export function createLoginHandler({ env, now = Date.now, limiter = new IpLimiter(5) }: Options, services: LoginServices) {
  return async (req: Request, res: Response) => {
    try {
      if (req.method !== 'POST') throw new LoginError(405, 'Use POST to sign in.');
      const origin = allowedOrigin(req, env);
      limiter.check(clientIp(req, env), now());
      const body = readBody(req, ['challenge', 'signature', 'idToken', 'address']);
      // Returning sessions are verified by Admin; they never mint a token or extend wallet time.
      if (body.idToken !== undefined) {
        if (body.challenge !== undefined || body.signature !== undefined || typeof body.idToken !== 'string' || body.idToken.length > 4096) throw new LoginError(400, 'Invalid session request.');
        const address = canonicalAddress(body.address);
        let claims;
        try { claims = await services.verifyToken(body.idToken); } catch { throw new LoginError(401, 'Please unlock your identity to sign in again.'); }
        if (!validSessionClaims(claims, address, origin, now())) throw new LoginError(401, 'Please unlock your identity to sign in again.');
        reply(res, 200, { address, walletSignedInAt: claims.walletSignedInAt });
        return;
      }
      if (body.address !== undefined) throw new LoginError(400, 'Invalid login request.');
      const payload = readChallenge(body.challenge, origin, nonceSecret(env), now());
      await verifyWallet(payload, body.signature);
      // Verification can be slow; enforce expiry again immediately before the atomic write.
      if (now() >= payload.expiresAt) throw new LoginError(401, 'This sign-in challenge expired. Try again.');
      const signedInAt = now();
      const id = createHash('sha256').update(payload.nonce).digest('hex');
      try { await services.consumeNonce(id, { expiresAt: payload.expiresAt, usedAt: signedInAt }); }
      catch (err) {
        if ((err as { code?: unknown })?.code === 6 || (err as { code?: unknown })?.code === 'already-exists') throw new LoginError(409, 'This sign-in challenge was already used. Try again.');
        throw err;
      }
      const token = await services.mintToken(payload.address, { walletSignedInAt: signedInAt, walletLoginOrigin: origin });
      reply(res, 200, { token });
    } catch (err) { fail(res, err); }
  };
}
