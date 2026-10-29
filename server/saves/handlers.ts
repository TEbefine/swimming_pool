// ID-01 (c) — POST /api/items: the only way a Player ID's save changes.
// Firebase ID token → address (uid) → validate the request → one Firestore transaction that updates
// players/{address} and creates players/{address}/log/{operationId}. Retrying the same operation
// returns the saved result instead of applying it twice (idempotent).
import { createHash } from 'node:crypto';
import { canonicalAddress, LoginError, validSessionClaims } from '../identity/challenge.js';
import { allowedOrigin, clientIp, header, IpLimiter, readBody, reply } from '../identity/http.js';
import type { Request, Response } from '../identity/http.js';
import {
  checkOperationId, countOperation, emptyPlayer, normalizePlayer, playerView,
  SaveError, validateStoryDay,
} from './rules.js';
import { applyBuy, applyIce, parseBuy, parseGoodsUid } from './purchases.js';
import { fishingDeckSecret, fishingRedemptionCutoff } from '../fishing/deck.js';
import { applySale, parseSaleCatches } from './sales.js';
import type { LogEntry, PlayerDoc } from './rules.js';

export interface TxResult<T> { write: { player: PlayerDoc; log: LogEntry } | null; response: T }
export interface SaveServices {
  verifyToken: (token: string) => Promise<{ uid: string; walletSignedInAt?: unknown; walletLoginOrigin?: unknown }>;
  readPlayer: (address: string) => Promise<unknown>;
  /** Runs `fn` in one transaction with the current player + log documents; writes only if it says so. */
  transact: <T>(address: string, operationId: string, fn: (player: unknown, log: unknown) => TxResult<T>) => Promise<T>;
}
interface Options {
  env: NodeJS.ProcessEnv;
  now?: () => number;
  /** Per IP, per server instance (best effort on serverless). */
  limiter?: IpLimiter;
  /** Per Player ID, per instance: counts EVERY request (also loads and refused saves, which cost reads). */
  playerLimiter?: IpLimiter;
  playerDaily?: DailyLimiter;
}

const BODY_LIMIT = 24_576;

/** Requests per Player ID per Bangkok day, per server instance (loads and refused saves cost reads too). */
export class DailyLimiter {
  private days = new Map<string, { day: number; count: number }>();
  private limit: number;
  constructor(limit: number) { this.limit = limit; }
  check(key: string, now: number) {
    const day = Math.floor((now + 7 * 3600_000) / 86_400_000);
    let e = this.days.get(key);
    if (!e || e.day !== day) {
      if (this.days.size > 20_000) this.days.clear();
      e = { day, count: 0 };
      this.days.set(key, e);
    }
    if (++e.count > this.limit) throw new SaveError(429, 'That is a lot of saving for one day. Please come back tomorrow.');
  }
}
/** The shop's server switch (ECO-02 d). Money ops exist only where ECONOMY_API=on: local dev saves and the
 * dev-test-id Preview. Production stays OFF until ECO-04 flips it; the client gate alone is not protection. */
export const ECONOMY_OPS = ['shop.sell', 'shop.buy', 'bag.use'] as const;
export const SHOP_CLOSED_LINE = "The shop isn't open yet.";
export function economyApiOn(env: NodeJS.ProcessEnv): boolean {
  return env.ECONOMY_API === 'on';
}
const FIELDS = ['op', 'operationId', 'catches', 'world', 'baseRevision', 'state', 'vendor', 'cart', 'uid', 'expectedTotal'];

/** Same JSON for the same request, whatever the key order (for the idempotency hash). */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
function onlyFields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some(k => !allowed.includes(k))) throw new SaveError(400, 'Invalid save request.');
}

