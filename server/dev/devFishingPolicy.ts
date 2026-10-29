// Imported only by Vite's serve-only plugins. Never a fallback for the production handlers.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { FISHING_DECK } from '../../src/game/fishing/deckConfig.js';
export const DEV_DECK_SECRET = 'dev-only-fishing-deck-no-production-use-2026';

/** Pin the first NEW full window once; restarts must not move an activation cutoff. */
export function devFishingPolicy(root: string, now = Date.now()) {
  const file = resolve(root, '.dev/fishing-policy.json');
  let cutoff: number;
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (!Number.isSafeInteger(saved.redeemFromDeckId) || saved.redeemFromDeckId < 0) throw new Error('Invalid dev fishing policy; restore it or reset dev saves coherently.');
    cutoff = saved.redeemFromDeckId;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    cutoff = Math.floor(now / FISHING_DECK.windowMs) + 1;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ redeemFromDeckId: cutoff }), { flag: 'wx' });
  }
  return { FISHING_DECK_SECRET: DEV_DECK_SECRET, FISHING_DECK_REDEEM_FROM_DECK_ID: String(cutoff) };
}
