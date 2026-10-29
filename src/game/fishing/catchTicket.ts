import { FISHING_DECK } from './deckConfig.js';
import { canonicalDeckCast } from './deckRoll.js';
import type { DeckCastInfo } from './deckRoll.js';

/** The server reconstructs the seed from the owner + window. Never store a seed on a catch. */
export interface CatchTicket {
  version: number;
  deckId: number;
  castIndex: number;
  castInfo: DeckCastInfo;
  castAt: number;
}
export interface CatchStamp { caughtAt: number; ticket?: CatchTicket }

/** Local persistence validation only; sale authenticity belongs to stage 5. */
export function parseCatchTicket(raw: unknown, caughtAt: number): CatchTicket | null {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const t = raw as CatchTicket;
    if (t.version !== FISHING_DECK.version || !Number.isSafeInteger(t.deckId) || t.deckId < 0
      || !Number.isSafeInteger(t.castIndex) || t.castIndex < 0 || t.castIndex >= FISHING_DECK.casts
      || !Number.isSafeInteger(t.castAt) || t.castAt < 0 || !Number.isSafeInteger(caughtAt)
      || t.castAt > caughtAt || caughtAt - t.castAt > FISHING_DECK.maxCastDurationMs
      || Math.floor(t.castAt / FISHING_DECK.windowMs) !== t.deckId) return null;
    canonicalDeckCast(t.castInfo);
    return { version: t.version, deckId: t.deckId, castIndex: t.castIndex,
      castInfo: { distance: t.castInfo.distance, nice: t.castInfo.nice }, castAt: t.castAt };
  } catch { return null; }
}
