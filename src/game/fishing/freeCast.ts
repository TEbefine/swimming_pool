import { rollDeckCatch } from './deckRoll.js';
import type { DeckCatch, DeckCastInfo } from './deckRoll.js';
import { DECK_RULES_V1 } from './deckRollV1.js';
import { parseCatchTicket } from './catchTicket.js';
import type { CatchStamp, CatchTicket } from './catchTicket.js';
import type { FishingDeck } from './deckStore.js';

export interface FreeCast {
  castAt: number;
  address?: string;
  ticket?: CatchTicket;
  rolled?: DeckCatch;
}
type Reserve = (castAt: number) => { deck: FishingDeck; castIndex: number } | null;

/** No network, and no validation/storage failure can escape into a throw of the line. */
export function prepareFreeCast(info: DeckCastInfo, castAt: number, reserve: Reserve): FreeCast {
  const fallback = { castAt };
  try {
    const card = reserve(castAt);
    if (!card || castAt < card.deck.window.startAt || castAt >= card.deck.window.endAt) return fallback;
    // The minigame's UI bands may change independently. V1 Nice always comes from its frozen distance band.
    const castInfo = { distance: info.distance, nice: info.distance >= DECK_RULES_V1.niceMin && info.distance <= DECK_RULES_V1.niceMax };
    const ticket = { version: card.deck.version, deckId: card.deck.deckId, castIndex: card.castIndex, castInfo, castAt };
    const rolled = rollDeckCatch({ ...ticket, seed: card.deck.seed });
    return { castAt, address: card.deck.address, ticket, rolled };
  } catch { return fallback; }
}

/** Both timestamps are gameNow() readings. A backwards clock correction keeps ordering, but loses sale eligibility. */
export function finishFreeCast(cast: FreeCast, now: number, address: string | null): CatchStamp {
  const caughtAt = Math.max(cast.castAt, now);
  const ticket = now >= cast.castAt && cast.address === address ? parseCatchTicket(cast.ticket, caughtAt) : null;
  return { caughtAt, ...(ticket ? { ticket } : {}) };
}

export const BOOK_ONLY_CATCH = "Fish Book only — can't be sold.";