export function createItemsHandler({ env, now = Date.now, limiter = new IpLimiter(60), playerLimiter = new IpLimiter(20), playerDaily = new DailyLimiter(600) }: Options, services: SaveServices) {
  return async (req: Request, res: Response) => {
    try {
      if (req.method !== 'POST') throw new SaveError(405, 'Use POST to save.');
      let origin: string;
      try { origin = allowedOrigin(req, env); } catch { throw new SaveError(403, 'Saving is not allowed from this origin.'); }
      try { limiter.check(clientIp(req, env), now()); } catch (err) {
        throw err instanceof LoginError && err.status === 429 ? new SaveError(429, 'Saving too often. Please wait a minute.') : err;
      }

      // Who is asking: a Firebase ID token whose uid is the wallet address, inside the 48-hour wallet window.
      const bearer = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(header(req, 'authorization'));
      if (!bearer) throw new SaveError(401, 'Please unlock your Player ID to save.');
      let claims: Awaited<ReturnType<SaveServices['verifyToken']>>;
      try { claims = await services.verifyToken(bearer[1]); } catch { throw new SaveError(401, 'Please unlock your Player ID to save.'); }
      let address: string;
      try { address = canonicalAddress(claims.uid); } catch { throw new SaveError(401, 'Please unlock your Player ID to save.'); }
      if (!validSessionClaims(claims, address, origin, now())) throw new SaveError(401, 'Please unlock your Player ID to save.');
      try { playerLimiter.check(address, now()); } catch { throw new SaveError(429, 'Saving too often. Please wait a minute.'); }
      playerDaily.check(address, now()); // ≤ 600 requests × ≤ 2 reads per ID per day per instance

      const body = readBody(req, FIELDS, BODY_LIMIT, 'Save request');
      const op = body.op;
      // Before any Firestore read: a closed shop costs nothing and changes nothing.
      if ((ECONOMY_OPS as readonly unknown[]).includes(op) && !economyApiOn(env)) throw new SaveError(403, SHOP_CLOSED_LINE, { shopClosed: true });

      if (op === 'load') {
        onlyFields(body, ['op']);
        const raw = await services.readPlayer(address);
        const t = now();
        reply(res, 200, { ...playerView(raw ? normalizePlayer(raw, t) : emptyPlayer(t)), serverNow: t });
        return;
      }

      if (op === 'shop.buy' || op === 'bag.use') {
        onlyFields(body, op === 'shop.buy' ? ['op', 'operationId', 'vendor', 'cart', 'expectedTotal'] : ['op', 'operationId', 'uid']);
        const operationId = checkOperationId(body.operationId);
        const purchase = op === 'shop.buy' ? parseBuy(body) : null;
        const uid = op === 'bag.use' ? parseGoodsUid(body.uid) : null;
        const hash = createHash('sha256').update(stable(purchase
          ? [op, purchase.vendor, purchase.cart, purchase.expectedTotal ?? null] : [op, uid])).digest('hex');
        const result = await services.transact(address, operationId, (rawPlayer, rawLog) => {
          const t = now();
          const doc = rawPlayer ? normalizePlayer(rawPlayer, t) : emptyPlayer(t);
          if (rawLog) return replay(doc, rawLog, hash);
          const budget = countOperation(doc, t);
          const { fields, changes } = purchase
            ? applyBuy(doc, purchase.cart, purchase.vendor, purchase.expectedTotal, t)
            : applyIce(doc, uid!, t);
          return commit(doc, { ...fields, ...budget }, op, hash, changes, t);
        });
        reply(res, 200, { ...(result as object), serverNow: now() }); // the phone keeps its catch clock in step with ours
        return;
      }

      if (op === 'shop.sell') {
        onlyFields(body, ['op', 'operationId', 'catches']);
        const operationId = checkOperationId(body.operationId);
        const catches = parseSaleCatches(body.catches);
        const hash = createHash('sha256').update(stable([op, catches])).digest('hex');
        const result = await services.transact(address, operationId, (rawPlayer, rawLog) => {
          const t = now();
          const doc = rawPlayer ? normalizePlayer(rawPlayer, t) : emptyPlayer(t);
          // Time, catalogue and player-state checks follow replay lookup: the original receipt
          // remains valid after spoilage, config changes, a later sale or Bangkok midnight.
          if (rawLog) return replay(doc, rawLog, hash);
          const budget = countOperation(doc, t);
          const { fields, changes } = applySale(doc, catches, { now: t, address, secret: fishingDeckSecret(env), redeemFromDeckId: fishingRedemptionCutoff(env) });
          return commit(doc, { ...fields, ...budget }, op, hash, changes, t);
        });
        reply(res, 200, { ...(result as object), serverNow: now() }); // the phone keeps its catch clock in step with ours
        return;
      }

      if (op === 'story.saveDay') {
        onlyFields(body, ['op', 'operationId', 'world', 'baseRevision', 'state']);
        const operationId = checkOperationId(body.operationId);
        if (body.world !== 'dalbit') throw new SaveError(400, 'Unknown story world.');
        const base = body.baseRevision;
        if (base !== null && (typeof base !== 'number' || !Number.isSafeInteger(base) || base < 1)) throw new SaveError(400, 'Invalid save request.');
        validateStoryDay(body.state, undefined, false); // shape + absolute bounds before any read
        const hash = createHash('sha256').update(stable([op, body.world, base, body.state])).digest('hex');
        const result = await services.transact(address, operationId, (rawPlayer, rawLog) => {
          const t = now();
          const doc = rawPlayer ? normalizePlayer(rawPlayer, t) : emptyPlayer(t);
          if (rawLog) return replay(doc, rawLog, hash);
          const budget = countOperation(doc, t);
          const prev = doc.storyWorlds.dalbit;
          if ((prev?.revision ?? null) !== base) throw new SaveError(409, 'Your story changed on another device. Reload to continue.');
          const state = validateStoryDay(body.state, prev);
          const save = { day: state.day, step: state.step, revision: (prev?.revision ?? 0) + 1, savedAt: t, state };
          const changes = { world: 'dalbit', day: state.day, storyRevision: save.revision, coins: state.coins };
          return commit(doc, { storyWorlds: { ...doc.storyWorlds, dalbit: save }, ...budget }, op, hash, changes, t);
        });
        reply(res, 200, { ...(result as object), serverNow: now() }); // the phone keeps its catch clock in step with ours
        return;
      }

      throw new SaveError(400, 'Invalid save request.');
    } catch (err) { failSave(res, err); }
  };
}

function replay(doc: PlayerDoc, rawLog: unknown, hash: string): TxResult<unknown> {
  const log = rawLog as Partial<LogEntry>;
  if (log.requestHash !== hash) throw new SaveError(409, 'This save was already used for something else.');
  return { write: null, response: { ...playerView(doc), result: log.changes ?? {}, replayed: true } };
}

function commit(doc: PlayerDoc, fields: Partial<PlayerDoc>, op: string, hash: string, changes: Record<string, unknown>, t: number): TxResult<unknown> {
  const player: PlayerDoc = { ...doc, ...fields, revision: doc.revision + 1, updatedAt: t };
  const log: LogEntry = { at: t, op, requestHash: hash, changes, prevRevision: doc.revision, newRevision: player.revision };
  return { write: { player, log }, response: { ...playerView(player), result: changes } };
}

function failSave(res: Response, err: unknown) {
  // Never log requests, tokens or stored data.
  if (err instanceof SaveError) reply(res, err.status, { error: err.message, ...err.details });
  else if (err instanceof LoginError) reply(res, err.status, { error: err.message });
  else reply(res, 503, { error: 'Saving is temporarily unavailable. Your progress is kept on this device; please retry.' });
}
